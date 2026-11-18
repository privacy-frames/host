import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { build } from '/tmp/aw-engine-feasibility/node_modules/esbuild/lib/main.js';
import {
  chromium,
  firefox,
} from '/home/damen/Projects/privacy-frames/node_modules/playwright/index.mjs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
const directory = fileURLToPath(new URL('.', import.meta.url));
const dependencies = '/tmp/aw-engine-feasibility/node_modules';
const output = '/tmp/context-engine-feasibility';
await mkdir(output, { recursive: true });
const loader = `${dependencies}/@jitl/quickjs-wasmfile-release-sync/dist/emscripten-module.browser.mjs`;
// This is a scoped trusted-glue UTF-8 substitute, explicitly not a no-polyfill result.
const substitute = `{decode(bytes){return decodeURIComponent(Array.from(bytes, byte => '%' + byte.toString(16).padStart(2, '0')).join(''))}}`;
for (const entry of [
  'worker',
  'child',
  'main',
  'worklet',
  'native-worklet',
  'transfer',
]) {
  for (const adapted of entry === 'worklet' ? [false, true] : [false]) {
    await build({
      entryPoints: [`${directory}${entry}.ts`],
      outfile: `${output}/${entry}${adapted ? '-adapted' : ''}.js`,
      bundle: true,
      format: 'esm',
      platform: 'browser',
      nodePaths: [dependencies],
      plugins: adapted
        ? [
            {
              name: 'scoped-utf8-loader',
              setup(build) {
                build.onLoad(
                  { filter: /emscripten-module\.browser\.mjs$/ },
                  async (args) => ({
                    contents: (await readFile(args.path, 'utf8')).replace(
                      'new TextDecoder',
                      substitute,
                    ),
                    loader: 'js',
                  }),
                );
              },
            },
          ]
        : [],
    });
  }
}
const wasm = await readFile(
  `${dependencies}/@jitl/quickjs-wasmfile-release-sync/dist/emscripten-module.wasm`,
);
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname;
    response.setHeader(
      'Content-Type',
      path.endsWith('.js')
        ? 'text/javascript'
        : path.endsWith('.wasm')
          ? 'application/wasm'
          : 'text/html',
    );
    response.end(
      path === '/engine.wasm'
        ? wasm
        : path.endsWith('.js')
          ? await readFile(`${output}${path}`)
          : path === '/child'
            ? '<script type="module" src="/child.js"></script>'
            : '<!doctype html>',
    );
  } catch {
    response.statusCode = 404;
    response.end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const receipts = {
  environment: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    playwright: '1.63.0',
    esbuild: '0.28.2',
  },
  loaderSha256: createHash('sha256')
    .update(await readFile(loader))
    .digest('hex'),
  wasmSha256: createHash('sha256').update(wasm).digest('hex'),
  date: new Date().toISOString(),
  engine: 'quickjs-emscripten@0.32.0',
  wasmBytes: wasm.length,
  browsers: [],
};
try {
  for (const [name, type] of [
    ['chromium', chromium],
    ['firefox', firefox],
  ]) {
    const browser = await type.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      const result = await page.evaluate(async () => {
        const bounded = (promise, ms = 15000) =>
          Promise.race([
            promise,
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('timeout')), ms),
            ),
          ]);
        const receive = (port) =>
          bounded(
            new Promise((resolve) => (port.onmessage = (event) => resolve(event.data))),
          );
        const result = {
          native: {
            Worker: typeof Worker,
            SharedWorker: typeof SharedWorker,
            AudioContext: typeof AudioContext,
            OfflineAudioContext: typeof OfflineAudioContext,
            structuredClone: typeof structuredClone,
          },
        };
        const native = new Worker(
          URL.createObjectURL(
            new Blob(
              ['onmessage = event => postMessage(event.data, [event.data.buffer])'],
              { type: 'text/javascript' },
            ),
          ),
        );
        let buffer = new Float32Array([3, 4]).buffer;
        let waiting = receive(native);
        native.postMessage({ buffer }, [buffer]);
        result.nativeTransfer = {
          senderDetached: buffer.byteLength === 0,
          received: Array.from(new Float32Array((await waiting).buffer)),
        };
        native.terminate();
        const worker = new Worker('/worker.js', { type: 'module' });
        buffer = new Float32Array([3, 4]).buffer;
        waiting = receive(worker);
        worker.postMessage({ buffer }, [buffer]);
        const first = await waiting;
        waiting = receive(worker);
        worker.postMessage({});
        const second = await waiting;
        result.worker = {
          senderDetached: buffer.byteLength === 0,
          first: {
            ...first,
            buffer: first.buffer ? Array.from(new Float32Array(first.buffer)) : null,
          },
          second,
        };
        worker.terminate();
        if (typeof SharedWorker === 'function') {
          try {
            const first = new SharedWorker('/worker.js', {
              type: 'module',
              name: 'persistent-context',
            });
            const second = new SharedWorker('/worker.js', {
              type: 'module',
              name: 'persistent-context',
            });
            let waiting = receive(first.port);
            first.port.postMessage({});
            const one = await waiting;
            waiting = receive(second.port);
            second.port.postMessage({});
            const two = await waiting;
            result.sharedWorker = { one, two };
            first.port.close();
            second.port.close();
          } catch (error) {
            result.sharedWorker = { error: String(error) };
          }
        } else result.sharedWorker = { unavailable: true };
        const child = document.createElement('iframe');
        const childReady = new Promise(
          (resolve) => (globalThis.contextChildReady = resolve),
        );
        globalThis.contextNested = () => child.contentWindow.childGuest('21');
        child.src = '/child';
        document.body.append(child);
        await bounded(childReady);
        result.child = {
          value: child.contentWindow.childGuest('callParent()'),
          identity: child.contentWindow.childGuest(
            'window === self && window === getWindow()',
          ),
          nativeIdentity: child.contentWindow === child.contentWindow,
          missingDOM: child.contentWindow.childGuest('typeof document'),
        };
        globalThis.contextNested = () => {
          throw new Error('parent failure');
        };
        result.child.error = child.contentWindow.childGuest(
          'try { callParent() } catch(error) { error.message }',
        );
        result.child.prototype = child.contentWindow.childGuest(
          'Object.getPrototypeOf(window).probe = 7; getWindow().probe',
        );
        child.remove();
        const audio = new OfflineAudioContext(1, 256, 48000);
        const sourceBuffer = audio.createBuffer(1, 256, 48000);
        const samples = new Float32Array(256).fill(0.125);
        sourceBuffer.copyToChannel(samples, 0);
        const copied = new Float32Array(256);
        sourceBuffer.copyFromChannel(copied, 0);
        const source = audio.createBufferSource();
        source.buffer = sourceBuffer;
        const analyser = audio.createAnalyser();
        analyser.fftSize = 32;
        source.connect(analyser);
        analyser.connect(audio.destination);
        source.start();
        const rendered = await audio.startRendering();
        const frequency = new Float32Array(analyser.frequencyBinCount);
        analyser.getFloatFrequencyData(frequency);
        result.audio = {
          copied: copied[0],
          rendered: rendered.getChannelData(0)[0],
          frames: rendered.length,
          frequencyBins: frequency.length,
          ended: source.playbackState ?? null,
        };
        result.guestAudio = await (await import('/main.js'), globalThis.contextAudio());
        const original = new Float32Array([9, 10]);
        const cyclic = { original };
        cyclic.self = cyclic;
        const cloned = structuredClone(cyclic);
        let functionError;
        try {
          structuredClone(() => 1);
        } catch (error) {
          functionError = error.name;
        }
        result.guestTransfer = await (await import('/transfer.js')).probeGuestTransfer();
        result.cloneControl = {
          typedArray: cloned.original instanceof Float32Array,
          cycle: cloned.self === cloned,
          separateBuffer: cloned.original.buffer !== original.buffer,
          functionError,
        };
        const module = await WebAssembly.compile(
          await (await fetch('/engine.wasm')).arrayBuffer(),
        );
        const nativeAudio = new OfflineAudioContext(1, 256, 48000);
        await nativeAudio.audioWorklet.addModule('/native-worklet.js');
        new AudioWorkletNode(nativeAudio, 'native-control').connect(
          nativeAudio.destination,
        );
        const nativeOutput = await nativeAudio.startRendering();
        result.nativeWorklet = {
          samples: [
            nativeOutput.getChannelData(0)[0],
            nativeOutput.getChannelData(0)[255],
          ],
        };
        result.worklets = [];
        for (const adapted of [false, true]) {
          try {
            const context = new OfflineAudioContext(1, 256, 48000);
            await context.audioWorklet.addModule(
              `/worklet${adapted ? '-adapted' : ''}.js`,
            );
            const node = new AudioWorkletNode(context, 'engine-probe', {
              processorOptions: { module },
            });
            node.connect(context.destination);
            const startup = await receive(node.port);
            if (!startup.ready) {
              result.worklets.push({ adapted, startup });
              continue;
            }
            buffer = new Float32Array([5]).buffer;
            waiting = receive(node.port);
            node.port.postMessage({ buffer }, [buffer]);
            const echo = await waiting;
            const detached = buffer.byteLength === 0;
            const output = await context.startRendering();
            result.worklets.push({
              adapted,
              startup,
              senderDetached: detached,
              echo: Array.from(new Float32Array(echo.echo)),
              frames: output.length,
              samples: [output.getChannelData(0)[0], output.getChannelData(0)[255]],
            });
          } catch (error) {
            result.worklets.push({ adapted, error: String(error) });
          }
        }
        return result;
      });
      assert.equal(result.guestTransfer.copyControl.sender.bufferLength, 4);
      if (!result.guestTransfer.unavailable) {
        assert.equal(result.guestTransfer.sender.bufferLength, 0);
        assert.equal(result.guestTransfer.sender.fullLength, 0);
        assert.equal(result.guestTransfer.sender.subarrayLength, 0);
        assert.equal(result.guestTransfer.sender.dataLength, 'TypeError');
        assert.deepEqual(result.guestTransfer.returned, [11, 22, 33, 44]);
        assert.equal(result.guestTransfer.nativeSenderDetached, true);
        assert.equal(result.guestTransfer.target.graph.sameBuffer, true);
        assert.deepEqual(result.guestTransfer.target.graph.subarray, [22, 33]);
      }
      assert.deepEqual(result.nativeWorklet.samples, [0.25, 0.25]);
      assert.equal(result.worker.first.count, 1);
      assert.equal(result.worker.second.count, 2);
      assert.deepEqual(result.worker.first.buffer, [4, 4]);
      assert.equal(result.worker.senderDetached, true);
      if (!result.sharedWorker.unavailable) {
        assert.equal(result.sharedWorker.one.count, 1);
        assert.equal(result.sharedWorker.two.count, 2);
      }
      assert.equal(result.child.value, 22);
      assert.equal(result.child.identity, true);
      assert.equal(result.child.error, 'parent failure');
      assert.equal(result.child.prototype, 7);
      assert.equal(result.guestAudio.guestToAudioSample, 0.125);
      assert.equal(result.guestAudio.analyserToGuestBins, 16);
      assert.match(result.worklets[0].startup.error, /TextDecoder/);
      assert.deepEqual(result.worklets[1].samples, [0.25, 0.25]);
      assert.deepEqual(result.worklets[1].echo, [7]);
      assert.equal(result.worklets[1].senderDetached, true);
      receipts.browsers.push({ name, version: browser.version(), ...result });
      console.log(JSON.stringify(receipts.browsers.at(-1)));
    } finally {
      await browser.close();
    }
  }
} finally {
  server.close();
  await writeFile(`${directory}receipts.json`, JSON.stringify(receipts, null, 2) + '\n');
}
