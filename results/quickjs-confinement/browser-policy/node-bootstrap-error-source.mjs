import { readFile } from 'node:fs/promises';
import { newQuickJSWASMModuleFromVariant, newVariant } from 'quickjs-emscripten-core';
import { quickjsVariant } from '../../../src/guest/quickjs.ts';
import { installGuestRegExpLegacy } from '../../../src/guest/legacy-regexp.ts';

const module = await newQuickJSWASMModuleFromVariant(newVariant(quickjsVariant, {
  wasmModule: await WebAssembly.compile(await readFile('vendor/quickjs/generated/engine.wasm')),
}));
const source = `(${installGuestRegExpLegacy.toString()})();`;
for (const helperDefined of [false, true]) {
  const context = module.newContext();
  try {
    if (helperDefined) {
      const initialized = context.evalCode(
        'globalThis.__name = (fn, name) => Object.defineProperty(fn, "name", {value: name, configurable: true});',
        'diagnostic:name-helper',
      );
      if (initialized.error) {
        try { throw new Error(JSON.stringify(context.dump(initialized.error))); }
        finally { initialized.error.dispose(); }
      }
      initialized.value.dispose();
    }
    const result = context.evalCode(source, 'diagnostic:captured-legacy-source', {
      type: 'global', strict: true,
    });
    if (result.error) {
      try {
        console.log(JSON.stringify({ helperDefined, error: context.dump(result.error) }));
      } finally {
        result.error.dispose();
      }
    } else {
      result.value.dispose();
      console.log(JSON.stringify({ helperDefined, evaluated: true }));
    }
  } finally {
    context.dispose();
    console.log(JSON.stringify({ helperDefined, disposed: true }));
  }
}
