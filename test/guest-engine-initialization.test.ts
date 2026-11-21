import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('a trusted-factory initializer error is reported without a runtime disposal assertion', () => {
  const engine = new URL('../src/guest/engine.ts', import.meta.url).href;
  const wasm = new URL('../vendor/quickjs/generated/engine.wasm', import.meta.url).href;
  const source = `
    import assert from 'node:assert/strict';
    import { readFile } from 'node:fs/promises';
    import { GuestEngine } from ${JSON.stringify(engine)};
    const unavailable = () => { throw new Error('No native operations admitted'); };
    const host = { get: () => undefined, set: () => false, call: unavailable,
      construct: unavailable, ownKeys: () => [], descriptor: () => undefined,
      prototype: () => null };
    let failure;
    try {
      await GuestEngine.create({ host,
        wasmModule: await WebAssembly.compile(await readFile(new URL(${JSON.stringify(wasm)}))) });
    } catch (error) { failure = error; }
    assert(failure, 'Direct TSX embeds a bootstrap body with an external naming helper');
    assert.equal(failure.name, 'ReferenceError');
    assert.match(failure.message, /__name.*not defined/);
    console.log('Original initializer error preserved; runtime released');
  `;
  // TSX's naming helper is deliberately absent from the fresh QuickJS context.
  // This is a real failed-initialization case, not a replacement bootstrap.
  const child = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module'], {
    input: source,
    encoding: 'utf8',
    timeout: 30000,
  });
  assert.equal(child.error, undefined);
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stderr, '');
  assert.match(child.stdout, /Original initializer error preserved; runtime released/);
});
