import {
  parse,
  parseFragment,
  serialize,
  type DefaultTreeAdapterTypes as Tree,
} from 'parse5';
import { isDataScript, isExecutableScriptType } from '../shared/policy.ts';
import { decodeDocumentDataURL } from '../shared/document-data.ts';

import { prepareCSS } from './css.ts';
export { cssReferences } from './css.ts';

const element = (node: Tree.Node): node is Tree.Element => 'tagName' in node;
const attribute = (node: Tree.Element, name: string) =>
  node.attrs.find((attr) => attr.name === name)?.value;
interface PreparedScriptContext {
  url: string;
  baseURL: string;
  documentURL: string;
  inline: boolean;
}
export interface PreparedSourceDocument {
  html: string;
  kind: 'html' | 'svg';
  title: string;
  baseURL: string;
  links: string[];
  documentURLs: string[];
  manifestURL: string | null;
  inlineScripts: { url: string; code: string }[];
  scriptContexts: PreparedScriptContext[];
}
interface SourceDocumentOptions {
  kind?: 'html' | 'svg';
  baseURL?: string;
}
function visit(
  node: Tree.Node,
  callback: (node: Tree.Element) => void,
  templates = true,
) {
  if (element(node)) callback(node);
  if ('childNodes' in node)
    for (const child of node.childNodes) visit(child, callback, templates);
  if (templates && 'content' in node)
    visit(node.content as Tree.DocumentFragment, callback, templates);
}

