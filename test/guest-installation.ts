import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, firefox } from 'playwright';
import { servers } from './server.ts';

const server = await servers();
const observations: object[] = [];
try {
  for (const [name, type] of Object.entries(
    process.env.GUEST_BROWSER === 'chromium' ? { chromium } : { chromium, firefox },
  )) {
    const browser = await type.launch({ headless: true });
    try {
      const context = await browser.newContext();
      const manager = await context.newPage();
      const errors: string[] = [];
      manager.on('pageerror', (error) => console.error('manager', error.message));
      await manager.goto('http://127.0.0.1:4210/privacy-frames/');
      await manager.getByText('Ready to install.', { exact: true }).waitFor();
      await manager.locator('#app-url').fill('http://127.0.0.1:4212/');
      await manager.locator('#install button').click();
      await manager.waitForFunction(
        () =>
          /^(Installed |Installation refused:)/.test(
            document.querySelector('#status')?.textContent || '',
          ),
        undefined,
        { timeout: 60000 },
      );
      const status = await manager.locator('#status').textContent();
      assert.match(status || '', /^Installed /);
      const opened = context.waitForEvent('page');
      await manager.locator('#app-list a[data-app]').first().click();
      const app = await opened;
      app.on('pageerror', (error) => {
        errors.push(error.message);
        console.error(name, error.message.slice(0, 1500));
      });
      app.on('console', (message) => {
        if (message.type() === 'error')
          console.error(name, message.text().slice(0, 1500));
      });
      await app.waitForFunction(
        () =>
          ['ready', 'failed'].includes(
            document.documentElement.dataset.privacyRuntime || '',
          ),
        undefined,
        { timeout: 60000 },
      );
      console.log(name, 'body', (await app.locator('body').innerText()).slice(0, 1200));
      assert.equal(
        await app.locator('html').getAttribute('data-privacy-runtime'),
        'ready',
      );
      await app.locator('#note').waitFor({ timeout: 30000 });
      await app
        .getByText('Installed reference', { exact: true })
        .waitFor({ timeout: 15000 });
      await app.waitForFunction(() => {
        const image = document.querySelector('#illustration');
        return image instanceof HTMLImageElement && image.naturalWidth > 0;
      });
      const start = server.traffic.length;
      await app.locator('#note').fill('guest-private-canary-' + name);
      await app.locator('#save').click();
      await app.getByText('Saved locally.', { exact: true }).waitFor();
      assert(
        !server.traffic
          .slice(start)
          .some((request) => request.path.includes('guest-private-canary')),
      );
      await app.reload();
      await app.locator('#note').waitFor();
      assert.equal(
        await app.locator('#note').inputValue(),
        'guest-private-canary-' + name,
      );
      await context.setOffline(true);
      await app.reload();
      await app.locator('#note').waitFor();
      assert.equal(
        await app.locator('#note').inputValue(),
        'guest-private-canary-' + name,
      );
      observations.push({
        browser: name,
        version: browser.version(),
        status,
        url: app.url(),
        errors,
        savedAndOffline: true,
      });
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
}
await mkdir('results/guest-runtime', { recursive: true });
await writeFile(
  'results/guest-runtime/installation.json',
  JSON.stringify(observations, null, 2) + '\n',
);
