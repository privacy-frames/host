import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import ts from 'typescript';
import { gillianImage, verifyFixture } from '../runtime-verification/gillian.ts';

const root = resolve(import.meta.dirname, '../..');
const directory = resolve(root, '.tools/quickjs-proof/identity');
const receipt = resolve(root, 'results/quickjs-confinement/identity-implementation.json');
const sourcePath = 'src/guest/identity.ts';
const source = await readFile(resolve(root, sourcePath), 'utf8');
const file = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true);
const declarations = file.statements.filter(ts.isFunctionDeclaration);
assert.equal(declarations.length, 1);
const declaration = declarations[0];
assert.equal(declaration.name?.text, 'allocateIdentity');
assert(declaration.body && !declaration.asteriskToken);
assert.deepEqual(
  declaration.modifiers?.map((modifier) => modifier.kind),
  [ts.SyntaxKind.ExportKeyword],
);
assert.equal(declaration.parameters.length, 1);
assert.equal(declaration.parameters[0].name.getText(file), 'state');
assert(
  !declaration.parameters[0].initializer && !declaration.parameters[0].dotDotDotToken,
);
assert(
  file.statements.every(
    (statement) =>
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      statement === declaration,
  ),
  'Allocator extraction cannot omit top-level runtime dependencies',
);
const original = declaration.getText(file).replace(/^export /, '');
const procedure = 'allocateIdentity';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');

type Case = 'available' | 'exhausted';
function erased(code: string): string {
  const compiled = ts.transpileModule(code, {
    compilerOptions: {
      target: ts.ScriptTarget.ES5,
      module: ts.ModuleKind.CommonJS,
      removeComments: true,
      ignoreDeprecations: '6.0',
    },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics?.length, 0);
  const file = ts.createSourceFile(
    'identity.js',
    compiled.outputText,
    ts.ScriptTarget.Latest,
    true,
  );
  const functions = file.statements.filter(ts.isFunctionDeclaration);
  assert.equal(functions.length, 1);
  const fn = functions[0];
  assert.equal(fn.name?.text, procedure);
  assert(fn.body);
  assert(
    file.statements.every(
      (statement) =>
        statement === fn ||
        (ts.isExpressionStatement(statement) &&
          ts.isStringLiteral(statement.expression) &&
          statement.expression.text === 'use strict'),
    ),
    'Type erasure emitted runtime helpers or unknown statements',
  );
  const bindings = new Set([procedure, 'undefined']);
  for (const parameter of fn.parameters) {
    assert(ts.isIdentifier(parameter.name));
    bindings.add(parameter.name.text);
  }
  const collect = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node)) {
      assert(ts.isIdentifier(node.name));
      bindings.add(node.name.text);
    }
    assert(!ts.isFunctionLike(node) || node === fn, 'Nested function is unsupported');
    ts.forEachChild(node, collect);
  };
  collect(fn);
  const references = (node: ts.Node): void => {
    if (
      ts.isIdentifier(node) &&
      !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)
    ) {
      assert(bindings.has(node.text), 'Uncaptured allocator identifier: ' + node.text);
    }
    ts.forEachChild(node, references);
  };
  references(fn);
  return fn.getText(file);
}

function fixture(kind: Case, mutate?: (code: string) => string): string {
  const precondition =
    'UndefinedBinding(#globalProto) * (state == #state) * Counter(#state, #identity, #proto) * (is-int #identity) * ' +
    (kind === 'available'
      ? '(1 <=# #identity) * (#identity <=# 9007199254740991)'
      : '(#identity == 9007199254740992)');
  const postcondition =
    kind === 'available'
      ? 'UndefinedBinding(#globalProto) * Counter(#state, #identity + 1, #proto) * (ret == #identity)'
      : 'UndefinedBinding(#globalProto) * Counter(#state, #identity, #proto) * (ret == undefined)';
  return `'use strict';
/**
@pred UndefinedBinding(proto):
  JSObjWithProto($lg, proto) * DataPropGen($lg, "undefined", undefined, false, false, false);
*/
/**
@pred Counter(o:Obj; identity:Num, proto):
  JSObjWithProto(o, proto) * DataProp(o, "next", identity);
*/
/**
@id ${procedure}
@pre ${precondition}
@post ${postcondition}
*/
${erased(mutate ? mutate(original) : original)}
`;
}

