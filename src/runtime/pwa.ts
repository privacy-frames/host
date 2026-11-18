import {
  applicationURL,
  applicationLaunchURL,
  publicAlias,
} from '../shared/runtime-url.ts';
import type { Installation } from '../shared/types';

interface ManifestIcon {
  src: string;
  sizes?: string;
  type?: string;
  purpose?: string;
}

interface WebManifest {
  id: string;
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  icons: ManifestIcon[];
  description?: string;
  lang?: string;
  theme_color?: string;
  background_color?: string;
  dir?: string;
  orientation?: string;
  shortcuts?: Array<{ name: string; url: string }>;
}

type ManifestApplication = Pick<
  Installation,
  'id' | 'source' | 'manifest' | 'publisherManifest'
> & {
  resources: ReadonlyArray<
    Pick<Installation['resources'][number], 'url' | 'contentType'>
  >;
};

function text(value: unknown, maximum = 200): string | undefined {
  return typeof value === 'string' ? value.slice(0, maximum) : undefined;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function supported(value: unknown, choices: readonly string[]): value is string {
  return typeof value === 'string' && choices.includes(value);
}

function localLaunch(
  input: unknown,
  source: string,
  manifest: string,
  entry: URL,
): string | null {
  if (typeof input !== 'string') return null;
  try {
    const url = new URL(input, manifest);
    const original = new URL(source);
    return url.origin === original.origin &&
      url.pathname === original.pathname &&
      url.search === original.search
      ? entry.pathname + url.search + url.hash
      : null;
  } catch {
    return null;
  }
}

/** Publisher metadata describes presentation; the host supplies all local routes. */
export function webManifest(app: ManifestApplication, base: string | URL): WebManifest {
  const entry = applicationURL(app, base);
  const launch = applicationLaunchURL(app, base);
  const root = new URL(`${publicAlias(app.id)}/`, base);
  const original = app.publisherManifest?.value ?? {};
  const publisherURL = app.publisherManifest?.url;
  const result: WebManifest = {
    id: root.pathname,
    name: text(original.name, 100) || app.manifest.name,
    short_name: text(original.short_name, 40) || app.manifest.name.slice(0, 40),
    start_url: launch.pathname + launch.search,
    scope: root.pathname,
    display: 'standalone',
    icons: [],
  };

  for (const key of ['description', 'lang', 'theme_color', 'background_color'] as const) {
    const value = text(original[key]);
    if (value) result[key] = value;
  }
  if (supported(original.dir, ['ltr', 'rtl', 'auto'])) result.dir = original.dir;
  if (
    supported(original.display, ['fullscreen', 'standalone', 'minimal-ui', 'browser'])
  ) {
    result.display = original.display;
  }
  if (
    supported(original.orientation, [
      'any',
      'natural',
      'landscape',
      'landscape-primary',
      'landscape-secondary',
      'portrait',
      'portrait-primary',
      'portrait-secondary',
    ])
  )
    result.orientation = original.orientation;

  if (publisherURL) {
    result.start_url =
      localLaunch(original.start_url ?? app.source, app.source, publisherURL, entry) ??
      launch.pathname + launch.search;
    const icons = Array.isArray(original.icons) ? original.icons.slice(0, 8) : [];
    for (const item of icons) {
      const icon = record(item);
      if (!icon || typeof icon.src !== 'string') continue;
      try {
        const url = new URL(icon.src, publisherURL);
        url.hash = '';
        const index = app.resources.findIndex(
          (resource) =>
            resource.url === url.href && /^image\//i.test(resource.contentType),
        );
        if (index < 0) continue;
        const local: ManifestIcon = { src: new URL(`__icon/${index}`, root).pathname };
        const sizes = text(icon.sizes, 100);
        const type = text(icon.type, 100);
        if (sizes) local.sizes = sizes;
        if (type) local.type = type;
        if (
          typeof icon.purpose === 'string' &&
          /^(any|maskable|monochrome)( (any|maskable|monochrome))*$/.test(icon.purpose)
        ) {
          local.purpose = icon.purpose;
        }
        result.icons.push(local);
      } catch {
        // Invalid optional presentation metadata uses the bundled fallback.
      }
    }

    const shortcuts: NonNullable<WebManifest['shortcuts']> = [];
    for (const item of Array.isArray(original.shortcuts)
      ? original.shortcuts.slice(0, 8)
      : []) {
      const shortcut = record(item);
      if (!shortcut) continue;
      const name = text(shortcut.name, 80);
      const url = localLaunch(shortcut.url, app.source, publisherURL, entry);
      if (name && url) shortcuts.push({ name, url });
    }
    if (shortcuts.length) result.shortcuts = shortcuts;
  }

  for (const size of [192, 512]) {
    const dimensions = `${size}x${size}`;
    if (
      result.icons.some((icon) =>
        (icon.sizes || '')
          .split(/\s+/)
          .some((value) => value === 'any' || value === dimensions),
      )
    )
      continue;
    result.icons.push({
      src: new URL(`pwa-${size}.png`, base).pathname,
      sizes: dimensions,
      type: 'image/png',
      purpose: 'any',
    });
  }
  return result;
}

export function manifestURL(app: Pick<Installation, 'id'>, base: string | URL): URL {
  return new URL(`${publicAlias(app.id)}/__manifest.webmanifest`, base);
}
