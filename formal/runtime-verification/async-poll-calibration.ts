import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium, firefox } from 'playwright';
import { launch } from '../../test/browser-profile.ts';
import { waitUntil } from '../../test/helpers/poll.ts';
import { testProvenance } from '../../test/provenance.ts';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const before = await testProvenance(import.meta.url);
const runnerBefore = hash(await readFile(new URL(import.meta.url), 'utf8'));
const library = 'node_modules/playwright-core/lib/coreBundle.js';
const libraryBefore = hash(await readFile(library, 'utf8'));
const rows = [];
let completed = false;
try {
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    const browser = await launch(engine);
    try {
      const page = await browser.newPage();
      const handle = await page.waitForFunction(async () => false, {}, { timeout: 100 });
      const asyncValue: unknown = await handle.jsonValue();
      await handle.dispose();
      assert.equal(asyncValue, false);
      await assert.rejects(
        page.waitForFunction(() => false, {}, { timeout: 100 }),
        {
          name: 'TimeoutError',
        },
      );
      await assert.rejects(
        waitUntil(() => page.evaluate(async () => false), 'False observation', 100),
        { message: 'False observation' },
      );
      await page.evaluate(() => Reflect.set(window, 'fixtureReady', false));
      let attempts = 0;
      await waitUntil(async () => {
        if (++attempts === 3)
          await page.evaluate(() => Reflect.set(window, 'fixtureReady', true));
        return page.evaluate(async () => Reflect.get(window, 'fixtureReady') === true);
      }, 'Positive observation did not arrive');
      assert.equal(attempts, 3);
      rows.push({
        name,
        version: browser.version(),
        nativeAsyncFalseResolved: asyncValue,
        nativeSynchronousFalseTimedOut: true,
        awaitedAsynchronousFalseTimedOut: true,
        positiveAttempts: attempts,
      });
      console.log(name, 'asynchronous readiness comparison PASS');
    } finally {
      await browser.close();
    }
  }
  completed = true;
} finally {
  const after = await testProvenance(import.meta.url);
  const runnerAfter = hash(await readFile(new URL(import.meta.url), 'utf8'));
  const libraryAfter = hash(await readFile(library, 'utf8'));
  const sourceStable = before.sourceSHA256 === after.sourceSHA256;
  const artifactsStable =
    JSON.stringify(before.artifacts) === JSON.stringify(after.artifacts);
  await writeFile(
    new URL('./async-poll-calibration.json', import.meta.url),
    JSON.stringify(
      {
        scope:
          'Readiness-method calibration in owned blank pages. A native async-false wait resolves false; it is not a readiness fence. The awaited helper rejects false conditions and waits for the positive producer. No confinement claim follows.',
        completed:
          completed &&
          sourceStable &&
          artifactsStable &&
          runnerBefore === runnerAfter &&
          libraryBefore === libraryAfter,
        before,
        after,
        sourceStable,
        artifactsStable,
        runnerBefore,
        runnerAfter,
        library,
        libraryBefore,
        libraryAfter,
        rows,
      },
      null,
      2,
    ) + '\n',
  );
  assert(
    sourceStable &&
      artifactsStable &&
      runnerBefore === runnerAfter &&
      libraryBefore === libraryAfter,
  );
}
