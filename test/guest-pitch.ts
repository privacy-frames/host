import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, firefox } from 'playwright';
import { parseResourceList } from '../src/installation/resource-list.ts';
import { provideResourceList } from './resource-list-input.ts';
import { servers } from './server.ts';

declare global {
  var guestPitchAudio: { frames: number; energy: number; state: string }[];
}

const sourceURL = 'https://damenh.github.io/pitch-training/';
const listURL =
  'https://privacy-frames.github.io/apps/resource-lists/pitch-training.uris';
const listResponse = await fetch(listURL);
assert(listResponse.ok, `Resource list returned ${listResponse.status}`);
const candidates = parseResourceList(await listResponse.text());
// Supplemental lists are user input. Discard stale publisher entries before pasting;
// the ordinary HTML discovery path still discovers the current release's assets.
const checked = await Promise.all(
  candidates.map(async (url) => {
    const response = await fetch(url, { method: 'HEAD' });
    return { url, status: response.status };
  }),
);
const resources = checked.filter(({ status }) => status === 200).map(({ url }) => url);
const htmlResponse = await fetch(sourceURL);
assert(htmlResponse.ok);
const sourceHTML = await htmlResponse.text();
const sourceScripts = [...sourceHTML.matchAll(/<script[^>]+src="([^"]+)"/g)];
const hashes = await Promise.all(
  sourceScripts.map(async ([, path]) => {
    const url = new URL(path!, sourceURL).href;
    const response = await fetch(url);
    assert(response.ok);
    return {
      url,
      sha256: createHash('sha256')
        .update(Buffer.from(await response.arrayBuffer()))
        .digest('hex'),
    };
  }),
);

