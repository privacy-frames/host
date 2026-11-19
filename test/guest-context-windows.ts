import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { chromium, firefox, type Download } from 'playwright';

const output = new URL('../.tools/guest-window-test/', import.meta.url);
await mkdir(output, { recursive: true });
await build({
  entryPoints: [new URL('./guest-context-windows.browser.ts', import.meta.url).pathname],
  outfile: new URL('browser.js', output).pathname,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
});
const wasm = await readFile(
  new URL('../vendor/quickjs/generated/engine.wasm', import.meta.url),
);
const bundle = await readFile(new URL('browser.js', output));
const server = createServer((request, response) => {
  const path = new URL(request.url || '/', 'http://localhost').pathname;
  response.setHeader(
    'Content-Type',
    path.endsWith('.wasm')
      ? 'application/wasm'
      : path.endsWith('.js')
        ? 'text/javascript'
        : 'text/html',
  );
  response.end(
    path === '/quickjs.wasm'
      ? wasm
      : path === '/browser.js'
        ? bundle
        : path.startsWith('/app/')
          ? ''
          : '<!doctype html><script type="module" src="/browser.js"></script>',
  );
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address === 'object');
const receipts = [];
try {
  for (const [name, type] of [
    ['chromium', chromium],
    ['firefox', firefox],
  ] as const) {
    const browser = await type.launch({ headless: true });
    try {
      const page = await browser.newPage();
      const requests: string[] = [];
      page.on('request', (request) => requests.push(request.url()));
      page.on('pageerror', (error) => console.error(name, error));
      page.on('console', (message) => {
        if (message.type() === 'error') console.error(name, message.text());
      });
      const approvals: { type: string; message: string; accepted: boolean }[] = [];
      page.on('dialog', async (dialog) => {
        const accepted = approvals.length > 0;
        approvals.push({ type: dialog.type(), message: dialog.message(), accepted });
        if (accepted) await dialog.accept();
        else await dialog.dismiss();
      });
      const downloaded: Download[] = [];
      page.on('download', (download) => downloaded.push(download));
      await page.goto(`http://127.0.0.1:${address.port}/`);
      await page.waitForFunction(
        () => globalThis.guestWindowResults !== undefined,
        undefined,
        { timeout: 30000 },
      );
      const observation = await page.evaluate(() => globalThis.guestWindowResults);
      receipts.push({
        browser: name,
        version: browser.version(),
        observation,
        requests,
        approvals,
        assertionFailure: undefined as string | undefined,
        nativeBlobNavigationControl: false,
        nativeNamespaceControl: undefined as
          { xlink: boolean; xmlBase: boolean } | undefined,
        nativeEditingControl: undefined as
          { inserted: boolean; parsed: string | undefined } | undefined,
        downloads: [] as { filename: string; bytes: string }[],
      });
      assert(observation && !observation.error, JSON.stringify(observation));
      const result = observation.result!;
      assert.deepEqual(result.finished, {
        value: 21,
        returned: false,
        cancelled: true,
        dynamicFlag: 1,
        attributeFlag: 1,
        evalFlag: 1,
        eventRealms: { script: true, dom: true },
        srcdoc: true,
      });
      assert.deepEqual(result.messages, {
        reply: { bytes: [10, 7], source: true, origin: true, trusted: true },
        port: true,
        detached: true,
      });
      assert.deepEqual(result.logicalOrigins, [
        {
          kind: 'origin-reply',
          id: 'explicit',
          count: 1,
          sender: 'https://fixture.invalid',
          target: 'https://other.fixture.invalid',
          origin: 'https://other.fixture.invalid',
          source: true,
        },
        {
          kind: 'origin-reply',
          id: 'wildcard',
          count: 2,
          sender: 'https://fixture.invalid',
          target: 'https://other.fixture.invalid',
          origin: 'https://other.fixture.invalid',
          source: true,
        },
      ]);
      assert.equal(result.logicalLoadCount, 1);
      assert.deepEqual(result.anchors, {
        stayedInDocument: true,
        nativeScriptAbsent: true,
      });
      assert.deepEqual(result.conversions, [
        { method: 'setAttribute', name: 1, value: 1 },
        { method: 'setAttributeNS', name: 1, value: 1 },
        ...[
          'removeAttribute',
          'removeAttributeNS',
          'toggleAttribute',
          'removeNamedItem',
          'removeNamedItemNS',
        ].map((method) => ({ method, name: 1 })),
      ]);
      assert.deepEqual(result.conversionDOM, [
        { method: 'setAttribute', href: null, label: true, spellcheck: null },
        { method: 'setAttributeNS', href: null, label: true, spellcheck: null },
        ...[
          'removeAttribute',
          'removeAttributeNS',
          'toggleAttribute',
          'removeNamedItem',
          'removeNamedItemNS',
        ].map((method) => ({ method, href: null, label: false, spellcheck: 'false' })),
      ]);
      assert.deepEqual(result.conversionBoundaries, {
        history: [
          { method: 'pushState', count: 1, path: '/app/history-pushState' },
          { method: 'replaceState', count: 1, path: '/app/history-replaceState' },
        ],
        instruction: { count: 1, target: 'local-note' },
      });
      assert.deepEqual(result.logicalAttributes, {
        removed: true,
        added: true,
        empty: true,
        toggled: false,
        absent: true,
        removedNS: true,
      });
      assert.deepEqual(
        result.namespaceDOM,
        ['setAttributeNS', 'setAttributeNodeNS', 'setNamedItemNS'].map((method) => ({
          method,
          localTarget: true,
        })),
      );
      assert.equal(result.namespaceBaseLocal, true);
      const editing = result.editing as {
        local: { inserted: boolean; formatted: boolean; text: string; markup: string };
        denied: Record<string, string>;
        block: {
          calls: number;
          result: boolean;
          paragraph: boolean;
          frame: boolean;
          text: string;
        };
        converted: { calls: number; valueCalls: number; text: string; parsed: boolean };
      };
      assert.equal(editing.local.inserted, true);
      assert.equal(editing.local.formatted, true);
      assert.equal(editing.local.text, 'Local editing');
      assert.match(editing.local.markup, /<(?:b|strong)\b|font-weight/i);
      assert.deepEqual(
        editing.denied,
        Object.fromEntries(
          ['insertHTML', 'createLink', 'insertImage', 'copy', 'cut', 'paste'].map(
            (command) => [command, 'SecurityError'],
          ),
        ),
      );
      assert.deepEqual(editing.converted, {
        calls: 1,
        valueCalls: 1,
        text: '<span id="converted-command-node">Literal text</span>',
        parsed: false,
      });
      assert.deepEqual(editing.block, {
        calls: 1,
        result: true,
        paragraph: true,
        frame: false,
        text: 'Block formatting',
      });
      assert.deepEqual(
        result.modifierTargets,
        ['html', 'svg'].flatMap((kind) =>
          ['ctrl', 'shift'].map((modifier) => ({
            kind,
            modifier,
            physicalTarget: '_self',
            physicalHref: null,
            xlinkHref: null,
          })),
        ),
      );
      await page.waitForTimeout(100);
      assert.deepEqual(
        page
          .context()
          .pages()
          .filter((candidate) => candidate !== page && !candidate.isClosed())
          .map((candidate) => candidate.url()),
        [],
        'Synthetic modifier click created an unprepared native context',
      );
      assert.equal(result.guestConfirmationUnavailable, true);
      assert.deepEqual(
        approvals.map((approval) => ({
          type: approval.type,
          accepted: approval.accepted,
        })),
        [
          { type: 'confirm', accepted: false },
          { type: 'confirm', accepted: true },
          { type: 'confirm', accepted: true },
        ],
      );
      assert.deepEqual(result.detached, { click: true, cancelled: true, dispatch: true });
      for (let attempt = 0; downloaded.length < 2 && attempt < 30; attempt++)
        await page.waitForTimeout(100);
      assert.equal(
        downloaded.length,
        2,
        'Connected/detached local downloads did not both start',
      );
      for (const download of downloaded) {
        const path = await download.path();
        assert(path);
        const bytes = await readFile(path, 'utf8');
        const expected =
          download.suggestedFilename() === 'guest-download.txt'
            ? 'unchanged guest download bytes'
            : 'unchanged detached download bytes';
        assert.equal(bytes, expected);
        receipts
          .at(-1)!
          .downloads.push({ filename: download.suggestedFilename(), bytes });
      }
      assert.deepEqual(
        receipts
          .at(-1)!
          .downloads.map((download) => download.filename)
          .sort(),
        ['guest-detached-download.txt', 'guest-download.txt'],
      );
      assert.deepEqual(result.receiverRealm, { event: true, buffer: true, port: true });
      assert.equal(result.pendingWindow, true);
      assert.deepEqual(result.nativeTrust, [false]);
      assert.deepEqual(result.removed, { hidden: true, callbackClosed: true });
      assert.deepEqual(result.brands, {
        node: true,
        element: true,
        document: true,
        frame: true,
        template: true,
        attr: true,
        blob: true,
        window: true,
        port: true,
        audio: true,
        cache: true,
        fakeNode: false,
        fakeElement: false,
      });
      assert.deepEqual(result.nativeMarkers, {
        dynamic: true,
        attribute: true,
        eval: true,
      });
      assert.deepEqual(result.popup, {
        guest: 7,
        syntheticPagehideSurvives: true,
        native: true,
        trustedURL: true,
        nativeContent: 'popup',
      });
      assert(requests.every((url) => new URL(url).hostname === '127.0.0.1'));
      const control = await browser.newPage();
      await control.goto(`http://127.0.0.1:${address.port}/app/native-control.html`);
      const nativeEditing = await control.evaluate(() => {
        const editor = document.createElement('div');
        editor.contentEditable = 'true';
        document.body.append(editor);
        editor.focus();
        const range = document.createRange();
        range.selectNodeContents(editor);
        const selection = getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
        const inserted = document.execCommand(
          'insertHTML',
          false,
          '<mark id="native-command-node">Native HTML</mark>',
        );
        return {
          inserted,
          parsed: editor.querySelector('#native-command-node')?.textContent,
        };
      });
      assert.deepEqual(nativeEditing, { inserted: true, parsed: 'Native HTML' });
      receipts.at(-1)!.nativeEditingControl = nativeEditing;
      const nativeNamespace = await control.evaluate(() => {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        const anchor = document.createElementNS('http://www.w3.org/2000/svg', 'a');
        const destination = new URL('/namespace-control/', location.href).href;
        anchor.setAttributeNS('http://www.w3.org/1999/xlink', 'alias:href', destination);
        svg.append(anchor);
        document.body.append(svg);
        let xmlBase = false;
        try {
          svg.setAttributeNS(
            'http://www.w3.org/XML/1998/namespace',
            'alias:base',
            destination,
          );
          xmlBase = svg.baseURI === destination;
        } catch {}
        return { xlink: anchor.href.baseVal === destination, xmlBase };
      });
      assert.equal(
        nativeNamespace.xlink,
        true,
        'Native arbitrary-prefix XLink control is inactive',
      );
      receipts.at(-1)!.nativeNamespaceControl = nativeNamespace;
      await Promise.all([
        control.waitForNavigation(),
        control.evaluate(() => {
          const anchor = document.createElement('a');
          anchor.href = URL.createObjectURL(
            new Blob(['<script>globalThis.anchorNativeControl=1</script>'], {
              type: 'text/html',
            }),
          );
          document.body.append(anchor);
          anchor.dispatchEvent(
            new MouseEvent('click', { bubbles: true, cancelable: false }),
          );
        }),
      ]);
      assert.equal(
        await control.evaluate(() => Reflect.get(window, 'anchorNativeControl')),
        1,
      );
      receipts.at(-1)!.nativeBlobNavigationControl = true;
      await control.close();
    } catch (error) {
      const receipt = receipts.at(-1);
      if (receipt?.browser === name)
        receipt.assertionFailure = error instanceof Error ? error.stack : String(error);
      throw error;
    } finally {
      if (receipts.at(-1)?.browser === name) console.log(JSON.stringify(receipts.at(-1)));
      await browser.close();
    }
  }
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await writeFile(
    new URL('../results/guest-context-windows.json', import.meta.url),
    JSON.stringify(receipts, null, 2) + '\n',
  );
}
