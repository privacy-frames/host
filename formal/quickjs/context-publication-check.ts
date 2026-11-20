import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import ts from 'typescript';
import { gillianImage, verifyFixture } from '../runtime-verification/gillian.ts';

const root = resolve(import.meta.dirname, '../..');
const directory = resolve(root, '.tools/quickjs-proof/context-publication');
const sourcePath = 'src/guest/contexts/lifecycle-kernel.ts';
const source = await readFile(resolve(root, sourcePath), 'utf8');
const file = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true);
const functions = file.statements.filter(ts.isFunctionDeclaration);
const names = [
  'beginContextPublication',
  'closeContextPublication',
  'isCurrentContextPublication',
];
assert.deepEqual(
  functions.map((value) => value.name?.text),
  names,
);
assert(
  file.statements.every(
    (node) => ts.isInterfaceDeclaration(node) || ts.isFunctionDeclaration(node),
  ),
  'Extracted kernel cannot omit top-level execution or imports',
);
const erased = functions.map((fn) => {
  assert(fn.body && !fn.asteriskToken);
  assert.deepEqual(
    fn.modifiers?.map((value) => value.kind),
    [ts.SyntaxKind.ExportKeyword],
  );
  const result = ts.transpileModule(fn.getText(file).replace(/^export /, ''), {
    compilerOptions: {
      target: ts.ScriptTarget.ES5,
      module: ts.ModuleKind.CommonJS,
      removeComments: true,
      ignoreDeprecations: '6.0',
    },
    reportDiagnostics: true,
  });
  assert.equal(result.diagnostics?.length, 0);
  const parsed = ts.createSourceFile(
    'kernel.js',
    result.outputText,
    ts.ScriptTarget.ES5,
    true,
  );
  const declarations = parsed.statements.filter(ts.isFunctionDeclaration);
  assert.equal(declarations.length, 1, 'Type erasure changed the kernel function');
  assert(
    parsed.statements.every(
      (statement) =>
        ts.isFunctionDeclaration(statement) ||
        (ts.isExpressionStatement(statement) &&
          ts.isStringLiteral(statement.expression) &&
          statement.expression.text === 'use strict'),
    ),
    'Type erasure introduced runtime helpers',
  );
  return declarations[0].getText(parsed);
});
const predicate = `/**
@pred Publication(o:Obj; token:Obj, closed:Bool, proto):
 JSObjWithProto(o, proto) * DataProp(o, "token", token) * DataProp(o, "closed", closed);
*/`;
const heap = 'Publication(#state, #old, #closed, #proto) * JSObject(#old)';
interface Contract {
  label: string;
  procedure: string;
  pre: string;
  post: string;
}
const contracts: Contract[] = [
  ...['beginContextPublication', 'closeContextPublication'].map((procedure) => ({
    label: procedure === 'beginContextPublication' ? 'begin' : 'close',
    procedure,
    pre: `(state == #state) * ${heap}`,
    post: `Publication(#state, #next, ${procedure === 'closeContextPublication'}, #proto) * JSObject(#old) * JSObject(#next) * (! (#next == #old)) * (ret == #next)`,
  })),
  ...['beginContextPublication', 'closeContextPublication'].map((procedure) => ({
    label: procedure === 'beginContextPublication' ? 'begin-retained' : 'close-retained',
    procedure,
    pre: `(state == #state) * ${heap} * DataProp(#state, "retained", #retained) * JSObject(#retained)`,
    post: `Publication(#state, #next, ${procedure === 'closeContextPublication'}, #proto) * JSObject(#old) * DataProp(#state, "retained", #retained) * JSObject(#retained) * JSObject(#next) * (! (#next == #old)) * (! (#next == #retained)) * (ret == #next)`,
  })),
  ...[false, true].map((closed) => ({
    label: closed ? 'current-closed' : 'current-live',
    procedure: 'isCurrentContextPublication',
    pre: `(state == #state) * (token == #old) * Publication(#state, #old, ${closed}, #proto) * JSObject(#old)`,
    post: `Publication(#state, #old, ${closed}, #proto) * JSObject(#old) * (ret == ${!closed})`,
  })),
  ...[false, true].map((closed) => ({
    label: closed ? 'stale-closed' : 'stale-live',
    procedure: 'isCurrentContextPublication',
    pre: `(state == #state) * (token == #retained) * Publication(#state, #old, ${closed}, #proto) * JSObject(#old) * JSObject(#retained)`,
    post: `Publication(#state, #old, ${closed}, #proto) * JSObject(#old) * JSObject(#retained) * (ret == false)`,
  })),
];
function fixture(contract: Contract, mutation?: (body: string) => string): string {
  return (
    "'use strict';\n" +
    predicate +
    '\n' +
    erased
      .map((body, index) => {
        if (names[index] !== contract.procedure) return body;
        return `/**\n@id ${contract.procedure}\n@pre ${contract.pre}\n@post ${contract.post}\n*/\n${mutation ? mutation(body) : body}`;
      })
      .join('\n')
  );
}
const results = [];
for (const contract of contracts) {
  results.push(
    await verifyFixture({
      directory,
      name: contract.label,
      code: fixture(contract),
      procedures: [contract.procedure],
    }),
  );
}
const faults = [
  {
    label: 'begin-reuses-token',
    contract: 'begin',
    from: 'var token = {};',
    to: 'var token = state.token;',
  },
  {
    label: 'close-stays-live',
    contract: 'close',
    from: 'state.closed = true;',
    to: 'state.closed = false;',
  },
  {
    label: 'ignores-closed',
    contract: 'current-closed',
    from: '!state.closed && state.token === token',
    to: 'state.token === token',
  },
  {
    label: 'ignores-identity',
    contract: 'stale-live',
    from: '!state.closed && state.token === token',
    to: '!state.closed',
  },
];
for (const fault of faults) {
  const contract = contracts.find((value) => value.label === fault.contract)!;
  results.push(
    await verifyFixture({
      directory,
      name: fault.label,
      code: fixture(contract, (body) => {
        assert.equal(body.split(fault.from).length, 2, 'Fault anchor changed');
        return body.replace(fault.from, fault.to);
      }),
      procedures: [contract.procedure],
      failedProcedure: contract.procedure,
    }),
  );
}
const contract = contracts[0];
await assert.rejects(
  verifyFixture({
    directory,
    name: 'missing-contract',
    code: fixture(contract).replaceAll('*/\nfunction', '*/\n"use strict";\nfunction'),
    procedures: [contract.procedure],
  }),
  /Wrong number of procedure contracts checked/,
);
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const callers = [
  'src/guest/contexts/documents.ts',
  'src/guest/contexts/window-contexts.ts',
  'src/guest/session.ts',
  'src/guest/browser.ts',
];
const callerHashes = Object.fromEntries(
  await Promise.all(
    callers.map(async (path) => [
      path,
      hash(await readFile(resolve(root, path), 'utf8')),
    ]),
  ),
);
await mkdir(resolve(root, 'results/quickjs-confinement'), { recursive: true });
await writeFile(
  resolve(root, 'results/quickjs-confinement/context-publication-implementation.json'),
  JSON.stringify(
    {
      scope:
        'Direct deductive verification of the actual three context publication kernel functions after TypeScript erasure. Caller hashes identify reviewed integration; they are not caller correctness proofs.',
      source: sourcePath,
      sourceSHA256: hash(source),
      runnerSHA256: hash(await readFile(import.meta.filename, 'utf8')),
      toolchain: { gillianImage, typescript: ts.version, mode: 'verify' },
      assumptions: [
        'The native private state owns writable token and closed data properties; old and retained tokens remain ordinary live objects.',
        'JavaScript fresh object identity, TypeScript erasure, parser/extractor, Gillian semantics, verifier and solver are trusted.',
        'Browser lifecycle, AbortSignal behavior, caller ownership and native callbacks require separate integration contracts.',
      ],
      callerHashes,
      results,
      missingContractControl: 'rejected',
      completedAt: new Date().toISOString(),
    },
    null,
    2,
  ) + '\n',
);
console.log(
  'Context publication: eight production contracts verified; four postcondition faults and a zero-contract run rejected.',
);