const server = await servers({ publicExamples: true });
const receipts: object[] = [];
try {
  const browsers = [
    ['chromium', chromium],
    ['firefox', firefox],
  ] as const;
  for (const [name, type] of browsers) {
    if (process.env.GUEST_BROWSER && process.env.GUEST_BROWSER !== name) continue;
    const browser = await type.launch({ headless: true });
    const errors: string[] = [];
    const checks: string[] = [];
    let failure: string | undefined;
    const started = performance.now();
    try {
      const context = await browser.newContext();
      const manager = await context.newPage();
      manager.on('pageerror', (error) => console.error(name, 'manager', error.message));
      await manager.goto('http://127.0.0.1:4210/privacy-frames/');
      await manager.getByText('Ready to install.', { exact: true }).waitFor();
      await manager.locator('#app-url').fill(sourceURL);
      await provideResourceList(manager, resources);
      await manager.locator('#install button').click();
      await manager.waitForFunction(
        () =>
          /^(Installed |Installation refused:)/.test(
            document.querySelector('#status')?.textContent || '',
          ),
        undefined,
        { timeout: 120000 },
      );
      const status = await manager.locator('#status').textContent();
      assert.match(status || '', /^Installed /);
      checks.push(
        'Installed unchanged public release using an explicit resource URL list',
      );
      const opened = context.waitForEvent('page');
      await manager.locator('#app-list a[data-app]').first().click();
      const app = await opened;
      app.setDefaultTimeout(60000);
      app.on('pageerror', (error) => {
        errors.push(error.message);
        console.error(name, 'app', error.message);
      });
      app.on('console', (message) => {
        if (message.type() === 'error')
          console.error(name, 'console', message.text().slice(0, 1800));
      });
      await app.waitForFunction(
        () =>
          ['ready', 'failed'].includes(
            document.documentElement.dataset.privacyRuntime || '',
          ),
        undefined,
        { timeout: 120000 },
      );
      console.log(
        name,
        'runtime',
        await app.locator('html').getAttribute('data-privacy-runtime'),
        (await app.locator('body').innerText()).slice(0, 1400),
      );
      assert.equal(
        await app.locator('html').getAttribute('data-privacy-runtime'),
        'ready',
      );
      await app.getByRole('navigation', { name: 'Main', exact: true }).waitFor();
      checks.push('Guest JavaScript renders the application against the native DOM');
      // Trusted test instrumentation observes real native audio, rather than guest
      // property changes or a fabricated application-side success marker.
      await app.evaluate(() => {
        globalThis.guestPitchAudio = [];
        const start = AudioBufferSourceNode.prototype.start;
        AudioBufferSourceNode.prototype.start = function (...args) {
          const data = this.buffer?.getChannelData(0);
          let energy = 0;
          if (data) for (const sample of data) energy += sample * sample;
          guestPitchAudio.push({
            frames: data?.length || 0,
            energy,
            state: this.context.state,
          });
          return Reflect.apply(start, this, args);
        };
      });
      const networkStart = server.traffic.length;
      await app.getByRole('button', { name: 'Play note', exact: true }).click();
      await app.waitForFunction(() =>
        guestPitchAudio.some(
          (item) => item.frames > 1000 && item.energy > 0 && item.state === 'running',
        ),
      );
      checks.push(
        'Admitted piano samples decode and produce nonzero native audio in a running context',
      );
      await app.getByRole('button', { name: 'C', exact: true }).click();
      await app.getByRole('button', { name: 'Submit answer', exact: true }).click();
      const history = await app.evaluate(() => {
        const key = Object.keys(localStorage).find((key) => key.endsWith('history/v1'));
        return key ? JSON.parse(localStorage.getItem(key) || 'null') : null;
      });
      assert(Array.isArray(history) && history.length > 0);
      const tab = async (label: string) =>
        app
          .getByRole('navigation', { name: 'Main', exact: true })
          .getByRole('link', { name: label, exact: true })
          .click();
      await tab('Reference');
      await app.getByRole('button', { name: 'Load C major scale', exact: true }).click();
      await app
        .getByRole('textbox', { name: 'Piece title', exact: true })
        .fill('Guest acceptance score');
      await app.getByRole('button', { name: 'Save to library', exact: true }).click();
      await app
        .getByRole('button', { name: 'Guest acceptance score', exact: true })
        .waitFor();
      const databases = await app.evaluate(async () =>
        (await indexedDB.databases()).map((database) => database.name),
      );
      assert(databases.some((name) => name?.endsWith('piano-library')));
      await tab('Settings');
      await app.getByLabel('Instrument').selectOption('triangle');
      await context.setOffline(true);
      await app.reload({ waitUntil: 'commit' });
      await app.getByLabel('Instrument').waitFor();
      assert.equal(await app.getByLabel('Instrument').inputValue(), 'triangle');
      await tab('Reference');
      await app
        .getByRole('button', { name: 'Guest acceptance score', exact: true })
        .waitFor();
      const restoredHistory = await app.evaluate(() => {
        const key = Object.keys(localStorage).find((key) => key.endsWith('history/v1'));
        return key ? JSON.parse(localStorage.getItem(key) || 'null') : null;
      });
      assert.deepEqual(restoredHistory, history);
      checks.push(
        'Hash routes, settings, history and the IndexedDB score survive an offline reload',
      );
      const runtimeTraffic = server.traffic
        .slice(networkStart)
        .filter((request) => request.port === 4211 && request.path !== '/runtime/sw.js');
      assert.deepEqual(
        runtimeTraffic,
        [],
        'Application requests reached the physical runtime HTTP server',
      );
      checks.push(
        'No application request reached the runtime HTTP server after confinement',
      );
      assert.deepEqual(errors, []);
    } catch (error) {
      failure = error instanceof Error ? error.stack : String(error);
      throw error;
    } finally {
      receipts.push({
        browser: name,
        version: browser.version(),
        sourceURL,
        listURL,
        hashes,
        omittedResources: checked.filter((item) => item.status !== 200),
        elapsedMs: Math.round(performance.now() - started),
        checks,
        errors,
        failure,
      });
      console.log(JSON.stringify(receipts.at(-1)));
      await browser.close();
    }
  }
} finally {
  await server.close();
  await mkdir('results/guest-runtime', { recursive: true });
  await writeFile(
    'results/guest-runtime/pitch.json',
    JSON.stringify(receipts, null, 2) + '\n',
  );
}
