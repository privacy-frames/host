import {
  internalArray,
  internalMap,
  internalRecord,
  ownDescriptor,
} from '../../shared/primordials.ts';
import { LIMITS, mime } from '../../shared/policy.ts';
import { isJavaScriptMIME } from '../../shared/javascript-mime.ts';
import { resourceURL } from '../../shared/runtime-url.ts';
import type { StoredInstallation } from '../storage.ts';
import {
  WorkletRegistry,
  workletIdentifier,
  workletKind,
  workletModuleSource,
  workletStorage,
  type WorkletActor,
  type WorkletStorage,
} from './worklet-store.ts';
import {
  WORKLET_IMPORTS,
  type WorkletModuleSource,
  type WorkletRegistration,
} from './worklet-types.ts';
import { prepareWorkletModule } from './worklet-source.ts';
import type { WorkletGraph, WorkletGraphOptions } from './worklet-graph.ts';

export interface WorkletOwner {
  app: StoredInstallation;
  clientId: string;
}
interface WorkletControllerOptions {
  base: URL;
  owner(clientId: string): Promise<WorkletOwner | undefined>;
  readResource(
    app: StoredInstallation,
    path: string,
    generation: string,
  ): Promise<ArrayBuffer>;
  guardSource(): Promise<string>;
  importSource(): Promise<string>;
  compile(options: WorkletGraphOptions): Promise<WorkletGraph>;
  storage?: WorkletStorage;
}
function field(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid worklet request');
  const property = ownDescriptor(value, key);
  if (property && !('value' in property))
    throw new Error('Invalid worklet request field');
  return property?.value;
}
function actor(owner: WorkletOwner): WorkletActor {
  return {
    application: owner.app.id,
    generation: owner.app.generation,
    parentClient: owner.clientId,
  };
}
function resource(app: StoredInstallation, input: string, base: URL) {
  const url = new URL(input);
  url.hash = '';
  return app.resources.find(
    (item) =>
      item.url === url.href || resourceURL(app, item.path, base).href === url.href,
  );
}
function javascript(app: StoredInstallation, input: string, base: URL) {
  const item = resource(app, input, base);
  if (!item || !isJavaScriptMIME(item.contentType || mime(item.path)))
    throw new Error('Worklet module is not installed JavaScript');
  return item;
}

/** Native sender binding selects the owner; packet identity fields grant no role. */
export function createWorkletController(options: WorkletControllerOptions) {
  const registry = new WorkletRegistry(options.storage || workletStorage(options.base));
  return internalRecord({
    async request(clientId: string, packet: unknown): Promise<WorkletRegistration> {
      const owner = await options.owner(clientId);
      if (!owner || owner.clientId !== clientId)
        throw new Error('Worklet owner is unavailable');
      const kind = workletKind(field(packet, 'kind'));
      let source: WorkletModuleSource = workletModuleSource(field(packet, 'source'));
      if (source.kind === 'resource') {
        const item = javascript(owner.app, source.url, options.base);
        source = { kind: 'resource', url: item.url + new URL(source.url).hash };
      } else if (new URL(source.url).origin !== options.base.origin)
        throw new Error('Worklet Blob belongs to another origin');
      const previous = field(packet, 'id');
      const issued = await registry.register(
        actor(owner),
        kind,
        source,
        previous === undefined ? undefined : workletIdentifier(previous),
      );
      const identity = issued.identity;
      const external = internalMap<string, string>();
      const modules = field(packet, 'modules');
      if (!Array.isArray(modules) || modules.length > LIMITS.files * 2 + 2)
        throw new Error('Invalid prepared worklet modules');
      for (let index = 0; index < modules.length; index++) {
        const pair: unknown = ownDescriptor(modules, '' + index)?.value;
        if (!Array.isArray(pair) || pair.length !== 2)
          throw new Error('Invalid prepared worklet module');
        const id: unknown = ownDescriptor(pair, '0')?.value;
        const local: unknown = ownDescriptor(pair, '1')?.value;
        if (typeof id !== 'string' || typeof local !== 'string')
          throw new Error('Invalid prepared worklet module URL');
        const url = new URL(local);
        if (
          url.protocol !== 'blob:' ||
          url.origin !== options.base.origin ||
          external.has(id)
        )
          throw new Error('Prepared worklet module is not local');
        const installed = resource(owner.app, id, options.base);
        const installedJavaScript =
          installed && isJavaScriptMIME(installed.contentType || mime(installed.path));
        if (
          id !== WORKLET_IMPORTS &&
          !installedJavaScript &&
          !identity.entries.some(
            (entry) => entry.source.kind === 'blob' && entry.source.url === id,
          )
        )
          throw new Error('Prepared worklet module is not owned');
        external.set(id, url.href);
      }
      const aliases = internalArray<[string, string]>();
      for (const item of owner.app.resources) {
        const canonical = resourceURL(owner.app, item.path, options.base).href;
        aliases.push([item.url, canonical], [canonical, canonical]);
      }
      const entry =
        source.kind === 'blob'
          ? source.url
          : resourceURL(
              owner.app,
              javascript(owner.app, source.url, options.base).path,
              options.base,
            ).href + new URL(source.url).hash;
      const graph = external.has(entry)
        ? null
        : await options.compile({
            entry,
            external,
            async readModule(id) {
              if (id === WORKLET_IMPORTS) return options.importSource();
              const blob = identity.entries.find(
                (item) => item.source.kind === 'blob' && item.source.url === id,
              )?.source;
              let code: string, baseURL: string, logicalURL: string;
              if (blob?.kind === 'blob') {
                code = blob.text;
                baseURL = logicalURL = blob.url;
              } else {
                const item = javascript(owner.app, id, options.base);
                const bytes = await options.readResource(
                  owner.app,
                  item.path,
                  identity.generation,
                );
                if (bytes.byteLength > LIMITS.bytes)
                  throw new Error('Worklet module exceeds size limit');
                code = new TextDecoder().decode(bytes);
                baseURL =
                  resourceURL(owner.app, item.path, options.base).href + new URL(id).hash;
                logicalURL = item.url + new URL(id).hash;
              }
              return prepareWorkletModule(code, {
                baseURL,
                logicalURL,
                importsURL: WORKLET_IMPORTS,
                aliases,
              });
            },
          });
      const metadata = {
        version: identity.version,
        id: identity.id,
        kind: identity.kind,
        application: identity.application,
        generation: identity.generation,
        parentClient: identity.parentClient,
      };
      const guard =
        'const __privacyWorkletMetadata=' +
        JSON.stringify(metadata) +
        ';\n' +
        (await options.guardSource());
      const current = await options.owner(clientId);
      if (
        !current ||
        current.clientId !== clientId ||
        current.app.id !== owner.app.id ||
        current.app.generation !== identity.generation ||
        !(await registry.resolve(identity.id, actor(current)))
      )
        throw new Error('Worklet owner changed during preparation');
      return { id: identity.id, kind, entry, guard, graph };
    },
  });
}
