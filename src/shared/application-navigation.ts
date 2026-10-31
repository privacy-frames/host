import { strings, ownDescriptor, internalRecord } from './primordials.ts';
// Capture URL operations before publisher code can alter platform prototypes.
const NativeURL = URL;
const apply = Reflect.apply;
const descriptor = ownDescriptor;
const origin = descriptor(NativeURL.prototype, 'origin')!.get!;
const pathname = descriptor(NativeURL.prototype, 'pathname')!.get!;
const search = descriptor(NativeURL.prototype, 'search')!.get!;
const hash = descriptor(NativeURL.prototype, 'hash')!.get!;
const href = descriptor(NativeURL.prototype, 'href')!.get!;

function address(input: string) {
  const url = new NativeURL(input);
  return internalRecord({
    origin: apply(origin, url, []) as string,
    pathname: apply(pathname, url, []) as string,
    search: apply(search, url, []) as string,
    hash: apply(hash, url, []) as string,
    href: apply(href, url, []) as string,
  });
}

/** Root history may change location only within its own public app namespace. */
export function isApplicationRoute(input: string, applicationURL: string): boolean {
  try {
    const target = address(input);
    const entry = address(applicationURL);
    if (
      !strings.endsWith(entry.pathname, '/') ||
      target.origin !== entry.origin ||
      !strings.startsWith(target.pathname, entry.pathname)
    )
      return false;
    return strings
      .split(strings.slice(target.pathname, entry.pathname.length), '/')
      .every((part) => {
        const decoded = decodeURIComponent(part);
        return (
          !strings.startsWith(decoded, '__') &&
          !strings.includes(decoded, '/') &&
          !strings.includes(decoded, '\\') &&
          decoded !== '.' &&
          decoded !== '..'
        );
      });
  } catch {
    return false;
  }
}

/** Translate publisher history URLs; never reinterpret a foreign runtime path. */
export function applicationHistoryURL(
  input: string,
  currentURL: string,
  applicationURL: string,
  sourceURL: string,
): string | undefined {
  try {
    if (!isApplicationRoute(currentURL, applicationURL)) return;
    const entry = address(applicationURL);
    const current = address(currentURL);
    const source = address(sourceURL);
    if (strings.startsWith(input, entry.pathname)) {
      const physical = apply(href, new NativeURL(input, applicationURL), []);
      return isApplicationRoute(physical, applicationURL) ? physical : undefined;
    }
    const sourceDirectory = address(apply(href, new NativeURL('./', source.href), []));
    const route = strings.slice(current.pathname, entry.pathname.length);
    const logicalCurrent =
      apply(href, new NativeURL(route, sourceDirectory.href), []) +
      current.search +
      current.hash;
    const targetURL = new NativeURL(input, logicalCurrent);
    const target = address(apply(href, targetURL, []));
    if (target.origin === entry.origin) {
      if (isApplicationRoute(target.href, applicationURL)) return target.href;
      // Apps also construct a URL from location.href and replace its pathname
      // with their original deployment directory. Treat only that known prefix
      // as a logical publisher path; the browser still receives an app URL.
      if (
        sourceDirectory.pathname === '/' ||
        !strings.startsWith(target.pathname, sourceDirectory.pathname)
      )
        return;
      const mapped =
        apply(
          href,
          new NativeURL(
            strings.slice(target.pathname, sourceDirectory.pathname.length),
            applicationURL,
          ),
          [],
        ) +
        target.search +
        target.hash;
      return isApplicationRoute(mapped, applicationURL) ? mapped : undefined;
    }
    if (target.origin !== source.origin) return;
    const suffix = strings.startsWith(target.pathname, sourceDirectory.pathname)
      ? strings.slice(target.pathname, sourceDirectory.pathname.length)
      : strings.replace(target.pathname, /^\//, '');
    const mapped = apply(href, new NativeURL(suffix, applicationURL), []);
    const result = mapped + target.search + target.hash;
    return isApplicationRoute(result, applicationURL) ? result : undefined;
  } catch {
    return;
  }
}
