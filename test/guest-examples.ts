import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, firefox, type BrowserContext, type Page } from 'playwright';
import { provideResourceList } from './resource-list-input.ts';
import { servers } from './server.ts';

const server = await servers({ acceptWebSockets: true });
const receipts: object[] = [];

async function install(
  manager: Page,
  context: BrowserContext,
  port: number,
  files: string[],
): Promise<Page> {
  const source = `http://127.0.0.1:${port}/`;
  const previous = new Set(
    await manager
      .locator('#app-list a[data-app]')
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute('data-installation')),
      ),
  );
  await manager.locator('#app-url').fill(source);
  await provideResourceList(
    manager,
    files.map((file) => new URL(file, source).href),
  );
  await manager.locator('#install button').click();
  await manager.waitForFunction(
    () =>
      /^(Installed |Installation refused:)/.test(
        document.querySelector('#status')?.textContent || '',
      ),
    undefined,
    { timeout: 60000 },
  );
  assert.match(await manager.locator('#status').innerText(), /^Installed /);
  const opened = context.waitForEvent('page');
  const installed = (
    await manager
      .locator('#app-list a[data-app]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-installation')))
  ).find((id) => id && !previous.has(id));
  assert(installed, 'Installation did not add an application');
  await manager.locator('#app-list a[data-installation="' + installed + '"]').click();
  const app = await opened;
  await app.waitForFunction(
    () =>
      ['ready', 'failed'].includes(document.documentElement.dataset.privacyRuntime || ''),
    undefined,
    { timeout: 60000 },
  );
  assert.equal(await app.locator('html').getAttribute('data-privacy-runtime'), 'ready');
  return app;
}

