import test from 'node:test';
import assert from 'node:assert/strict';
import { readWorkletGraph } from '../src/runtime/contexts/worklet-graph-schema.ts';
import {
  createWorkletChunks,
  createWorkletBootstrap,
} from '../src/runtime/contexts/worklet-chunks.ts';

function graph() {
  return {
    entry: 'https://publisher.test/entry.js',
    chunks: [{ name: 'entry.js', code: 'export const answer=19;', imports: [] }],
    facades: [{ module: 'https://publisher.test/entry.js', chunk: 'entry.js' }],
  };
}

test('wire graph records are copied before the sender can change them', () => {
  const source = graph();
  const parsed = readWorkletGraph(source);
  source.chunks[0].code = 'throw new Error("changed");';
  source.facades[0].chunk = 'other.js';
  assert.equal(parsed.chunks[0].code, 'export const answer=19;');
  assert.equal(parsed.facades[0].chunk, 'entry.js');
});

test('wire getters and sparse arrays are refused without invoking accessors', () => {
  let called = false;
  const source = graph();
  Object.defineProperty(source, 'entry', {
    get() {
      called = true;
      return 'entry';
    },
  });
  assert.throws(() => readWorkletGraph(source), /graph field/);
  assert.equal(called, false);
  const sparse = graph();
  delete sparse.chunks[0];
  assert.throws(() => readWorkletGraph(sparse), /graph field/);
});

test('duplicate and absent chunk/facade targets fail before linking', () => {
  const duplicate = graph();
  duplicate.chunks.push(duplicate.chunks[0]);
  assert.throws(() => readWorkletGraph(duplicate), /Duplicate worklet chunk/);
  const absent = graph();
  absent.facades[0].chunk = 'missing.js';
  assert.throws(() => readWorkletGraph(absent), /Invalid worklet facade/);
  assert.throws(() => readWorkletGraph({ ...graph(), facades: [] }), /entry has no/);
});

test('remote imports and invalid replacement ranges cannot become local scripts', () => {
  for (const edit of [
    { start: 0, end: 2, target: 'https://receiver.test/module.js', external: true },
    { start: -1, end: 2, target: 'entry.js', external: false },
    { start: 0, end: 100, target: 'entry.js', external: false },
    { start: 0, end: 2, target: 'missing.js', external: false },
  ]) {
    const source = graph();
    const input = { ...source, chunks: [{ ...source.chunks[0], imports: [edit] }] };
    assert.throws(() => createWorkletChunks(input));
  }
});

test('a cyclic emitted chunk graph is refused without publishing an entry', () => {
  const source = graph();
  const code = 'import "other";';
  const input = {
    ...source,
    chunks: ['entry.js', 'other.js'].map((name, index) => ({
      name,
      code,
      imports: [
        { start: 7, end: 14, target: index ? 'entry.js' : 'other.js', external: false },
      ],
    })),
  };
  assert.throws(() => createWorkletChunks(input), /missing or cyclic/);
});

test('bootstrap entries retain identity and closing denies new URL grants', async () => {
  const application = URL.createObjectURL(new Blob(['export const answer=19;']));
  const bootstrap = createWorkletBootstrap('export const prepared=true;');
  try {
    const first = bootstrap.entry(application);
    assert.equal(bootstrap.entry(application), first);
    assert.equal((await fetch(first)).ok, true);
    assert.throws(() => bootstrap.entry('https://receiver.test/entry.js'), /not local/);
    bootstrap.close();
    assert.throws(() => bootstrap.entry(application), /closed/);
    await assert.rejects(fetch(first));
  } finally {
    bootstrap.close();
    URL.revokeObjectURL(application);
  }
});