await rm(receipt, { force: true });
await mkdir(directory, { recursive: true });
const results = [];
for (const kind of ['available', 'exhausted'] as const) {
  results.push(
    await verifyFixture({
      directory,
      name: 'production-' + kind,
      code: fixture(kind),
      procedures: [procedure],
    }),
  );
}
const mutations = [
  {
    name: 'omitted-guard',
    kind: 'exhausted',
    from: 'if (identity > 9007199254740991) return undefined;',
    to: '',
  },
  {
    name: 'omitted-increment',
    kind: 'available',
    from: 'state.next = identity + 1;',
    to: 'state.next = identity;',
  },
  {
    name: 'wrap-to-one',
    kind: 'available',
    from: 'state.next = identity + 1;',
    to: 'state.next = identity === 9007199254740991 ? 1 : identity + 1;',
  },
] as const;
for (const mutation of mutations) {
  const code = fixture(mutation.kind, (body) => {
    assert.equal(body.split(mutation.from).length, 2, 'Allocator fault anchor changed');
    return body.replace(mutation.from, mutation.to);
  });
  results.push(
    await verifyFixture({
      directory,
      name: mutation.name,
      code,
      procedures: [procedure],
      failedProcedure: procedure,
    }),
  );
}
const zeroContracts = fixture('available').replace(
  /\/\*\*\n@id allocateIdentity[\s\S]*?\*\//,
  '',
);
assert.notEqual(zeroContracts, fixture('available'));
await assert.rejects(
  verifyFixture({
    directory,
    name: 'zero-contracts',
    code: zeroContracts,
    procedures: [procedure],
  }),
  /Wrong number of procedure contracts checked/,
);
const zeroLog = await readFile(resolve(directory, 'zero-contracts.log'), 'utf8');
assert.match(zeroLog, /Obtained 0 symbolic tests in total/);
assert(!zeroLog.includes('Verifying one spec of procedure '));
await mkdir(resolve(root, 'results/quickjs-confinement'), { recursive: true });
await writeFile(
  receipt,
  JSON.stringify(
    {
      scope:
        'Deductive checking of the extracted production allocateIdentity function under owned-counter and standard undefined-binding contracts. Private-state ownership, engine callers and browser effects require separate verification.',
      mode: 'verify',
      source: sourcePath,
      sourceSHA256: hash(source),
      extractedFunctionSHA256: hash(original),
      erasedFunctionSHA256: hash(erased(original)),
      runnerSHA256: hash(await readFile(import.meta.filename, 'utf8')),
      typescriptVersion: ts.version,
      image: gillianImage,
      imageSourceRevision: 'not-identified',
      contracts: {
        available:
          'Owned writable next field, arbitrary record prototype, integral counter in 1..9007199254740991; returns old counter, advances next exactly once, preserves prototype and framed heap.',
        exhausted:
          'Owned writable next field equal 9007199254740992; returns undefined, leaves counter/prototype and framed heap unchanged.',
        globalUndefined:
          'Standard immutable, non-enumerable, non-configurable global undefined data property, preserved by both paths.',
      },
      callerCorrespondence:
        'pending: establish initialization, private ownership, integral range preservation and use by every identity allocator',
      numericModel: {
        integerPrecondition:
          'Gillian is-int predicate with explicit bounded numeric conditions',
        arithmetic:
          'Mathematical-number arithmetic; this is not an IEEE-754 bit-level proof.',
        requiredJavaScriptContract:
          'Integers 1..9007199254740992 are exactly representable; adding 1 to an integer at most 9007199254740991 is exact. These properties of trusted JavaScript arithmetic connect bounded integral states to the model.',
        referenceSource: {
          repository: 'https://github.com/GillianPlatform/Gillian',
          revision: '469aa5c134ba7790c40669bd4bc50483aff36d7b',
          path: 'GillianCore/smt/smt.ml',
          url: 'https://github.com/GillianPlatform/Gillian/blob/469aa5c134ba7790c40669bd4bc50483aff36d7b/GillianCore/smt/smt.ml#L994',
          correspondence:
            'Reference source shows real-valued Num arithmetic; the pinned container source revision remains unidentified.',
        },
      },
      extraction: {
        sourceBodyCopied: true,
        changes:
          'Remove export and type annotations; TypeScript emits ES5 variable declarations. No allocation-body substitution in the production cases.',
        closedBody:
          'Reject top-level runtime dependencies, compiler helpers and free runtime identifiers except standard undefined.',
        trusted: [
          'TypeScript parser/type erasure',
          'source extractor',
          'Gillian JavaScript semantics/compiler/verifier',
          'solver',
          'pinned container',
        ],
      },
      results,
      zeroContractControl: {
        refused: true,
        verifierReportedContracts: 0,
        inputSHA256: hash(zeroContracts),
        outputSHA256: hash(zeroLog),
      },
      completedAt: new Date().toISOString(),
    },
    null,
    2,
  ) + '\n',
);
console.log('Production available and exhausted allocator contracts verified');
console.log('Omitted guard, omitted increment and wrap controls fail postconditions');
console.log('Zero-contract verifier success rejected');
