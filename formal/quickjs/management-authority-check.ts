import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import ts from 'typescript';
import { gillianImage, verifyFixture } from '../runtime-verification/gillian.ts';

const root = resolve(import.meta.dirname, '../..');
const directory = resolve(root, '.tools/quickjs-proof/management-authority');
const sourcePath = 'src/runtime/authority.ts';
const source = await readFile(resolve(root, sourcePath), 'utf8');
const file = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true);
const functions = file.statements.filter(ts.isFunctionDeclaration);
const names = ['acceptsManagerSender', 'clientCanManage', 'managementPortIsCurrent'];
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
const fields = [
  'closed',
  'bound',
  'trusted',
  'embedded',
  'parentSource',
  'allowedOrigin',
];
interface Contract {
  label: string;
  procedure: string;
  pre: string;
  post: string;
}
const contracts: Contract[] = [];
const good = [false, false, true, true, true, true];
for (let failed = -1; failed < fields.length; failed++) {
  const values = fields.map((_, index) =>
    index === failed ? !good[index] : failed < 0 ? good[index] : `#b${index}`,
  );
  const heap = `Sender(#claims, ${values.join(', ')}, #proto)`;
  contracts.push({
    label:
      failed < 0 ? 'sender-accepted' : `sender-reject-${fields[failed].toLowerCase()}`,
    procedure: 'acceptsManagerSender',
    pre: `(claims == #claims) * ${heap}`,
    post: `${heap} * (ret == ${failed < 0})`,
  });
}
for (let failed = -1; failed < 3; failed++) {
  const heap = 'Identity(#client, #id, #kind, #url, #proto)';
  const matches = ['(#id == #source)', '(#kind == "window")', '(#url == #control)'];
  const condition = failed < 0 ? matches.join(' * ') : `(! ${matches[failed]})`;
  contracts.push({
    label: failed < 0 ? 'client-accepted' : `client-reject-${failed}`,
    procedure: 'clientCanManage',
    pre: `(client == #client) * (sourceID == #source) * (controlURL == #control) * ${heap} * ${condition}`,
    post: `${heap} * (ret == ${failed < 0})`,
  });
}

for (const closed of [false, true]) {
  contracts.push({
    label: `endpoint-current-${closed}`,
    procedure: 'managementPortIsCurrent',
    pre: `(closed == ${closed}) * (current == #endpoint) * (candidate == #endpoint) * JSObject(#endpoint)`,
    post: `JSObject(#endpoint) * (ret == ${!closed})`,
  });
  contracts.push({
    label: `endpoint-stale-${closed}`,
    procedure: 'managementPortIsCurrent',
    pre: `(closed == ${closed}) * (current == #endpoint) * (candidate == #candidate) * JSObject(#endpoint) * JSObject(#candidate)`,
    post: `JSObject(#endpoint) * JSObject(#candidate) * (ret == false)`,
  });
}
contracts.push({
  label: 'endpoint-unbound',
  procedure: 'managementPortIsCurrent',
  pre: `(closed == false) * (current == null) * (candidate == #candidate) * JSObject(#candidate)`,
  post: `JSObject(#candidate) * (ret == false)`,
});
function fixture(contract: Contract, mutation?: (body: string) => string): string {
  return (
    "'use strict';\n" +
    `/**
@pred Sender(o:Obj; c:Bool, b:Bool, t:Bool, e:Bool, p:Bool, a:Bool, proto):
 JSObjWithProto(o, proto) * DataProp(o, "closed", c) * DataProp(o, "bound", b) * DataProp(o, "trusted", t) * DataProp(o, "embedded", e) * DataProp(o, "parentSource", p) * DataProp(o, "allowedOrigin", a);
@pred Identity(o:Obj; id:Str, kind:Str, url:Str, proto):
 JSObjWithProto(o, proto) * DataProp(o, "id", id) * DataProp(o, "type", kind) * DataProp(o, "url", url);
*/\n` +
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
    label: 'ignores-sender-origin',
    contract: 'sender-reject-allowedorigin',
    from: ' &&\n        claims.allowedOrigin',
    to: '',
  },
  {
    label: 'ignores-client-url',
    contract: 'client-reject-2',
    from: ' && client.url === controlURL',
    to: '',
  },
  {
    label: 'ignores-endpoint-close',
    contract: 'endpoint-current-true',
    from: '!closed && current === candidate',
    to: 'current === candidate',
  },
  {
    label: 'ignores-endpoint-identity',
    contract: 'endpoint-stale-false',
    from: '!closed && current === candidate',
    to: '!closed',
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
const callers = ['src/runtime/worker.ts', 'src/bridge/connect.ts'];
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
  resolve(root, 'results/quickjs-confinement/management-authority-implementation.json'),
  JSON.stringify(
    {
      scope:
        'Direct deductive verification of the actual three management authorization predicates after TypeScript erasure. Caller hashes identify reviewed integration; they are not caller correctness proofs.',
      source: sourcePath,
      sourceSHA256: hash(source),
      runnerSHA256: hash(await readFile(import.meta.filename, 'utf8')),
      toolchain: { gillianImage, typescript: ts.version, mode: 'verify' },
      assumptions: [
        'Claims and client snapshots are owned native data-property records. Actual callers derive them from browser observations; peer payload claims never establish identity.',
        'JavaScript fresh object identity, TypeScript erasure, parser/extractor, Gillian semantics, verifier and solver are trusted.',
        'Browser event/client/port authenticity, fixed trusted bridge bytes, physical client URL integrity, async rechecks and storage transaction semantics require separate caller/platform contracts.',
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
  'Management authority: sixteen production contracts verified; four postcondition faults and a zero-contract run rejected.',
);
