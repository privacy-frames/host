import {
  parseFragment,
  serialize,
  defaultTreeAdapter,
  html,
  type DefaultTreeAdapterTypes as Tree,
} from 'parse5';
import { normalizeNativeAttributes } from '../../shared/native-attributes.ts';

export const CONTEXT_MARKER = 'data-privacy-document';

export interface FragmentInput {
  text: string;
  localName: string;
  namespace: string;
  markerPrefix: string;
}

export interface FragmentContext {
  key: string;
  element: 'iframe' | 'object';
  attributes: [string, string][];
}

export interface PreparedFragment {
  html: string;
  contexts: FragmentContext[];
}

/** Pure parsing; callers own native context creation and publication. */
export function prepareFragment(input: FragmentInput): PreparedFragment {
  const namespace =
    input.namespace === html.NS.SVG
      ? html.NS.SVG
      : input.namespace === html.NS.MATHML
        ? html.NS.MATHML
        : html.NS.HTML;
  const parent = defaultTreeAdapter.createElement(input.localName, namespace, []);
  const ast = parseFragment(parent, input.text, {});
  const contexts: FragmentContext[] = [];
  function visit(parent: Tree.ParentNode): void {
    parent.childNodes = parent.childNodes.map((child) => {
      if (!('tagName' in child)) return child;
      normalizeNativeAttributes(child.tagName, child.namespaceURI, child.attrs);
      if (child.attrs.some((item) => item.name === CONTEXT_MARKER))
        throw new Error('Reserved context marker');
      if (
        child.namespaceURI === html.NS.HTML &&
        (child.tagName === 'iframe' || child.tagName === 'object')
      ) {
        if (child.attrs.some((item) => item.name.startsWith('on')))
          throw new Error('Inline event handlers are not admitted');
        const key = input.markerPrefix + '-' + contexts.length;
        contexts.push({
          key,
          element: child.tagName,
          attributes: child.attrs.map((item) => [item.name, item.value]),
        });
        const placeholder: Tree.Template = {
          ...defaultTreeAdapter.createElement('template', html.NS.HTML, [
            { name: CONTEXT_MARKER, value: key },
          ]),
          nodeName: 'template',
          tagName: 'template',
          content: defaultTreeAdapter.createDocumentFragment(),
        };
        return placeholder;
      }
      visit(child);
      if ('content' in child) visit(child.content as Tree.DocumentFragment);
      return child;
    });
  }
  visit(ast);
  return { html: serialize(ast), contexts };
}
