import { newQuickJSWASMModuleFromVariant, newVariant } from 'quickjs-emscripten-core';
import variant from '@jitl/quickjs-wasmfile-release-sync';
import type { GuestResult } from './types.ts';

const started = performance.now();
const module = await WebAssembly.compile(
  await (await fetch('/engine.wasm')).arrayBuffer(),
);
const engine = await newQuickJSWASMModuleFromVariant(
  newVariant(variant, { wasmModule: module }),
);
const context = engine.newContext();
const initialized = performance.now();

// Only these two native nodes can be addressed by the fixture bridge.
const parent = document.createElement('div');
const child = document.createElement('span');
document.body.append(parent);
const nodes = new Map<number, Node>([
  [1, parent],
  [2, child],
]);
const nativeNode = (handle: number) => {
  const node = nodes.get(handle);
  if (!node) throw new Error('Unknown fixture node');
  return node;
};

const functions = {
  // Deliberately permissive diagnostic for the CSP control, not a proposed API.
  appendDiagnosticScript: context.newFunction('appendDiagnosticScript', (source) => {
    const script = document.createElement('script');
    script.textContent = context.getString(source);
    document.body.append(script);
  }),
  nativeRead: context.newFunction('nativeRead', (handle, property) => {
    const node = nativeNode(context.getNumber(handle));
    switch (context.getString(property)) {
      case 'nodeName':
        return context.newString(node.nodeName);
      case 'textContent':
        return context.newString(node.textContent || '');
      default:
        throw new Error('Unsupported fixture property');
    }
  }),
  nativeWrite: context.newFunction('nativeWrite', (handle, property, value) => {
    if (context.getString(property) !== 'textContent')
      throw new Error('Unsupported write');
    nativeNode(context.getNumber(handle)).textContent = context.getString(value);
  }),
  nativeParent: context.newFunction('nativeParent', (handle) => {
    const parent = nativeNode(context.getNumber(handle)).parentNode;
    return context.newNumber(parent === nodes.get(1) ? 1 : 0);
  }),
  nativeAppend: context.newFunction('nativeAppend', (parent, child) => {
    nativeNode(context.getNumber(parent)).appendChild(
      nativeNode(context.getNumber(child)),
    );
  }),
};

for (const [name, handle] of Object.entries(functions)) {
  context.setProp(context.global, name, handle);
  handle.dispose();
}

try {
  const source = await (await fetch('/guest.js')).text();
  context.unwrapResult(context.evalCode(source, 'generated-guest.js')).dispose();
  const result = context.unwrapResult(context.evalCode('JSON.stringify(bindingResults)'));
  const guest: GuestResult = JSON.parse(context.getString(result));
  result.dispose();

  // A later native mutation must be read through the same guest wrapper.
  child.textContent = 'native mutation';
  const mutationResult = context.unwrapResult(context.evalCode('node(2).textContent'));
  const nativeMutation = context.getString(mutationResult);
  mutationResult.dispose();
  context
    .unwrapResult(
      context.evalCode("appendDiagnosticScript('globalThis.nativeMarker = true')"),
    )
    .dispose();
  globalThis.probeResult = {
    status: 'passed',
    guest,
    nativeMutation,
    nativeText: child.textContent,
    nodeCount: parent.childNodes.length,
    engineStartupMs: initialized - started,
    totalMs: performance.now() - started,
    nativeScriptExecuted: Reflect.get(globalThis, 'nativeMarker') === true,
  };
} catch (error) {
  globalThis.probeResult = {
    status: 'failed',
    error: String(error),
    stack: error instanceof Error ? error.stack : undefined,
  };
} finally {
  context.dispose();
}
