import { internalMap, internalRecord } from '../../shared/primordials.ts';
import type { Resource } from '../../shared/types.ts';
import { applicationURL, resourceURL } from '../../shared/runtime-url.ts';
import { isExecutableScriptType, mime } from '../../shared/policy.ts';
import { getApp, type StoredInstallation } from '../storage.ts';
import { response } from '../response-policy.ts';
import { workerResourceAliases } from '../contexts/worker-aliases.ts';
import {
  CONTEXT_POLICY_VERSION,
  ContextRegistry,
  type WorkerBootstrapMetadata,
} from '../contexts/model.ts';
import {
  PublisherStore,
  publisherId,
  type PublisherExecutor,
  type PublisherRegistration,
} from './store.ts';
import {
  PUBLISHER_RPC,
  PUBLISHER_LAUNCH,
  publisherObject,
  publisherString,
  publisherName,
  type PublisherLaunch,
  type PublisherClientDescription,
} from './protocol.ts';
interface Options {
  base: URL;
  contexts: ContextRegistry;
  client(id: string): Promise<Client | undefined>;
  application(client: Client): Promise<string | null>;
  windows(): Promise<readonly WindowClient[]>;
  bootstrap(): Promise<Response | undefined>;
  resource(app: StoredInstallation, path: string): Promise<Response | undefined>;
  store?: PublisherStore;
}
interface Connection {
  port: MessagePort;
  closed: boolean;
  executor: PublisherExecutor;
  jobs: Map<
    string,
    { resolve(value: Record<string, unknown>): void; reject(reason: Error): void }
  >;
  ready: Promise<void>;
  close(reason?: Error): void;
}
/** A lost executor changes availability, not the host's admitted resource policy. */
class PublisherExecutorUnavailable extends Error {}

const UUID = '[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}';
const bootstrapPattern = new RegExp(
  `/__contexts/publisher/(${UUID})/(classic|module)\\.js$`,
);
const redeemPattern = new RegExp(`/__contexts/(${UUID})/publisher-connect$`);
const headersForPublisher = (headers: Headers) =>
  Array.from(headers).filter(
    ([name]) =>
      !['cookie', 'cookie2', 'authorization', 'proxy-authorization'].includes(
        name.toLowerCase(),
      ),
  );
