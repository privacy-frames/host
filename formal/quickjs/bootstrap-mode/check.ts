import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import ts from 'typescript';
import {
  newQuickJSWASMModuleFromVariant,
  newVariant,
  type QuickJSContext,
  type QuickJSHandle,
} from 'quickjs-emscripten-core';
import { quickjsVariant } from '../../../src/guest/quickjs.ts';
import {
  extractFactory,
  extractSites,
  omitStrictOptions,
  checkApplicationMode,
  type BootstrapSite,
} from './extract.ts';

const root = new URL('../../../', import.meta.url);
const digest = (value: Uint8Array | string) =>
  createHash('sha256').update(value).digest('hex');
const factoryFiles = new Map([
  ['installGuestRegExpLegacy', 'src/guest/legacy-regexp.ts'],
  ['installGuestRuntime', 'src/guest/guest-runtime.ts'],
  ['allocateIdentity', 'src/guest/identity.ts'],
  ['installGuestBinary', 'src/guest/guest-binary.ts'],
]);
const sdkFiles = (
  await readdir(new URL('node_modules/quickjs-emscripten-core/dist/', root))
)
  .filter((name) => name.endsWith('.mjs'))
  .map((name) => 'node_modules/quickjs-emscripten-core/dist/' + name);
const inputs = [
  ...factoryFiles.values(),
  'src/guest/engine.ts',
  'src/guest/quickjs.ts',
  'vendor/quickjs/upstream/quickjs.c',
  'vendor/quickjs/generated/engine.wasm',
  'vendor/quickjs/generated/engine.mjs',
  'vendor/quickjs/generated/build.json',
  'package-lock.json',
  'formal/quickjs/bootstrap-mode/check.ts',
  'formal/quickjs/bootstrap-mode/extract.ts',
  ...sdkFiles,
  'node_modules/quickjs-emscripten-core/package.json',
  'node_modules/@jitl/quickjs-wasmfile-release-sync/dist/ffi.mjs',
  'node_modules/@jitl/quickjs-ffi-types/dist/index.mjs',
  'node_modules/typescript/lib/typescript.js',
];
const hashes = async () =>
  Object.fromEntries(
    await Promise.all(
      inputs.map(async (path) => [path, digest(await readFile(new URL(path, root)))]),
    ),
  );
const before = await hashes();
const factories = new Map(
  await Promise.all(
    [...factoryFiles].map(
      async ([name, path]) =>
        [
          name,
          extractFactory(await readFile(new URL(path, root), 'utf8'), name),
        ] as const,
    ),
  ),
);
const engine = await readFile(new URL('src/guest/engine.ts', root), 'utf8');
const sites = extractSites(engine, factories);
checkApplicationMode(engine);
const controlSites = extractSites(omitStrictOptions(engine), factories);
const binary = await readFile(new URL('vendor/quickjs/generated/engine.wasm', root));
const wasmBinary = Uint8Array.from(binary).buffer;
const module = await newQuickJSWASMModuleFromVariant(
  newVariant(quickjsVariant, { wasmBinary }),
);

function evaluate(
  context: QuickJSContext,
  code: string,
  options: BootstrapSite['options'] = { type: 'global' },
): unknown {
  const handle = context.unwrapResult(
    context.evalCode(code, 'privacy:calibration', options),
  );
  try {
    return context.dump(handle);
  } finally {
    handle.dispose();
  }
}
function requireStrict(context: QuickJSContext, site: BootstrapSite) {
  const strict = evaluate(
    context,
    '(function trustedModeProbe(){return this === undefined;})()',
    site.options,
  );
  assert.equal(
    strict,
    true,
    'Trusted privacy evaluation must preserve strict unbound this',
  );
  return strict;
}

