import { strings, internalRecord } from './primordials.ts';
import {
  isNavigationTarget,
  isUnsafeTargetMutation,
  normalizeNavigationAttributes,
} from './navigation-targets.ts';

export const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';

/** Native effect controls retain an explicit value across application mutation. */
export function fixedNativeAttribute(
  name: string,
  namespace: string | null,
): string | undefined {
  if (isNavigationTarget(name)) return '_self';
  if (namespace === HTML_NAMESPACE && strings.toLowerCase(name) === 'spellcheck')
    return 'false';
}

export function isUnsafeNativeAttributeMutation(name: string, value: string): boolean {
  return (
    isUnsafeTargetMutation(name, value) ||
    (strings.toLowerCase(name) === 'attributename' &&
      strings.toLowerCase(strings.trim(value)) === 'spellcheck')
  );
}

/** Prepare parser-owned HTML before editable elements can reach a live document. */
export function normalizeNativeAttributes(
  tag: string,
  namespace: string,
  attributes: Array<{ name: string; value: string }>,
): void {
  normalizeNavigationAttributes(tag, attributes);
  for (const item of attributes) {
    if (isUnsafeNativeAttributeMutation(item.name, item.value))
      throw new Error('Declarative native effect-control mutation is not admitted');
  }
  if (namespace !== HTML_NAMESPACE) return;
  const existing = attributes.find((item) => item.name === 'spellcheck');
  if (existing) existing.value = 'false';
  else attributes.push(internalRecord({ name: 'spellcheck', value: 'false' }));
}
