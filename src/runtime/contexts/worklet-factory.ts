import type { PolicyTools } from '../enforcement/native.ts';
import { strings, internalRecord, internalMap } from '../../shared/primordials.ts';
import type { ResourceAliases } from '../resource-aliases.ts';
import type {
  WorkletKind,
  WorkletModuleSource,
  WorkletRegistration,
} from './worklet-types.ts';

// Control-plane requests retain the pre-adapter native operation.
const nativeFetch = fetch;

interface WorkletFactoryOptions {
  applicationURL: string;
  resources: Pick<ResourceAliases, 'mapURL' | 'isInstalledURL'>;
}
interface WorkletState {
  kind: WorkletKind;
  id?: string;
  registration: Promise<void>;
  modules: Map<string, Promise<void>>;
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
  const responseJSON = Response.prototype.json,
    responseText = Response.prototype.text;
  const headerGet = Headers.prototype.get;
  const stringify = JSON.stringify;
  const runtimeOrigin: string = apply(origin, new NativeURL(options.applicationURL), []);
  const endpoint: string = apply(
    href,
    new NativeURL('__worklet-intents', options.applicationURL),
    [],
  );
  const states = new WeakMap<object, WorkletState>();
  function register(worklet: object, kind: WorkletKind) {
    if (!states.has(worklet))
      states.set(
        worklet,
        internalRecord({
          kind,
          registration: NativePromise.resolve(),
          modules: internalMap(),
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
      url = field('url');
    if (
      typeof id !== 'string' ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id) ||
      field('kind') !== kind ||
      typeof url !== 'string'
    )
      fail('Invalid worklet registration identity');
    const expected = apply(
      href,
      new NativeURL(`__contexts/${id}/worklet/entry/`, options.applicationURL),
      [],
    );
    if (
      !strings.startsWith(url, expected) ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.js$/.test(
        strings.slice(url, expected.length),
      )
    )
      fail('Invalid worklet module route');
    return internalRecord({ id, kind, url });
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
          const reply = await nativeFetch(
            endpoint,
            internalRecord<RequestInit>({
              method: 'POST',
              credentials: 'omit',
              headers: internalRecord({ 'Content-Type': 'application/json' }),
              body: stringify(
                internalRecord({
                  kind: state.kind,
                  ...(state.id ? internalRecord({ id: state.id }) : internalRecord({})),
                  source: moduleSource,
                }),
              ),
            }),
          );
          if (!apply(responseOK, reply, [])) fail('Worklet registration was refused');
          const value = registration(await apply(responseJSON, reply, []), state.kind);
          if (state.id && state.id !== value.id) fail('Worklet identity changed');
          state.id = value.id;
          return value;
        },
      ]) as Promise<WorkletRegistration>;
      state.registration = apply(promiseThen, issued, [() => undefined, () => undefined]);
      const loading: Promise<void> = apply(promiseThen, issued, [
        (value: WorkletRegistration) =>
          apply(nativeAdd, this, [value.url, internalRecord({ credentials: 'omit' })]),
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
