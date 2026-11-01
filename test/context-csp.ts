import http from 'node:http';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, firefox } from 'playwright';
import { launch } from './browser-profile.ts';
import { response } from '../src/runtime/response-policy.ts';
import { testProvenance } from './provenance.ts';
import { build } from 'esbuild';

const requests: string[] = [];
let origin = '';
const probe = (
  await build({
    stdin: {
      resolveDir: process.cwd(),
      contents: `
import {prepareScriptURLs} from './src/runtime/enforcement/script-urls.ts';
const scriptURL = location.pathname === '/confined/' ? prepareScriptURLs() : value => value;
async function workerResult(url) {
  return new Promise(resolve => {
    let worker;
    const timer = setTimeout(() => { worker?.terminate(); resolve({ outcome: 'timeout' }); }, 5000);
    try {
      worker = new Worker(scriptURL(url));
      worker.onmessage = event => { clearTimeout(timer); worker.terminate(); resolve({ outcome: 'message', value: event.data }); };
      worker.onerror = event => { event.preventDefault(); clearTimeout(timer); worker.terminate(); resolve({ outcome: 'error' }); };
    } catch (error) { clearTimeout(timer); resolve({ outcome: 'throw', name: error.name }); }
  });
}
window.runContextCSPProbe = async () => {
  const approved = await workerResult('/allowed/kernel.js');
  const ordinary = await workerResult('/ordinary/application.js');
  const other = await workerResult('/another-app/worker.js');
  const url = URL.createObjectURL(new Blob(["postMessage('blob worker')"], { type: 'text/javascript' }));
  const blob = await workerResult(url);
  URL.revokeObjectURL(url);
  return { approved, ordinary, other, blob };
};
`,
    },
    bundle: true,
    write: false,
    format: 'iife',
    target: 'es2022',
  })
).outputFiles[0].text;
const server = http.createServer(async (request, target) => {
  const path = request.url || '/';
  requests.push(path);
  let result: Response;
  if (path === '/confined/') {
    result = response(
      '<!doctype html><title>CSP context test</title><script src="/probe.js"></script>',
      'text/html',
      200,
      { workerSource: origin + '/allowed/' },
    );
  } else if (path === '/control/') {
    result = new Response(
      '<!doctype html><title>Unrestricted control</title><script src="/probe.js"></script>',
      { headers: { 'Content-Type': 'text/html' } },
    );
  } else if (path === '/probe.js') {
    result = new Response(probe, { headers: { 'Content-Type': 'text/javascript' } });
  } else if (
    ['/allowed/kernel.js', '/ordinary/application.js', '/another-app/worker.js'].includes(
      path,
    )
  ) {
    result = new Response(`postMessage(${JSON.stringify(path)});`, {
      headers: { 'Content-Type': 'text/javascript' },
    });
  } else result = new Response('Not found', { status: 404 });
  target.writeHead(result.status, Object.fromEntries(result.headers));
  target.end(Buffer.from(await result.arrayBuffer()));
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('CSP test server missing');
origin = `http://127.0.0.1:${address.port}`;
const evidence = {
  scope:
    'Native directory CSP boundary. The owned fixture deliberately brands every attempted URL to isolate CSP source restrictions; it is not the production URL admission policy.',
  provenance: await testProvenance(import.meta.url),
  date: new Date().toISOString(),
  browsers: [],
};
try {
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    const browser = await launch(engine);
    try {
      const page = await browser.newPage();
      await page.goto(origin + '/control/');
      const control = await page.evaluate(() =>
        Reflect.get(window, 'runContextCSPProbe')(),
      );
      for (const item of Object.values(control)) assert.equal(item.outcome, 'message');
      const start = requests.length;
      await page.goto(origin + '/confined/');
      const confined = await page.evaluate(() =>
        Reflect.get(window, 'runContextCSPProbe')(),
      );
      assert.equal(confined.approved.outcome, 'message');
      for (const key of ['ordinary', 'other', 'blob']) {
        assert(['error', 'throw'].includes(confined[key].outcome), key);
      }
      const received = requests.slice(start);
      assert(received.includes('/allowed/kernel.js'));
      assert(!received.includes('/ordinary/application.js'));
      assert(!received.includes('/another-app/worker.js'));
      evidence.browsers.push({
        name,
        version: browser.version(),
        control,
        confined,
        received,
      });
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await mkdir('results/contexts', { recursive: true });
  await writeFile(
    'results/contexts/csp-startup.json',
    JSON.stringify(evidence, null, 2) + '\n',
  );
}
console.log(
  'Directory CSP permits the approved worker and refuses other sources despite test-issued URL brands in both browsers.',
);
