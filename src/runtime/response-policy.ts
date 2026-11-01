import { SCRIPT_URL_CSP } from '../shared/script-url-policy.ts';

interface ResponseOptions {
  scriptNonce?: string;
  workerSource?: string;
  controllerSource?: string;
  frameSource?: string;
  embedded?: boolean;
  popups?: boolean;
}

function workerURL(value: string): URL {
  if (typeof value !== 'string' || /[\s;"'<>`]/.test(value))
    throw new Error('Invalid worker bootstrap source');
  const source = new URL(value);
  if (
    !['https:', 'http:'].includes(source.protocol) ||
    source.href !== value ||
    source.username ||
    source.password ||
    value.includes('?') ||
    value.includes('#')
  )
    throw new Error('Invalid worker bootstrap source');
  return source;
}

function workerSources(options: ResponseOptions): string {
  if (options.workerSource === undefined) {
    if (options.controllerSource !== undefined)
      throw new Error('Controller source requires a worker bootstrap directory');
    return "'none'";
  }
  const directory = workerURL(options.workerSource);
  if (!directory.pathname.endsWith('/'))
    throw new Error('Invalid worker bootstrap directory');
  if (options.controllerSource === undefined) return directory.href;
  const controller = workerURL(options.controllerSource);
  if (controller.origin !== directory.origin || controller.pathname.endsWith('/'))
    throw new Error('Invalid worker controller source');
  return directory.href + ' ' + controller.href;
}

/** Browser policy prevents effects that a service-worker fetch handler cannot cover. */
function policy(
  nonce: string | undefined,
  workerSource: string,
  options: ResponseOptions,
) {
  return [
    'sandbox allow-scripts allow-same-origin allow-forms' +
      (options.popups ? ' allow-popups allow-popups-to-escape-sandbox' : ''),
    options.embedded ? "frame-ancestors 'self'" : "frame-ancestors 'none'",
    "default-src 'none'",
    "manifest-src 'self'",
    "script-src 'self' blob: 'unsafe-eval' 'wasm-unsafe-eval'" +
      (nonce ? ` 'nonce-${nonce}'` : ''),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' blob: data:",
    "media-src 'self' blob: data:",
    "object-src 'none'",
    'frame-src ' + (options.frameSource ? workerSource : "'none'"),
    `worker-src ${workerSource}${workerSource === "'none'" ? '' : ' blob:'}`,
    "form-action 'none'",
    "base-uri 'none'",
    SCRIPT_URL_CSP,
  ].join('; ');
}

const headers = {
  // Supporting browsers enforce this on document/worker context responses.
  'Connection-Allowlist': '(response-origin); redirects=block; webrtc=block',
  'X-Frame-Options': 'DENY',
  'X-DNS-Prefetch-Control': 'off',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cache-Control': 'no-store',
  'Permissions-Policy':
    'camera=(), microphone=(self), geolocation=(), usb=(), serial=(), hid=(), bluetooth=(), payment=(), attribution-reporting=(), browsing-topics=(), interest-cohort=(), identity-credentials-get=()',
  'X-Content-Type-Options': 'nosniff',
};

export function response(
  body: BodyInit,
  type = 'text/html',
  status = 200,
  options: ResponseOptions = {},
): Response {
  if (options.scriptNonce && !/^[a-zA-Z0-9+/_-]+$/.test(options.scriptNonce))
    throw new Error('Invalid script nonce');
  if (
    (options.frameSource !== undefined && options.frameSource !== options.workerSource) ||
    (options.embedded && !options.frameSource)
  )
    throw new Error('Document contexts require their owning bootstrap directory');
  return new Response(body, {
    status,
    headers: {
      ...headers,
      'Content-Security-Policy': policy(
        options.scriptNonce,
        workerSources(options),
        options,
      ),
      'X-Frame-Options': options.embedded ? 'SAMEORIGIN' : 'DENY',
      'Content-Type': type,
    },
  });
}
