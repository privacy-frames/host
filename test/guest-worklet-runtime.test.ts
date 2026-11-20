import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { allocateIdentity } from '../src/guest/identity.ts';

const source = await readFile(
  new URL('../src/guest/contexts/worklet-runtime.ts', import.meta.url),
  'utf8',
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  reportDiagnostics: true,
});
assert.deepEqual(compiled.diagnostics, []);
function fixture(exhausted = false) {
  const names: string[] = [];
  const context = createContext({
    exports: {},
    __privacyRegisterProcessor(name: string) {
      names.push(name);
    },
    __privacyProcessorPort() {
      return {};
    },
  });
  runInContext(compiled.outputText, context);
  const allocator = exhausted ? '() => undefined' : allocateIdentity.toString();
  runInContext(
    `globalThis.helpers = exports.installWorkletGuestRuntime(${allocator});`,
    context,
  );
  return { context, names, evaluate: (code: string) => runInContext(code, context) };
}

test('worklet registration captures name checks and refuses reserved names', () => {
  const setup = fixture();
  const result = setup.evaluate(`(() => {
    const prefix = String.prototype.startsWith;
    const string = String;
    let coercions = 0;
    try {
      String.prototype.startsWith = () => false;
      globalThis.String = () => 'changed';
      let reserved = false, symbol = false;
      try { registerProcessor('privacy-frames:other', class { process() {} }); }
      catch (error) { reserved = error instanceof TypeError; }
      try { registerProcessor(Symbol('name'), class { process() {} }); }
      catch (error) { symbol = error instanceof TypeError; }
      registerProcessor({toString() { coercions++; return 'ordinary'; }},
        class extends AudioWorkletProcessor { process() { return false; } });
      return [reserved, symbol, coercions];
    } finally {
      globalThis.String = string;
      String.prototype.startsWith = prefix;
    }
  })()`);
  assert.deepEqual(Array.from(result), [true, true, 1]);
  assert.deepEqual(setup.names, ['ordinary']);
});

test('worklet maps, reflection and audio copies retain captured operations', () => {
  const setup = fixture();
  const result = setup.evaluate(`(() => {
    registerProcessor('signal', class extends AudioWorkletProcessor {
      process(inputs, outputs, parameters) {
        outputs[0][0][0] = inputs[0][0][0] * parameters.gain[0];
        return false;
      }
    });
    const id = helpers.construct('signal', {});
    const saved = [Map.prototype.get, Map.prototype.set, Map.prototype.delete,
      Object.keys, Object.entries, Reflect.construct,
      Object.getPrototypeOf(Float32Array.prototype).set];
    const fail = () => { throw new Error('mutable worklet operation invoked'); };
    try {
      Map.prototype.get = fail; Map.prototype.set = fail; Map.prototype.delete = fail;
      Object.keys = fail; Object.entries = fail; Reflect.construct = fail;
      Object.getPrototypeOf(Float32Array.prototype).set = fail;
      const result = helpers.process(id, [[new Float32Array([0.5])]],
        [[new Float32Array(1)]], {gain: new Float32Array([0.5])});
      const released = helpers.process(id, [], [], {}).active === false;
      helpers.release(id);
      return [result.active, result.outputs[0][0][0], released];
    } finally {
      Map.prototype.get = saved[0]; Map.prototype.set = saved[1];
      Map.prototype.delete = saved[2]; Object.keys = saved[3];
      Object.entries = saved[4]; Reflect.construct = saved[5];
      Object.getPrototypeOf(Float32Array.prototype).set = saved[6];
    }
  })()`);
  assert.deepEqual(Array.from(result), [false, 0.25, true]);
});

test('worklet allocation exhaustion rejects before invoking application construction', () => {
  const setup = fixture(true);
  const result = setup.evaluate(`(() => {
    let constructed = 0;
    registerProcessor('signal', class extends AudioWorkletProcessor {
      constructor() { super(); constructed++; }
      process() { return false; }
    });
    let rejected = false;
    try { helpers.construct('signal', {}); }
    catch (error) { rejected = error instanceof RangeError; }
    return [rejected, constructed];
  })()`);
  assert.deepEqual(Array.from(result), [true, 0]);
});

test('worklet parameter names remain data rather than private-record prototypes', () => {
  const setup = fixture();
  const result = setup.evaluate(`(() => {
    let observed;
    registerProcessor('signal', class extends AudioWorkletProcessor {
      process(_inputs, _outputs, parameters) {
        observed = Object.getPrototypeOf(parameters) === null &&
          parameters.__proto__[0] === 3;
        return true;
      }
    });
    const id = helpers.construct('signal', {});
    const parameters = Object.create(null);
    parameters.__proto__ = new Float32Array([3]);
    helpers.process(id, [], [], parameters);
    helpers.release(id);
    return observed;
  })()`);
  assert.equal(result, true);
});
