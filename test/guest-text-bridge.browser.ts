import { createGuestWindow } from '../src/guest/session.ts';
import type { GuestContextCatalog } from '../src/guest/contexts/types.ts';

function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
async function run() {
  let unknownReads = 0;
  Object.defineProperty(TextEncoder.prototype, 'unreviewedTextFixture', {
    configurable: true,
    get() {
      unknownReads++;
      return 'native positive';
    },
  });
  check(
    Reflect.get(new TextEncoder(), 'unreviewedTextFixture') === 'native positive',
    'Native getter positive control',
  );
  check(unknownReads === 1, 'Native control executes getter once');
  unknownReads = 0;
  const foreignFrame = document.createElement('iframe');
  document.body.append(foreignFrame);
  const foreignWindow = foreignFrame.contentWindow;
  check(foreignWindow, 'Foreign native realm exists');
  const ForeignEncoder = Reflect.get(foreignWindow, 'TextEncoder') as typeof TextEncoder;
  const ForeignDecoder = Reflect.get(foreignWindow, 'TextDecoder') as typeof TextDecoder;
  const foreign = [new ForeignEncoder(), new ForeignDecoder()];
  foreignFrame.remove();
  const catalog: GuestContextCatalog = {
    application: 'text-bridge-fixture',
    generation: 'fixture-generation',
    sourceURL: 'https://fixture.invalid/',
    documentBase: 'https://fixture.invalid/',
    runtimeURL: location.origin + '/',
    applicationURL: location.origin + '/app/',
    engineWasm: await (await fetch('/engine.wasm')).arrayBuffer(),
    workerBootstrap: {
      dedicated: new ArrayBuffer(0),
      shared: new ArrayBuffer(0),
      worklet: new ArrayBuffer(0),
    },
    resources: [],
  };
  const session = await createGuestWindow(catalog, window);
  try {
    let unknownGetterDenied = false;
    try {
      session.environment.host.get(new TextEncoder(), 'unreviewedTextFixture');
    } catch {
      unknownGetterDenied = true;
    }
    Reflect.set(window, '__textBridgeObserved', { unknownReads, unknownGetterDenied });
    check(
      unknownReads === 0,
      'Unreviewed native text getter must be denied before execution',
    );
    check(unknownGetterDenied, 'Unknown text getter must reject');
    for (const value of foreign) {
      let denied = false;
      try {
        session.environment.host.get(value, 'encoding');
      } catch {
        denied = true;
      }
      check(denied, 'Foreign native text brand must be claimed and refused');
    }
    const result = await session.engine.evaluate(
      `(() => {
      function check(value, message) { if (!value) throw new Error(message); }
      let strings = 0, options = 0;
      const decoder = new TextDecoder({ toString() { strings++; return 'utf-8'; } }, {
        get fatal() { options++; return true; }, get ignoreBOM() { options++; return true; }
      });
      check(strings === 1 && options === 2, 'Native constructor conversion once');
      check(decoder.encoding === 'utf-8' && decoder.fatal && decoder.ignoreBOM, 'Native attributes');
      const encoder = new TextEncoder();
      strings = 0;
      const bytes = encoder.encode({ toString() { strings++; return 'A🐼é'; } });
      check(strings === 1 && bytes instanceof Uint8Array && bytes.length === 7, 'Encoding and binary handoff');
      check(decoder.decode(bytes) === 'A🐼é', 'Decoder binary input');
      const target = new Uint8Array(6);
      const written = encoder.encodeInto('A🐼é', target);
      check(written.read === 3 && written.written === 5 && target[0] === 65 && target[4] === 188, 'Native encodeInto writes caller buffer');
      const stream = new TextDecoder();
      check(stream.decode(new Uint8Array([240,159]), { stream: true }) === '', 'Decoder retains partial scalar');
      check(stream.decode(new Uint8Array([144,188])) === '🐼', 'Decoder completes partial scalar');
      let invalid = false;
      try { decoder.decode(new Uint8Array([255])); } catch { invalid = true; }
      check(invalid, 'Native fatal decoding');
      for (const value of [encoder, decoder]) {
        const proto = Object.getPrototypeOf(value);
        const ctor = value === encoder ? TextEncoder : TextDecoder;
        check(proto === ctor.prototype && proto.constructor === ctor, 'Constructor prototype identity');
        check(Object.getPrototypeOf(proto) === Object.prototype, 'Guest intrinsic prototype boundary');
        const encoding = Object.getOwnPropertyDescriptor(proto, 'encoding');
        check(encoding.get.call(value) === 'utf-8', 'Borrowed native getter');
        const methodName = value === encoder ? 'encode' : 'decode';
        const method = value[methodName];
        check(method === value[methodName] && Object.getOwnPropertyDescriptor(proto, methodName).value === method, 'Stable method and descriptor identity');
        check(Object.getPrototypeOf(method) === Function.prototype, 'Guest callable intrinsic boundary');
      }
      let unknown = false;
      try { encoder.unreviewedTextFixture; } catch { unknown = true; }
      check(unknown, 'Guest unreviewed getter rejection');
      return JSON.stringify({ construction: true, conversion: true, encoding: true, encodeInto: true,
        streamingDecode: true, fatalDecode: true, reflection: true, binaryHandoff: true,
        foreignBrandsDenied: true, unknownGetterDenied: true });
    })()`,
      'text:bridge-fixture',
    );
    return JSON.parse(String(result)) as unknown;
  } finally {
    session.close();
    Reflect.deleteProperty(TextEncoder.prototype, 'unreviewedTextFixture');
  }
}
run()
  .then((result) => Reflect.set(window, '__textBridgeResult', result))
  .catch((error) =>
    Reflect.set(
      window,
      '__textBridgeFailure',
      String(error) + (error instanceof Error && error.stack ? '\n' + error.stack : ''),
    ),
  );
