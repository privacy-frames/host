interface HistoryIdentity {
  application: string;
  generation: string;
  sourceURL: string;
}

interface StoredHistory extends HistoryIdentity {
  kind: 'privacy-frames-history';
  logicalURL: string;
  data: unknown;
}

/** Guest routes describe the publisher document; native routes always address
 * the admitted runtime document. Only the fragment is shared between them. */
export class GuestLocation {
  private readonly identity: HistoryIdentity;
  private readonly physical: URL;
  private readonly source: URL;
  private logical: URL;
  private readonly push: History['pushState'];
  private readonly replace: History['replaceState'];

  constructor(
    private readonly native: Window,
    identity: HistoryIdentity,
  ) {
    this.identity = {
      application: identity.application,
      generation: identity.generation,
      sourceURL: identity.sourceURL,
    };
    this.physical = new URL(native.location.href);
    this.source = new URL(identity.sourceURL);
    this.push = native.history.pushState.bind(native.history);
    this.replace = native.history.replaceState.bind(native.history);
    const stored = this.stored();
    this.logical = new URL(stored?.logicalURL ?? this.source.href);
    this.logical.hash = native.location.hash;
    this.update(true, stored ? stored.data : null, '', this.logical.href);
    native.addEventListener('hashchange', this.hashchange);
    native.addEventListener('popstate', this.popstate, true);
  }

  get href(): string {
    // Native hash changes include the browser's fragment controls and the
    // runtime's mediated anchor clicks; pushState itself emits no hashchange.
    this.logical.hash = this.native.location.hash;
    return this.logical.href;
  }

  private readonly hashchange = () => {
    if (!this.stored()) this.update(true, null, '', this.href);
  };

  private readonly popstate = () => {
    const stored = this.stored();
    if (stored) this.logical = new URL(stored.logicalURL);
  };

  eventState(value: unknown): unknown {
    const stored = this.stored(value);
    return stored ? stored.data : value;
  }

  dispose(): void {
    this.native.removeEventListener('hashchange', this.hashchange);
    this.native.removeEventListener('popstate', this.popstate, true);
  }

  private stored(value: unknown = this.native.history.state): StoredHistory | undefined {
    if (!value || typeof value !== 'object') return;
    if (
      !('kind' in value) ||
      value.kind !== 'privacy-frames-history' ||
      !('application' in value) ||
      value.application !== this.identity.application ||
      !('generation' in value) ||
      value.generation !== this.identity.generation ||
      !('sourceURL' in value) ||
      value.sourceURL !== this.identity.sourceURL ||
      !('logicalURL' in value) ||
      typeof value.logicalURL !== 'string' ||
      !('data' in value)
    )
      return;
    try {
      if (new URL(value.logicalURL).origin !== this.source.origin) return;
    } catch {
      return;
    }
    return value as StoredHistory;
  }

  private update(
    replace: boolean,
    data: unknown,
    unused: string,
    input?: string | URL | null,
  ): void {
    const current = this.href;
    const text = input == null ? '' : String(input);
    const next = new URL(text === '' ? current : text, current);
    if (next.origin !== this.source.origin)
      throw new DOMException('History leaves the application origin', 'SecurityError');
    const physical = new URL(this.physical.href);
    physical.hash = next.hash;
    const record: StoredHistory = {
      ...this.identity,
      kind: 'privacy-frames-history',
      logicalURL: next.href,
      data,
    };
    // Native structured-clone validation runs before committing the logical URL.
    (replace ? this.replace : this.push)(record, unused, physical.href);
    this.logical = next;
  }

  navigate(input: string): void {
    const current = new URL(this.href);
    const next = new URL(String(input), current);
    if (
      next.origin !== current.origin ||
      next.pathname !== current.pathname ||
      next.search !== current.search
    )
      throw new DOMException('Navigation leaves the installed document', 'SecurityError');
    this.native.location.hash = next.hash;
  }

  readonly location: object = (() => {
    const facade: Record<string, unknown> = {
      assign: (value: string) => this.navigate(value),
      replace: (value: string) => this.navigate(value),
      reload: () => {
        throw new DOMException('Native document reload is unavailable', 'SecurityError');
      },
      toString: () => this.href,
    };
    for (const key of [
      'href',
      'origin',
      'protocol',
      'host',
      'hostname',
      'port',
      'pathname',
      'search',
      'hash',
    ] as const) {
      Object.defineProperty(facade, key, {
        enumerable: true,
        get: () => new URL(this.href)[key],
        ...(key !== 'origin'
          ? {
              set: (value: string) => {
                const next = new URL(this.href);
                if (key === 'href') return this.navigate(String(value));
                next[key] = String(value);
                this.navigate(next.href);
              },
            }
          : {}),
      });
    }
    return facade;
  })();

  createHistory(): object {
    const owner = this;
    const traversal = () => {
      throw new DOMException(
        'History traversal may leave this application',
        'SecurityError',
      );
    };
    return {
      get length() {
        return owner.native.history.length;
      },
      get state() {
        const stored = owner.stored();
        return stored ? stored.data : null;
      },
      pushState: (data: unknown, unused: string, url?: string | URL | null) =>
        this.update(false, data, unused, url),
      replaceState: (data: unknown, unused: string, url?: string | URL | null) =>
        this.update(true, data, unused, url),
      back: traversal,
      forward: traversal,
      go: traversal,
    };
  }
}
