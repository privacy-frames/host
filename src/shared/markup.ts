import { parse, parseFragment, type DefaultTreeAdapterTypes } from 'parse5';
import { strings, internalRecord, internalSet } from './primordials.ts';
import { isNavigationTarget } from './navigation-targets.ts';
import { isUnsafeNativeAttributeMutation } from './native-attributes.ts';
import { elementAllowed, isDataScript } from './policy.ts';

const presentationMetadata = internalSet(['viewport', 'color-scheme', 'theme-color']);

interface MarkupOptions {
  document?: boolean;
  initial?: boolean;
}

export function validateMarkup(
  html: string,
  { document = false, initial = false }: MarkupOptions = internalRecord({}),
): DefaultTreeAdapterTypes.Document | DefaultTreeAdapterTypes.DocumentFragment {
  // Apply this lexical gate before parsing, including raw text and comments.
  if (
    /<\/?\s*(?:iframe|frame|frameset|object|embed|applet|portal|fencedframe|webview|base)/i.test(
      html,
    )
  ) {
    throw new Error('Context-producing markup is not admitted');
  }
  if (!initial && /<\/?\s*(?:script|link|meta)/i.test(html)) {
    throw new Error('Dynamic policy/resource markup is not admitted');
  }

  const ast = document ? parse(html) : parseFragment(html);
  function visit(node: DefaultTreeAdapterTypes.Node): void {
    if ('tagName' in node) {
      const tag = strings.toLowerCase(node.tagName);
      elementAllowed(tag);
      if (
        tag === 'meta' &&
        node.attrs.some(
          (attribute) =>
            attribute.name === 'http-equiv' ||
            (attribute.name === 'name' &&
              !presentationMetadata.has(strings.toLowerCase(attribute.value))),
        )
      ) {
        throw new Error('Application response policy must be supplied by the host');
      }
      if (
        tag === 'link' &&
        strings.toLowerCase(
          node.attrs.find((attribute) => attribute.name === 'rel')?.value || '',
        ) !== 'stylesheet'
      ) {
        throw new Error('Only stylesheet links are admitted');
      }
      if (
        tag === 'script' &&
        !(
          initial &&
          isDataScript(
            node.attrs.find((attribute) => attribute.name === 'type')?.value || '',
          ) &&
          !node.attrs.some((attribute) => attribute.name === 'src')
        ) &&
        (!initial ||
          !node.attrs.some((attribute) => attribute.name === 'src') ||
          node.childNodes.some(
            (child) => 'value' in child && Boolean(strings.trim(child.value)),
          ))
      ) {
        throw new Error('Inline scripts must be prepared as installed resources');
      }
      for (const attribute of node.attrs) {
        if (
          (isNavigationTarget(attribute.name) &&
            strings.toLowerCase(attribute.value) !== '_self') ||
          isUnsafeNativeAttributeMutation(attribute.name, attribute.value)
        )
          throw new Error('Native browsing targets must remain in the prepared context');
        if (
          strings.startsWith(attribute.name, 'on') ||
          ['srcdoc', 'is', 'manifest'].includes(attribute.name)
        ) {
          throw new Error(`Attribute not admitted: ${attribute.name}`);
        }
      }
    }
    if ('childNodes' in node) for (const child of node.childNodes) visit(child);
    if ('content' in node) visit(node.content);
  }
  visit(ast);
  return ast;
}
