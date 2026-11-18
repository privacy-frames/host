import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, firefox, type Page } from 'playwright';
import { launch } from './browser-profile.ts';
import { browserStorageState } from './browser-storage-state.ts';

const root = process.cwd();
const output = path.join(
  root,
  process.env.CORPUS_GUARD
    ? 'results/guest-runtime/corpus-diagnostic'
    : 'results/guest-runtime/corpus',
);
const runtimeDirectory = process.env.CORPUS_RUNTIME_DIRECTORY ?? 'dist-runtime';
const publisher =
  process.env.PUBLISHER_DIRECTORY ?? path.join(root, 'publisher-source/dist');
const portBase = Number(process.env.CORPUS_PORT_BASE ?? 4310);
const ports = {
  manager: portBase,
  runtime: portBase + 1,
  installation: portBase + 9,
  publisher: portBase + 2,
};
const managerURL = `http://127.0.0.1:${ports.manager}/privacy-frames/`;
const runtimeURL = `http://127.0.0.1:${ports.runtime}/runtime/`;
const installationURL = `http://127.0.0.1:${ports.installation}/installation/`;
const publisherURL = `http://127.0.0.1:${ports.publisher}/apps/`;
const bindingFixture = `<!doctype html><title>DOM compatibility fixture</title><body><object id=local-spinner data="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E"><span>Fallback spinner</span></object><script>
const spinner = document.getElementById('local-spinner');
if (!(spinner instanceof HTMLObjectElement) || !spinner.parentNode) throw new Error('Inert object structure was lost');
if (spinner.getSVGDocument() !== null) throw new Error('Native object context must remain unavailable');
spinner.parentNode.removeChild(spinner);
document.body.appendChild(spinner);
const node = document.createElement('div');
node.appendChild(document.createTextNode('private text'));
document.body.appendChild(node);
Object.defineProperty(CharacterData.prototype, '__guestCompatibility', { value() { return this.data.toUpperCase(); } });
if (node.firstChild.__guestCompatibility() !== 'PRIVATE TEXT') throw new Error('Guest CharacterData extension did not apply');
const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, { acceptNode(value) { return value === node ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP; } });
if (walker.nextNode() !== node) throw new Error('Callback NodeFilter traversal failed');
node.remove();
if (node.parentNode !== null) throw new Error('DOM removal failed');
if (!(document instanceof HTMLDocument)) throw new Error('Legacy HTMLDocument brand failed');
document.body.dataset.result = 'passed';
</script>`;
const targets = [
  { id: 'bindings', url: `${publisherURL}bindings/` },
  {
    id: 'wikipedia',
    url: 'https://en.wikipedia.org/w/rest.php/v1/page/Albert_Einstein/html',
  },
  { id: 'excalidraw', url: `${publisherURL}excalidraw/` },
  { id: 'drawio', url: `${publisherURL}drawio/?offline=1` },
  { id: 'stackedit', url: `${publisherURL}stackedit/` },
  { id: 'cyberchef', url: 'https://gchq.github.io/CyberChef/' },
];
const media: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};
const listeners: http.Server[] = [];
const config = JSON.parse(await readFile('dist-manager/config.json', 'utf8'));
Object.assign(config, {
  managerURL,
  runtimeURL,
  installationURL,
  managerOrigins: [new URL(managerURL).origin],
  examples: targets.map((target) => ({
    name: target.id,
    url: target.url,
    ...(['wikipedia', 'bindings'].includes(target.id)
      ? {}
      : { resourceListURL: `${publisherURL}resource-lists/${target.id}.uris` }),
  })),
});
for (const [port, directory, prefix] of [
  [ports.manager, 'dist-manager', '/privacy-frames/'],
  [ports.runtime, runtimeDirectory, '/runtime/'],
  [ports.installation, 'dist-installation', '/installation/'],
  [ports.publisher, publisher, '/apps/'],
] as const) {
  const server = http.createServer(async (request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Cache-Control', 'no-store');
    try {
      const url = new URL(request.url ?? '/', 'http://local');
      if (!url.pathname.startsWith(prefix)) throw new Error('Outside scope');
      let relative = decodeURIComponent(url.pathname.slice(prefix.length));
      if (relative.split('/').includes('..')) throw new Error('Invalid path');
      if (port !== ports.publisher && relative === 'config.json') {
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify(config));
        return;
      }
      if (!relative || relative.endsWith('/')) relative += 'index.html';
      if (port === ports.publisher && relative === 'bindings/index.html') {
        response.setHeader('Content-Type', 'text/html');
        response.end(bindingFixture);
        return;
      }
      let bytes = await readFile(
        port === ports.runtime && relative === 'guard.js' && process.env.CORPUS_GUARD
          ? process.env.CORPUS_GUARD
          : path.join(directory, relative),
      );
      if (relative.endsWith('.uris')) {
        bytes = Buffer.from(
          bytes
            .toString()
            .replaceAll('https://privacy-frames.github.io/apps/', publisherURL),
        );
      }
      response.setHeader(
        'Content-Type',
        media[path.extname(relative)] ?? 'application/octet-stream',
      );
      response.end(bytes);
    } catch {
      response.writeHead(404).end('Not found');
    }
  });
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  listeners.push(server);
}