try {
  for (const [name, type] of [
    ['chromium', chromium],
    ['firefox', firefox],
  ] as const) {
    if (process.env.GUEST_BROWSER && process.env.GUEST_BROWSER !== name) continue;
    const browser = await type.launch({ headless: true });
    const checks: string[] = [];
    const observations: Record<string, unknown> = {};
    let failure: string | undefined;
    try {
      const context = await browser.newContext();
      const manager = await context.newPage();
      await manager.goto('http://127.0.0.1:4210/privacy-frames/');
      await manager.getByText('Ready to install.', { exact: true }).waitFor();
      const hostile = await install(manager, context, 4214, [
        'index.html',
        'app.js',
        'app.css',
        'worklet.js',
      ]);
      hostile.on('pageerror', (error) => console.error(name, 'hostile', error.message));
      await hostile.locator('#run').click();
      await hostile
        .locator('#status')
        .filter({ hasText: 'checks refused.' })
        .waitFor({ timeout: 60000 });
      const rows = await hostile.locator('#results tr').evaluateAll((elements) =>
        elements.map((row) => ({
          name: row.children[0]?.textContent,
          status: row.children[1]?.textContent,
        })),
      );
      assert(
        rows.some(
          (row) =>
            row.name === 'prototype tampering' && row.status === 'Allowed / available',
        ),
      );
      assert(
        rows.some((row) => row.name === 'eval' && row.status === 'Allowed / available'),
      );
      assert(
        rows.some(
          (row) =>
            row.name === 'Function constructor' && row.status === 'Allowed / available',
        ),
      );
      assert(
        await hostile.evaluate(
          () =>
            Reflect.get(window, 'boundaryProbes') === undefined &&
            [1, 2].map((value) => value + 1).join(',') === '2,3',
        ),
      );
      observations.hostileRows = rows;
      checks.push(
        'Unchanged hostile application executes local evaluation and prototype changes without modifying native globals or native prototypes',
      );
      const hostileStart = server.traffic.length;
      await hostile.locator('#diagnostic').fill('synthetic-guest-hostile-' + name);
      await hostile.locator('#network').click();
      await hostile
        .getByText(
          'Fetch and XHR rejected. Inspect the receiver for all attempted routes.',
          { exact: true },
        )
        .waitFor();
      await hostile.waitForTimeout(200);
      const hostileDisclosure = server.traffic
        .slice(hostileStart)
        .filter((request) => request.port === 4366);
      assert.deepEqual(hostileDisclosure, []);
      checks.push(
        'Unchanged hostile disclosure button produces no receiver HTTP or WebSocket traffic',
      );
      await hostile.close();

      const playground = await install(manager, context, 4217, [
        'index.html',
        'app.js',
        'app.css',
      ]);
      playground.on('pageerror', (error) =>
        console.error(name, 'playground', error.message),
      );
      const playgroundStart = server.traffic.length;
      await playground.locator('#secret').fill('synthetic-guest-playground-' + name);
      await playground.locator('#run').click();
      await playground.locator('#output').filter({ hasText: 'BLOCKED:' }).waitFor();
      assert(
        (await playground.locator('#output').innerText()).includes(
          'synthetic-guest-playground-' + name,
        ),
      );
      assert.deepEqual(
        server.traffic.slice(playgroundStart).filter((request) => request.port === 4366),
        [],
      );
      await playground.locator('#html').fill('<h2 id="edited">Edited preview</h2>');
      await playground.locator('#css').fill('h2 { color: rgb(120, 200, 140); }');
      await playground
        .locator('#javascript')
        .fill(
          'preview.querySelector("#edited").textContent="JavaScript ran"; log("EDITED SCRIPT RAN");',
        );
      await playground.locator('#run').click();
      await playground
        .locator('#output')
        .filter({ hasText: 'EDITED SCRIPT RAN' })
        .waitFor();
      assert.equal(
        await playground
          .locator('#preview')
          .evaluate((node) => node.shadowRoot?.querySelector('h2')?.textContent),
        'JavaScript ran',
      );
      assert.equal(
        await playground.locator('#preview').evaluate((node) => {
          const heading = node.shadowRoot?.querySelector('h2');
          return heading ? getComputedStyle(heading).color : null;
        }),
        'rgb(120, 200, 140)',
      );
      checks.push(
        'Unchanged playground dynamically imports user-entered JavaScript and edits native Shadow DOM/CSS while default disclosure remains blocked',
      );
      await playground.locator('#javascript').fill(`globalThis.editorReply=value=>value+1;
const frame=document.createElement('iframe');
frame.srcdoc='<p id="child">Guest editor frame</p><script>globalThis.editorAnswer=parent.editorReply(41)</script>';
frame.addEventListener('load',()=>log('PREPARED CHILD:',frame.contentWindow.editorAnswer));
preview.append(frame);`);
      await playground.locator('#run').click();
      await playground
        .locator('#output')
        .filter({ hasText: 'PREPARED CHILD: 42' })
        .waitFor({ timeout: 30000 });
      assert(
        await playground.locator('#preview').evaluate((node) => {
          const frame = node.shadowRoot?.querySelector('iframe');
          return (
            frame?.contentDocument?.getElementById('child')?.textContent ===
              'Guest editor frame' &&
            Reflect.get(frame.contentWindow!, 'editorAnswer') === undefined
          );
        }),
      );
      checks.push(
        'User-entered code creates a prepared native child frame with synchronous guest callbacks and no native application execution',
      );
      await playground.close();

      const baseline = await context.newPage();
      const controlStart = server.traffic.length;
      await baseline.goto('http://127.0.0.1:4217/');
      await baseline.locator('#run').click();
      await baseline.locator('#output').filter({ hasText: 'NETWORK REACHED:' }).waitFor();
      observations.control = server.traffic
        .slice(controlStart)
        .filter((request) => request.port === 4366);
      assert(
        (observations.control as object[]).length > 0,
        'Native unrestricted control did not reach the receiver',
      );
      checks.push(
        'The same unchanged playground sends to the live receiver when run outside the host',
      );
      await baseline.close();
    } catch (error) {
      failure = error instanceof Error ? error.stack : String(error);
      throw error;
    } finally {
      receipts.push({
        browser: name,
        version: browser.version(),
        checks,
        observations,
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
    'results/guest-runtime/examples.json',
    JSON.stringify(receipts, null, 2) + '\n',
  );
}
