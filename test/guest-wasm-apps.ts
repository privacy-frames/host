import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, firefox, type Page } from 'playwright';
import { launch } from './browser-profile.ts';

const root = process.cwd();
const output = path.join(root, 'results/guest-runtime/wasm-apps');
const publisher =
  process.env.PUBLISHER_DIRECTORY ?? path.join(root, 'publisher-source/dist');
const managerURL = 'http://127.0.0.1:4810/privacy-frames/';
const runtimeURL = 'http://127.0.0.1:4811/runtime/';
const installationURL = 'http://127.0.0.1:4819/installation/';
const publisherURL = 'http://127.0.0.1:4812/apps/';
const targets = [
  {
    id: 'photocraft',
    url: 'https://share.damenh.com/craft/hVO5F2d3gEg2c4hY5/#photo-craft',
    list: 'https://privacy-frames.github.io/apps/resource-lists/photocraft.uris',
  },
  {
    id: 'squoosh',
    url: publisherURL + 'squoosh/',
    list: publisherURL + 'resource-lists/squoosh.uris',
  },
] as const;
const config = JSON.parse(await readFile('dist-manager/config.json', 'utf8'));
Object.assign(config, {
  managerURL,
  runtimeURL,
  installationURL,
  managerOrigins: [new URL(managerURL).origin],
  examples: targets.map((target) => ({
    name: target.id,
    url: target.url,
    resourceListURL: target.list,
  })),
});
const requests: { port: number; url: string; method: string }[] = [];
const media: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json',
  '.uris': 'text/uri-list',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};
