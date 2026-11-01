import http from 'node:http';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { build } from './build.ts';
import { chromium, firefox } from 'playwright';
import { launch } from './browser-profile.ts';
import { testProvenance } from './provenance.ts';
import { prepareWorkletModule } from '../src/runtime/contexts/worklet-source.ts';
import { WORKLET_POLICY_VERSION } from '../src/runtime/contexts/worklet-types.ts';
import { response } from '../src/runtime/response-policy.ts';

const bundled = await build({
  entryPoints: ['src/runtime/contexts/worklet-guard.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  target: 'es2022',
  define: { 'process.env.NODE_ENV': '"production"' },
});
const guard = bundled.outputFiles[0].text;
const importsBundle = await build({
  entryPoints: ['src/runtime/contexts/worklet-imports.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  target: 'es2022',
});
const imports = importsBundle.outputFiles[0].text;
const bindingFixture = await build({
  entryPoints: ['test/fixtures/global-bindings/worklet.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  target: 'es2022',
});
const bindingChecks = bindingFixture.outputFiles[0].text;

let origin = '';
const requests: string[] = [];
const server = http.createServer(async (request, target) => {
  const path = (request.url || '/').split('?')[0];
  requests.push(path);
  const kind = path.includes('/paint/') ? 'paint' : 'audio';
  let result: Response;
  if (path.endsWith('/guard.js'))
    result = response(
      'const __privacyWorkletMetadata=' +
        JSON.stringify({
          version: WORKLET_POLICY_VERSION,
          id: 'b4e56663-dca9-4058-ac11-10a8d738677d',
          application: 'fixture',
          generation: 'fixture-generation',
          parentClient: 'native-owner',
          kind,
        }) +
        ';\n' +
        guard,
      'text/javascript',
    );
  else if (path.endsWith('/imports.js')) result = response(imports, 'text/javascript');
  else if (path.endsWith('/dependency.js'))
    result = response(
      prepareWorkletModule(
        bindingChecks +
          '\nglobalThis.dependencyPrepared=globalThis.dependencyPrototypeProtected===true;export const dependency=true;',
        {
          baseURL: origin + '/source/' + kind + '/dependency.js',
          logicalURL: 'https://publisher.test/' + kind + '/dependency.js',
          importsURL: origin + '/guarded/' + kind + '/imports.js',
          aliases: [],
        },
      ),
      'text/javascript',
    );
  else if (path.endsWith('/entry.js')) {
    const audio = `import './dependency.js';registerProcessor('guarded-probe',class extends AudioWorkletProcessor{constructor(){super();this.port.postMessage({type:'prepared',prepared:globalThis.dependencyPrototypeProtected===true,dependencyPrepared:globalThis.dependencyPrepared===true,bindingsSealed:globalThis.dependencyBindingsSealed===true,network:typeof fetch,storage:typeof indexedDB});import('/not-installed.js').then(()=>this.port.postMessage({type:'dynamic',outcome:'unexpected'})).catch(error=>this.port.postMessage({type:'dynamic',name:error.name,outcome:'rejected'}));}process(inputs,outputs){for(const output of outputs)for(const channel of output)channel.fill(0.25);return false;}});`;
    const paint = `import './dependency.js';registerPaint('guarded-probe',class{paint(ctx){ctx.fillStyle=globalThis.dependencyPrototypeProtected===true&&globalThis.dependencyPrepared===true&&globalThis.dependencyBindingsSealed===true?'#00ff00':'#ff0000';ctx.fillRect(0,0,8,8);}});`;
    result = response(
      'import ' +
        JSON.stringify(origin + '/guarded/' + kind + '/guard.js') +
        ';\n' +
        prepareWorkletModule(kind === 'audio' ? audio : paint, {
          baseURL: origin + '/source/' + kind + '/entry.js',
          logicalURL: 'https://publisher.test/' + kind + '/entry.js',
          importsURL: origin + '/guarded/' + kind + '/imports.js',
          aliases: [
            [
              origin + '/source/' + kind + '/dependency.js',
              origin + '/guarded/' + kind + '/dependency.js',
            ],
          ],
        }),
      'text/javascript',
    );
  } else
    result = response('<!doctype html><title>Worklet guard test</title>', 'text/html');
  target.writeHead(result.status, Object.fromEntries(result.headers));
  target.end(Buffer.from(await result.arrayBuffer()));
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string')
  throw new Error('Guard fixture server missing');
origin = `http://127.0.0.1:${address.port}`;
const evidence = {
  provenance: await testProvenance(import.meta.url),
  guardSHA256: createHash('sha256').update(guard).digest('hex'),
  scope:
    'Actual bundled synchronous Worklet guard, transformed static dependencies, native processor/paint behavior and default response CSP; controller authentication tested separately',
  browsers: [] as { name: string; version: string; audio: unknown; paint: unknown }[],
};
try {
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    const browser = await launch(engine);
    try {
      const page = await browser.newPage();
      await page.goto(origin + '/');
      const audio = await page.evaluate(async () => {
        const context = new OfflineAudioContext(1, 256, 44100);
        if (!context.audioWorklet) return { available: false };
        await context.audioWorklet.addModule('/guarded/audio/entry.js');
        const processor = new AudioWorkletNode(context, 'guarded-probe');
        const messages: Record<string, unknown>[] = [];
        const received = new Promise<void>((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error('Guarded native audio timeout')),
            5000,
          );
          processor.port.onmessage = (event) => {
            messages.push(event.data);
            if (messages.length === 2) {
              clearTimeout(timer);
              resolve();
            }
          };
        });
        processor.connect(context.destination);
        const output = await context.startRendering();
        await received;
        processor.port.close();
        return { available: true, sample: output.getChannelData(0)[0], messages };
      });
      assert.equal(audio.available, true);
      assert.equal(audio.sample, 0.25);
      assert.deepEqual(
        audio.messages!.find((item) => item.type === 'prepared'),
        {
          type: 'prepared',
          prepared: true,
          dependencyPrepared: true,
          bindingsSealed: true,
          network: 'undefined',
          storage: 'undefined',
        },
      );
      assert.deepEqual(
        audio.messages!.find((item) => item.type === 'dynamic'),
        { type: 'dynamic', name: 'TypeError', outcome: 'rejected' },
      );
      const paintAvailable = await page.evaluate(() => 'paintWorklet' in CSS);
      let paint: unknown = { available: false, reason: 'CSS.paintWorklet absent' };
      if (paintAvailable) {
        await page.evaluate(async () => {
          await Reflect.get(CSS, 'paintWorklet').addModule('/guarded/paint/entry.js');
          const node = document.createElement('div');
          node.id = 'paint';
          node.style.cssText =
            'width:8px;height:8px;background-image:paint(guarded-probe)';
          document.body.appendChild(node);
        });
        const image = await page.locator('#paint').screenshot();
        const pixel = await page.evaluate(
          async (bytes) => {
            const image = await createImageBitmap(
              new Blob([new Uint8Array(bytes)], { type: 'image/png' }),
            );
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 8;
            const context = canvas.getContext('2d')!;
            context.drawImage(image, 0, 0);
            return [...context.getImageData(4, 4, 1, 1).data];
          },
          [...image],
        );
        assert.deepEqual(pixel, [0, 255, 0, 255]);
        paint = { available: true, pixel };
      }
      evidence.browsers.push({ name, version: browser.version(), audio, paint });
      console.log(
        `${name}: production Worklet guard + native audio passed; paint ${paintAvailable ? 'passed' : 'unavailable'}`,
      );
    } finally {
      await browser.close();
    }
  }
  assert(!requests.includes('/not-installed.js'));
  await mkdir('results/contexts', { recursive: true });
  await writeFile(
    'results/contexts/worklet-guard.json',
    JSON.stringify({ ...evidence, requests }, null, 2) + '\n',
  );
} finally {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
