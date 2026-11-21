import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const interfaces = networkInterfaces();
assert(
  Object.values(interfaces)
    .flat()
    .every((entry) => entry!.internal),
);
assert(Object.keys(interfaces).includes('lo'));
const form = `<form action=/submit method=post>
<label>Full name<input name=fullname autocomplete=name></label>
<label>Address<input name=address autocomplete=street-address></label>
<label>City<input name=city autocomplete=address-level2></label>
<label>State<input name=state autocomplete=address-level1></label>
<label>Postal code<input name=postal autocomplete=postal-code></label>
<label>Country<input name=country autocomplete=country-name></label>
<label>Email<input name=email type=email autocomplete=email></label>
<button>Submit</button></form>`;
const application = `<!doctype html><html lang=en><title>Synthetic form control</title>
<button id=reveal>Show form</button><main id=content></main><script>
document.getElementById('reveal').addEventListener('click', () => {
  document.getElementById('content').innerHTML = ${JSON.stringify(form)};
});
</script></html>`;
const urls = {
  manager: 'http://127.0.0.1:4800/manager/',
  runtime: 'http://127.0.0.1:4801/runtime/',
  installation: 'http://127.0.0.1:4802/installation/',
  publisher: 'http://127.0.0.1:4803/publisher/',
  service: 'http://127.0.0.1:4804/',
};
assert.equal(new URL(urls.service).hostname, '127.0.0.1');
const config = {
  ...JSON.parse(await readFile('dist-manager/config.json', 'utf8')),
  managerURL: urls.manager,
  runtimeURL: urls.runtime,
  installationURL: urls.installation,
  managerOrigins: [new URL(urls.manager).origin],
  examples: [],
};
const media: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
};
const servers: Server[] = [];
let phase = '';
const requests: Record<string, number> = {};
let received: (() => void) | undefined;
const observations = [];
try {
  for (const [role, directory] of [
    ['manager', 'dist-manager'],
    ['runtime', 'dist-runtime'],
    ['installation', 'dist-installation'],
    ['publisher', ''],
    ['service', ''],
  ] as const) {
    const base = new URL(urls[role]);
    const server = createServer(async (request, response) => {
      response.setHeader('Access-Control-Allow-Origin', '*');
      response.setHeader('Cache-Control', 'no-store');
      const url = new URL(request.url ?? '/', base);
      if (role === 'service') {
        request.resume();
        if (url.pathname.startsWith('/v1/pages')) {
          requests[phase] = (requests[phase] ?? 0) + 1;
          received?.();
        }
        response.writeHead(200, { 'Content-Type': 'application/x-protobuf' }).end();
        return;
      }
      if (role === 'publisher') {
        response.writeHead(200, { 'Content-Type': 'text/html' }).end(application);
        return;
      }
      try {
        assert(url.pathname.startsWith(base.pathname));
        let relative = decodeURIComponent(url.pathname.slice(base.pathname.length));
        assert(!relative.split('/').includes('..'));
        if (!relative || relative.endsWith('/')) relative += 'index.html';
        if (relative === 'config.json') {
          response.writeHead(200, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify(config));
        } else {
          const bytes = await readFile(path.join(directory, relative));
          response.writeHead(200, {
            'Content-Type': media[path.extname(relative)] ?? 'application/octet-stream',
          });
          response.end(bytes);
        }
      } catch {
        response.writeHead(404).end();
      }
    });
    await new Promise<void>((resolve) =>
      server.listen(Number(base.port), '127.0.0.1', resolve),
    );
    servers.push(server);
  }
  for (const variant of ['disabled-native', 'native', 'confined'] as const) {
    phase = variant;
    requests[phase] = 0;
    const serviceSwitch = '--autofill-server-url=' + urls.service;
    const launchContext = () =>
      chromium.launchPersistentContext('/tmp/profile-' + variant, {
        executablePath: '/browser/chrome',
        headless: true,
        ignoreDefaultArgs: ['--disable-background-networking'],
        args: [
          serviceSwitch,
          ...(variant === 'disabled-native'
            ? ['--disable-features=AutofillServerCommunication']
            : []),
        ],
      });
    let context = await launchContext();
    try {
      const page = context.pages()[0];
      let app = page;
      let confinementHeaders: Record<string, string> | undefined;
      let installationRequests = 0;
      if (variant === 'confined') {
        await page.goto(urls.manager);
        await page.getByText('Ready to install.', { exact: true }).waitFor();
        await page.locator('#app-url').fill(urls.publisher + 'app/');
        await page.locator('#install button').click();
        await page.waitForFunction(
          () =>
            /^(Installed |Installation refused:)/.test(
              document.querySelector('#status')?.textContent ?? '',
            ),
          undefined,
          { timeout: 30000 },
        );
        assert.match(await page.locator('#status').innerText(), /^Installed /);
        const link = await page
          .locator('#app-list a[data-app]')
          .first()
          .getAttribute('href');
        assert(link);
        const installedURL = new URL(link, urls.manager).href;
        await context.close();
        installationRequests = requests[phase];
        phase = variant + ':runtime';
        requests[phase] = 0;

        // Reopen only the installed app in a new browser process. The manager
        // and installer cannot produce a delayed request in this observation.
        context = await launchContext();
        app = context.pages()[0];
        const response = await app.goto(installedURL);
        assert(response);
        await app.waitForFunction(
          () => document.documentElement.dataset.privacyRuntime === 'ready',
          undefined,
          { timeout: 30000 },
        );
        assert(
          response.fromServiceWorker(),
          'The app document must be served by the real runtime worker',
        );
        confinementHeaders = await response.allHeaders();
        assert(
          confinementHeaders['content-security-policy'].includes("connect-src 'none'"),
        );
      } else await page.goto(urls.publisher + 'app/');
      const session = await context.newCDPSession(app);
      const version = await session.send('Browser.getVersion');
      const commands = await Promise.all(
        (await readdir('/proc'))
          .filter((name) => /^[0-9]+$/.test(name))
          .map((name) => readFile(`/proc/${name}/cmdline`, 'utf8').catch(() => '')),
      );
      const command = commands
        .map((value) => value.split('\0').filter(Boolean))
        .find(
          (args) =>
            args[0] === '/browser/chrome' &&
            !args.some((arg) => arg.startsWith('--type=')),
        );
      assert(command?.includes(serviceSwitch));
      assert.equal(await app.locator('input').count(), 0);
      await app.waitForTimeout(10000);
      const startupRequests = requests[phase];
      phase = variant + ':form';
      requests[phase] = 0;
      const observedRequest = new Promise<void>((resolve) => (received = resolve));
      await app.locator('#reveal').click();
      assert.equal(await app.locator('input').count(), 7);
      await Promise.race([
        observedRequest,
        new Promise((resolve) => setTimeout(resolve, 10000)),
      ]);
      observations.push({
        variant,
        version,
        arguments: command,
        controls: 7,
        installationRequests,
        startupRequests,
        requests: requests[phase],
        confinementHeaders,
      });
      if (variant === 'disabled-native') assert.equal(requests[phase], 0);
      if (variant === 'native')
        assert(requests[phase] > 0, 'Native positive control is unqualified');
    } finally {
      await context.close();
      received = undefined;
    }
  }
  console.log(
    JSON.stringify({
      interfaces,
      observations,
      qualifiedConfinement: false,
      outcome:
        requests['confined:form'] > 0
          ? 'browser-owned-request-observed-in-confined-runtime'
          : 'no-confined-request-observed-in-this-configuration',
    }),
  );
} finally {
  for (const server of servers) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
