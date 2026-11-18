import type {
  GuestWorkerInitialization,
  GuestWorkerSession,
  GuestWorkerSessionFactory,
} from './types.ts';

const INITIALIZATION = 'privacy-frames:guest-worker';

function initialization(value: unknown, location: string): GuestWorkerInitialization {
  if (typeof value !== 'object' || value === null)
    throw new TypeError('Worker initialization is missing');
  const packet = value as Partial<GuestWorkerInitialization>;
  const catalog = packet.catalog;
  if (
    packet.kind !== INITIALIZATION ||
    (packet.scriptType !== 'classic' && packet.scriptType !== 'module') ||
    typeof packet.entryURL !== 'string' ||
    (packet.name !== undefined && typeof packet.name !== 'string') ||
    !catalog ||
    typeof catalog.application !== 'string' ||
    typeof catalog.generation !== 'string' ||
    typeof catalog.sourceURL !== 'string' ||
    typeof catalog.documentBase !== 'string' ||
    typeof catalog.runtimeURL !== 'string' ||
    typeof catalog.applicationURL !== 'string' ||
    !(catalog.engineWasm instanceof ArrayBuffer) ||
    !Array.isArray(catalog.resources) ||
    !catalog.resources.every(
      (resource) =>
        resource &&
        typeof resource.url === 'string' &&
        typeof resource.path === 'string' &&
        typeof resource.contentType === 'string' &&
        resource.bytes instanceof ArrayBuffer,
    )
  ) {
    throw new TypeError('Invalid worker initialization');
  }
  if (new URL('./', location).href !== catalog.applicationURL)
    throw new DOMException('Worker initialization has another owner', 'SecurityError');
  // The complete record was validated at the message boundary above.
  return packet as GuestWorkerInitialization;
}

function copyMessage(event: MessageEvent): MessageEvent {
  return new MessageEvent(event.type, {
    data: event.data,
    ports: [...event.ports],
    origin: event.origin,
    lastEventId: event.lastEventId,
  });
}

/** Bootstrap is the first native listener; messages wait until guest setup completes. */
export function startDedicatedWorker(
  scope: DedicatedWorkerGlobalScope,
  createSession: GuestWorkerSessionFactory,
): void {
  let state: 'waiting' | 'preparing' | 'ready' | 'closed' = 'waiting';
  let session: GuestWorkerSession | undefined;
  const pending: MessageEvent[] = [];
  const nativeClose = scope.close.bind(scope);

  function fail(error: unknown): void {
    state = 'closed';
    pending.length = 0;
    session?.close();
    // A native uncaught task error is reported through Worker.onerror.
    setTimeout(() => {
      throw error instanceof Error ? error : new Error(String(error));
    });
    setTimeout(nativeClose);
  }

  const receive = (event: MessageEvent<unknown>) => {
    if (state === 'ready' || state === 'closed') return;
    event.stopImmediatePropagation();
    if (state === 'preparing') {
      pending.push(copyMessage(event));
      return;
    }
    state = 'preparing';
    void (async () => {
      const descriptor = initialization(event.data, scope.location.href);
      session = await createSession(descriptor, scope);
      await session.start(descriptor.entryURL, descriptor.scriptType);
      state = 'ready';
      scope.removeEventListener('message', receive);
      for (const queued of pending.splice(0)) scope.dispatchEvent(queued);
    })().catch(fail);
  };
  scope.addEventListener('message', receive);
}

/** Every native shared port starts with a host packet before guest connect delivery. */
export function startSharedWorker(
  scope: SharedWorkerGlobalScope,
  createSession: GuestWorkerSessionFactory,
): void {
  let descriptor: GuestWorkerInitialization | undefined;
  let ready: Promise<GuestWorkerSession> | undefined;
  const initializedPorts = new WeakSet<MessagePort>();
  const nativeConnect = (event: MessageEvent) => {
    if (!event.isTrusted) return;
    event.stopImmediatePropagation();
    const port = event.ports[0];
    if (!port) return;
    const pending: MessageEvent[] = [];
    let preparing = false;

    const receive = (message: MessageEvent<unknown>) => {
      if (initializedPorts.has(port)) return;
      message.stopImmediatePropagation();
      if (preparing) {
        pending.push(copyMessage(message));
        return;
      }
      preparing = true;
      void (async () => {
        const candidate = initialization(message.data, scope.location.href);
        if (!descriptor) {
          descriptor = candidate;
          ready = (async () => {
            const session = await createSession(candidate, scope);
            await session.start(candidate.entryURL, candidate.scriptType);
            return session;
          })();
        } else if (
          candidate.catalog.application !== descriptor.catalog.application ||
          candidate.catalog.generation !== descriptor.catalog.generation ||
          candidate.entryURL !== descriptor.entryURL ||
          candidate.scriptType !== descriptor.scriptType
        ) {
          throw new DOMException('Shared worker identity changed', 'SecurityError');
        }
        await ready;
        initializedPorts.add(port);
        port.removeEventListener('message', receive);
        scope.dispatchEvent(new MessageEvent('connect', { ports: [port] }));
        for (const queued of pending.splice(0)) port.dispatchEvent(queued);
      })().catch((error: unknown) => {
        pending.length = 0;
        port.postMessage({ type: 'privacy-frames:worker-error', message: String(error) });
        port.close();
      });
    };
    port.addEventListener('message', receive);
    port.start();
  };
  scope.addEventListener('connect', nativeConnect);
}
