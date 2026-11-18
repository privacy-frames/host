export type GuestDocumentSource =
  { kind: 'resource'; url: string } | { kind: 'markup'; html: string; baseURL: string };

export interface GuestDocumentSession {
  close(): void;
}

export interface GuestDocumentFactoryOptions {
  baseURL: string;
  /** Called after the real iframe exists, before application markup is rendered. */
  prepare(
    frame: HTMLIFrameElement,
    source: GuestDocumentSource,
  ): Promise<GuestDocumentSession>;
  report(error: unknown): void;
}

interface DocumentState {
  source: GuestDocumentSource;
  generation: number;
  session?: GuestDocumentSession;
  pending?: Promise<void>;
  ready: boolean;
  nativeLoad?: { resolve(): void; reject(error: Error): void };
  nativeURL?: string;
}

/** Application frame URLs select admitted content, never a native navigation. */
export function createGuestDocuments(options: GuestDocumentFactoryOptions) {
  const frames = new WeakMap<HTMLIFrameElement, DocumentState>();
  const sessions = new Set<GuestDocumentSession>();
  const active = new Set<DocumentState>();
  const nativeDispatch = EventTarget.prototype.dispatchEvent;
  let disposed = false;

  function state(frame: HTMLIFrameElement): DocumentState {
    if (disposed) throw new Error('Guest document factory is closed');
    const existing = frames.get(frame);
    if (existing) {
      active.add(existing);
      return existing;
    }
    const source = frame.getAttribute('srcdoc');
    const address = frame.getAttribute('src');
    const created: DocumentState = {
      source:
        source !== null
          ? { kind: 'markup', html: source, baseURL: options.baseURL }
          : address && address !== 'about:blank'
            ? { kind: 'resource', url: new URL(address, options.baseURL).href }
            : { kind: 'markup', html: '', baseURL: options.baseURL },
      generation: 0,
      ready: false,
    };
    frame.removeAttribute('srcdoc');
    frame.removeAttribute('src');
    frames.set(frame, created);
    active.add(created);
    // The native blank document can finish loading before its guest environment.
    // Only the post-preparation load event is delivered to application listeners.
    frame.addEventListener(
      'load',
      (event) => {
        if (event.isTrusted) {
          if (
            created.nativeLoad &&
            frame.contentWindow?.location.href === created.nativeURL &&
            frame.contentDocument?.readyState === 'complete'
          ) {
            created.nativeLoad.resolve();
            created.nativeLoad = undefined;
          }
          if (!created.ready) event.stopImmediatePropagation();
        }
      },
      true,
    );
    return created;
  }

  function close(current: DocumentState): void {
    current.generation++;
    current.ready = false;
    current.nativeLoad?.reject(
      new DOMException('Document preparation changed', 'AbortError'),
    );
    current.nativeLoad = undefined;
    current.nativeURL = undefined;
    if (current.session) {
      sessions.delete(current.session);
      current.session.close();
      current.session = undefined;
    }
    current.pending = undefined;
  }

  function prepare(frame: HTMLIFrameElement): Promise<void> {
    const current = state(frame);
    if (!frame.isConnected || current.ready) return Promise.resolve();
    if (current.pending) return current.pending;
    const generation = current.generation;
    const pending = (async () => {
      const prepared = await options.prepare(frame, current.source);
      if (generation !== current.generation || !frame.isConnected) {
        prepared.close();
        return;
      }
      current.session = prepared;
      sessions.add(prepared);
      current.ready = true;
      nativeDispatch.call(frame, new Event('load'));
    })()
      .catch((error: unknown) => {
        if (generation === current.generation) {
          options.report(error);
          nativeDispatch.call(frame, new Event('error'));
        }
      })
      .finally(() => {
        if (current.pending === pending) current.pending = undefined;
      });
    current.pending = pending;
    return pending;
  }

  return {
    /** Register before insertion so native load cannot precede host preparation. */
    track(frame: HTMLIFrameElement): void {
      state(frame);
    },
    configure(frame: HTMLIFrameElement, source: GuestDocumentSource): Promise<void> {
      const current = state(frame);
      close(current);
      current.source = source;
      return prepare(frame);
    },
    source(frame: HTMLIFrameElement): GuestDocumentSource {
      return state(frame).source;
    },
    /** Trusted preparation can await the native bootstrap while guest load waits. */
    navigate(frame: HTMLIFrameElement, bootstrapURL: string): Promise<void> {
      const current = state(frame);
      current.nativeLoad?.reject(
        new DOMException('Document navigation replaced', 'AbortError'),
      );
      return new Promise<void>((resolve, reject) => {
        current.nativeLoad = { resolve, reject };
        current.nativeURL = bootstrapURL;
        frame.src = bootstrapURL;
      });
    },
    connected: prepare,
    disconnected(frame: HTMLIFrameElement): void {
      const current = frames.get(frame);
      if (current) {
        close(current);
        active.delete(current);
      }
    },
    dispose(): void {
      disposed = true;
      for (const current of active) close(current);
      active.clear();
      sessions.clear();
    },
  };
}