const runtime = module.newRuntime();
const modeContext = runtime.newContext();
const modes = [];
const poisonModes = [];
const poisonCode = `(() => {
  const subject=function calibrationSubject(){return 1;};
  const result={};
  for(const key of ['caller','arguments']) {
    const descriptor=Object.getOwnPropertyDescriptor(Function.prototype,key);
    const own=Object.getOwnPropertyDescriptor(subject,key);
    let blocked=false,read;
    try{const value=Reflect.get(subject,key);read={type:typeof value,isNull:value===null};}
    catch(error){blocked=error instanceof TypeError;}
    let prototypeGetterThrows=false;
    try{Reflect.apply(descriptor.get,subject,[]);}catch(error){prototypeGetterThrows=error instanceof TypeError;}
    result[key]={getter:typeof descriptor?.get==='function',setter:typeof descriptor?.set==='function',throws:blocked,
      configurable:descriptor?.configurable,ownKind:own?('value'in own?'data':'accessor'):'absent',read,prototypeGetterThrows};
  }
  return result;
})()`;
try {
  for (const site of sites) {
    modes.push({
      filename: site.filename,
      options: site.options,
      strictThis: requireStrict(modeContext, site),
    });
    assert.equal(
      site.options.strict,
      true,
      'Actual production privacy options are explicitly strict',
    );
  }
  for (const site of controlSites) {
    const ordinaryThis = evaluate(
      modeContext,
      '(function trustedModeProbe(){return this === globalThis;})()',
      site.options,
    );
    assert.equal(ordinaryThis, true);
    assert.throws(() => requireStrict(modeContext, site), /strict unbound this/);
    modes.push({
      filename: site.filename,
      options: site.options,
      ordinaryThis,
      strictProbeRejected: true,
    });
  }
  for (const site of [sites[0], controlSites[0]]) {
    const result = evaluate(modeContext, poisonCode, site.options);
    assert(result && typeof result === 'object');
    for (const key of ['caller', 'arguments']) {
      const field: unknown = Reflect.get(result, key);
      assert(field && typeof field === 'object');
      assert.equal(Reflect.get(field, 'getter'), true);
      assert.equal(Reflect.get(field, 'setter'), true);
      if (site.options.strict) {
        assert.equal(Reflect.get(field, 'throws'), true);
        assert.equal(Reflect.get(field, 'prototypeGetterThrows'), true);
      }
    }
    poisonModes.push({ strict: site.options.strict ?? false, result });
  }
  assert.equal(
    evaluate(
      modeContext,
      '(function ordinaryApplication(){return this === globalThis;})()',
    ),
    true,
  );
  assert.equal(
    evaluate(modeContext, 'ordinaryApplicationSentinel=19;ordinaryApplicationSentinel'),
    19,
  );
} finally {
  modeContext.dispose();
}

