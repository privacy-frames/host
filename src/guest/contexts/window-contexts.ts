import type { GuestResources } from '../resources.ts';
import type { GuestContextCatalog, GuestContextResource } from './types.ts';
import { isHTMLIFrameElement, isMessagePort } from './brands.ts';
import {
  createGuestDocuments,
  type GuestDocumentSource,
  type GuestDocumentSession,
} from './documents.ts';

export interface GuestWindowContextsOptions {
  catalog: GuestContextCatalog;
  resources: GuestResources;
  nativeWindow: Window;
  createSession(
    catalog: GuestContextCatalog,
    window: Window,
    html: string,
  ): Promise<GuestDocumentSession>;
  report(error: unknown): void;
  commitTransfers?(transfer: readonly Transferable[]): void;
  canMessage?(target: Window): boolean;
}

interface FrameSource {
  src: string | null;
  srcdoc: string | null;
  window?: Window;
}

interface PreparedDocument {
  catalog: GuestContextCatalog;
  html: string;
}

interface PopupState {
  generation: number;
  session?: GuestDocumentSession;
}

const messageEvents = new WeakSet<MessageEvent>();

/** Native host authentication still sees these synthetic events as untrusted. */
export const isGuestWindowMessage = (event: unknown): event is MessageEvent =>
  event instanceof MessageEvent && messageEvents.has(event);

function textDocument(text: string): string {
  return (
    '<!doctype html><pre>' +
    text.replace(
      /[&<>]/g,
      (value) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
        })[value] || value,
    ) +
    '</pre>'
  );
}

function popupFeatures(value: string): { features: string; detached: boolean } {
  const allowed = new Set([
    'width',
    'height',
    'left',
    'top',
    'screenx',
    'screeny',
    'resizable',
    'scrollbars',
    'toolbar',
    'menubar',
    'status',
    'location',
    'popup',
  ]);
  const result: string[] = [];
  let detached = false;
  for (const feature of value.split(/[\s,]+/)) {
    if (!feature) continue;
    const [key, argument] = feature.toLowerCase().split('=', 2);
    if (key === 'noopener' || key === 'noreferrer') {
      if (argument !== '0' && argument !== 'no' && argument !== 'false') detached = true;
    } else if (allowed.has(key)) {
      result.push(argument === undefined ? key : key + '=' + argument);
    }
  }
  return { features: result.join(','), detached };
}

