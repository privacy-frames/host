import {
  strings,
  ownDescriptor,
  internalRecord,
  internalSet,
  internalArray,
} from '../../shared/primordials.ts';
import { parseDocumentSurface, type DocumentSurface } from './document-surface.ts';
import type { WindowContentMetadata } from './window-realm.ts';
import type { DocumentContentInput } from './document-content-types.ts';
import { CONTEXT_POLICY_VERSION } from './model.ts';
import { LIMITS } from '../../shared/policy.ts';
export interface DocumentRegistration extends DocumentSurface {
  id: string;
  nonce: string;
  parentToken: string;
  kind: 'html' | 'svg';
  url: string;
}
export interface DocumentBootstrapConfiguration extends DocumentRegistration {
  policyVersion: number;
  application: string;
  installationGeneration: string;
  applicationURL: string;
  runtimeURL: string;
  content: WindowContentMetadata;
}
const NativeURL = URL;
const apply = Reflect.apply;
const descriptor = ownDescriptor;
const href = descriptor(NativeURL.prototype, 'href')!.get!;
const hash = descriptor(NativeURL.prototype, 'hash')!.get!;
const protocol = descriptor(NativeURL.prototype, 'protocol')!.get!;
const username = descriptor(NativeURL.prototype, 'username')!.get!;
const password = descriptor(NativeURL.prototype, 'password')!.get!;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const MAX_TEXT = 100 * 1024 * 1024;
const encoder = new TextEncoder();
const encode = TextEncoder.prototype.encode;
function field(value: unknown, name: string): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid document protocol data');
  const own = descriptor(value, name);
  if (!own) return undefined;
  if (!('value' in own)) throw new Error('Document protocol requires data properties');
  return own.value;
}
function string(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > MAX_TEXT)
    throw new Error('Invalid document protocol string');
  return value;
}
export function documentIdentifier(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value))
    throw new Error('Invalid document context identifier');
  return value;
}
function address(value: unknown, webOnly = false): string {
  const text = string(value);
  const url = new NativeURL(text);
  if (
    apply(username, url, []) ||
    apply(password, url, []) ||
    (webOnly && !['http:', 'https:'].includes(apply(protocol, url, [])))
  )
    throw new Error('Invalid document protocol URL');
  return apply(href, url, []);
}
function aliases(value: unknown, applicationURL: string): [string, string][] {
  if (!Array.isArray(value) || value.length > 1000)
    throw new Error('Invalid document resource graph');
  const result = internalArray<[string, string]>();
  for (const entry of value) {
    if (!Array.isArray(entry) || entry.length !== 2)
      throw new Error('Invalid document resource alias');
    const source = address(entry[0], true);
    const target = address(entry[1], true);
    if (
      apply(hash, new NativeURL(source), []) ||
      apply(hash, new NativeURL(target), []) ||
      !strings.startsWith(target, applicationURL)
    )
      throw new Error('Document resource leaves its application');
    result.push([source, target]);
  }
  return result;
}
export function parseDocumentRegistration(
  value: unknown,
  applicationURL: string,
): DocumentRegistration {
  const id = documentIdentifier(field(value, 'id'));
  const kind = field(value, 'kind');
  if (kind !== 'html' && kind !== 'svg') throw new Error('Invalid document kind');
  const url = address(field(value, 'url'), true);
  const expected = apply(
    href,
    new NativeURL(`__contexts/${id}/document.${kind}`, applicationURL),
    [],
  );
  if (url !== expected) throw new Error('Invalid document bootstrap address');
  return internalRecord({
    id,
    kind,
    url,
    ...parseDocumentSurface(value),
    nonce: documentIdentifier(field(value, 'nonce')),
    parentToken: documentIdentifier(field(value, 'parentToken')),
  });
}
export function parseWindowContentMetadata(
  value: unknown,
  applicationURL: string,
): WindowContentMetadata {
  const documentBase = field(value, 'documentBase');
  const resources = aliases(field(value, 'aliases'), applicationURL);
  const scripts = field(value, 'scripts');
  if (!Array.isArray(scripts) || scripts.length > LIMITS.files)
    throw new Error('Invalid document script inventory');
  const targets = internalSet(resources.map((entry) => entry[1]));
  const seen = internalSet<string>();
  const checkedScripts = internalArray<string>();
  for (const input of scripts) {
    const url = address(input, true);
    if (!targets.has(url) || seen.has(url))
      throw new Error('Document script is not a unique admitted resource');
    seen.add(url);
    checkedScripts.push(url);
  }
  return internalRecord({
    installationGeneration: string(field(value, 'installationGeneration')),
    aliases: resources,
    scripts: checkedScripts,
    source: address(field(value, 'source'), true),
    ...(documentBase === undefined
      ? internalRecord({})
      : internalRecord({ documentBase: address(documentBase) })),
  });
}
export function parseInstalledDocument(value: unknown, applicationURL: string) {
  return internalRecord({
    ...parseWindowContentMetadata(value, applicationURL),
    document: parseDocumentContentInput(
      field(value, 'document'),
      internalRecord({
        kind: 'html',
        applicationURL,
      }),
    ),
  });
}
export function parseDocumentBootstrap(
  value: unknown,
  expectedURL: string,
): DocumentBootstrapConfiguration {
  const applicationURL = address(field(value, 'applicationURL'), true);
  const runtimeURL = address(field(value, 'runtimeURL'), true);
  const registration = parseDocumentRegistration(value, applicationURL);
  const installationGeneration = string(field(value, 'installationGeneration'));
  const content = parseWindowContentMetadata(field(value, 'content'), applicationURL);
  if (content.installationGeneration !== installationGeneration)
    throw new Error('Document content generation differs from its bootstrap');
  if (
    registration.url !== expectedURL ||
    !strings.endsWith(applicationURL, '/') ||
    !strings.endsWith(runtimeURL, '/') ||
    !strings.startsWith(applicationURL, runtimeURL) ||
    field(value, 'policyVersion') !== CONTEXT_POLICY_VERSION
  )
    throw new Error('Invalid document bootstrap ownership');
  return internalRecord({
    ...registration,
    policyVersion: CONTEXT_POLICY_VERSION,
    application: string(field(value, 'application')),
    installationGeneration,
    applicationURL,
    runtimeURL,
    content,
  });
}
export function parseDocumentContentInput(
  value: unknown,
  configuration: Pick<DocumentBootstrapConfiguration, 'kind' | 'applicationURL'>,
): DocumentContentInput {
  const kind = field(value, 'kind');
  const text = field(value, 'text');
  if (
    (kind !== 'html' && kind !== 'svg') ||
    kind !== configuration.kind ||
    typeof text !== 'string' ||
    apply(encode, encoder, [text]).byteLength > MAX_TEXT
  )
    throw new Error('Invalid document content');
  const base = field(value, 'baseURL');
  const unavailable = field(value, 'unavailableURLs');
  if (
    unavailable !== undefined &&
    (!Array.isArray(unavailable) || unavailable.length > LIMITS.files)
  )
    throw new Error('Invalid unavailable document resources');
  const unavailableURLs = Array.isArray(unavailable)
    ? unavailable.map((item: unknown) => address(item, true))
    : [];
  return internalRecord({
    kind,
    text,
    sourceURL: address(field(value, 'sourceURL')),
    ...(base === undefined
      ? internalRecord({})
      : internalRecord({ baseURL: address(base) })),
    aliases: aliases(field(value, 'aliases'), configuration.applicationURL),
    unavailableURLs,
  });
}
