import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { chromium, firefox } from 'playwright';
import { launch } from '../../test/browser-profile.ts';
import { testProvenance } from '../../test/provenance.ts';

// This component experiment uses only owned native AudioWorklets. It does not
// enable a production adapter or claim complete worklet confinement.
const before = await testProvenance(import.meta.url);
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const runnerBefore = digest(await readFile(new URL(import.meta.url), 'utf8'));
const traffic: string[] = [];
const server = http.createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://fixture.invalid');
  traffic.push(url.pathname);
  response.setHeader('Cache-Control', 'no-store');
  if (url.pathname === '/') {
    const strict = url.searchParams.get('strict') === 'true';
    response.setHeader(
      'Content-Security-Policy',
      `default-src 'none'; script-src ${strict ? '' : "'self' "}blob: data: 'unsafe-inline'; connect-src 'none'`,
    );
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><title>Native worklet policy</title>');
  } else if (url.pathname === '/dependency.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end('export const answer=19;');
  } else if (url.pathname === '/entry.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(
      "import {answer} from './dependency.js';registerProcessor('probe',class extends AudioWorkletProcessor{process(inputs,outputs){outputs[0][0].fill(answer/100);return false}});",
    );
  } else response.writeHead(404).end();
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address === 'object');
const origin = `http://127.0.0.1:${address.port}`;
const rows = [];
let completed = false;
try {
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    const browser = await launch(engine);
    try {
      for (const strict of [false, true]) {
        for (const mode of ['http', 'blob-graph', 'window-map'] as const) {
          const context = await browser.newContext();
          try {
            const page = await context.newPage();
            await page.goto(`${origin}/?strict=${strict}`);
            const start = traffic.length;
            const result = await page.evaluate(
              async ({ mode, origin }) => {
                const audio = new OfflineAudioContext(1, 256, 44100);
                const blobs: string[] = [];
                const moduleURL = (source: string) => {
                  const url = URL.createObjectURL(
                    new Blob([source], { type: 'text/javascript' }),
                  );
                  blobs.push(url);
                  return url;
                };
                const dependency = moduleURL('export const answer=19;');
                let entry = origin + '/entry.js';
                if (mode !== 'http') {
                  const reference =
                    mode === 'window-map' ? origin + '/dependency.js' : dependency;
                  if (mode === 'window-map') {
                    const map = document.createElement('script');
                    map.type = 'importmap';
                    map.textContent = JSON.stringify({
                      imports: { [reference]: dependency },
                    });
                    document.head.appendChild(map);
                  }
                  entry = moduleURL(
                    `import {answer} from ${JSON.stringify(reference)};registerProcessor('probe',class extends AudioWorkletProcessor{process(inputs,outputs){outputs[0][0].fill(answer/100);return false}});`,
                  );
                }
                try {
                  await audio.audioWorklet.addModule(entry);
                  const node = new AudioWorkletNode(audio, 'probe');
                  node.connect(audio.destination);
                  const rendered = await audio.startRendering();
                  node.port.close();
                  return {
                    loaded: true,
                    sample: rendered.getChannelData(0)[0],
                    error: '',
                  };
                } catch (error) {
                  return {
                    loaded: false,
                    sample: 0,
                    error: String(error),
                  };
                } finally {
                  for (const url of blobs) URL.revokeObjectURL(url);
                }
              },
              { mode, origin },
            );
            const requests = traffic.slice(start);
            rows.push({
              name,
              version: browser.version(),
              strict,
              mode,
              result,
              requests,
            });
            if (mode === 'blob-graph') {
              assert.equal(result.loaded, true);
              assert(Math.abs(result.sample - 0.19) < 0.00001);
              assert.deepEqual(requests, []);
            } else if (mode === 'http') {
              assert.equal(result.loaded, !strict);
              if (strict) assert.deepEqual(requests, []);
              else {
                assert(requests.includes('/entry.js'));
                assert(requests.includes('/dependency.js'));
              }
            } else if (strict) {
              // Both tested engines ignore the Window map in worklet graphs.
              assert.equal(result.loaded, false);
              assert.deepEqual(requests, []);
            } else {
              assert.equal(result.loaded, true);
              assert(Math.abs(result.sample - 0.19) < 0.00001);
              assert.deepEqual(requests, ['/dependency.js']);
            }
            console.log(
              `${name}: strict=${strict} ${mode} loaded=${result.loaded} requests=${requests.length}`,
            );
          } finally {
            await context.close();
          }
        }
      }
    } finally {
      await browser.close();
    }
  }
  completed = true;
} finally {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  const after = await testProvenance(import.meta.url);
  const runnerAfter = digest(await readFile(new URL(import.meta.url), 'utf8'));
  const sourceStable = before.sourceSHA256 === after.sourceSHA256;
  const artifactsStable =
    JSON.stringify(before.artifacts) === JSON.stringify(after.artifacts);
  const runnerStable = runnerBefore === runnerAfter;
  await writeFile(
    'formal/runtime-verification/native-worklet-policy.json',
    JSON.stringify(
      {
        scope:
          'Native AudioWorklet local Blob dependency graph, HTTP policy controls and Window import-map applicability; not production integration',
        completed: completed && sourceStable && artifactsStable && runnerStable,
        before,
        after,
        runnerBefore,
        runnerAfter,
        sourceStable,
        artifactsStable,
        runnerStable,
        rows,
      },
      null,
      2,
    ) + '\n',
  );
  assert(sourceStable, 'Source changed during the native comparison');
  assert(artifactsStable, 'Build artifacts changed during the native comparison');
  assert(runnerStable, 'Runner changed during the native comparison');
}