function executable(resource: Resource) {
  const type = (resource.contentType || mime(resource.path))
    .split(';')[0]
    .trim()
    .toLowerCase();
  return (
    isExecutableScriptType(type) ||
    type === 'text/html' ||
    type === 'application/xhtml+xml' ||
    type === 'image/svg+xml' ||
    type === 'application/xml' ||
    type === 'text/xml'
  );
}
/** Publisher source is an application data-plane participant, never a controller. */
export function createPublisherController(options: Options) {
  const { base, contexts } = options;
  const store = options.store || new PublisherStore();
  const connections = internalMap<string, Connection>();
  const pendingLaunches = internalMap<
    string,
    {
      promise: Promise<Connection>;
      resolve(value: Connection): void;
      reject(reason: Error): void;
    }
  >();
  async function nativeOwner(client: Client | undefined) {
    if (!client || client.type !== 'window') return;
    const appId = await options.application(client);
    const app = appId ? await getApp(appId) : undefined;
    return app ? internalRecord({ client, app }) : undefined;
  }
  async function owner(id: string) {
    return id ? nativeOwner(await options.client(id)) : undefined;
  }

  async function liveRegistration(id: string) {
    const registration = await store.byId(id);
    const app = registration ? await getApp(registration.application) : undefined;
    return registration && app && app.generation === registration.generation
      ? internalRecord({ registration, app })
      : undefined;
  }
  async function launch(
    registration: PublisherRegistration,
    parentClient: string,
  ): Promise<PublisherLaunch> {
    const app = await getApp(registration.application);
    if (!app || app.generation !== registration.generation)
      throw new Error('Publisher installation was replaced');
    return internalRecord({
      registration,
      ticket: await store.grant(registration, parentClient),
      url: new URL(
        `__contexts/publisher/${registration.id}/${registration.type}.js`,
        applicationURL(app, base),
      ).href,
      name: publisherName(app.id, app.generation, registration.id),
    });
  }
  async function windows(app: StoredInstallation) {
    const values = await options.windows();
    const result: WindowClient[] = [];
    for (const client of values)
      if ((await options.application(client)) === app.id) result.push(client);
    return result;
  }
  async function describe(
    app: StoredInstallation,
  ): Promise<PublisherClientDescription[]> {
    return (await windows(app)).map((client) =>
      internalRecord({
        id: client.id,
        url: client.url,
        type: 'window',
        frameType: client.frameType,
        visibilityState: client.visibilityState,
        focused: client.focused,
      }),
    );
  }
  async function ensure(registration: PublisherRegistration): Promise<Connection> {
    const live = connections.get(registration.id);
    if (live) {
      await live.ready;
      return live;
    }
    const existing = pendingLaunches.get(registration.id);
    if (existing) return existing.promise;
    let resolve!: (value: Connection) => void, reject!: (reason: Error) => void;
    const promise = new Promise<Connection>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    const pending = internalRecord({ promise, resolve, reject });
    pendingLaunches.set(registration.id, pending);
    // This timeout covers trusted executor rebinding, never arbitrary application
    // fetch-handler runtime. Publisher code cannot expand the admitted resource set.
    const timer = setTimeout(() => {
      if (pendingLaunches.get(registration.id) === pending) {
        pendingLaunches.delete(registration.id);
        reject(new PublisherExecutorUnavailable('Publisher executor unavailable'));
      }
    }, 15000);
    void promise.finally(() => clearTimeout(timer)).catch(() => {});
    try {
      const app = await getApp(registration.application);
      if (!app || app.generation !== registration.generation)
        throw new Error('Publisher installation unavailable');
      const parents = await windows(app);
      if (!parents.length) throw new Error('Publisher profile requires an app Window');
      parents[0].postMessage(
        internalRecord({
          type: PUBLISHER_LAUNCH,
          launch: await launch(registration, parents[0].id),
        }),
      );
    } catch (error) {
      pendingLaunches.delete(registration.id);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
    return promise;
  }
  function job(
    connection: Connection,
    operation: string,
    payload: unknown,
    ports: Transferable[] = [],
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      if (connection.closed) {
        reject(new PublisherExecutorUnavailable('Publisher executor disconnected'));
        return;
      }
      const id = crypto.randomUUID();
      connection.jobs.set(id, internalRecord({ resolve, reject }));
      try {
        connection.port.postMessage(
          internalRecord({ type: 'privacy-publisher-job', id, operation, payload }),
          ports,
        );
      } catch (error) {
        connection.jobs.delete(id);
        reject(error);
      }
    });
  }
  async function attach(
    registration: PublisherRegistration,
    port: MessagePort,
    ticket: string,
  ) {
    const prior = connections.get(registration.id);
    if (prior)
      prior.close(new PublisherExecutorUnavailable('Publisher executor replaced'));
    let readyResolve!: () => void, readyReject!: (reason: Error) => void;
    const ready = new Promise<void>((resolve, reject) => {
      readyResolve = resolve;
      readyReject = reject;
    });
    const connection: Connection = internalRecord({
      port,
      closed: false,
      executor: internalRecord({
        application: registration.application,
        generation: registration.generation,
        registration: registration.id,
        browserClient: '',
        contextId: '',
        parentClient: '',
      }),
      jobs: internalMap(),
      ready,
      close(
        reason = new PublisherExecutorUnavailable('Publisher executor disconnected'),
      ) {
        if (connection.closed) return;
        connection.closed = true;
        if (connections.get(registration.id) === connection)
          connections.delete(registration.id);
        port.close();
        readyReject(reason);
        for (const task of connection.jobs.values()) task.reject(reason);
        connection.jobs.clear();
      },
    });
    void ready.catch(() => {});
    connections.set(registration.id, connection);
    const timer = setTimeout(() => connection.close(), 15000);
    port.onmessage = (event) => {
      if (connection.closed) return;
      void (async () => {
        const data = publisherObject(event.data);
        if (data.type === 'privacy-publisher-ready') {
          const executor = await store.executor(registration.id);
          // The one-use role grant was redeemed through an actual bound SharedWorker
          // fetch before readiness. A Window-supplied arbitrary port cannot self-assert.
          if (
            !executor ||
            data.contextId !== executor.contextId ||
            data.browserClient !== executor.browserClient
          )
            throw new Error('Publisher executor role was not redeemed');
          connection.executor = executor;
          await store.activate(registration.id, executor);
          const current = await liveRegistration(registration.id);
          if (current)
            for (const client of await windows(current.app))
              client.postMessage(
                internalRecord({
                  type: 'privacy-publisher-state',
                  registration: internalRecord({
                    ...current.registration,
                    state: 'active',
                    lifecycleCompleted: true,
                  }),
                }),
              );
          clearTimeout(timer);
          readyResolve();
          const waiting = pendingLaunches.get(registration.id);
          if (waiting) {
            pendingLaunches.delete(registration.id);
            waiting.resolve(connection);
          }
        } else if (data.type === 'privacy-publisher-result') {
          const id = publisherString(data.id),
            pending = connection.jobs.get(id);
          if (!pending) return;
          connection.jobs.delete(id);
          if (data.ok === true) pending.resolve(publisherObject(data.value));
          else pending.reject(new Error('Publisher event failed'));
        } else if (data.type === 'privacy-publisher-client-rpc') {
          const operation = publisherString(data.operation),
            id = publisherString(data.id);
          const live = await liveRegistration(registration.id);
          if (!live) throw new Error('Publisher installation unavailable');
          let value: unknown;
          if (operation === 'clients') value = await describe(live.app);
          else if (operation === 'post-message') {
            const payload = publisherObject(data.payload);
            const target = (await windows(live.app)).find(
              (client) => client.id === payload.client,
            );
            if (!target) throw new Error('Publisher client is outside the application');
            target.postMessage(
              internalRecord({
                type: 'privacy-publisher-application-message',
                registration: registration.id,
                data: payload.data,
              }),
              [...event.ports],
            );
            value = true;
          } else if (operation === 'unregister') {
            value = await store.unregister(live.registration);
            for (const client of await windows(live.app))
              client.postMessage(
                internalRecord({ type: 'privacy-publisher-state', registration: null }),
              );
          } else throw new Error('Unknown publisher client operation');
          port.postMessage(
            internalRecord({
              type: 'privacy-publisher-client-result',
              id,
              ok: true,
              value,
            }),
          );
        } else if (data.type === 'privacy-publisher-failed')
          throw new Error('Publisher executor failed');
      })().catch(() => {
        clearTimeout(timer);
        connection.close(new Error('Invalid publisher executor protocol'));
      });
    };
    port.onmessageerror = () => connection.close();
    port.start();
    port.postMessage(internalRecord({ type: 'privacy-publisher-connect', ticket }));
    await ready;
  }
  async function registration(app: StoredInstallation, input: unknown) {
    const data = publisherObject(input);
    const url = new URL(publisherString(data.script));
    if (url.username || url.password || url.hash)
      throw new Error('Invalid publisher script URL');
    const resource = app.resources.find(
      (resource) =>
        resource.url === url.href ||
        resourceURL(app, resource.path, base).href === url.href,
    );
    if (
      !resource ||
      !isExecutableScriptType(
        (resource.contentType || mime(resource.path)).split(';')[0].trim(),
      )
    )
      throw new Error('Publisher script is not installed JavaScript');
    if (data.workerType !== 'classic' && data.workerType !== 'module')
      throw new Error('Invalid publisher script type');
    const scope = new URL(publisherString(data.scope));
    const source = new URL(app.source);
    if (
      scope.origin !== source.origin ||
      scope.search ||
      scope.hash ||
      scope.username ||
      scope.password
    )
      throw new Error('Publisher scope is outside the app');
    return store.register(
      internalRecord({ application: app.id, generation: app.generation }),
      internalRecord({
        script: resource.url,
        scope: scope.href,
        type: data.workerType,
      }),
    );
  }
  return internalRecord({
    handlesMessage(data: unknown) {
      return (
        !!data &&
        typeof data === 'object' &&
        'type' in data &&
        data.type === PUBLISHER_RPC
      );
    },
    async message(event: ExtendableMessageEvent) {
      const reply = event.ports[0];
      if (!reply) return;
      try {
        const source = event.source;
        if (!source || !('type' in source) || source.type !== 'window')
          throw new Error('Publisher request has no Window owner');
        // This is the browser-provided ExtendableMessageEvent source, never a
        // body-claimed client. Re-fetching a loading Window through clients.get
        // can deadlock a parser waiting for its publisher-mediated resources.
        const parent = await nativeOwner(source);
        if (!parent) throw new Error('Publisher request has no current app owner');
        const data = publisherObject(event.data),
          operation = publisherString(data.operation);
        let value: unknown;
        if (operation === 'register') {
          const record = await registration(parent.app, data.payload);
          value = await launch(record, parent.client.id);
        } else if (operation === 'status') {
          const record = await store.registration(
            internalRecord({
              application: parent.app.id,
              generation: parent.app.generation,
            }),
          );
          value = record ? await launch(record, parent.client.id) : null;
        } else if (operation === 'attach') {
          const payload = publisherObject(data.payload),
            record = await store.byId(publisherId(payload.registration));
          if (
            !record ||
            record.application !== parent.app.id ||
            record.generation !== parent.app.generation ||
            event.ports.length !== 2
          )
            throw new Error('Publisher attachment leaves its app');
          await attach(record, event.ports[1], publisherId(payload.ticket));
          value = true;
        } else if (operation === 'unregister') {
          const record = await store.registration(
            internalRecord({
              application: parent.app.id,
              generation: parent.app.generation,
            }),
          );
          value = await store.unregister(
            internalRecord({
              application: parent.app.id,
              generation: parent.app.generation,
            }),
          );
          if (record) {
            connections.get(record.id)?.close();
          }
          for (const client of await windows(parent.app))
            client.postMessage(
              internalRecord({ type: 'privacy-publisher-state', registration: null }),
            );
        } else if (operation === 'message') {
          const record = await store.registration(
            internalRecord({
              application: parent.app.id,
              generation: parent.app.generation,
            }),
          );
          if (!record) throw new Error('Publisher registration unavailable');
          const connection = await ensure(record);
          value = await job(
            connection,
            'message',
            internalRecord({
              data: data.payload,
              source: (await describe(parent.app)).find(
                (client) => client.id === parent.client.id,
              ),
            }),
            event.ports.slice(1),
          );
        } else throw new Error('Unknown publisher operation');
        reply.postMessage(internalRecord({ ok: true, value }));
      } catch (error) {
        reply.postMessage(
          internalRecord({
            ok: false,
            error: error instanceof Error ? error.message : 'Publisher request failed',
          }),
        );
      } finally {
        reply.close();
      }
    },
    async respond(event: FetchEvent): Promise<Response | undefined> {
      const url = new URL(event.request.url),
        bootstrap = url.pathname.match(bootstrapPattern),
        redeem = url.pathname.match(redeemPattern);
      if (url.origin !== base.origin || (!bootstrap && !redeem)) return;
      if (url.search || url.hash) return Response.error();
      if (bootstrap) {
        if (
          event.request.method !== 'GET' ||
          event.request.destination !== 'sharedworker' ||
          !event.resultingClientId
        )
          return Response.error();
        const parent = await owner(event.clientId),
          live = await liveRegistration(bootstrap[1]);
        if (
          !parent ||
          !live ||
          parent.app.id !== live.app.id ||
          parent.app.generation !== live.app.generation ||
          bootstrap[2] !== live.registration.type
        )
          return Response.error();
        const entry = applicationURL(live.app, base);
        if (
          url.href !==
          new URL(
            `__contexts/publisher/${live.registration.id}/${live.registration.type}.js`,
            entry,
          ).href
        )
          return Response.error();
        const identity = internalRecord({
          policyVersion: CONTEXT_POLICY_VERSION,
          installationGeneration: live.app.generation,
          id: crypto.randomUUID(),
          application: live.app.id,
          parent: parent.client.id,
          kind: 'shared-worker' as const,
          state: 'preparing' as const,
          url: url.href,
        });
        await contexts.bind(event.resultingClientId, identity);
        await store.bind(
          internalRecord({
            application: live.app.id,
            generation: live.app.generation,
            registration: live.registration.id,
            browserClient: event.resultingClientId,
            contextId: identity.id,
            parentClient: parent.client.id,
          }),
        );
        const code = await options.bootstrap();
        if (!code) return Response.error();
        const resources = new URL(`__contexts/${identity.id}/resources/`, entry);
        const metadata: WorkerBootstrapMetadata = internalRecord({
          identity,
          runtime: base.href,
          applicationURL: entry.href,
          ...workerResourceAliases(live.app, resources, base),
        });
        return response(
          `"use strict";globalThis.__privacyContext=${JSON.stringify(metadata)};\n${await code.text()}`,
          'text/javascript',
          200,
          internalRecord({
            workerSource: new URL('__contexts/', entry).href,
            controllerSource: new URL('sw.js', base).href,
          }),
        );
      }
      if (
        event.request.method !== 'POST' ||
        event.request.destination !== '' ||
        !event.clientId ||
        event.resultingClientId
      )
        return Response.error();
      const bound = await contexts.resolveWorker(event.clientId);
      if (!bound || bound.kind !== 'shared-worker' || bound.id !== redeem![1])
        return Response.error();
      try {
        const body = publisherObject(await event.request.json());
        const registrationId = publisherId(body.registration),
          executor = await store.executor(registrationId);
        if (
          !executor ||
          executor.browserClient !== event.clientId ||
          executor.contextId !== bound.id ||
          executor.application !== bound.application ||
          executor.generation !== bound.installationGeneration
        )
          return Response.error();
        const record = await store.consume(publisherId(body.ticket), executor),
          live = await liveRegistration(registrationId);
        if (
          !record ||
          !live ||
          url.href !==
            new URL(
              `__contexts/${bound.id}/publisher-connect`,
              applicationURL(live.app, base),
            ).href
        )
          return Response.error();
        return response(
          JSON.stringify(
            internalRecord({
              registration: record,
              browserClient: event.clientId,
              contextId: bound.id,
            }),
          ),
          'application/json',
        );
      } catch {
        return Response.error();
      }
    },
    async isExecutor(clientId: string) {
      const bound = await contexts.resolveWorker(clientId);
      if (!bound || bound.kind !== 'shared-worker') return false;
      const record = await store.registration(
        internalRecord({
          application: bound.application,
          generation: bound.installationGeneration,
        }),
      );
      const executor = record ? await store.executor(record.id) : undefined;
      return executor?.browserClient === clientId && executor.contextId === bound.id;
    },
    async intercept(
      event: Pick<FetchEvent, 'request' | 'clientId' | 'resultingClientId'>,
      app: StoredInstallation,
      resource: Resource,
      baseResponse: Response,
    ): Promise<Response> {
      if (
        event.request.method !== 'GET' ||
        event.resultingClientId ||
        !['', 'image', 'audio', 'video', 'font', 'style', 'track'].includes(
          event.request.destination,
        ) ||
        executable(resource)
      )
        return baseResponse;
      const record = await store.registration(
        internalRecord({
          application: app.id,
          generation: app.generation,
        }),
      );
      if (!record) return baseResponse;
      const bound = await contexts.resolveWorker(event.clientId);
      const executor = await store.executor(record.id);
      if (
        bound &&
        executor?.browserClient === event.clientId &&
        executor.contextId === bound.id
      )
        return baseResponse;
      try {
        const connection = await ensure(record);
        const value = await job(
          connection,
          'fetch',
          internalRecord({
            url: resource.url,
            headers: headersForPublisher(event.request.headers),
            clientId: event.clientId,
            destination: event.request.destination,
          }),
        );
        if (value.handled === false) return baseResponse;
        if (
          value.handled !== true ||
          value.error === true ||
          !(value.body instanceof ArrayBuffer) ||
          !Array.isArray(value.headers) ||
          typeof value.status !== 'number' ||
          value.status < 200 ||
          value.status >= 300
        )
          return Response.error();
        const headers = new Headers(value.headers as [string, string][]);
        const type =
          headers.get('content-type') || resource.contentType || mime(resource.path);
        if (
          isExecutableScriptType(type.split(';')[0]) ||
          /html|svg\+xml|(?:^|\/)xml/i.test(type)
        )
          return Response.error();
        const result = response(value.body, type, value.status);
        for (const name of [
          'content-language',
          'cache-control',
          'expires',
          'last-modified',
          'etag',
          'vary',
        ])
          if (headers.has(name)) result.headers.set(name, headers.get(name)!);
        return result;
      } catch (error) {
        if (error instanceof PublisherExecutorUnavailable) {
          // Rebinding can close a pending compatibility fetch. The host still
          // permits this exact immutable resource; never retry publisher code or
          // contact the network. Revalidate ownership after the asynchronous job.
          const current = await getApp(app.id);
          const client = await options.client(event.clientId);
          if (
            current?.generation === app.generation &&
            client &&
            (await options.application(client)) === app.id
          )
            return baseResponse;
        }
        return Response.error();
      }
    },
  });
}