const servers = [];
for (const [port, directory, prefix] of [
  [4810, 'dist-manager', '/privacy-frames/'],
  [4811, 'dist-runtime', '/runtime/'],
  [4819, 'dist-installation', '/installation/'],
  [4812, publisher, '/apps/'],
] as const) {
  const server = createServer(async (request, response) => {
    requests.push({ port, url: request.url ?? '/', method: request.method ?? 'GET' });
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Cache-Control', 'no-store');
    try {
      const address = new URL(request.url ?? '/', 'http://local');
      if (!address.pathname.startsWith(prefix)) throw new Error('Outside scope');
      let relative = decodeURIComponent(address.pathname.slice(prefix.length));
      if (relative.split('/').includes('..')) throw new Error('Invalid path');
      if (!relative || relative.endsWith('/')) relative += 'index.html';
      if (port !== 4812 && relative === 'config.json') {
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify(config));
        return;
      }
      let bytes = await readFile(path.join(directory, relative));
      if (relative.endsWith('.uris'))
        bytes = Buffer.from(
          bytes
            .toString()
            .replaceAll('https://privacy-frames.github.io/apps/', publisherURL),
        );
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
  servers.push(server);
}

async function image(page: Page, noise: boolean): Promise<Buffer> {
  const encoded = await page.evaluate((noise) => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext('2d')!;
    if (!noise) {
      context.fillStyle = '#ff0000';
      context.fillRect(0, 0, 256, 256);
    } else {
      const pixels = context.createImageData(256, 256);
      let seed = 0x12345678;
      for (let offset = 0; offset < pixels.data.length; offset += 4) {
        for (let channel = 0; channel < 3; channel++) {
          seed ^= seed << 13;
          seed ^= seed >>> 17;
          seed ^= seed << 5;
          pixels.data[offset + channel] = seed & 255;
        }
        pixels.data[offset + 3] = 255;
      }
      context.putImageData(pixels, 0, 0);
    }
    return canvas.toDataURL('image/png').split(',')[1];
  }, noise);
  return Buffer.from(encoded, 'base64');
}
async function decoded(page: Page, bytes: Buffer) {
  return page.evaluate(async (encoded) => {
    const raw = Uint8Array.from(atob(encoded), (value) => value.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([raw]));
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let red = 0,
      black = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (
        data[i] === 255 &&
        data[i + 1] === 0 &&
        data[i + 2] === 0 &&
        data[i + 3] === 255
      )
        red++;
      if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0 && data[i + 3] === 255)
        black++;
    }
    return { width: canvas.width, height: canvas.height, red, black };
  }, bytes.toString('base64'));
}
async function download(page: Page, action: () => Promise<unknown>, confined: boolean) {
  let confirmations = 0;
  const approve = async (dialog: import('playwright').Dialog) => {
    assert.equal(dialog.type(), 'confirm');
    assert(dialog.message().startsWith('Allow this application to export a file?'));
    confirmations++;
    await dialog.accept();
  };
  page.on('dialog', approve);
  try {
    const pending = page.waitForEvent('download', { timeout: 60000 });
    await action();
    const item = await pending;
    const file = await item.path();
    assert(file);
    const bytes = await readFile(file);
    if (confined) assert.equal(confirmations, 1, 'Export requires host approval');
    return {
      bytes,
      name: item.suggestedFilename(),
      confirmations,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      decoded: await decoded(page, bytes),
    };
  } finally {
    page.off('dialog', approve);
  }
}
async function photo(page: Page, confined: boolean) {
  await page.waitForFunction(
    () =>
      !document.querySelector('#photocraft_loading') &&
      (document.querySelector('canvas')?.width ?? 0) > 0,
    undefined,
    { timeout: 90000 },
  );
  const png = await image(page, false);
  const transfer = await page.evaluateHandle((encoded) => {
    const bytes = Uint8Array.from(atob(encoded), (value) => value.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], 'synthetic-red.png', { type: 'image/png' }));
    return transfer;
  }, png.toString('base64'));
  await page.locator('canvas').first().dispatchEvent('drop', { dataTransfer: transfer });
  await page.waitForTimeout(2000);
  const before = await page.screenshot({
    path: path.join(output, 'photocraft-import.png'),
  });
  await page.mouse.move(570, 350);
  await page.mouse.down();
  await page.mouse.move(620, 400, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  const after = await page.screenshot({
    path: path.join(output, 'photocraft-brush.png'),
  });
  const pixels = await page.evaluate(
    async ({ before, after }) => {
      const values: number[][] = [];
      for (const encoded of [before, after]) {
        const bytes = Uint8Array.from(atob(encoded), (value) => value.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext('2d')!;
        context.drawImage(bitmap, 0, 0);
        values.push(Array.from(context.getImageData(580, 360, 1, 1).data));
        bitmap.close();
      }
      return values;
    },
    { before: before.toString('base64'), after: after.toString('base64') },
  );
  assert.deepEqual(pixels, [
    [255, 0, 0, 255],
    [0, 0, 0, 255],
  ]);
  await page.mouse.click(25, 15);
  await page.waitForTimeout(250);
  await page.mouse.move(75, 465);
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(output, 'photocraft-menu.png') });
  if (process.env.WASM_APPS_INSPECT) return { inspected: true };
  const exported = await download(page, () => page.mouse.click(350, 100), confined);
  assert.equal(exported.decoded.width, 256);
  assert.equal(exported.decoded.height, 256);
  assert(exported.decoded.red > 50000 && exported.decoded.black > 10);
  return {
    ...exported,
    bytes: exported.bytes.length,
    inputBytes: png.length,
    screenPixels: pixels,
  };
}
async function squoosh(page: Page, confined: boolean) {
  await page
    .locator('file-drop input[type=file]')
    .waitFor({ state: 'attached', timeout: 90000 });
  const png = await image(page, true);
  await page
    .locator('file-drop input[type=file]')
    .setInputFiles({ name: 'synthetic-noise.png', mimeType: 'image/png', buffer: png });
  const link = page.locator('a[download="synthetic-noise.jpg"]');
  await link.waitFor({ timeout: 120000 });
  const before = await download(page, () => link.click(), confined);
  assert.equal(before.decoded.width, 256);
  assert.equal(before.decoded.height, 256);
  assert.deepEqual([...before.bytes.subarray(0, 3)], [255, 216, 255]);
  const previousURL = await link.evaluate(
    (element) => element.getAttribute('data-pf-href') || element.getAttribute('href'),
  );
  const quality = page.locator('input[type=range][name=quality]').first();
  await quality.evaluate((element) => {
    if (!(element instanceof HTMLInputElement)) throw new Error('Quality slider missing');
    element.value = '50';
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(
    (previous) => {
      const element = document.querySelector('a[download="synthetic-noise.jpg"]');
      const current =
        element?.getAttribute('data-pf-href') || element?.getAttribute('href');
      return current && current !== previous;
    },
    previousURL,
    { timeout: 60000 },
  );
  const after = await download(page, () => link.click(), confined);
  assert.notEqual(before.sha256, after.sha256);
  assert(after.bytes.length < before.bytes.length);
  return {
    inputBytes: png.length,
    before: { ...before, bytes: before.bytes.length },
    after: { ...after, bytes: after.bytes.length },
    workers: page.workers().length,
    controls: await page.locator('select').evaluateAll((elements) =>
      elements
        .filter(
          (element): element is HTMLSelectElement => element instanceof HTMLSelectElement,
        )
        .map((element) => ({
          value: element.value,
          options: [...element.options].map((option) => option.text),
        })),
    ),
  };
}

await mkdir(output, { recursive: true });
const guardHash = createHash('sha256')
  .update(await readFile('dist-runtime/guard.js'))
  .digest('hex');
let failed = false;
try {
  for (const [name, engine] of [
    ['chromium', chromium],
    ['firefox', firefox],
  ] as const) {
    if (process.env.WASM_APPS_BROWSER && name !== process.env.WASM_APPS_BROWSER) continue;
    const softwareDisplay =
      name === 'firefox' ? process.env.WASM_APPS_FIREFOX_DISPLAY : undefined;
    const firefoxUserPrefs = {
      'webgl.force-enabled': true,
      'webgl.disabled': false,
      'gfx.webrender.software': true,
    };
    const browser = await launch(
      engine,
      softwareDisplay
        ? {
            headless: false,
            env: { ...process.env, DISPLAY: softwareDisplay, LIBGL_ALWAYS_SOFTWARE: '1' },
            firefoxUserPrefs,
          }
        : {},
    );
    try {
      for (const target of targets) {
        if (process.env.WASM_APPS_TARGET && target.id !== process.env.WASM_APPS_TARGET)
          continue;
        for (const mode of ['native', 'confined'] as const) {
          if (process.env.WASM_APPS_MODE && mode !== process.env.WASM_APPS_MODE) continue;
          const context = await browser.newContext({
            viewport: { width: 1280, height: 800 },
            serviceWorkers: mode === 'native' ? 'block' : 'allow',
          });
          const errors: string[] = [];
          const privateRequests: string[] = [];
          let privateTask = false;
          context.on('request', (request) => {
            if (privateTask && /^https?:/.test(request.url()))
              privateRequests.push(request.url());
          });
          const responses: { url: string; status: number }[] = [];
          context.on('page', (page) =>
            page.on('pageerror', (error) => errors.push(error.stack ?? error.message)),
          );
          context.on('console', (message) => {
            if (message.type() === 'error') errors.push(message.text());
          });
          context.on('response', (response) => {
            if (response.status() >= 400)
              responses.push({ url: response.url(), status: response.status() });
          });
          const row: Record<string, unknown> = {
            browser: name,
            version: browser.version(),
            application: target.id,
            graphicsProfile: softwareDisplay
              ? { display: softwareDisplay, softwareMesa: true, firefoxUserPrefs }
              : { headless: true },
            mode,
            sourceURL: target.url,
            guardHash,
            started: new Date().toISOString(),
            errors,
            responses,
            privateRequests,
          };
          console.log(`Starting ${name}/${target.id}/${mode}`);
          let page = await context.newPage();
          try {
            if (mode === 'native')
              await page.goto(target.url, { waitUntil: 'domcontentloaded' });
            else {
              await page.goto(managerURL);
              await page.getByText('Ready to install.', { exact: true }).waitFor();
              await page.locator('#app-url').fill(target.url);
              const details = page.locator('#resource-list-options');
              if (!(await details.evaluate((node) => (node as HTMLDetailsElement).open)))
                await details.locator('summary').click();
              await page.getByLabel('Resource list', { exact: true }).selectOption('url');
              await page.locator('#resource-list-url').fill(target.list);
              await page.locator('#install button').click();
              await page.waitForFunction(
                () =>
                  /^(Installed |Installation refused:)/.test(
                    document.querySelector('#status')?.textContent ?? '',
                  ),
                undefined,
                { timeout: 330000 },
              );
              row.installation = await page.locator('#status').innerText();
              assert(
                String(row.installation).startsWith('Installed '),
                String(row.installation),
              );
              const opened = context.waitForEvent('page');
              await page.locator('#app-list a[data-app]').first().click();
              page = await opened;
              await page.waitForFunction(
                () =>
                  ['ready', 'failed'].includes(
                    document.documentElement.dataset.privacyRuntime ?? '',
                  ),
                undefined,
                { timeout: 180000 },
              );
              assert.equal(
                await page.locator('html').getAttribute('data-privacy-runtime'),
                'ready',
              );
            }
            row.url = page.url();
            privateTask = true;
            row.task = await (target.id === 'photocraft'
              ? photo(page, mode === 'confined')
              : squoosh(page, mode === 'confined'));
            if (mode === 'confined' && !process.env.WASM_APPS_INSPECT) {
              privateTask = false;
              await context.setOffline(true);
              await page.reload({ waitUntil: 'commit' });
              await page.waitForFunction(
                () => document.documentElement.dataset.privacyRuntime === 'ready',
                undefined,
                { timeout: 180000 },
              );
              privateTask = true;
              row.offlineTask = await (target.id === 'photocraft'
                ? photo(page, true)
                : squoosh(page, true));
            }
            if (mode === 'confined')
              assert.deepEqual(
                privateRequests,
                [],
                'Private image task performs no HTTP requests',
              );
            row.passed = !process.env.WASM_APPS_INSPECT;
          } catch (error) {
            row.passed = false;
            failed = true;
            row.error = error instanceof Error ? error.stack : String(error);
          } finally {
            row.inputs = await page
              .locator('input[type=file]')
              .evaluateAll((elements) =>
                elements
                  .filter(
                    (element): element is HTMLInputElement =>
                      element instanceof HTMLInputElement,
                  )
                  .map((element) => ({
                    files: [...(element.files ?? [])].map((file) => ({
                      name: file.name,
                      size: file.size,
                      type: file.type,
                    })),
                    value: element.value,
                  })),
              )
              .catch(() => []);
            row.completed = new Date().toISOString();
            row.text = (
              await page
                .locator('body')
                .innerText()
                .catch(() => '')
            ).slice(0, 2500);
            await page
              .screenshot({ path: path.join(output, `${name}-${target.id}-${mode}.png`) })
              .catch(() => {});
            await writeFile(
              path.join(output, `${name}-${target.id}-${mode}.json`),
              JSON.stringify(row, null, 2) + '\n',
            );
            console.log(
              JSON.stringify({
                browser: name,
                application: target.id,
                mode,
                passed: row.passed,
                error: row.error,
                errors: errors.slice(0, 4),
              }),
            );
            await context.close();
          }
        }
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
}
if (failed) process.exitCode = 1;
