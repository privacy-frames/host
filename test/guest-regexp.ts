import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { transform } from 'esbuild';
import { getQuickJS } from 'quickjs-emscripten';
import { chromium, firefox } from 'playwright';
async function compile(path: string, globalName: string) {
  return (
    await transform(await readFile(path, 'utf8'), {
      loader: 'ts',
      format: 'iife',
      globalName,
      target: 'es2022',
      keepNames: false,
    })
  ).code;
}
const installer = await compile('src/guest/legacy-regexp.ts', 'LegacyInstaller');
const cases = await compile('test/fixtures/guest-regexp-cases.ts', 'LegacyCases');
const program = cases + ';JSON.stringify(LegacyCases.legacyRegExpCases())';

const module = await getQuickJS();
const context = module.newContext();
const evaluate = (source: string) => {
  const value = context.unwrapResult(context.evalCode(source));
  try {
    return context.dump(value);
  } finally {
    value.dispose();
  }
};
const raw = evaluate(`'M0,0'.match(/^([a-zA-Z])/); typeof RegExp.$1`);
assert.equal(raw, 'undefined');
evaluate(installer + ';LegacyInstaller.installGuestRegExpLegacy()');
assert.equal(evaluate(`RegExp.$1`), '');
assert.equal(
  evaluate(`(() => {
  const oldApply = Reflect.apply;
  const oldSlice = String.prototype.slice;
  Reflect.apply = () => { throw new Error('changed apply'); };
  String.prototype.slice = () => { throw new Error('changed slice'); };
  /(private)/.exec('xprivatey');
  const result = RegExp.$1 + '|' + RegExp.leftContext + '|' + RegExp.rightContext;
  Reflect.apply = oldApply;
  String.prototype.slice = oldSlice;
  return result;
})()`),
  'private|x|y',
);
const guest = JSON.parse(evaluate(program));
context.dispose();
const controls = [];
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch();
  try {
    const page = await browser.newPage();
    const serial = JSON.parse(await page.evaluate(program));
    assert.deepEqual(
      guest.results.filter(
        (row: { operation: string }) => row.operation !== 'property-shape',
      ),
      serial.results.filter(
        (row: { operation: string }) => row.operation !== 'property-shape',
      ),
      name,
    );
    if (name === 'chromium') assert.deepEqual(guest, serial);
    assert(guest.deletedPropertyStaysDeleted);
    const matchingControls = serial.results.length - (name === 'firefox' ? 1 : 0);
    controls.push({
      browser: name,
      version: browser.version(),
      matchingControls,
      result: serial,
    });
    console.log(`${name}: ${matchingControls} legacy RegExp controls match QuickJS`);
  } finally {
    await browser.close();
  }
}
await mkdir('results/guest-runtime', { recursive: true });
await writeFile(
  'results/guest-runtime/legacy-regexp.json',
  JSON.stringify(
    {
      completed: new Date().toISOString(),
      negativeControl: { rawQuickJSCaptureType: raw },
      guest,
      controls,
      scope:
        'Browser-observed static capture properties and aliases. No RegExp.prototype.compile or proposed subclass/cross-realm invalidation; neither tested browser implements that invalidation. Descriptor configurability/enumerability follow Chrome and the TC39 draft; Firefox retains nonconfigurable enumerable statics.',
    },
    null,
    2,
  ) + '\n',
);
