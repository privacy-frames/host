import { strings, internalRecord } from '../shared/primordials.ts';
import { compileDocumentContent } from './contexts/document-content.ts';
import { type DocumentContentInput } from './contexts/document-content-types.ts';
import { resourceURL } from '../shared/runtime-url.ts';
import type { Installation } from '../shared/types.ts';
import { manifestURL } from './pwa.ts';
import { scriptResourceURLs } from './script-resources.ts';
export function alias(
  app: Installation,
  input: string,
  base: string,
  runtime: URL,
): string {
  if (strings.startsWith(input, '#')) return input;
  try {
    const url = new URL(input, base),
      hash = url.hash;
    url.hash = '';
    const resource = app.resources.find((item) => item.url === url.href);
    return resource ? resourceURL(app, resource.path, runtime).href + hash : input;
  } catch {
    return input;
  }
}
export function css(app: Installation, text: string, base: string, runtime: URL): string {
  return strings.replace(
    strings.replace(
      text,
      /url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]*))\s*\)/gi,
      (whole, double, single, plain) => {
        const value = double ?? single ?? plain;
        const mapped = alias(app, value, base, runtime);
        return mapped === value ? whole : `url(${JSON.stringify(mapped)})`;
      },
    ),
    /(@import\s+)(["'])(.*?)\2/gi,
    (_whole, rule, _quote, value) =>
      rule + JSON.stringify(alias(app, value, base, runtime)),
  );
}
/** Return source data for an already prepared root realm, never active markup. */
export function prepareRuntimeDocument(
  app: Installation,
  bytes: ArrayBuffer,
  runtime: URL,
) {
  const documentBase =
    app.resources.find((resource) => resource.path === app.manifest.entry)
      ?.documentBase ||
    app.documentBase ||
    app.source;
  const aliases: [string, string][] = app.resources.map((resource) => [
    resource.url,
    resourceURL(app, resource.path, runtime).href,
  ]);
  const document: DocumentContentInput = internalRecord({
    kind: 'html',
    text: new TextDecoder().decode(bytes),
    sourceURL: app.source,
    baseURL: documentBase,
    aliases,
    unavailableURLs: app.capture.unavailableResources.map((item) => item.url),
  });
  // Runtime admission and the controller repeat this validation independently
  // of the installer. Only the prepared renderer consumes the source afterward.
  compileDocumentContent(document);
  return internalRecord({
    source: app.source,
    documentBase,
    aliases,
    scripts: scriptResourceURLs(
      app.resources,
      (resource) => resourceURL(app, resource.path, runtime).href,
    ),
    manifestURL: manifestURL(app, runtime).href,
    document,
  });
}