const context = runtime.newContext();
let helpers: QuickJSHandle | undefined;
const calls: { operation: string; identity: number; property: string }[] = [];
function privateGlobalReferences(values: QuickJSHandle[]): number {
  const names = context.getOwnPropertyNames(context.global).unwrap();
  let matches = 0;
  try {
    for (const name of names) {
      const value = context.getProp(context.global, name);
      try {
        for (const privateValue of values) if (context.eq(value, privateValue)) matches++;
      } finally {
        value.dispose();
      }
    }
  } finally {
    names.dispose();
  }
  return matches;
}
let privacy: Record<string, unknown>;
try {
  const legacy = sites.find(({ filename }) => filename === 'privacy:legacy-regexp')!;
  const bindings = sites.find(({ filename }) => filename === 'privacy:bindings')!;
  const binarySite = sites.find(({ filename }) => filename === 'privacy:binary')!;
  context
    .unwrapResult(context.evalCode(legacy.code, legacy.filename, legacy.options))
    .dispose();
  const dispatch = context.newFunction('__privacyHostDispatch', (...args) => {
    const operation = context.getString(args[0]);
    calls.push({
      operation,
      identity: context.getNumber(args[1]),
      property: context.getString(args[2]),
    });
    if (operation === 'own') return context.false;
    if (operation === 'prototype') return context.null;
    assert.equal(operation, 'get');
    assert.equal(context.getString(args[2]), 'string:sample');
    return context.newNumber(23);
  });
  context.setProp(context.global, '__privacyHostDispatch', dispatch);
  dispatch.dispose();
  assert.equal(
    evaluate(context, 'Object.hasOwn(globalThis,"__privacyHostDispatch")'),
    true,
  );
  helpers = context.unwrapResult(
    context.evalCode(bindings.code, bindings.filename, bindings.options),
  );
  assert.equal(
    evaluate(context, 'Object.hasOwn(globalThis,"__privacyHostDispatch")'),
    false,
  );
  const helperNames = context.getOwnPropertyNames(helpers).unwrap();
  const helperValues: QuickJSHandle[] = [];
  try {
    for (const name of helperNames) helperValues.push(context.getProp(helpers, name));
    assert.equal(
      privateGlobalReferences([helpers, ...helperValues]),
      0,
      'Helper container/functions are not direct application global values',
    );
  } finally {
    helperNames.dispose();
    for (const value of helperValues) value.dispose();
  }
  const createHost = context.getProp(helpers, 'createHost');
  const identity = context.newNumber(17);
  const name = context.newString('calibration');
  try {
    const subject = context.unwrapResult(
      context.callFunction(
        createHost,
        context.undefined,
        identity,
        context.false,
        context.false,
        name,
        context.false,
      ),
    );
    try {
      context.setProp(context.global, 'subject', subject);
    } finally {
      subject.dispose();
    }
  } finally {
    createHost.dispose();
    identity.dispose();
    name.dispose();
  }
  assert.equal(evaluate(context, 'subject.sample'), 23);
  assert(calls.some(({ operation, identity }) => operation === 'get' && identity === 17));
  assert.equal(
    evaluate(context, 'Object.hasOwn(globalThis,"__privacyHostDispatch")'),
    false,
  );
  const getHooks = context.getProp(helpers, 'binaryHooks');
  const hooks = context.unwrapResult(context.callFunction(getHooks, context.undefined));
  getHooks.dispose();
  const privateBindings = context.unwrapResult(
    context.evalCode(
      `({
    descriptions(){return [];},atomicKeys(){return [];},
    construct(){throw Error('unused');},invoke(){throw Error('unused');},
    staticInvoke(){throw Error('unused');},atomic(){throw Error('unused');}
  })`,
      'privacy:stub-binary-data',
      { type: 'global', strict: true },
    ),
  );
  const installer = context.unwrapResult(
    context.evalCode(binarySite.code, binarySite.filename, binarySite.options),
  );
  const aliases = context.unwrapResult(
    context.callFunction(installer, context.undefined, privateBindings, hooks),
  );
  try {
    assert.equal(privateGlobalReferences([helpers, hooks, privateBindings, aliases]), 0);
    const poison = evaluate(
      context,
      `(() => {
      const result={};
      for(const key of ['caller','arguments']) {
        const descriptor=Object.getOwnPropertyDescriptor(Function.prototype,key);
        let current=false;try{Reflect.get(ArrayBuffer.isView,key);}catch(error){current=error instanceof TypeError;}
        result[key]={getter:typeof descriptor?.get==='function',setter:typeof descriptor?.set==='function',throws:current,configurable:descriptor?.configurable};
      }
      return result;
    })()`,
    );
    assert(poison && typeof poison === 'object');
    for (const key of ['caller', 'arguments']) {
      const field: unknown = Reflect.get(poison, key);
      assert(field && typeof field === 'object');
      for (const property of ['getter', 'setter', 'throws'])
        assert.equal(Reflect.get(field, property), true);
    }
    privacy = {
      dispatchRemoved: true,
      retainedDispatchWorks: true,
      helperGlobalReferences: 0,
      binaryPrivateGlobalReferences: 0,
      callerArguments: poison,
      dispatchCalls: calls,
      binaryStubScope:
        'Empty descriptions/atomic names exercise the actual installer; this does not validate native binary operations.',
    };
  } finally {
    aliases.dispose();
    installer.dispose();
    privateBindings.dispose();
    hooks.dispose();
  }
} finally {
  helpers?.dispose();
  context.dispose();
  runtime.dispose();
}
assert.deepEqual(await hashes(), before, 'Bootstrap calibration inputs remain stable');
await mkdir(new URL('results/quickjs-confinement/bootstrap-mode/', root), {
  recursive: true,
});
await writeFile(
  new URL('results/quickjs-confinement/bootstrap-mode/calibration.json', root),
  JSON.stringify(
    {
      scope:
        'Source-corresponding trusted bootstrap evaluation-mode and direct-publication calibration in the pinned QuickJS SDK. Not a complete C5 privacy proof or an application escape claim.',
      toolchain: {
        node: process.version,
        typescript: ts.version,
        quickjsSDK: JSON.parse(
          await readFile(
            new URL('node_modules/quickjs-emscripten-core/package.json', root),
            'utf8',
          ),
        ).version,
      },
      inputHashes: before,
      extractedHashes: Object.fromEntries(
        [...factories].map(([name, source]) => [name, digest(source)]),
      ),
      modes,
      poisonModes,
      applicationSloppyModePreserved: true,
      privacy,
      premises: [
        'QuickJS lexical environments and intrinsic semantics are trusted; global identity scans do not prove transitive heap nonreachability.',
        'TypeScript ES2022 transpileModule is trusted for direct type erasure; source AST correspondence is narrower than complete engine execution.',
        'The custom Wasm module, SDK flags and native host function support are trusted. Function caller/arguments poison behavior is characterized, not asserted as an escape.',
      ],
      completedAt: new Date().toISOString(),
    },
    null,
    2,
  ) + '\n',
);
console.log(
  'Three actual privacy sites are strict; three omitted-option controls fail their semantic probe. Dispatch capture/deletion, private globals and ordinary sloppy app mode pass.',
);
