import type { GuestContextCatalog, GuestContextResource } from './contexts/types.ts';
import { rewriteGuestCSS } from './css.ts';

export interface GuestSource {
  url: string;
  code: string;
}

/** Catalog reads never fall back to the browser's network implementation. */
export class GuestResources {
  private resources = new Map<string, GuestContextResource>();
  private blobs = new Map<string, Blob>();
  private blobSources = new WeakMap<Blob, string>();
  private nativeURLs = new WeakMap<GuestContextResource, string>();
  private preparingCSS = new WeakSet<GuestContextResource>();
  readonly modules = new Map<string, string>();

  constructor(readonly catalog: GuestContextCatalog) {
    for (const resource of catalog.resources) {
      const physical = new URL(resource.path, catalog.applicationURL).href;
      this.resources.set(this.canonical(resource.url), resource);
      this.resources.set(this.canonical(physical), resource);
      if (
        /(?:javascript|ecmascript)/i.test(resource.contentType) ||
        /\.(?:m?js)(?:[?#]|$)/i.test(resource.url)
      ) {
        const code = new TextDecoder().decode(resource.bytes);
        this.modules.set(resource.url, code);
        this.modules.set(physical, code);
      }
    }
  }

  private canonical(input: string): string {
    const url = new URL(input, this.catalog.documentBase);
    url.hash = '';
    return url.href;
  }

  resolve(input: string, base = this.catalog.documentBase): string {
    return new URL(input, base).href;
  }

  resource(input: string): GuestContextResource | undefined {
    const key = this.canonical(input);
    const exact = this.resources.get(key);
    if (exact) return exact;
    // Cache-busting parameters cannot grant new content or remote access.
    const url = new URL(key);
    url.search = '';
    return this.resources.get(url.href);
  }

  nativeURL(input: string, base = this.catalog.documentBase): string {
    if (!input || input.startsWith('#')) return input;
    const url = new URL(input, base);
    if (['data:', 'blob:'].includes(url.protocol)) return url.href;
    const resource = this.resource(url.href);
    if (!resource) return 'data:application/octet-stream,';
    let local = this.nativeURLs.get(resource);
    if (!local) {
      // Stop recursive imports with an empty stylesheet, keeping the cycle local.
      if (this.preparingCSS.has(resource)) return 'data:text/css,';
      let blob: Blob;
      if (/^text\/css(?:;|$)/i.test(resource.contentType)) {
        this.preparingCSS.add(resource);
        try {
          const css = rewriteGuestCSS(new TextDecoder().decode(resource.bytes), (input) =>
            this.nativeURL(input, resource.url),
          );
          blob = new Blob([css], { type: resource.contentType });
        } finally {
          this.preparingCSS.delete(resource);
        }
      } else blob = new Blob([resource.bytes], { type: resource.contentType });
      local = this.createObjectURL(blob);
      this.nativeURLs.set(resource, local);
    }
    return local + url.hash;
  }

  source(input: string, base = this.catalog.documentBase): GuestSource {
    const url = this.resolve(input, base);
    const code = this.modules.get(url) || this.modules.get(this.canonical(url));
    if (code === undefined)
      throw new TypeError('Script resource is not installed: ' + url);
    return { url, code };
  }

  registerBlob(blob: Blob, parts?: readonly BlobPart[]): void {
    if (!parts) return;
    const decoded: string[] = [];
    for (const part of parts) {
      if (typeof part === 'string') decoded.push(part);
      else if (part instanceof Blob) {
        const text = this.blobSources.get(part);
        if (text === undefined) return;
        decoded.push(text);
      } else decoded.push(new TextDecoder().decode(part));
    }
    this.blobSources.set(blob, decoded.join(''));
  }

  createObjectURL(blob: Blob): string {
    const url = URL.createObjectURL(blob);
    this.blobs.set(url, blob);
    const source = this.blobSources.get(blob);
    if (source !== undefined) this.modules.set(url, source);
    return url;
  }

  revokeObjectURL(url: string): void {
    this.blobs.delete(url);
    this.modules.delete(url);
    URL.revokeObjectURL(url);
  }

  async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const method = (
      init?.method || (input instanceof Request ? input.method : 'GET')
    ).toUpperCase();
    if (method !== 'GET' && method !== 'HEAD')
      throw new TypeError('Only local resource reads are available');
    const url = this.resolve(input instanceof Request ? input.url : String(input));
    const blob = this.blobs.get(url);
    if (blob)
      return new Response(method === 'HEAD' ? null : blob, {
        headers: { 'Content-Type': blob.type },
      });
    if (url.startsWith('data:')) return this.dataResponse(url, method === 'HEAD');
    const resource = this.resource(url);
    if (!resource) throw new TypeError('Resource is not installed: ' + url);
    return new Response(method === 'HEAD' ? null : resource.bytes.slice(0), {
      headers: { 'Content-Type': resource.contentType },
    });
  }

  private dataResponse(url: string, head: boolean): Response {
    const comma = url.indexOf(',');
    if (comma < 0) throw new TypeError('Invalid data URL');
    const metadata = url.slice(5, comma);
    const encoded = url.slice(comma + 1);
    const bytes = /;base64$/i.test(metadata)
      ? Uint8Array.from(atob(encoded), (value) => value.charCodeAt(0))
      : new TextEncoder().encode(decodeURIComponent(encoded));
    return new Response(head ? null : bytes, {
      headers: {
        'Content-Type':
          metadata.replace(/;base64$/i, '') || 'text/plain;charset=US-ASCII',
      },
    });
  }

  dispose(): void {
    for (const url of this.blobs.keys()) URL.revokeObjectURL(url);
    this.blobs.clear();
    this.resources.clear();
    this.modules.clear();
  }
}
