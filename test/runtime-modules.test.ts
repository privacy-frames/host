import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { relocateRuntimeModule } from '../src/runtime/modules.ts';

const original = 'https://publisher.test/app/module.js';
const target = 'https://runtime.test/source/app/module.js';
const resources = {
  mapURL(input: unknown): string {
    const url = new URL(String(input));
    const fragment = url.hash;
    url.hash = '';
    return (url.href === original ? target : url.href) + fragment;
  },
  isInstalledURL(input: unknown): boolean {
    const url = new URL(String(input));
    url.hash = '';
    return url.href === target;
  },
};

test('generated module imports relocate admitted resources without rewriting strings or comments', () => {
  const code = `// import '${original}'\nconst text="import '${original}'";import value from '${original}';export {value};`;
  const rewritten = relocateRuntimeModule(code, 'https://publisher.test/app/', resources);
  assert(rewritten.includes(`// import '${original}'`));
  assert(rewritten.includes(`const text="import '${original}'"`));
  assert(rewritten.includes(`import value from ${JSON.stringify(target)}`));
});

test('generated relative and dynamic imports preserve their source base and fragments', () => {
  const code = `import('./module.js#part')`;
  assert.equal(
    relocateRuntimeModule(code, 'https://publisher.test/app/', resources),
    `import(${JSON.stringify(target + '#part')})`,
  );
});

test('unknown, computed and Blob-relative imports retain native failure behavior', () => {
  for (const code of [
    `import('https://uninstalled.test/module.js')`,
    `import(computeURL())`,
    `import('./module.js')`,
  ]) {
    assert.equal(
      relocateRuntimeModule(code, 'blob:https://runtime.test/id', resources),
      code,
    );
  }
});

test('all static import and re-export source forms preserve their surrounding syntax', () => {
  for (const code of [
    `import './module.js';`,
    `import value, { named as alias } from './module.js';`,
    `import * as namespace from './module.js';`,
    `export { value as renamed } from './module.js';`,
    `export * from './module.js';`,
    `export * as namespace from './module.js';`,
  ])
    assert.equal(
      relocateRuntimeModule(code, 'https://publisher.test/app/', resources),
      code.replace("'./module.js'", JSON.stringify(target)),
    );
});

test('escaped string and no-substitution template imports use cooked source values', () => {
  for (const code of [
    String.raw`import value from './mod\u0075le.js';`,
    String.raw`export * from "./mod\x75le.js";`,
    String.raw`import('./mod\u0075le.js')`,
    'import(`./mod\\u0075le.js`)',
  ]) {
    const expected = code.startsWith('import value')
      ? `import value from ${JSON.stringify(target)};`
      : code.startsWith('export')
        ? `export * from ${JSON.stringify(target)};`
        : `import(${JSON.stringify(target)})`;
    assert.equal(
      relocateRuntimeModule(code, 'https://publisher.test/app/', resources),
      expected,
    );
  }
});

test('literal parentheses and nested imports relocate without evaluating computed expressions', () => {
  const code = `const text=\`import('./module.js') \${import(/* actual */ ('./module.js#part'))}\`;`;
  assert.equal(
    relocateRuntimeModule(code, 'https://publisher.test/app/', resources),
    `const text=\`import('./module.js') \${import(/* actual */ (${JSON.stringify(target + '#part')}))}\`;`,
  );
  for (const computed of [
    `import('./module.js' + '')`,
    'import(`./${name}.js`)',
    `import(value || './module.js')`,
    `import(computeURL('./module.js'))`,
    `import(tag\`./module.js\`)`,
  ])
    assert.equal(
      relocateRuntimeModule(computed, 'https://publisher.test/app/', resources),
      computed,
    );
});

