import { normalizeNativeAttributes } from '../../shared/native-attributes.ts';
import {
  parse,
  parseFragment,
  serialize,
  serializeOuter,
  defaultTreeAdapter,
  html as parserHTML,
  type DefaultTreeAdapterTypes as Tree,
} from 'parse5';
import { isDataScript, isExecutableScriptType } from '../../shared/policy.ts';
import {
  CONTENT_MARKER,
  type ContentAttribute,
  type ContentScript,
  type ContentHandler,
  type ChildDocumentSource,
  type ContentContext,
  type ContentCommon,
  type CompiledDocumentContent,
  type DocumentContentInput,
} from './document-content-types.ts';
const HTML = parserHTML.NS.HTML;
const SVG = parserHTML.NS.SVG;
const XMLNS = 'http://www.w3.org/2000/xmlns/';
function element(node: Tree.Node): node is Tree.Element {
  return 'tagName' in node;
}
function children(node: Tree.Node): Tree.ChildNode[] {
  return 'childNodes' in node ? node.childNodes : [];
}
function template(node: Tree.Element): node is Tree.Template {
  return node.namespaceURI === HTML && node.tagName === 'template' && 'content' in node;
}
function attribute(node: Tree.Element, name: string): string | undefined {
  return node.attrs.find((item) => !item.namespace && item.name === name)?.value;
}
function contentAttributes(node: Tree.Element): ContentAttribute[] {
  return node.attrs.map((item) => ({
    name: item.prefix ? item.prefix + ':' + item.name : item.name,
    value: item.value,
    ...(item.namespace ? { namespace: item.namespace } : {}),
  }));
}
/** Compile inert render data only. This does not change admission or create a realm. */
export function compileDocumentContent(
  input: DocumentContentInput,
): CompiledDocumentContent {
  const sourceURL = new URL(input.sourceURL).href;
  const documentURL = new URL(sourceURL);
  documentURL.hash = '';
  let baseURL = new URL(input.baseURL || sourceURL, sourceURL).href;
  const aliases = new Map<string, string>();
  const installed = new Set<string>();
  for (const [source, target] of input.aliases) {
    const original = new URL(source);
    const destination = new URL(target);
    if (
      original.hash ||
      destination.hash ||
      !['http:', 'https:'].includes(destination.protocol) ||
      destination.username ||
      destination.password
    )
      throw new Error('Invalid installed resource alias');
    const previous = aliases.get(original.href);
    if (previous && previous !== destination.href)
      throw new Error('Conflicting resource alias');
    aliases.set(original.href, destination.href);
    installed.add(destination.href);
  }
  function address(value: string, currentBase = baseURL) {
    const url = new URL(value, currentBase);
    const hash = url.hash;
    url.hash = '';
    return {
      url,
      hash,
      mapped: aliases.get(url.href) || (installed.has(url.href) ? url.href : undefined),
    };
  }
  function mapURL(value: string, currentBase = baseURL): string {
    const result = address(value, currentBase);
    if (value.trim().startsWith('#')) {
      if (result.url.href === documentURL.href) return value;
      return (result.mapped || result.url.href) + result.hash;
    }
    if (['javascript:', 'vbscript:'].includes(result.url.protocol))
      throw new Error('Executable URL is not render markup');
    return result.mapped ? result.mapped + result.hash : value;
  }
  function css(text: string, currentBase = baseURL): string {
    return text
      .replace(
        /url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]*))\s*\)/gi,
        (
          whole,
          double: string | undefined,
          single: string | undefined,
          plain: string | undefined,
        ) => {
          const value = double ?? single ?? plain ?? '';
          const mapped = mapURL(value, currentBase);
          return mapped === value ? whole : 'url(' + JSON.stringify(mapped) + ')';
        },
      )
      .replace(
        /(@import\s+)(["'])(.*?)\2/gi,
        (_whole, rule: string, _quote: string, value: string) =>
          rule + JSON.stringify(mapURL(value, currentBase)),
      );
  }
  const ast = input.kind === 'html' ? parse(input.text) : parseFragment(input.text);
  let root: Tree.Element;
  let head: Tree.Element | undefined;
  let body: Tree.Element | undefined;
  if (input.kind === 'html') {
    const html = children(ast).find((node) => element(node) && node.tagName === 'html');
    if (!html || !element(html)) throw new Error('Missing HTML root');
    root = html;
    head = children(root).find(
      (node): node is Tree.Element => element(node) && node.tagName === 'head',
    );
    body = children(root).find(
      (node): node is Tree.Element => element(node) && node.tagName === 'body',
    );
    if (!head || !body) throw new Error('Missing HTML document sections');
    function findBase(node: Tree.Element): Tree.Element | undefined {
      if (
        node.namespaceURI === HTML &&
        node.tagName === 'base' &&
        attribute(node, 'href') !== undefined
      )
        return node;
      for (const child of node.childNodes)
        if (element(child)) {
          const found = findBase(child);
          if (found) return found;
        }
    }
    const firstBase = findBase(root);
    if (firstBase) baseURL = new URL(attribute(firstBase, 'href')!, baseURL).href;
  } else {
    const roots = children(ast).filter(element);
    if (
      roots.length !== 1 ||
      roots[0].namespaceURI !== SVG ||
      roots[0].tagName !== 'svg' ||
      children(ast).some((node) => 'value' in node && node.value.trim())
    )
      throw new Error('Expected one native SVG root');
    root = roots[0];
  }
  const scripts = new Array<ContentScript>();
  const handlers = new Array<ContentHandler>();
  const contexts = new Array<ContentContext>();
  let sequence = 0;
  function marker(node: Tree.Element): string {
    const existing = attribute(node, CONTENT_MARKER);
    if (existing) return existing;
    const value = 'pf-content-' + ++sequence;
    node.attrs.push({ name: CONTENT_MARKER, value });
    return value;
  }
  function placeholder(value: string): Tree.Template {
    const node = defaultTreeAdapter.createElement('template', HTML, [
      { name: CONTENT_MARKER, value },
    ]);
    return {
      ...node,
      nodeName: 'template',
      tagName: 'template',
      content: defaultTreeAdapter.createDocumentFragment(),
    };
  }
  function source(node: Tree.Element, currentBase: string): ChildDocumentSource {
    const inline = node.tagName === 'iframe' ? attribute(node, 'srcdoc') : undefined;
    if (inline !== undefined)
      return { kind: 'srcdoc', text: inline, baseURL: currentBase };
    const value = attribute(node, node.tagName === 'object' ? 'data' : 'src');
    if (value === undefined || !value.trim()) return { kind: 'empty' };
    const resolved = address(value, currentBase);
    if (resolved.url.href === 'about:blank') return { kind: 'empty' };
    if (resolved.url.protocol === 'data:' || resolved.url.protocol === 'blob:')
      return {
        kind: resolved.url.protocol === 'data:' ? 'data' : 'blob',
        url: resolved.url.href + resolved.hash,
        baseURL: currentBase,
      };
    if (!['http:', 'https:'].includes(resolved.url.protocol))
      throw new Error('Unsupported child document source');
    return {
      kind: 'url',
      url: resolved.url.href + resolved.hash,
      ...(resolved.mapped ? { installedURL: resolved.mapped + resolved.hash } : {}),
    };
  }
  function scrubAttributes(node: Tree.Element, templates: string[], currentBase: string) {
    const retained: Tree.Element['attrs'] = new Array();
    for (const item of node.attrs) {
      const name = item.name.toLowerCase();
      if ([CONTENT_MARKER, 'nonce', 'is', 'manifest'].includes(name)) continue;
      if (name.startsWith('on')) {
        const id = marker(node);
        handlers.push({
          marker: id,
          templates: [...templates],
          event: name.slice(2),
          code: item.value,
        });
        continue;
      }
      if (name === 'srcdoc') continue;
      if (name === 'style') item.value = css(item.value, currentBase);
      if (['src', 'href', 'poster', 'action', 'formaction', 'data'].includes(name))
        item.value = mapURL(item.value, currentBase);
      retained.push(item);
    }
    const id = node.attrs.find((item) => item.name === CONTENT_MARKER);
    node.attrs = retained;
    if (id) node.attrs.push(id);
  }
  function visit(
    node: Tree.Element,
    templates: string[],
    inheritedBase = baseURL,
  ): Tree.Element | undefined {
    const tag = node.tagName.toLowerCase();
    if (tag.includes(':'))
      throw new Error('Qualified element names require an XML parser');
    const declaredNamespace =
      attribute(node, 'xmlns') ??
      node.attrs.find((item) => item.namespace === XMLNS && item.name === 'xmlns')?.value;
    if (
      input.kind === 'svg' &&
      declaredNamespace !== undefined &&
      declaredNamespace !== node.namespaceURI
    )
      throw new Error('XML namespace differs from parsed element namespace');
    if (
      [
        'embed',
        'frame',
        'frameset',
        'fencedframe',
        'portal',
        'applet',
        'webview',
      ].includes(tag)
    )
      throw new Error('Unsupported document context element');
    if (tag === 'base') return undefined;
    normalizeNativeAttributes(tag, node.namespaceURI, node.attrs);
    if (tag === 'meta' && attribute(node, 'http-equiv') !== undefined)
      throw new Error('Response policy cannot be supplied by content');
    const xmlBase =
      input.kind === 'svg'
        ? node.attrs.find(
            (item) =>
              item.name === 'xml:base' ||
              (item.name === 'base' &&
                item.namespace === 'http://www.w3.org/XML/1998/namespace'),
          )
        : undefined;
    const currentBase = xmlBase
      ? new URL(xmlBase.value, inheritedBase).href
      : inheritedBase;
    if (xmlBase) {
      xmlBase.value = currentBase;
      xmlBase.name = 'base';
      xmlBase.prefix = 'xml';
      xmlBase.namespace = 'http://www.w3.org/XML/1998/namespace';
    }
    const childSource =
      tag === 'iframe' || tag === 'object' ? source(node, currentBase) : undefined;
    const scriptURL =
      tag === 'script'
        ? (attribute(node, 'src') ??
          node.attrs.find((item) => item.name === 'href')?.value)
        : undefined;
    // Remove publisher marker attributes before assigning any compiler marker.
    node.attrs = node.attrs.filter((item) => item.name.toLowerCase() !== CONTENT_MARKER);
    scrubAttributes(node, templates, currentBase);
    if (childSource) {
      const id = marker(node);
      contexts.push({
        marker: id,
        templates: [...templates],
        element: tag === 'object' ? 'object' : 'iframe',
        source: childSource,
        attributes: contentAttributes(node).filter(
          (item) => !['src', 'data', 'srcdoc', CONTENT_MARKER].includes(item.name),
        ),
      });
      const inert = placeholder(id);
      if (tag === 'object')
        inert.content.childNodes = node.childNodes.flatMap<Tree.ChildNode>((child) => {
          if (!element(child)) return [child];
          const result = visit(child, [...templates, id], currentBase);
          return result ? [result] : [];
        });
      return inert;
    }
    if (tag === 'script') {
      const type = (attribute(node, 'type') || '').trim().toLowerCase();
      const src = scriptURL;
      if (isDataScript(type)) {
        if (src !== undefined) throw new Error('Data scripts must be inline');
        return node;
      }
      if (!isExecutableScriptType(type))
        throw new Error('Unsupported executable script type');
      const id = marker(node);
      let scriptSource: ContentScript['source'];
      if (src !== undefined) {
        const resolved = address(src, currentBase);
        if (!resolved.mapped) {
          if (!input.unavailableURLs?.includes(resolved.url.href))
            throw new Error('External script is not an installed resource');
          scriptSource = {
            kind: 'unavailable',
            sourceURL: resolved.url.href + resolved.hash,
          };
        } else
          scriptSource = {
            kind: 'resource',
            url: resolved.mapped + resolved.hash,
            sourceURL: resolved.url.href + resolved.hash,
          };
      } else {
        if (node.childNodes.some((child) => element(child)))
          throw new Error('Executable script contains markup');
        scriptSource = {
          kind: 'inline',
          code: node.childNodes
            .map((child) => ('value' in child ? child.value : ''))
            .join(''),
          baseURL: currentBase,
        };
      }
      scripts.push({
        marker: id,
        templates: [...templates],
        kind: type === 'module' ? 'module' : 'classic',
        async: attribute(node, 'async') !== undefined,
        defer: attribute(node, 'defer') !== undefined,
        noModule: attribute(node, 'nomodule') !== undefined,
        attributes: contentAttributes(node).filter(
          (item) => !['src', 'href', 'xlink:href', CONTENT_MARKER].includes(item.name),
        ),
        source: scriptSource,
      });
      return placeholder(id);
    }
    if (tag === 'style')
      for (const child of node.childNodes)
        if ('value' in child) child.value = css(child.value, currentBase);
    if (
      ['animate', 'set'].includes(tag) &&
      /^on/i.test(
        attribute(node, 'attributeName') || attribute(node, 'attributename') || '',
      )
    )
      throw new Error('Declarative event-handler mutation is not admitted');
    node.childNodes = node.childNodes.flatMap<Tree.ChildNode>((child) => {
      if (!element(child)) return [child];
      const result = visit(child, templates, currentBase);
      return result ? [result] : [];
    });
    if (template(node)) {
      const path = [...templates, marker(node)];
      node.content.childNodes = node.content.childNodes.flatMap<Tree.ChildNode>(
        (child) => {
          if (!element(child)) return [child];
          const result = visit(child, path, currentBase);
          return result ? [result] : [];
        },
      );
    }
    return node;
  }
  visit(root, []);
  // SVG fragments will be inserted into a real XML Document. Make namespace
  // boundaries explicit rather than relying on HTML foreign-content parsing.
  function namespace(node: Tree.Element, parent: string) {
    if (node.namespaceURI !== parent && !node.attrs.some((item) => item.name === 'xmlns'))
      node.attrs.push({ name: 'xmlns', value: node.namespaceURI, namespace: XMLNS });
    for (const child of node.childNodes)
      if (element(child)) namespace(child, node.namespaceURI);
    if (template(node))
      for (const child of node.content.childNodes)
        if (element(child)) namespace(child, HTML);
  }
  if (input.kind === 'svg') namespace(root, '');
  function assertPassive(text: string, svg = false) {
    const context = svg ? defaultTreeAdapter.createElement('svg', SVG, []) : undefined;
    const reparsed = context ? parseFragment(context, text, {}) : parseFragment(text);
    function inspect(node: Tree.Node) {
      if (element(node)) {
        const tag = node.tagName.toLowerCase();
        if (
          [
            'iframe',
            'object',
            'embed',
            'frame',
            'frameset',
            'fencedframe',
            'portal',
            'applet',
            'webview',
            'base',
          ].includes(tag) ||
          (tag === 'script' && !isDataScript(attribute(node, 'type') || '')) ||
          node.attrs.some(
            (item) => item.name.toLowerCase().startsWith('on') || item.name === 'srcdoc',
          )
        )
          throw new Error('Serialized content is not inert');
        if (template(node)) inspect(node.content);
      }
      for (const child of children(node)) inspect(child);
    }
    inspect(reparsed);
  }
  const common: ContentCommon = {
    sourceURL,
    baseURL,
    scripts,
    handlers,
    contexts,
  };
  if (input.kind === 'html') {
    const headText = serialize(head!);
    const bodyText = serialize(body!);
    assertPassive(headText);
    assertPassive(bodyText);
    return {
      ...common,
      kind: 'html',
      html: {
        attributes: contentAttributes(root),
        bodyAttributes: contentAttributes(body!),
        head: headText,
        body: bodyText,
      },
    };
  }
  const content = root.childNodes.map((node) => serializeOuter(node)).join('');
  assertPassive(content, true);
  return {
    ...common,
    kind: 'svg',
    svg: { attributes: contentAttributes(root), content },
  };
}
