import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '../../..');
const path = 'src/runtime/storage.ts';
const source = await readFile(resolve(root, path), 'utf8');
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
const declaration = parsed.statements.find(
  (node): node is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(node) && node.name?.text === 'getResource',
);
assert(declaration?.body);
const callbacks: ts.ArrowFunction[] = [];
function visit(node: ts.Node): void {
  if (
    ts.isBinaryExpression(node) &&
    ts.isPropertyAccessExpression(node.left) &&
    node.left.getText(parsed) === 'transaction.oncomplete' &&
    ts.isArrowFunction(node.right)
  )
    callbacks.push(node.right);
  ts.forEachChild(node, visit);
}
visit(declaration);
assert.equal(callbacks.length, 1, 'Exactly one actual getResource completion callback');
const callback = callbacks[0];
assert.equal(callback.parameters.length, 0);
assert(ts.isBlock(callback.body));
const body = callback.body.getText(parsed);
const erased = ts.transpileModule(
  'function completion(metadata, resource, expectedGeneration, resolve, reject) ' + body,
  {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    reportDiagnostics: true,
  },
);
assert.equal(erased.diagnostics?.length, 0);
const complete: unknown = runInNewContext(erased.outputText + '\ncompletion');
assert.equal(typeof complete, 'function');
if (typeof complete !== 'function') throw new Error('Missing completion callback');
const completionCases = [];
for (const generation of [undefined, 'g0', 'g1'])
  for (const present of [false, true])
    for (const expected of ['g0', 'g1']) {
      const bytes = present ? new ArrayBuffer(0) : undefined;
      let resolved = false,
        rejected = false,
        result: unknown;
      complete(
        { result: generation === undefined ? undefined : { generation } },
        { result: bytes },
        expected,
        (value: unknown) => {
          resolved = true;
          result = value;
        },
        () => {
          rejected = true;
        },
      );
      assert.equal(resolved, generation === expected && present);
      assert.equal(rejected, !resolved);
      if (resolved) assert.equal(result, bytes, 'Return original transaction snapshot');
      completionCases.push({
        generation: generation ?? null,
        present,
        expected,
        resolved,
        rejected,
      });
    }

// Ghost generation labels describe provenance; production resource values are bytes.
interface State {
  generation?: number;
  bodies: Map<string, { generation: number; bytes: string }>;
}
type Action = 'read-a' | 'read-b' | 'replace' | 'remove';
function permutations<T>(items: T[]): T[][] {
  return items.length
    ? items.flatMap((item, index) =>
        permutations(items.filter((_, current) => current !== index)).map((rest) => [
          item,
          ...rest,
        ]),
      )
    : [[]];
}
const schedules = permutations<Action>(['read-a', 'read-b', 'replace', 'remove']);
function explore(checkGeneration: boolean) {
  const outcomes = [];
  for (const schedule of schedules) {
    const state: State = {
      generation: 0,
      bodies: new Map(
        ['a', 'b'].map((key) => [key, { generation: 0, bytes: key + ':g0' }]),
      ),
    };
    const captured: { generation: number; bytes: string }[] = [];
    let rejected = false;
    for (const action of schedule) {
      if (action === 'remove') {
        state.generation = undefined;
        state.bodies.clear();
      } else if (action === 'replace') {
        state.generation = 1;
        state.bodies = new Map(
          ['a', 'b'].map((key) => [key, { generation: 1, bytes: key + ':g1' }]),
        );
      } else {
        const bytes = state.bodies.get(action === 'read-a' ? 'a' : 'b');
        if ((checkGeneration && state.generation !== 0) || !bytes) rejected = true;
        else captured.push({ ...bytes });
      }
    }
    const provenance = captured.every((item) => item.generation === 0);
    if (checkGeneration)
      assert(provenance, 'Successful resource snapshots preserve captured generation');
    outcomes.push({
      schedule,
      rejected,
      provenance,
      captured,
      finalGeneration: state.generation ?? null,
    });
  }
  return outcomes;
}
const outcomes = explore(true);
const faults = explore(false).filter((item) => !item.provenance);
assert(
  faults.length > 0,
  'Removing generation premise must expose mixed/new resource snapshots',
);
assert(
  outcomes.some((item) => item.captured.length === 2 && item.finalGeneration === null),
  'Previously captured local bytes survive removal',
);
assert.equal(source, await readFile(resolve(root, path), 'utf8'));
const output = resolve(root, 'results/quickjs-confinement/resource-publication');
await mkdir(output, { recursive: true });
await writeFile(
  resolve(output, 'model.json'),
  JSON.stringify(
    {
      scope:
        '12 actual completion callback cases and 24 abstract transaction schedules; no full async/browser proof',
      source: { [path]: hash(source) },
      harness: hash(await readFile(import.meta.filename, 'utf8')),
      extractedCallback: hash(erased.outputText),
      completionCases,
      outcomes,
      generationOmissionCounterexamples: faults,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  JSON.stringify({
    completionCases: completionCases.length,
    schedules: outcomes.length,
    generationOmissionCounterexamples: faults.length,
  }),
);
