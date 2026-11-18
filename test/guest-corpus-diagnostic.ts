import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile, mkdir } from 'node:fs/promises';

const output = '.tools/guest-corpus-diagnostic/guard.js';
await mkdir('.tools/guest-corpus-diagnostic', { recursive: true });

// Diagnostic host instrumentation only. Application resources remain unchanged.
await build({
  entryPoints: ['src/guest/window.ts'],
  outfile: output,
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  define: { __BUILD_ID__: JSON.stringify('corpus-diagnostic') },
  plugins: [
    {
      name: 'trusted-guest-diagnostics',
      setup(build) {
        build.onLoad({ filter: /\/src\/guest\/window\.ts$/ }, async ({ path }) => {
          const source = await readFile(path, 'utf8');
          const marker = 'const session = await createGuestWindow(data, window);';
          assert.equal(source.split(marker).length, 2);
          const instrumentation = `
          Reflect.set(window, '__guestDiagnosticEval', () => session.engine.evaluate(\`
            JSON.stringify((() => {
              const selectors = ['#operations', '#recipe', '#IO'];
              const values = Array.from(selectors);
              return {
                fromType: typeof Array.from,
                fromSource: String(Array.from).slice(0,300),
                arrayDirect: selectors,
                arrayFrom: values,
                fromEntries: [0,1,2].map(index => ({type:typeof values[index], value:values[index]})),
                queries: selectors.map(selector => ({selector, found:!!document.querySelector(selector), id:document.querySelector(selector)?.id})),
                documentIdentity: window.document === document,
                stages: [
                  ['splitter', () => window.app.initialiseSplitter()],
                  ['storage', () => window.app.loadLocalStorage()],
                  ['color', () => window.app.manager.options.applyPreferredColorScheme()],
                  ['operations', () => window.app.populateOperationsList()],
                  ['manager', () => window.app.manager.setup()],
                  ['bombe', () => window.app.manager.output.saveBombe()],
                  ['sizes', () => window.app.adjustComponentSizes()],
                  ['compile', () => window.app.setCompileMessage()],
                ].map(([name, invoke]) => { try { invoke(); return {name, passed:true}; } catch(error) { return {name, error:error.stack}; } }),
                appLoaded: window.app?.appLoaded,
                workerLoaded: window.app?.workerLoaded,
                waitersLoaded: window.app?.waitersLoaded,
              };
            })())
          \`));
        `;
          return {
            contents: source.replace(marker, marker + instrumentation),
            loader: 'ts',
          };
        });
      },
    },
  ],
});
console.log(output);