test('import attributes and dynamic options retain their exact syntax and expressions', () => {
  for (const code of [
    `import value from './module.js' with { type: 'json' };`,
    `export { value } from './module.js' with { type: 'json' };`,
    `export * from './module.js' with { type: 'json' };`,
    `import('./module.js', { with: { type: 'json' }, sideEffect: computeOptions() })`,
  ])
    assert.equal(
      relocateRuntimeModule(code, 'https://publisher.test/app/', resources),
      code.replace("'./module.js'", JSON.stringify(target)),
    );
  const nested = `import('./module.js', { options: import('./module.js#options') })`;
  assert.equal(
    relocateRuntimeModule(nested, 'https://publisher.test/app/', resources),
    `import(${JSON.stringify(target)}, { options: import(${JSON.stringify(target + '#options')}) })`,
  );
});

test('invalid programs, bare imports and unresolved resources retain native failures', () => {
  for (const code of [
    `const invalid=;import('./module.js')`,
    `import('./module.js'`,
    `import value from 'bare-package';`,
    `import('./module.js?uninstalled=1')`,
    `export * from 'https://uninstalled.test/module.js';`,
  ])
    assert.equal(
      relocateRuntimeModule(code, 'https://publisher.test/app/', resources),
      code,
    );
});

test('an unresolved Blob-relative source keeps earlier reverse-order relocations', () => {
  const code = `import('./module.js');import('${original}');`;
  assert.equal(
    relocateRuntimeModule(code, 'blob:https://runtime.test/id', resources),
    `import('./module.js');import(${JSON.stringify(target)});`,
  );
});

test('source and deferred phase imports retain their syntax while relocating resources', () => {
  for (const code of [
    `import source module from './module.js';`,
    `import defer * as module from './module.js';`,
    `import.source('./module.js')`,
    `import.defer('./module.js')`,
    `import.source('./module.js', { with: { type: 'webassembly' } })`,
  ])
    assert.equal(
      relocateRuntimeModule(code, 'https://publisher.test/app/', resources),
      code.replace("'./module.js'", JSON.stringify(target)),
    );
  for (const computed of ['import.source(value)', 'import.defer(computeURL())'])
    assert.equal(
      relocateRuntimeModule(computed, 'https://publisher.test/app/', resources),
      computed,
    );
});

test('classic computed imports preserve parentheses, options, nesting and lexical shadowing', () => {
  const base = 'https://publisher.test/app/classic.js';
  const calls: unknown[][] = [];
  const code = `
    var preservedGlobal = 17;
    function run(globalThis, self, Function, privacyHost, importShim) {
      const path = './computed.js';
      return import((path), ({ with: { type: 'json' } }), /* trailing */);
    }
    run(null, null, null, null, null);
    import((import(('./inner.js'),)), { nested: import('./outer.js') });
  `;
  const context = {
    privacyHost: {
      importModule(...args: unknown[]) {
        calls.push(args);
        return './result.js';
      },
    },
    preservedGlobal: 0,
  };
  runInNewContext(relocateRuntimeModule(code, base, resources, true), context);
  assert.equal(context.preservedGlobal, 17);
  assert.equal(calls.length, 4);
  assert.deepEqual(
    calls.map((args) => [args[0], args[2]]),
    [
      ['./computed.js', base],
      ['./inner.js', base],
      ['./outer.js', base],
      ['./result.js', base],
    ],
  );
  const options = calls[0][1];
  assert(options !== null && typeof options === 'object');
  assert.equal(Reflect.get(Reflect.get(options, 'with'), 'type'), 'json');
});

test('classic adapter preserves argument evaluation order and ignores text and phases', () => {
  const events: string[] = [];
  const code = `
    // import('./comment.js')
    const text = "import('./text.js')";
    import((mark('specifier')), (mark('options')));
  `;
  runInNewContext(relocateRuntimeModule(code, original, resources, true), {
    mark(value: string) {
      events.push(value);
      return value;
    },
    privacyHost: {
      importModule() {
        events.push('adapter');
      },
    },
  });
  assert.deepEqual(events, ['specifier', 'options', 'adapter']);
  for (const phase of ['source', 'defer']) {
    const source = `import.${phase}(computed)`;
    assert.equal(relocateRuntimeModule(source, original, resources, true), source);
  }
});
