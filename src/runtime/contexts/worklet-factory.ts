import type { PolicyTools } from '../enforcement/native.ts';
import { internalArray, internalRecord, internalMap } from '../../shared/primordials.ts';
import type { ResourceAliases } from '../resource-aliases.ts';
import type {
  WorkletKind,
  WorkletModuleSource,
  WorkletRegistration,
} from './worklet-types.ts';
import { WORKLET_REQUEST } from './worklet-types.ts';
import { createWorkletBootstrap, createWorkletChunks } from './worklet-chunks.ts';
import { readWorkletGraph } from './worklet-graph-schema.ts';

// Control-plane requests retain the pre-adapter native operation.
const nativeFetch = fetch;

interface WorkletFactoryOptions {
  applicationURL: string;
  resources: Pick<ResourceAliases, 'mapURL' | 'isInstalledURL'>;
  request(packet: unknown): Promise<unknown>;
}
interface WorkletState {
  kind: WorkletKind;
  id?: string;
  registration: Promise<void>;
  modules: Map<string, Promise<void>>;
  facades: Map<string, string>;
  bootstrap?: ReturnType<typeof createWorkletBootstrap>;
  guard?: string;
  chunks: ReturnType<typeof createWorkletChunks>[];
}

/** Keep native Worklet objects, addModule promises and processor ports. */
export function createWorkletFactory(
  tools: PolicyTools,
  options: WorkletFactoryOptions,
): Function | undefined {
  if (typeof Worklet !== 'function') return undefined;
  const { apply, descriptor, accessor, propertyOwner, str, fail } = tools;
  const nativeAdd = Worklet.prototype.addModule;
  const NativePromise = Promise;
  const promiseThen = Promise.prototype.then;
  const NativeURL = URL;
  const href = descriptor(NativeURL.prototype, 'href')!.get!;
  const origin = descriptor(NativeURL.prototype, 'origin')!.get!;
  const protocol = descriptor(NativeURL.prototype, 'protocol')!.get!;
  const responseOK = descriptor(Response.prototype, 'ok')!.get!;
  const responseHeaders = descriptor(Response.prototype, 'headers')!.get!;
  const responseText = Response.prototype.text;
  const headerGet = Headers.prototype.get;
  const runtimeOrigin: string = apply(origin, new NativeURL(options.applicationURL), []);
  const states = new WeakMap<object, WorkletState>();
  function register(worklet: object, kind: WorkletKind) {
    if (!states.has(worklet))
      states.set(
        worklet,
        internalRecord({
          kind,
          registration: NativePromise.resolve(),
          modules: internalMap(),
          facades: internalMap(),
          chunks: internalArray(),
        }),
      );
    return worklet;
  }
  if (typeof BaseAudioContext === 'function') {
    const owner = propertyOwner(BaseAudioContext.prototype, 'audioWorklet');
    const get = owner && descriptor(owner, 'audioWorklet')?.get;
    if (owner && get)
      accessor(
        owner,
        'audioWorklet',
        internalRecord({
          get(this: BaseAudioContext) {
            return register(apply(get, this, []), 'audio');
          },
        }),
      );
  }
  if (typeof CSS === 'object') {
    const owner = propertyOwner(CSS, 'paintWorklet');
    const get = owner && descriptor(owner, 'paintWorklet')?.get;
    if (owner && get)
      accessor(
        owner,
        'paintWorklet',
        internalRecord({
          get() {
            return register(apply(get, CSS, []), 'paint');
          },
        }),
      );
  }
  function registration(value: unknown, kind: WorkletKind): WorkletRegistration {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return fail('Invalid worklet registration');
    const field = (key: string) => {
      const property = descriptor(value, key);
      if (!property || !('value' in property)) fail('Invalid worklet registration field');
      return property?.value;
    };
    const id = field('id'),
      entry = field('entry'),
      guard = field('guard');
    if (
      typeof id !== 'string' ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id) ||
      field('kind') !== kind ||
      typeof entry !== 'string' ||
      typeof guard !== 'string' ||
      !guard
    )
      fail('Invalid worklet registration identity');
    const raw = field('graph');
    const graph = raw === null ? null : readWorkletGraph(raw);
    if (graph && graph.entry !== entry) fail('Worklet entry identity changed');
    return internalRecord({ id, kind, entry, guard, graph });
  }
  async function source(url: URL, address: string): Promise<WorkletModuleSource> {
    if (apply(protocol, url, []) !== 'blob:') {
      if (!options.resources.isInstalledURL(address))
        fail('Worklet script is not installed');
      return internalRecord({ kind: 'resource', url: address });
    }
    if (apply(origin, url, []) !== runtimeOrigin)
      fail('Worklet Blob belongs to another origin');
    const value = await nativeFetch(address);
    if (!apply(responseOK, value, [])) fail('Worklet Blob is unavailable');
    return internalRecord({
      kind: 'blob',
      url: address,
      text: await apply(responseText, value, []),
      contentType:
        apply(headerGet, apply(responseHeaders, value, []), ['content-type']) || '',
    });
  }
  return function addModule(
    this: Worklet,
    input: unknown,
    requestOptions?: unknown,
  ): Promise<void> {
    const run = async () => {
      const state =
        states.get(this) || fail('Worklet is not owned by this prepared realm');
      if (requestOptions !== undefined && requestOptions !== null) {
        const credentials = Reflect.get(Object(requestOptions), 'credentials');
        if (
          credentials !== undefined &&
          !['omit', 'same-origin', 'include'].includes(str(credentials))
        )
          throw new TypeError('Invalid Worklet credentials mode');
      }
      const mapped = options.resources.mapURL(str(input));
      const url = new NativeURL(mapped);
      const address: string = apply(href, url, []);
      const previous = state.modules.get(address);
      if (previous) return previous;
      const inputSource = source(url, address).then(
        (value) => internalRecord({ source: value }),
        (error: unknown) => internalRecord({ error }),
      );
      const issued = apply(promiseThen, state.registration, [
        async () => {
          const prepared = await inputSource;
          if ('error' in prepared) throw prepared.error;
          const moduleSource = prepared.source;
          const modules = internalArray<[string, string]>();
          for (const pair of state.facades) modules.push(pair);
          const value = registration(
            await options.request(
              internalRecord({
                type: WORKLET_REQUEST,
                kind: state.kind,
                source: moduleSource,
                modules,
                ...(state.id ? internalRecord({ id: state.id }) : internalRecord({})),
              }),
            ),
            state.kind,
          );
          if (state.id && state.id !== value.id) fail('Worklet identity changed');
          if (options.resources.mapURL(value.entry) !== address)
            fail('Worklet source changed');
          if (state.guard && state.guard !== value.guard)
            fail('Worklet preparation changed');
          const bootstrap = state.bootstrap || createWorkletBootstrap(value.guard);
          let linked: ReturnType<typeof createWorkletChunks> | undefined;
          try {
            linked = value.graph ? createWorkletChunks(value.graph) : undefined;
            const entry =
              linked?.entry ||
              state.facades.get(value.entry) ||
              fail('Prepared worklet module is missing');
            const url = bootstrap.entry(entry);
            if (linked) {
              for (const [id, local] of linked.facades) state.facades.set(id, local);
              state.chunks.push(linked);
            }
            state.bootstrap = bootstrap;
            state.guard = value.guard;
            state.id = value.id;
            return url;
          } catch (error) {
            linked?.close();
            if (!state.bootstrap) bootstrap.close();
            throw error;
          }
        },
      ]);
      state.registration = apply(promiseThen, issued, [() => undefined, () => undefined]);
      const loading: Promise<void> = apply(promiseThen, issued, [
        (url: string) =>
          apply(nativeAdd, this, [url, internalRecord({ credentials: 'omit' })]),
      ]);
      state.modules.set(address, loading);
      void apply(promiseThen, loading, [
        undefined,
        () => {
          state.modules.delete(address);
        },
      ]);
      return loading;
    };
    // The public promise is distinct from private registration/cache promises.
    return run();
  };
}
