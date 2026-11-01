import { isJavaScriptMIME } from '../shared/javascript-mime.ts';
import { mime } from '../shared/policy.ts';
import type { Resource } from '../shared/types.ts';

/** Index installed JavaScript by MIME, including files without a .js suffix. */
export function scriptResourceURLs(
  resources: readonly Resource[],
  address: (resource: Resource) => string,
): string[] {
  return resources
    .filter((resource) => isJavaScriptMIME(resource.contentType || mime(resource.path)))
    .map(address);
}
