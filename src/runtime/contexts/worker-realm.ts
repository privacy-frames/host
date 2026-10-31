import {
  strings,
  internalArray,
  internalMap,
  internalSet,
  internalRecord,
} from '../../shared/primordials.ts';
import { sealRuntimeBindings } from '../bindings.ts';
import { prepareRuntimeIntrinsics } from '../intrinsics.ts';
import {
  CONTEXT_POLICY_VERSION,
  type ContextIdentity,
  type WorkerBootstrapMetadata,
} from './model.ts';
import { createPolicyTools } from '../enforcement/native.ts';
import { installEffectPolicy } from '../enforcement/effects.ts';
import { resourceAliases } from '../resource-aliases.ts';
import { scopeContextStorage } from './storage.ts';
import { relocateRuntimeModule } from '../modules.ts';
import type { WorkerControl } from './worker-protocol.ts';
import { createWorkerFactory } from './worker-factory.ts';
import { createSharedWorkerFactory } from './shared-worker-factory.ts';
const worker = self as unknown as DedicatedWorkerGlobalScope;
const rawAdd = EventTarget.prototype.addEventListener;
const rawImport = worker.importScripts;
const rawCreateURL = URL.createObjectURL;
const rawRevokeURL = URL.revokeObjectURL;
const NativeBlob = Blob;
function metadata(
  value: unknown,
  kind: 'dedicated-worker' | 'shared-worker',
): WorkerBootstrapMetadata {
  if (
    !value ||
    typeof value !== 'object' ||
    !('identity' in value) ||
    !('runtime' in value) ||
    !('applicationURL' in value) ||
    !('aliases' in value) ||
    !('rootAliases' in value)
  )
    throw new Error('Context metadata is missing');
  const identity = value.identity;
  if (
    !identity ||
    typeof identity !== 'object' ||
    !('policyVersion' in identity) ||
    identity.policyVersion !== CONTEXT_POLICY_VERSION ||
    !('installationGeneration' in identity) ||
    typeof identity.installationGeneration !== 'string' ||
    !identity.installationGeneration ||
    !('id' in identity) ||
    typeof identity.id !== 'string' ||
    !('application' in identity) ||
    typeof identity.application !== 'string' ||
    !('parent' in identity) ||
    typeof identity.parent !== 'string' ||
    !('kind' in identity) ||
    identity.kind !== kind ||
    !('state' in identity) ||
    identity.state !== 'preparing' ||
    !('url' in identity) ||
    identity.url !== location.href
  )
    throw new Error('Invalid worker identity');
  if (
    typeof value.runtime !== 'string' ||
    typeof value.applicationURL !== 'string' ||
    !Array.isArray(value.aliases) ||
    !Array.isArray(value.rootAliases)
  )
    throw new Error('Invalid context resources');
  const runtime = new URL(value.runtime);
  const application = new URL(value.applicationURL);
  if (application.origin !== runtime.origin)
    throw new Error('Invalid application origin');
  const aliases = internalArray<[string, string]>();
  for (const pair of value.aliases) {
    if (
      !Array.isArray(pair) ||
      pair.length !== 2 ||
      typeof pair[0] !== 'string' ||
      typeof pair[1] !== 'string'
    )
      throw new Error('Invalid resource alias');
    const target = new URL(pair[1]);
    if (
      target.origin !== application.origin ||
      !strings.startsWith(target.pathname, application.pathname)
    )
      throw new Error('Resource belongs to another application');
    aliases.push([pair[0], pair[1]]);
  }
  const checked: ContextIdentity = internalRecord({
    policyVersion: CONTEXT_POLICY_VERSION,
    installationGeneration: identity.installationGeneration,
    id: identity.id,
    application: identity.application,
    parent: identity.parent,
    kind,
    state: 'preparing',
    url: identity.url,
  });
  const rootAliases = internalArray<[string, string]>();
  const destinations = internalSet(aliases.map((pair) => pair[1]));
  for (const pair of value.rootAliases) {
    if (
      !Array.isArray(pair) ||
      pair.length !== 2 ||
      typeof pair[0] !== 'string' ||
      typeof pair[1] !== 'string'
    )
      throw new Error('Invalid root resource alias');
    const source = new URL(pair[0]);
    if (
      source.origin !== application.origin ||
      !strings.startsWith(source.pathname, application.pathname) ||
      !destinations.has(pair[1])
    )
      throw new Error('Root alias belongs to another application or resource graph');
    rootAliases.push([pair[0], pair[1]]);
  }
  return internalRecord({
    identity: checked,
    runtime: runtime.href,
    applicationURL: application.href,
    aliases,
    rootAliases,
  });
}
export function readWorkerMetadata(kind: 'dedicated-worker' | 'shared-worker') {
  const raw: unknown = Reflect.get(globalThis, '__privacyContext');
  Reflect.deleteProperty(globalThis, '__privacyContext');
  return metadata(raw, kind);
}
export function prepareWorkerRealm(
  context: WorkerBootstrapMetadata,
  listenerType: 'message' | 'connect',
  control: WorkerControl,
) {
  prepareRuntimeIntrinsics();
  const tools = createPolicyTools();
  const { apply, method, accessor, descriptor, propertyOwner, fail } = tools;
  let scriptBase = context.applicationURL;
  const resources = resourceAliases(
    internalRecord({
      method,
      accessor,
      descriptor,
      apply,
      target: worker,
      baseURL: () => scriptBase,
    }),
  );
  resources.install(context.aliases, undefined, context.rootAliases);
  const factory = createWorkerFactory(
    tools,
    internalRecord({
      applicationURL: context.applicationURL,
      baseURL: () => scriptBase,
      resources,
      control,
    }),
  );
  const sharedFactory = createSharedWorkerFactory(
    tools,
    internalRecord({
      applicationURL: context.applicationURL,
      baseURL: () => scriptBase,
      resources,
      identity: () =>
        internalRecord({
          application: context.identity.application,
          installationGeneration: context.identity.installationGeneration,
        }),
    }),
  );
  installEffectPolicy(
    tools,
    () => null,
    internalRecord({ Worker: factory, SharedWorker: sharedFactory }),
    worker,
  );
  scopeContextStorage(context.identity.application, tools, worker);
  const NativeURL = URL;
  const readProtocol = descriptor(NativeURL.prototype, 'protocol')!.get!;
  const readOrigin = descriptor(NativeURL.prototype, 'origin')!.get!;
  const readHref = descriptor(NativeURL.prototype, 'href')!.get!;
  const runtimeOrigin: string = apply(readOrigin, new NativeURL(context.runtime), []);
  const locationValues = internalMap<string, string>();
  const locationGetters = internalMap<string, Function>();
  for (const name of [
    'href',
    'origin',
    'protocol',
    'host',
    'hostname',
    'port',
    'pathname',
    'search',
    'hash',
  ]) {
    const get = descriptor(NativeURL.prototype, name)?.get;
    const owner = propertyOwner(location, name);
    if (get && owner) {
      locationGetters.set(name, get);
      accessor(
        owner,
        name,
        internalRecord({ get: () => locationValues.get(name) ?? '' }),
      );
    }
  }
  const locationStringOwner = propertyOwner(location, 'toString');
  if (locationStringOwner) method(locationStringOwner, 'toString', () => scriptBase);
  function installedScript(input: unknown): string {
    const mapped = resources.mapURL(input);
    const target = new NativeURL(mapped);
    const blob = apply(readProtocol, target, []) === 'blob:';
    if (
      blob
        ? apply(readOrigin, target, []) !== runtimeOrigin
        : !resources.isInstalledURL(mapped)
    )
      return fail('Script is not an installed resource or application Blob: ' + mapped);
    return apply(readHref, target, []);
  }
  const importsOwner = propertyOwner(worker, 'importScripts');
  if (importsOwner)
    method(importsOwner, 'importScripts', (...inputs: unknown[]) =>
      apply(rawImport, worker, inputs.map(installedScript)),
    );
  Object.defineProperty(
    worker,
    'privacyHost',
    internalRecord({
      value: Object.freeze(
        internalRecord({
          version: 1,
          application: context.identity.application,
          mode: 'network-isolated',
          context: context.identity.kind,
        }),
      ),
      writable: false,
      configurable: false,
    }),
  );
  // Registration opens delivery of native parent messages. This permits a module
  // to await its first message without waiting for module evaluation to finish.
  let applicationListenerReady: (() => void) | undefined;
  const onmessageOwner = propertyOwner(worker, 'on' + listenerType);
  if (!onmessageOwner) throw new Error('Worker message handlers are unavailable');
  const onmessage = descriptor(onmessageOwner, 'on' + listenerType);
  if (!onmessage?.set || !onmessage.get)
    throw new Error('Worker message handler accessors are unavailable');
  const setOnmessage = onmessage.set;
  const getOnmessage = onmessage.get;
  accessor(
    onmessageOwner,
    'on' + listenerType,
    internalRecord({
      set(this: DedicatedWorkerGlobalScope, value: unknown) {
        apply(setOnmessage, this, [value]);
        if (this === worker && typeof apply(getOnmessage, this, []) === 'function')
          applicationListenerReady?.();
      },
    }),
  );
  method(
    EventTarget.prototype,
    'addEventListener',
    function (this: EventTarget, ...args: unknown[]) {
      if (args.length) args[0] = tools.str(args[0]);
      const result = apply(rawAdd, this, args);
      if (this === worker && args[0] === listenerType && args[1] != null)
        applicationListenerReady?.();
      return result;
    },
  );
  sealRuntimeBindings(worker);
  return internalRecord({
    tools,
    resources,
    async load(start: unknown, notify: () => void) {
      let blob: string | undefined;
      try {
        if (
          !start ||
          typeof start !== 'object' ||
          !('source' in start) ||
          typeof start.source !== 'string'
        )
          throw new Error('Invalid worker source');
        const source = installedScript(start.source);
        const expectedBase = resources.sourceURL(source) || source;
        if (!('base' in start) || start.base !== expectedBase)
          throw new Error('Worker execution base does not match its admitted source');
        scriptBase = expectedBase;
        const sourceLocation = new NativeURL(scriptBase);
        for (const [name, get] of locationGetters)
          locationValues.set(name, apply(get, sourceLocation, []));
        const module = strings.endsWith(
          new NativeURL(context.identity.url).pathname,
          '/module.js',
        );
        let entry = source;
        if ('body' in start && start.body !== undefined) {
          if (
            !(start.body instanceof ArrayBuffer) ||
            start.body.byteLength > 100 * 1024 * 1024 ||
            !strings.startsWith(source, 'blob:')
          )
            throw new Error('Invalid worker Blob body');
          const code = relocateRuntimeModule(
            new TextDecoder().decode(start.body),
            source,
            resources,
          );
          blob = apply(rawCreateURL, NativeURL, [
            new NativeBlob([code], internalRecord({ type: 'text/javascript' })),
          ]);
          entry = blob!;
        } else if (strings.startsWith(source, 'blob:'))
          throw new Error('Worker Blob bytes are missing');
        await control('verify', []);
        applicationListenerReady = notify;
        if (module) await import(entry);
        else apply(rawImport, worker, [entry]);
        notify();
      } finally {
        applicationListenerReady = undefined;
        if (blob) apply(rawRevokeURL, NativeURL, [blob]);
      }
    },
  });
}
