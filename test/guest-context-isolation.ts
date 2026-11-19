import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, firefox } from 'playwright';
import { servers } from './server.ts';
import { provideResourceList } from './resource-list-input.ts';
import { testProvenance } from './provenance.ts';

// Application source is interpreted by the production guest engine. Native
// page.evaluate below only reads DOM receipts and the browser's isolation flag.
const main = `
const button = document.getElementById('run');
button.onclick = async () => {
  const result = document.getElementById('result');
  try {
    if (!crossOriginIsolated) throw new Error('Guest window is not isolated');
    const child = document.createElement('iframe');
    child.srcdoc = '<script>document.body.textContent=String(crossOriginIsolated)<\\/script>';
    const childReady = new Promise((resolve, reject) => {
      child.onload = resolve;
      setTimeout(() => reject(new Error('Child preparation timed out')), 15000);
    });
    document.body.appendChild(child);
    await childReady;
    if (!child.contentWindow.crossOriginIsolated) throw new Error('Child is not isolated');
    const module = new WebAssembly.Module(new Uint8Array([0,97,115,109,1,0,0,0]));
    const memory = new WebAssembly.Memory({ initial: 1, maximum: 2, shared: true });
    const buffer = new SharedArrayBuffer(16);
    const view = new Int32Array(buffer);
    const memoryView = new Int32Array(memory.buffer);
    Atomics.store(view, 0, 17);
    Atomics.store(memoryView, 0, 23);
    const worker = new Worker('worker.js');
    const received = await new Promise((resolve, reject) => {
      worker.onerror = event => reject(new Error(event.message));
      worker.onmessage = event => resolve(event.data);
      worker.postMessage({ module, memory, buffer, alias: buffer, view });
    });
    if (received.error) throw new Error(received.error);
    if (!received.isolated || !received.module || !received.memory || !received.buffer || !received.alias)
      throw new Error('Native worker brands or shared aliases lost');
    if (!(received.roundtrip.module instanceof WebAssembly.Module) ||
        !(received.roundtrip.memory instanceof WebAssembly.Memory) ||
        !(received.roundtrip.buffer instanceof SharedArrayBuffer))
      throw new Error('Returned native brands lost');
    if (Atomics.load(view, 0) !== 22 || Atomics.load(memoryView, 0) !== 30)
      throw new Error('Worker mutation did not reach sender');
    Atomics.add(new Int32Array(received.roundtrip.buffer), 0, 1);
    if (Atomics.load(view, 0) !== 23) throw new Error('Roundtrip created a buffer copy');
    worker.terminate();
    result.textContent = 'shared native worker passed';
  } catch (error) {
    result.textContent = 'FAILED: ' + error.stack;
  }
};`;
const worker = `
onmessage = event => {
  try {
    const { module, memory, buffer, alias, view } = event.data;
    new WebAssembly.Instance(module);
    Atomics.add(new Int32Array(memory.buffer), 0, 7);
    Atomics.add(view, 0, 5);
    postMessage({
      isolated: crossOriginIsolated,
      module: module instanceof WebAssembly.Module,
      memory: memory instanceof WebAssembly.Memory,
      buffer: buffer instanceof SharedArrayBuffer,
      alias: buffer === alias && view.buffer === buffer,
      roundtrip: { module, memory, buffer }
    });
  } catch (error) { postMessage({ error: error.stack }); }
};`;
const assets = new Map([
  [
    '/',
    '<!doctype html><button id="run">Run isolated contexts</button><output id="result"></output><script src="main.js"></script>',
  ],
  ['/main.js', main],
  ['/worker.js', worker],
]);
const publisherTraffic: string[] = [];
const publisher = createServer((request, response) => {
  publisherTraffic.push(request.url || '/');
  const path = new URL(request.url || '/', 'http://publisher').pathname;
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader(
    'Content-Type',
    path.endsWith('.js') ? 'text/javascript' : 'text/html',
  );
  const source = assets.get(path);
  response.writeHead(source ? 200 : 404).end(source || 'Missing fixture');
});
await new Promise<void>((resolve) => publisher.listen(0, '127.0.0.1', resolve));
const address = publisher.address();
assert(address && typeof address === 'object');
const sourceURL = `http://127.0.0.1:${address.port}/`;
const server = await servers();
const receipt = {
  provenance: await testProvenance(import.meta.url),
  observations: [] as object[],
};
try {
  for (const [name, type] of Object.entries({ chromium, firefox })) {
    if (process.env.GUEST_BROWSER && process.env.GUEST_BROWSER !== name) continue;
    const browser = await type.launch({ headless: true });
    try {
      const context = await browser.newContext();
      const manager = await context.newPage();
      await manager.goto('http://127.0.0.1:4210/privacy-frames/');
      await manager.getByText('Ready to install.', { exact: true }).waitFor();
      await manager.locator('#app-url').fill(sourceURL);
      await provideResourceList(manager, [
        sourceURL + 'main.js',
        sourceURL + 'worker.js',
      ]);
      await manager.locator('#install button').click();
      await manager
        .getByRole('status')
        .filter({ hasText: /^Installed / })
        .waitFor({ timeout: 60000 });
      const opened = context.waitForEvent('page');
      await manager.locator('#app-list a[data-app]').first().click();
      const page = await opened;
      await page.locator('#run').waitFor({ timeout: 60000 });
      assert.equal(await page.evaluate(() => crossOriginIsolated), true);
      // Worker and child creation happen only after normal startup is quiet.
      await page.waitForTimeout(3500);
      const start = server.traffic.length;
      const publisherStart = publisherTraffic.length;
      await page.locator('#run').click();
      await page
        .locator('#result')
        .filter({ hasText: /passed|FAILED:/ })
        .waitFor({ timeout: 60000 });
      assert.equal(
        await page.locator('#result').innerText(),
        'shared native worker passed',
      );
      await page.waitForTimeout(2500);
      assert.deepEqual(
        server.traffic.slice(start),
        [],
        'Guest context creation caused physical runtime HTTP',
      );
      assert.deepEqual(
        publisherTraffic.slice(publisherStart),
        [],
        'Guest context creation caused publisher HTTP',
      );
      receipt.observations.push({
        browser: name,
        version: browser.version(),
        isolated: true,
        nativeModuleMemoryAndSharedBufferRoundtrip: true,
        physicalRuntimeHTTP: [],
      });
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
  await new Promise<void>((resolve, reject) =>
    publisher.close((error) => (error ? reject(error) : resolve())),
  );
}
await mkdir('results/guest-runtime', { recursive: true });
await writeFile(
  'results/guest-runtime/context-isolation.json',
  JSON.stringify(receipt, null, 2) + '\n',
);
