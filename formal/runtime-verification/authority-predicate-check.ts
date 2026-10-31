import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import ts from 'typescript';
import { gillianImage, verifyFixture } from './gillian.ts';

const root = resolve(import.meta.dirname, '../..');
const directory = resolve(root, '.tools/authority-predicate');
const receipt = resolve(import.meta.dirname, 'authority-predicate.json');
await rm(receipt, { force: true });
const sourcePath = 'src/runtime/contexts/model.ts';
const source = await readFile(resolve(root, sourcePath), 'utf8');
const parsed = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true);
const versions = parsed.statements
  .filter(ts.isVariableStatement)
  .flatMap((statement) => [...statement.declarationList.declarations])
  .filter(
    (value) =>
      ts.isIdentifier(value.name) && value.name.text === 'CONTEXT_POLICY_VERSION',
  );
assert.equal(versions.length, 1);
assert(versions[0].initializer && ts.isNumericLiteral(versions[0].initializer));
assert.equal(versions[0].initializer.text, '3', 'Review policy-version proof premises');
const declarations = parsed.statements
  .filter(ts.isFunctionDeclaration)
  .filter((declaration) => declaration.name?.text === 'sameAuthority');
assert.equal(declarations.length, 1);
const declaration = declarations[0];
assert(declaration.body && !declaration.asteriskToken && !declaration.modifiers?.length);
assert.deepEqual(
  declaration.parameters.map((parameter) => parameter.name.getText(parsed)),
  ['current', 'expected'],
);
assert(
  declaration.parameters.every(
    (parameter) => !parameter.initializer && !parameter.dotDotDotToken,
  ),
);
const original = declaration.getText(parsed);
const fields = [
  'id',
  'application',
  'installationGeneration',
  'parent',
  'kind',
  'policyVersion',
  'url',
] as const;
type Field = (typeof fields)[number];
type Mode = 'root' | 'child';
type RecordFields = Record<Field | 'state' | 'proto', string>;
interface Case {
  name: string;
  precondition: string;
  postcondition: string;
}
function predicate(mode: Mode) {
  const parent = mode === 'root' ? 'null' : 'parent';
  const parameters = mode === 'root' ? '' : 'parent:Str, ';
  return `/**
@pred Authority${mode}(o:Obj; id:Str, application:Str, generation:Str, ${parameters}kind:Str, policy:Num, url:Str, phase:Str, proto):
 JSObjWithProto(o, proto) * DataProp(o, "id", id) * DataProp(o, "application", application) *
 DataProp(o, "installationGeneration", generation) * DataProp(o, "parent", ${parent}) *
 DataProp(o, "kind", kind) * DataProp(o, "policyVersion", policy) * DataProp(o, "url", url) * DataProp(o, "state", phase);
*/\n`;
}
function values(prefix: string): RecordFields {
  return {
    id: '#' + prefix + 'id',
    application: '#' + prefix + 'application',
    installationGeneration: '#' + prefix + 'generation',
    parent: '#' + prefix + 'parent',
    kind: '#' + prefix + 'kind',
    policyVersion: '3',
    url: '#' + prefix + 'url',
    state: '#' + prefix + 'phase',
    proto: '#' + prefix + 'proto',
  };
}
function owned(mode: Mode, object: string, fields: RecordFields) {
  const parameters = [fields.id, fields.application, fields.installationGeneration];
  if (mode === 'child') parameters.push(fields.parent);
  parameters.push(
    fields.kind,
    fields.policyVersion,
    fields.url,
    fields.state,
    fields.proto,
  );
  return `Authority${mode}(${object}, ${parameters.join(', ')})`;
}
const cases: Case[] = [];
function addCase(
  name: string,
  bindings: string,
  heap: string,
  constraints: string[],
  result: boolean,
) {
  cases.push({
    name,
    precondition: [bindings, heap, ...constraints].join(' * '),
    postcondition: heap + ' * (ret == ' + result + ')',
  });
}
for (const mode of ['root', 'child'] as const) {
  const current = values('c');
  const expected = { ...current, state: '#ephase', proto: '#eproto' };
  const pair = (c: RecordFields, e: RecordFields) =>
    owned(mode, '#c', c) + ' * ' + owned(mode, '#e', e);
  const bindings = '(current == #c) * (expected == #e)';
  const open = '(! (#ephase == "closed"))';
  addCase(mode + 'Match', bindings, pair(current, expected), [open], true);
  for (const field of fields) {
    if (mode === 'root' && field === 'parent') continue;
    const changed = { ...values('e'), policyVersion: '#epolicy' };
    addCase(
      mode + 'Mismatch' + field,
      bindings,
      pair(current, changed),
      [`(! (${current[field]} == ${changed[field]}))`],
      false,
    );
  }
  addCase(
    mode + 'ClosedExpected',
    bindings,
    pair(current, { ...values('e'), state: '"closed"', policyVersion: '#epolicy' }),
    [],
    false,
  );
  for (const closed of [false, true]) {
    const record = { ...current, state: closed ? '"closed"' : '#phase' };
    addCase(
      mode + (closed ? 'AliasedClosed' : 'AliasedOpen'),
      '(current == #c) * (expected == #c)',
      owned(mode, '#c', record),
      closed ? [] : ['(! (#phase == "closed"))'],
      !closed,
    );
  }
  for (const missing of ['undefined', 'null'])
    addCase(
      mode + 'Missing' + missing,
      `(current == ${missing}) * (expected == #e)`,
      owned(mode, '#e', { ...values('e'), policyVersion: '#epolicy' }),
      [],
      false,
    );
  const other: Mode = mode === 'root' ? 'child' : 'root';
  addCase(
    mode + 'ParentTypeMismatch',
    bindings,
    owned(mode, '#c', current) +
      ' * ' +
      owned(other, '#e', { ...values('e'), policyVersion: '#epolicy' }),
    [],
    false,
  );
}
assert.equal(cases.length, 27);
function fixture(selected: readonly Case[], mutate?: (body: string) => string) {
  let result = "'use strict';\n" + predicate('root') + predicate('child');
  for (const contract of selected) {
    const name = 'sameAuthority_' + contract.name;
    const renamed = (mutate ? mutate(original) : original).replace(
      'function sameAuthority(',
      'function ' + name + '(',
    );
    const compiled = ts.transpileModule(renamed, {
      compilerOptions: {
        target: ts.ScriptTarget.ES5,
        module: ts.ModuleKind.CommonJS,
        removeComments: true,
        ignoreDeprecations: '6.0',
      },
      reportDiagnostics: true,
    });
    assert.equal(compiled.diagnostics?.length, 0);
    const erased = ts.createSourceFile(
      name + '.js',
      compiled.outputText,
      ts.ScriptTarget.Latest,
      true,
    );
    const functions = erased.statements.filter(ts.isFunctionDeclaration);
    assert.equal(functions.length, 1);
    assert.equal(functions[0].name?.text, name);
    assert(
      erased.statements.every(
        (statement) =>
          ts.isFunctionDeclaration(statement) ||
          (ts.isExpressionStatement(statement) &&
            ts.isStringLiteral(statement.expression) &&
            statement.expression.text === 'use strict'),
      ),
    );
    result += `/**\n@id ${name}\n@pre ${contract.precondition}\n@post ${contract.postcondition}\n*/\n`;
    result += functions[0].getText(erased) + '\n';
  }
  return result;
}
const procedures = cases.map((contract) => 'sameAuthority_' + contract.name);
const production = fixture(cases);
const results = [
  await verifyFixture({ directory, name: 'production', code: production, procedures }),
];
for (const field of fields) {
  const contract = cases.find((contract) => contract.name === 'childMismatch' + field);
  assert(contract);
  results.push(
    await verifyFixture({
      directory,
      name: 'omits-' + field.toLowerCase(),
      code: fixture([contract], (body) => {
        const check = 'current.' + field + ' === expected.' + field;
        assert.equal(body.split(check).length, 2);
        return body.replace(check, 'true');
      }),
      procedures: ['sameAuthority_' + contract.name],
      failedProcedure: 'sameAuthority_' + contract.name,
    }),
  );
}
const closed = cases.find((contract) => contract.name === 'childAliasedClosed');
assert(closed);
results.push(
  await verifyFixture({
    directory,
    name: 'accepts-closed',
    code: fixture([closed], (body) => {
      const check = "expected.state !== 'closed'";
      assert.equal(body.split(check).length, 2);
      return body.replace(check, 'true');
    }),
    procedures: ['sameAuthority_' + closed.name],
    failedProcedure: 'sameAuthority_' + closed.name,
  }),
);
for (const mode of ['root', 'child'] as const) {
  const contract = cases.find((contract) => contract.name === mode + 'Match');
  assert(contract);
  results.push(
    await verifyFixture({
      directory,
      name: 'rejects-' + mode + '-match',
      code: fixture([contract], (body) => {
        const actualBody = declaration.body!.getText(parsed);
        assert.equal(body.split(actualBody).length, 2);
        return body.replace(actualBody, '{ return false; }');
      }),
      procedures: ['sameAuthority_' + contract.name],
      failedProcedure: 'sameAuthority_' + contract.name,
    }),
  );
}
const displaced = production.replaceAll('*/\nfunction', '*/\n"use strict";\nfunction');
assert.notEqual(displaced, production);
await assert.rejects(
  verifyFixture({
    directory,
    name: 'displaced-annotations',
    code: displaced,
    procedures,
  }),
  /Wrong number of procedure contracts checked/,
);
const displacedLog = await readFile(
  resolve(directory, 'displaced-annotations.log'),
  'utf8',
);
assert(displacedLog.includes('Obtained 0 symbolic tests in total'));
assert.equal(await readFile(resolve(root, sourcePath), 'utf8'), source);
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
await writeFile(
  receipt,
  JSON.stringify(
    {
      scope:
        'Deductive checks of the actual sameAuthority expression after TypeScript erasure and function renaming for separate contracts. Owned ordinary records with typed data properties; root/child parents, missing records, aliasing, closed expectations and each authority mismatch. Not caller ownership, storage/native actor authentication, async protocol refinement or full confinement.',
      mode: 'verify',
      image: gillianImage,
      imageSourceRevision: 'not-identified',
      typescriptVersion: ts.version,
      source: sourcePath,
      sourceSHA256: hash(source),
      functionSHA256: hash(original),
      runnerSHA256: hash(await readFile(import.meta.filename, 'utf8')),
      preconditions: [
        'Records are ordinary objects with owned writable data properties and arbitrary prototypes. Separate-record contracts require disjoint ownership; aliased contracts own one record.',
        'Identity, application, generation, kind, URL and state fields are strings. Parent is null for a root or a string for a child. Current policy version is 3; expected policy versions may be arbitrary numbers in refusal contracts. A selected mismatch is sufficient even when other fields differ.',
        'This function alone does not reject a closed current record: resolve/resolveWorker must filter it before calling. Proving that caller contract and preservation through async operations remains open.',
        'Extraction, TypeScript erasure, Gillian semantics, verifier, solver and native/caller contracts remain trusted. No proof of the complete registry follows from these contracts.',
      ],
      contracts: cases,
      results,
      vacuousAnnotationControl: {
        disposition: 'rejected-by-runner',
        inputSHA256: hash(displaced),
        outputSHA256: hash(displacedLog),
        observedProcedureCount: 0,
      },
      completedAt: new Date().toISOString(),
    },
    null,
    2,
  ) + '\n',
);
console.log(
  '27 production authority contracts verified; eight omissions, two false rejections and vacuous annotations rejected',
);