/** Prepare real child documents without handing guest markup to native navigation. */
export function createGuestWindowContexts(options: GuestWindowContextsOptions) {
  const { catalog, nativeWindow, resources } = options;
  const frames = new WeakMap<HTMLIFrameElement, FrameSource>();
  const known = new WeakSet<Window>();
  const popups = new Map<Window, PopupState>();
  const names = new Map<string, Window>();
  const bootstrap = new URL('__guest_document__.html', catalog.applicationURL).href;
  let disposed = false;

  async function prepareSource(source: GuestDocumentSource): Promise<PreparedDocument> {
    let html: string;
    let sourceURL: string;
    let documentBase: string;
    const additional: GuestContextResource[] = [];
    if (source.kind === 'markup') {
      html = source.html;
      sourceURL = catalog.sourceURL;
      documentBase = source.baseURL;
    } else if (source.url === 'about:blank') {
      html = '';
      sourceURL = catalog.sourceURL;
      documentBase = catalog.documentBase;
    } else {
      const response = await resources.fetch(source.url);
      const contentType = response.headers.get('content-type') || '';
      const bytes = await response.arrayBuffer();
      sourceURL = resources.resource(source.url)?.url || source.url;
      documentBase = /^(?:data:|blob:)/.test(sourceURL)
        ? catalog.documentBase
        : sourceURL;
      const text = new TextDecoder().decode(bytes);
      if (
        /^(?:text\/html|application\/xhtml\+xml|image\/svg\+xml)(?:;|$)/i.test(
          contentType,
        )
      )
        html = text;
      else if (/^text\//i.test(contentType)) html = textDocument(text);
      else if (/^image\//i.test(contentType)) {
        const url = resources.nativeURL(source.url);
        html =
          '<!doctype html><img src="' +
          url.replace(/&/g, '&amp;').replace(/"/g, '&quot;') +
          '">';
      } else
        throw new TypeError('Document resource type is not supported: ' + contentType);
      if (!resources.resource(source.url))
        additional.push({
          url: source.url,
          path: '__guest_virtual__/document.html',
          contentType,
          bytes,
        });
    }
    // Host-created Blob modules retain their bytes when a new guest realm is made.
    for (const [url, code] of resources.modules) {
      if (
        !/^(?:blob:|data:)/.test(url) ||
        additional.some((resource) => resource.url === url)
      )
        continue;
      additional.push({
        url,
        path: `__guest_virtual__/module-${additional.length}.js`,
        contentType: 'text/javascript',
        bytes: new TextEncoder().encode(code).buffer,
      });
    }
    return {
      html,
      catalog: {
        ...catalog,
        sourceURL,
        documentBase,
        resources: [...catalog.resources, ...additional],
      },
    };
  }

  const documents = createGuestDocuments({
    baseURL: catalog.documentBase,
    async prepare(frame, source, signal) {
      const prepared = await prepareSource(source);
      signal.throwIfAborted();
      if (!frame.isConnected) throw new DOMException('Frame was removed', 'AbortError');
      await documents.navigate(frame, bootstrap);
      signal.throwIfAborted();
      const child = frame.contentWindow;
      if (!child) throw new Error('Child document window is unavailable');
      known.add(child);
      return options.createSession(prepared.catalog, child, prepared.html);
    },
    report: options.report,
  });
  const removals = new MutationObserver((records) => {
    const inspect = (node: Node) => {
      if (isHTMLIFrameElement(node)) {
        const current = frames.get(node);
        if (
          current &&
          (!node.isConnected ||
            node.ownerDocument !== nativeWindow.document ||
            node.contentWindow !== current.window)
        ) {
          if (current.window) known.delete(current.window);
          current.window = undefined;
          documents.disconnected(node);
        }
      }
      for (const child of Array.from(node.childNodes)) inspect(child);
    };
    for (const record of records) for (const node of record.removedNodes) inspect(node);
  });
  removals.observe(nativeWindow.document, { childList: true, subtree: true });

  function record(frame: HTMLIFrameElement): FrameSource {
    const existing = frames.get(frame);
    if (existing) return existing;
    const created = {
      src: frame.getAttribute('src'),
      srcdoc: frame.getAttribute('srcdoc'),
    };
    frames.set(frame, created);
    documents.track(frame);
    return created;
  }

  function source(current: FrameSource): GuestDocumentSource {
    return current.srcdoc !== null
      ? { kind: 'markup', html: current.srcdoc, baseURL: catalog.documentBase }
      : current.src && current.src !== 'about:blank'
        ? { kind: 'resource', url: new URL(current.src, catalog.documentBase).href }
        : { kind: 'markup', html: '', baseURL: catalog.documentBase };
  }

  async function preparePopup(
    popup: Window,
    state: PopupState,
    documentSource: GuestDocumentSource,
  ): Promise<void> {
    const generation = ++state.generation;
    state.session?.close();
    state.session = undefined;
    const prepared = await prepareSource(documentSource);
    if (disposed || popup.closed || state.generation !== generation) return;
    // Initial about:blank listeners disappear when navigation replaces that
    // global. Guest-dispatched load events must not establish host readiness.
    while (
      popup.location.href !== bootstrap ||
      popup.document.readyState !== 'complete'
    ) {
      if (disposed || popup.closed || state.generation !== generation) return;
      await new Promise<void>((resolve) => nativeWindow.setTimeout(resolve, 5));
    }
    if (disposed || popup.closed || state.generation !== generation) return;
    const session = await options.createSession(prepared.catalog, popup, prepared.html);
    if (disposed || popup.closed || state.generation !== generation) session.close();
    else {
      state.session = session;
      popup.addEventListener(
        'pagehide',
        () => {
          session.close();
          if (state.session === session) state.session = undefined;
        },
        { once: true },
      );
    }
  }

  return {
    track(frame: HTMLIFrameElement): void {
      record(frame);
    },
    connected(frame: HTMLIFrameElement): Promise<void> {
      const current = record(frame);
      if (current.window && current.window !== frame.contentWindow) {
        known.delete(current.window);
        documents.disconnected(frame);
      }
      current.window = frame.contentWindow || undefined;
      if (current.window) known.add(current.window);
      return documents.connected(frame);
    },
    disconnected(frame: HTMLIFrameElement): void {
      const current = frames.get(frame);
      if (current?.window) known.delete(current.window);
      if (current) current.window = undefined;
      documents.disconnected(frame);
    },
    /** True means consumed; the caller must not mutate the native attribute. */
    attribute(frame: HTMLIFrameElement, name: string, value: string | null): boolean {
      const key = name.toLowerCase();
      if (key !== 'src' && key !== 'srcdoc') return false;
      const current = record(frame);
      current[key] = value;
      void documents.configure(frame, source(current));
      return true;
    },
    attributeValue(frame: HTMLIFrameElement, name: string): string | null | undefined {
      const key = name.toLowerCase();
      if (key !== 'src' && key !== 'srcdoc') return undefined;
      return record(frame)[key];
    },
    get(frame: HTMLIFrameElement, key: PropertyKey): string | undefined {
      const current = record(frame);
      if (key === 'src')
        return current.src ? new URL(current.src, catalog.documentBase).href : '';
      if (key === 'srcdoc') return current.srcdoc || '';
      return undefined;
    },
    knows(target: Window): boolean {
      return target === nativeWindow || known.has(target);
    },
    open(input: string | URL = '', target = '_blank', features = ''): Window | null {
      if (disposed) throw new Error('Guest window environment is closed');
      if (['_self', '_top', '_parent', '_unfencedTop'].includes(target))
        throw new DOMException(
          'This browsing target cannot create an application window',
          'SecurityError',
        );
      const logical = input
        ? new URL(String(input), catalog.documentBase).href
        : 'about:blank';
      if (!/^(?:blob:|data:|about:blank$)/.test(logical) && !resources.resource(logical))
        throw new TypeError('Popup resource is not installed');
      const parsed = popupFeatures(features);
      let popup = target && target !== '_blank' ? names.get(target) : undefined;
      if (!popup || popup.closed) {
        popup = nativeWindow.open(bootstrap, '_blank', parsed.features) || undefined;
        if (!popup) return null;
        popups.set(popup, { generation: 0 });
        known.add(popup);
        if (target && target !== '_blank') names.set(target, popup);
      }
      const state = popups.get(popup);
      if (!state) throw new Error('Popup ownership is unavailable');
      if (parsed.detached) popup.opener = null;
      void preparePopup(popup, state, { kind: 'resource', url: logical }).catch(
        options.report,
      );
      return parsed.detached ? null : popup;
    },
    postMessage(
      target: Window,
      message: unknown,
      targetOrigin: string | WindowPostMessageOptions = '/',
      transfer: Transferable[] = [],
    ): void {
      if (disposed) throw new Error('Guest window environment is closed');
      if (target !== nativeWindow && !known.has(target) && !options.canMessage?.(target))
        throw new DOMException('Target is not an application window', 'SecurityError');
      const requestedOrigin =
        typeof targetOrigin === 'string'
          ? targetOrigin
          : (targetOrigin.targetOrigin ?? '/');
      if (typeof targetOrigin === 'object') transfer = targetOrigin.transfer || [];
      let origin: string;
      try {
        origin =
          requestedOrigin === '/'
            ? nativeWindow.location.origin
            : requestedOrigin === '*'
              ? '*'
              : new URL(requestedOrigin).origin;
      } catch {
        throw new DOMException('Invalid target origin', 'SyntaxError');
      }
      const ports = transfer.filter(isMessagePort);
      const copied = structuredClone({ message, ports }, { transfer });
      options.commitTransfers?.(transfer);
      nativeWindow.setTimeout(() => {
        if (
          disposed ||
          target.closed ||
          (origin !== '*' && origin !== target.location.origin)
        )
          return;
        const event = new MessageEvent('message', {
          data: copied.message,
          ports: copied.ports,
          source: nativeWindow,
          origin: nativeWindow.location.origin,
        });
        messageEvents.add(event);
        target.dispatchEvent(event);
      });
    },
    dispose(): void {
      disposed = true;
      removals.disconnect();
      documents.dispose();
      for (const [popup, state] of popups) {
        state.generation++;
        state.session?.close();
        if (!popup.closed) popup.close();
      }
      popups.clear();
      names.clear();
    },
  };
}