/** Resolve source dependencies without rendering publisher markup or inheriting policy. */
export function prepareDocument(
  text: string,
  documentURL: string,
  options: SourceDocumentOptions = {},
): PreparedSourceDocument {
  return prepareSource(text, documentURL, options, 0);
}
function prepareSource(
  text: string,
  documentURL: string,
  options: SourceDocumentOptions,
  depth: number,
): PreparedSourceDocument {
  if (depth > 64)
    throw new Error('Nested source documents exceed the preparation work limit');
  const kind = options.kind || 'html';
  const ast = kind === 'html' ? parse(text) : parseFragment(text);
  const links = new Set<string>();
  const documentURLs = new Set<string>();
  const inlineScripts: { url: string; code: string }[] = [];
  const scriptContexts: PreparedScriptContext[] = [];
  let title = '',
    base = options.baseURL || documentURL,
    baseFound = false,
    canonical = documentURL,
    manifestURL: string | null = null;
  if (kind === 'html')
    visit(
      ast,
      (node) => {
        const href = attribute(node, 'href');
        if (node.tagName === 'base' && !baseFound && href) {
          baseFound = true;
          try {
            base = new URL(href, base).href;
          } catch {
            /* Invalid first base keeps the fallback. */
          }
        }
      },
      false,
    );
  visit(
    ast,
    (node) => {
      if (node.tagName !== 'link') return;
      const rel = (attribute(node, 'rel') || '').toLowerCase().split(/\s+/),
        href = attribute(node, 'href');
      if (!href) return;
      if (rel.includes('modulepreload') || rel.includes('preload'))
        links.add(new URL(href, base).href);
      if (!manifestURL && rel.includes('manifest'))
        manifestURL = new URL(href, base).href;
      if (rel.includes('canonical') || rel.includes('dc:isversionof'))
        canonical = new URL(href, base).href;
    },
    false,
  );
  const add = (value: string | undefined, currentBase: string) => {
    if (value && !/^(?:data:|blob:|#)/i.test(value)) {
      const url = new URL(value, currentBase);
      url.hash = '';
      links.add(url.href);
    }
  };
  const absorb = (child: PreparedSourceDocument) => {
    child.links.forEach((url) => links.add(url));
    child.documentURLs.forEach((url) => documentURLs.add(url));
    inlineScripts.push(...child.inlineScripts);
    scriptContexts.push(...child.scriptContexts);
  };
  function walk(parent: Tree.ParentNode, inheritedBase: string) {
    parent.childNodes = parent.childNodes.filter((child) => {
      if (!element(child)) return true;
      const get = (name: string) => attribute(child, name);
      const xmlBase =
        kind === 'svg'
          ? child.attrs.find(
              (attr) =>
                attr.name === 'xml:base' ||
                (attr.prefix === 'xml' && attr.name === 'base'),
            )
          : undefined;
      const currentBase = xmlBase
        ? new URL(xmlBase.value, inheritedBase).href
        : inheritedBase;
      if (xmlBase) xmlBase.value = currentBase;
      if (child.tagName === 'base') return false;
      if (child.tagName === 'title')
        title = child.childNodes
          .map((node) => ('value' in node ? node.value : ''))
          .join('');
      if (
        child.tagName === 'meta' &&
        !get('charset') &&
        !['viewport', 'color-scheme', 'theme-color'].includes(
          get('name')?.toLowerCase() || '',
        )
      )
        return false;
      if (child.tagName === 'link' && get('rel')?.toLowerCase() !== 'stylesheet')
        return false;
      const candidates = child.attrs.find((attr) => attr.name === 'srcset');
      if (candidates) {
        if (!get('src'))
          child.attrs.push({
            name: 'src',
            value: candidates.value.split(',')[0].trim().split(/\s+/)[0],
          });
        child.attrs = child.attrs.filter((attr) => attr !== candidates);
      }
      for (const attr of child.attrs) {
        if (['src', 'href', 'poster', 'data'].includes(attr.name) && attr.value) {
          if (child.tagName === 'a' && attr.name === 'href') {
            if (attr.value.startsWith('#')) continue;
            const target = new URL(attr.value, currentBase),
              identity = new URL(canonical),
              fragment = target.hash;
            target.hash = '';
            identity.hash = '';
            attr.value =
              fragment && target.href === identity.href
                ? fragment
                : new URL(attr.value, currentBase).href;
          } else if (!/^(?:data:|blob:|#|about:)/i.test(attr.value))
            attr.value = new URL(attr.value, currentBase).href;
        }
        if (attr.name === 'style') {
          const css = prepareCSS(attr.value, currentBase, 'declarationList');
          attr.value = css.text;
          css.urls.forEach((url) => add(url, currentBase));
        }
      }
      if (['iframe', 'object'].includes(child.tagName)) {
        const inline =
          child.tagName === 'iframe'
            ? child.attrs.find((attr) => attr.name === 'srcdoc')
            : undefined;
        const source = child.attrs.find(
          (attr) => attr.name === (child.tagName === 'object' ? 'data' : 'src'),
        );
        if (inline) {
          const nested = prepareSource(
            inline.value,
            documentURL,
            { kind: 'html', baseURL: currentBase },
            depth + 1,
          );
          inline.value = nested.html;
          absorb(nested);
        } else if (source?.value) {
          const url = new URL(source.value, currentBase);
          if (url.protocol === 'data:') {
            const fragment = url.hash;
            url.hash = '';
            const decoded = decodeDocumentDataURL(url.href);
            const nested = prepareSource(
              decoded.text,
              documentURL,
              { kind: decoded.kind, baseURL: currentBase },
              depth + 1,
            );
            source.value =
              'data:' +
              (decoded.kind === 'svg' ? 'image/svg+xml' : 'text/html') +
              ';charset=utf-8,' +
              encodeURIComponent(nested.html) +
              fragment;
            absorb(nested);
          } else if (['http:', 'https:'].includes(url.protocol)) {
            url.hash = '';
            links.add(url.href);
            documentURLs.add(url.href);
          }
        }
      }
      if (child.tagName === 'script') {
        const sourceKey =
          child.namespaceURI === 'http://www.w3.org/2000/svg' ? 'href' : 'src';
        if (isDataScript(get('type') || '')) {
          if (get('src') || get('href')) throw new Error('Data scripts must be inline');
          return true;
        }
        if (!isExecutableScriptType(get('type') || ''))
          throw new Error('Unsupported executable script type');
        let url = get(sourceKey);
        const inline = !url;
        if (!url) {
          url = new URL('__pf_inline_' + crypto.randomUUID() + '.js', currentBase).href;
          const code = child.childNodes
            .map((node) => ('value' in node ? node.value : ''))
            .join('');
          inlineScripts.push({ url, code });
          child.childNodes = [];
          child.attrs.push({ name: sourceKey, value: url });
        } else add(url, currentBase);
        const scriptURL = new URL(url, currentBase);
        const documentAddress = new URL(documentURL);
        scriptURL.hash = '';
        documentAddress.hash = '';
        if (!inline && scriptURL.href === documentAddress.href)
          throw new Error('Script must be installed JavaScript, not its source document');
        scriptContexts.push({
          url: scriptURL.href,
          baseURL: currentBase,
          documentURL,
          inline,
        });
      }
      if (child.tagName === 'link') add(get('href'), currentBase);
      if (['img', 'image', 'audio', 'video', 'source', 'input'].includes(child.tagName)) {
        add(get(child.tagName === 'image' ? 'href' : 'src'), currentBase);
        add(get('poster'), currentBase);
      }
      if (child.tagName === 'style')
        for (const node of child.childNodes)
          if ('value' in node) {
            const css = prepareCSS(node.value, currentBase);
            node.value = css.text;
            css.urls.forEach((url) => add(url, currentBase));
          }
      walk(child, currentBase);
      if ('content' in child) walk(child.content as Tree.DocumentFragment, currentBase);
      return true;
    });
  }
  walk(ast, base);
  const html = serialize(ast);
  return {
    html,
    kind,
    title,
    baseURL: base,
    links: [...links],
    documentURLs: [...documentURLs],
    manifestURL,
    inlineScripts,
    scriptContexts,
  };
}