async function interaction(page: Page, id: string) {
  if (id === 'bindings') {
    await page.waitForFunction(() => document.body.dataset.result === 'passed');
    assert.equal(
      await page.evaluate(() =>
        Reflect.has(CharacterData.prototype, '__guestCompatibility'),
      ),
      false,
    );
    assert.deepEqual(
      await page.evaluate(() => {
        const spinner = document.querySelector('object');
        return {
          data: spinner?.getAttribute('data'),
          document: spinner?.contentDocument,
        };
      }),
      { data: null, document: null },
    );
    return 'Guest-local prototype extension, callback traversal and inert native object movement passed';
  }
  if (id === 'wikipedia') {
    await page.getByText('Albert Einstein', { exact: true }).first().waitFor();
    await page.locator('h2').last().scrollIntoViewIfNeeded();
    assert(await page.evaluate(() => scrollY > 100));
    return 'Article rendered and scrolled to final section';
  }
  if (id === 'excalidraw') {
    await page.locator('canvas').first().waitFor({ timeout: 90000 });
    const rectangleCount = await page.evaluate(() => {
      const key = Object.keys(localStorage).find((key) => key.endsWith('excalidraw'));
      const elements: unknown = JSON.parse((key && localStorage.getItem(key)) || '[]');
      return Array.isArray(elements)
        ? elements.filter((element) => element?.type === 'rectangle').length
        : 0;
    });
    await page.keyboard.press('Escape');
    await page.keyboard.press('r');
    await page.mouse.move(430, 300);
    await page.mouse.down();
    await page.mouse.move(650, 450, { steps: 10 });
    await page.mouse.up();
    await page.waitForFunction((before) => {
      const key = Object.keys(localStorage).find((key) => key.endsWith('excalidraw'));
      const elements: unknown = JSON.parse((key && localStorage.getItem(key)) || '[]');
      return (
        Array.isArray(elements) &&
        elements.filter((element) => element?.type === 'rectangle').length > before
      );
    }, rectangleCount);
    await page.waitForFunction(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('canvas.static');
      const context = canvas?.getContext('2d');
      if (!canvas || !context) return false;
      const box = canvas.getBoundingClientRect();
      const scale = canvas.width / box.width;
      const x = Math.max(0, Math.floor((420 - box.left) * scale));
      const y = Math.max(0, Math.floor((290 - box.top) * scale));
      const width = Math.min(canvas.width - x, Math.floor(245 * scale));
      const height = Math.min(canvas.height - y, Math.floor(175 * scale));
      const pixels = context.getImageData(x, y, width, height).data;
      let ink = 0;
      for (let index = 0; index < pixels.length; index += 4)
        if (
          pixels[index + 3] > 128 &&
          pixels[index] + pixels[index + 1] + pixels[index + 2] < 600
        )
          ink++;
      return ink > 20;
    });
    return 'Rectangle drawn on native canvas and persisted';
  }
  if (id === 'stackedit') {
    const editor = page.locator('[contenteditable=true]').first();
    const skip = page.getByRole('button', { name: 'SKIP', exact: true });
    await Promise.race([editor.waitFor(), skip.waitFor()]);
    if (await skip.isVisible()) await skip.click();
    await editor.fill('# Synthetic evaluation\n\n**Private** local note');
    await page
      .locator('.cl-preview-section h1')
      .getByText('Synthetic evaluation', { exact: true })
      .waitFor();
    await page.waitForFunction(
      async () => {
        const name = (await indexedDB.databases()).find((database) =>
          database.name?.endsWith('stackedit-db'),
        )?.name;
        if (!name) return false;
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open(name);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        try {
          if (!database.objectStoreNames.contains('objects')) return false;
          const records = await new Promise<unknown[]>((resolve, reject) => {
            const request = database
              .transaction('objects')
              .objectStore('objects')
              .getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          return records.some(
            (record) =>
              record !== null &&
              typeof record === 'object' &&
              'type' in record &&
              record.type === 'content' &&
              'text' in record &&
              typeof record.text === 'string' &&
              record.text.includes('# Synthetic evaluation'),
          );
        } finally {
          database.close();
        }
      },
      undefined,
      { timeout: 30000 },
    );
    return 'Markdown edited, preview rendered and note committed to IndexedDB';
  }
  if (id === 'cyberchef') {
    const editor = page
      .locator('[contenteditable=true]:not([aria-readonly=true])')
      .first();
    await editor.waitFor({ timeout: 90000 });
    await page.waitForTimeout(3000);
    await editor.fill('Privacy Frames');
    await page.locator('#search').fill('To Base64');
    await page.getByText('To Base64', { exact: true }).first().dblclick();
    await page.waitForFunction(() =>
      document
        .querySelector('[contenteditable=true][aria-readonly=true]')
        ?.textContent?.includes('UHJpdmFjeSBGcmFtZXM='),
    );
    return 'To Base64 produced expected output';
  }
  const device = page.getByText('Device', { exact: true }).first();
  const create = page.getByRole('button', { name: 'Create New Diagram', exact: true });
  await Promise.race([
    device.waitFor({ timeout: 90000 }),
    create.waitFor({ timeout: 90000 }),
    page.locator('.geDiagramContainer').waitFor({ timeout: 90000 }),
  ]);
  if (await device.isVisible()) await device.click();
  if (await create.isVisible()) await create.click();
  const blank = page.getByText('Blank Diagram', { exact: true }).first();
  if (await blank.isVisible()) await blank.click();
  const final = page.getByRole('button', { name: 'Create', exact: true });
  if (await final.isVisible()) await final.click();
  const diagram = page.locator('.geDiagramContainer svg');
  await diagram.waitFor();
  const before = await diagram.innerHTML();
  await page.mouse.move(36, 292);
  await page.mouse.down();
  await page.mouse.move(600, 350, { steps: 12 });
  await page.mouse.up();
  await page.waitForFunction(
    (before) => document.querySelector('.geDiagramContainer svg')?.innerHTML !== before,
    before,
  );
  return 'Shape dragged into diagram';
}

await mkdir(output, { recursive: true });
const publisherRevision = execFileSync(
  'git',
  ['-C', path.dirname(publisher), 'rev-parse', 'HEAD'],
  { encoding: 'utf8' },
).trim();
const runtimeRevision = execFileSync('git', ['rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim();
const guardHash = createHash('sha256')
  .update(
    await readFile(process.env.CORPUS_GUARD ?? path.join(runtimeDirectory, 'guard.js')),
  )
  .digest('hex');
const browserName = process.env.CORPUS_BROWSER ?? 'chromium';
if (!['chromium', 'firefox'].includes(browserName)) throw new Error('Unknown browser');
const browser = await launch(browserName === 'firefox' ? firefox : chromium);
let failed = false;
try {
  for (const target of targets.filter(
    (target) => !process.env.CORPUS_TARGET || target.id === process.env.CORPUS_TARGET,
  )) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    context.setDefaultTimeout(30000);
    const errors: string[] = [];
    const failedRequests: string[] = [];
    context.on('page', (page) =>
      page.on('pageerror', (error) => errors.push(error.stack ?? error.message)),
    );
    context.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    context.on('requestfailed', (request) =>
      failedRequests.push(`${request.url()} ${request.failure()?.errorText}`),
    );
    const row: Record<string, unknown> = {
      ...target,
      started: new Date().toISOString(),
      browser: browser.version(),
      guardHash,
      publisherRevision,
      runtimeRevision,
      publisherSource:
        'Existing static publisher mirrors; app files served byte-for-byte without test modifications',
      errors,
      failedRequests,
    };
    console.log(`Starting ${target.id}`);
    const manager = await context.newPage();
    let app: Page | undefined;
    try {
      await manager.goto(managerURL);
      await manager.getByText('Ready to install.', { exact: true }).waitFor();
      await manager.locator('#app-url').fill(target.url);
      if (!['wikipedia', 'bindings'].includes(target.id))
        await manager
          .locator('#resource-list-url')
          .fill(`${publisherURL}resource-lists/${target.id}.uris`);
      await manager.locator('#install button').click();
      await manager.waitForFunction(
        () =>
          /^(Installed |Installation refused:)/.test(
            document.querySelector('#status')?.textContent ?? '',
          ),
        {},
        { timeout: 330000 },
      );
      row.installation = await manager.locator('#status').innerText();
      console.log(`${target.id}: ${row.installation}`);
      assert(String(row.installation).startsWith('Installed '), String(row.installation));
      const opened = context.waitForEvent('page');
      await manager.locator('#app-list a[data-app]').first().click();
      app = await opened;
      if (process.env.CORPUS_GUARD) {
        if (browserName === 'chromium') {
          const profiler = await context.newCDPSession(app);
          await profiler.send('Profiler.enable');
          await profiler.send('Profiler.start');
          setTimeout(async () => {
            const result = await profiler.send('Profiler.stop').catch(() => undefined);
            if (result) {
              const profile = result.profile;
              const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
              const functions = new Map<
                string,
                { name: string; source: string; line: number; samples: number }
              >();
              for (const sample of profile.samples ?? []) {
                const frame = nodes.get(sample)?.callFrame;
                if (!frame) continue;
                const key = JSON.stringify(frame);
                const entry = functions.get(key) ?? {
                  name: frame.functionName || '(anonymous)',
                  source: frame.url,
                  line: frame.lineNumber + 1,
                  samples: 0,
                };
                entry.samples++;
                functions.set(key, entry);
              }
              await writeFile(
                path.join(output, `${target.id}.profile.json`),
                JSON.stringify(
                  {
                    guardHash,
                    seconds: (profile.endTime - profile.startTime) / 1e6,
                    samples: profile.samples?.length,
                    functions: [...functions.values()]
                      .sort((a, b) => b.samples - a.samples)
                      .slice(0, 15),
                  },
                  null,
                  2,
                ) + '\n',
              );
            }
          }, 15000).unref();
        }
        await app.waitForFunction(
          () => typeof Reflect.get(window, '__guestDiagnosticEval') === 'function',
          undefined,
          { timeout: 90000 },
        );
        await app.waitForTimeout(10000);
        row.diagnostic = await app.evaluate(() =>
          Reflect.get(window, '__guestDiagnosticEval')(),
        );
        console.log(JSON.stringify(row.diagnostic));
        row.passed = false;
        continue;
      }
      await app.waitForFunction(
        () =>
          ['ready', 'failed'].includes(
            document.documentElement.dataset.privacyRuntime ?? '',
          ),
        {},
        { timeout: 90000 },
      );
      row.runtime = await app.locator('html').getAttribute('data-privacy-runtime');
      console.log(`${target.id}: runtime ${row.runtime}`);
      assert.equal(row.runtime, 'ready');
      row.task = await interaction(app, target.id);
      if (process.env.CORPUS_CAPTURE_STORAGE)
        row.storageBeforeReload = await browserStorageState(app);
      await context.setOffline(true);
      await app.reload({ waitUntil: 'commit' });
      await app.waitForFunction(
        () =>
          ['ready', 'failed'].includes(
            document.documentElement.dataset.privacyRuntime ?? '',
          ),
        {},
        { timeout: 90000 },
      );
      assert.equal(
        await app.locator('html').getAttribute('data-privacy-runtime'),
        'ready',
      );
      if (target.id === 'stackedit') {
        await app
          .locator('.cl-preview-section h1')
          .getByText('Synthetic evaluation', { exact: true })
          .waitFor();
        row.offlinePersistence = true;
      }
      row.offlineTask = await interaction(app, target.id);
      row.passed = true;
    } catch (error) {
      row.passed = false;
      failed = true;
      row.error = error instanceof Error ? error.stack : String(error);
    } finally {
      row.completed = new Date().toISOString();
      if (app) {
        if (process.env.CORPUS_CAPTURE_STORAGE)
          row.storageAfterReload = await browserStorageState(app).catch((error) => ({
            error: String(error),
          }));
        row.text = (
          await app
            .locator('body')
            .innerText()
            .catch(() => '')
        ).slice(0, 3000);
        await app
          .screenshot({ path: path.join(output, `${browserName}-${target.id}.png`) })
          .catch(() => {});
      }
      await writeFile(
        path.join(output, `${browserName}-${target.id}.json`),
        JSON.stringify(row, null, 2) + '\n',
      );
      console.log(
        JSON.stringify({
          id: target.id,
          passed: row.passed,
          error: row.error,
          errors: errors.slice(0, 4),
        }),
      );
      await context.close();
    }
  }
} finally {
  await browser.close();
  await Promise.all(
    listeners.map(
      (server) => new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  );
}

if (failed) process.exitCode = 1;
