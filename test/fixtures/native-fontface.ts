import { createNativeStringMapping } from '../../src/guest/native-string-mapping.ts';

function same(actual: unknown, expected: unknown, label: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(label + ': ' + JSON.stringify({ actual, expected }));
}

/** Runs in both native Window and Worker realms without a CSS namespace probe. */
export function nativeFontFaceChecks(scope: Window | WorkerGlobalScope) {
  const constructor: unknown = Reflect.get(scope, 'FontFace');
  if (typeof constructor !== 'function') throw new Error('Native FontFace unavailable');
  let mappedSources = 0;
  const mapping = createNativeStringMapping({
    global: scope,
    css: (value) => {
      mappedSources++;
      return value;
    },
    url: (value) => value,
  });
  const cases: { name: string; outcome: unknown }[] = [];
  for (const name of [
    'objects',
    'string',
    'null',
    'undefined',
    'symbol',
    'throwSource',
    'throwFamily',
    'reentry',
    'missing',
    'missingSource',
  ] as const) {
    const outcomes = [];
    for (const mediated of [false, true]) {
      const trace: string[] = [];
      const family = {
        toString() {
          trace.push('family');
          if (name === 'throwFamily') throw new Error('family');
          return 'Fixture';
        },
      };
      const source =
        name === 'string'
          ? 'local("Fixture")'
          : name === 'null'
            ? null
            : name === 'undefined'
              ? undefined
              : name === 'symbol'
                ? Symbol()
                : {
                    [Symbol.toPrimitive](hint: string) {
                      trace.push('source:' + hint);
                      if (name === 'throwSource') throw new Error('source');
                      if (name === 'reentry') {
                        const nested: FontFace = Reflect.construct(constructor, [
                          'Nested',
                          'local("Fixture")',
                        ]);
                        nested.loaded.catch(() => undefined);
                        trace.push('nested');
                      }
                      return 'local("Fixture\ud800")';
                    },
                  };
      const descriptors = new Proxy(
        {},
        {
          get(_target, key) {
            trace.push('descriptor:' + String(key));
            return undefined;
          },
        },
      );
      const args: unknown[] =
        name === 'missing'
          ? []
          : name === 'missingSource'
            ? [family]
            : [family, source, descriptors];
      const beforeMapping = mappedSources;
      let result: unknown;
      try {
        const font: FontFace = Reflect.construct(
          constructor,
          mediated ? mapping.construct(constructor, args) : args,
        );
        font.loaded.catch(() => undefined);
        result = { status: font.status, family: font.family };
      } catch (error) {
        result = { error: error instanceof Error ? error.name : String(error) };
      }
      const expectedMappings =
        mediated &&
        !['symbol', 'throwSource', 'throwFamily', 'missing', 'missingSource'].includes(
          name,
        )
          ? 1
          : 0;
      same(
        mappedSources - beforeMapping,
        expectedMappings,
        'source mapper invocation ' + name,
      );
      outcomes.push({ trace, result });
    }
    same(outcomes[1], outcomes[0], 'FontFace native conversion ' + name);
    cases.push({ name, outcome: outcomes[0] });
  }
  const sources: [string, object][] = [
    ['buffer', new ArrayBuffer(8)],
    ['view', new Uint8Array(8)],
    ['dataView', new DataView(new ArrayBuffer(8))],
  ];
  const detached = new ArrayBuffer(8);
  structuredClone(detached, { transfer: [detached] });
  sources.push(['detached', detached]);
  if (Reflect.has(ArrayBuffer.prototype, 'resizable'))
    sources.push([
      'resizable',
      Reflect.construct(ArrayBuffer, [8, { maxByteLength: 16 }]),
    ]);
  const shared: unknown = Reflect.get(scope, 'SharedArrayBuffer');
  if (typeof shared === 'function') {
    const buffer: SharedArrayBuffer = Reflect.construct(shared, [8]);
    sources.push(['sharedView', new Uint8Array(buffer)], ['sharedBuffer', buffer]);
  }
  for (const [name, source] of sources) {
    let reads = 0;
    Object.defineProperty(source, Symbol.toPrimitive, {
      value() {
        reads++;
        return 'local("Fixture")';
      },
    });
    const args = ['Fixture', source];
    const forwarded = mapping.construct(constructor, args);
    if (forwarded !== args)
      throw new Error('BufferSource argument list must remain unchanged');
    const outcomes = [];
    for (const input of [args, forwarded]) {
      try {
        const font: FontFace = Reflect.construct(constructor, input);
        font.loaded.catch(() => undefined);
        outcomes.push({ status: font.status, family: font.family });
      } catch (error) {
        outcomes.push({ error: error instanceof Error ? error.name : String(error) });
      }
    }
    same(outcomes[1], outcomes[0], 'FontFace native BufferSource ' + name);
    same(reads, 0, 'native binary source string conversions');
    cases.push({
      name,
      outcome: {
        native: outcomes[0],
        stringReads: reads,
        argumentsUnchanged: forwarded === args,
      },
    });
  }
  let proxyReads = 0;
  const proxy = new Proxy(new ArrayBuffer(8), {
    get(target, key) {
      if (key === Symbol.toPrimitive)
        return () => {
          proxyReads++;
          return 'local("Fixture")';
        };
      return Reflect.get(target, key, target);
    },
  });
  for (const mediated of [false, true]) {
    const args = ['Fixture', proxy];
    const font: FontFace = Reflect.construct(
      constructor,
      mediated ? mapping.construct(constructor, args) : args,
    );
    font.loaded.catch(() => undefined);
  }
  cases.push({ name: 'proxyOfBufferStringBranch', outcome: { stringReads: proxyReads } });
  same(proxyReads, 2, 'proxy of buffer takes native string branch once per call');
  return { cases, mappedSources, cssNamespace: typeof Reflect.get(scope, 'CSS') };
}
