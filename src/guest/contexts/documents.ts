import {
  beginContextPublication,
  closeContextPublication,
  isCurrentContextPublication,
  type ContextPublicationState,
} from './lifecycle-kernel.ts';

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
    signal: AbortSignal,
  ): Promise<GuestDocumentSession>;
  report(error: unknown): void;
}

interface DocumentState extends ContextPublicationState {
  source: GuestDocumentSource;
  session?: GuestDocumentSession;
  pending?: Promise<void>;
  ready: boolean;
  nativeLoad?: { resolve(): void; reject(error: Error): void };
  preparation?: AbortController;
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
      token: {},
      closed: true,
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
            frame.contentWindow?.location.href === 'about:blank' &&
            frame.contentDocument?.readyState === 'complete'
          ) {
            created.nativeLoad.resolve();
            created.nativeLoad = undefined;
          }
          // Native loads describe the initial empty document. Logical app loads
          // are dispatched only after its guest environment and markup are ready.
          event.stopImmediatePropagation();
        }
      },
      true,
    );
    return created;
  }

  function close(current: DocumentState): object {
    const token = closeContextPublication(current);
    const preparation = current.preparation;
    const nativeLoad = current.nativeLoad;
    const session = current.session;
    // Release owned fields before callbacks can reenter with a new preparation.
    current.preparation = undefined;
    current.nativeLoad = undefined;
    current.session = undefined;
    current.pending = undefined;
    current.ready = false;
    if (session) sessions.delete(session);
    const reason = new DOMException('Document preparation changed', 'AbortError');
    preparation?.abort(reason);
    nativeLoad?.reject(reason);
    session?.close();
    return token;
  }

  function prepare(frame: HTMLIFrameElement): Promise<void> {
    const current = state(frame);
    if (!frame.isConnected || current.ready) return Promise.resolve();
    if (current.pending) return current.pending;
    const token = beginContextPublication(current);
    const controller = new AbortController();
    current.preparation = controller;
    const pending = (async () => {
      const prepared = await options.prepare(frame, current.source, controller.signal);
      if (
        disposed ||
        !isCurrentContextPublication(current, token) ||
        !frame.isConnected
      ) {
        prepared.close();
        return;
      }
      current.session = prepared;
      sessions.add(prepared);
      current.ready = true;
      const EventConstructor = frame.ownerDocument.defaultView?.Event || Event;
      nativeDispatch.call(frame, new EventConstructor('load'));
    })()
      .catch((error: unknown) => {
        if (
          !disposed &&
          isCurrentContextPublication(current, token) &&
          frame.isConnected &&
          !(error instanceof DOMException && error.name === 'AbortError')
        ) {
          options.report(error);
          const EventConstructor = frame.ownerDocument.defaultView?.Event || Event;
          nativeDispatch.call(frame, new EventConstructor('error'));
        }
      })
      .finally(() => {
        if (current.preparation === controller) current.preparation = undefined;
        if (current.pending === pending) current.pending = undefined;
      });
    if (isCurrentContextPublication(current, token)) current.pending = pending;
    return pending;
  }

  return {
    /** Register before insertion so native load cannot precede host preparation. */
    track(frame: HTMLIFrameElement): void {
      state(frame);
    },
    configure(frame: HTMLIFrameElement, source: GuestDocumentSource): Promise<void> {
      const current = state(frame);
      const invalidated = close(current);
      if (current.token !== invalidated) return current.pending || Promise.resolve();
      current.source = source;
      return prepare(frame);
    },
    source(frame: HTMLIFrameElement): GuestDocumentSource {
      return state(frame).source;
    },
    /** Keep the initial inherited document: even local-scheme navigation can
     * schedule a controlling service worker's HTTP update check.
     */
    initial(frame: HTMLIFrameElement): Promise<void> {
      const current = state(frame);
      if (!frame.isConnected || frame.contentWindow?.location.href !== 'about:blank')
        return Promise.reject(
          new DOMException('Child is not an initial blank document', 'SecurityError'),
        );
      if (frame.contentDocument?.readyState === 'complete') return Promise.resolve();
      return new Promise<void>((resolve, reject) => {
        current.nativeLoad = { resolve, reject };
      });
    },
    connected: prepare,
    disconnected(frame: HTMLIFrameElement): void {
      const current = frames.get(frame);
      if (current) {
        active.delete(current);
        close(current);
      }
    },
    dispose(): void {
      disposed = true;
      const failures: unknown[] = [];
      for (const current of active) {
        try {
          close(current);
        } catch (error) {
          failures.push(error);
        }
      }
      active.clear();
      sessions.clear();
      if (failures.length)
        throw new AggregateError(failures, 'Guest document cleanup failed');
    },
  };
}
