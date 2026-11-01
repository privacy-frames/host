import { SCRIPT_URL_CSP } from '../src/shared/script-url-policy.ts';
import assert from 'node:assert/strict';
import http from 'node:http';
import { build } from './build.ts';
import { chromium, firefox } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { launch } from './browser-profile.ts';
import { testProvenance } from './provenance.ts';

// Isolated target gate test: CSP intentionally permits native popups. These are
// not full-runtime no-network claims; the independent receiver measures this gate.
const bundle = await build({
  stdin: {
    contents: `import {prepareScriptURLs} from './src/runtime/enforcement/script-urls.ts';prepareScriptURLs();import {createPolicyTools} from './src/runtime/enforcement/native.ts';import {createTrustedPolicy} from './src/runtime/trusted/client.ts';
import {installDOMPolicy,installResourceAttributePolicy} from './src/runtime/enforcement/dom.ts';
import {prepareNavigationPolicy} from './src/runtime/enforcement/navigation.ts';
const tools=createPolicyTools();const get=Element.prototype.getAttribute;
installDOMPolicy(tools,get,createTrustedPolicy(location.href));installResourceAttributePolicy(tools,String);prepareNavigationPolicy()(tools);window.ready=true;`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
});
let origin = '';
const receipts: string[] = [];
const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', origin);
  res.setHeader('Cache-Control', 'no-store');
  if (url.pathname === '/escape') {
    receipts.push(url.searchParams.get('token') || '');
    res.end('<!doctype html><title>Independent native target receiver</title>');
  } else if (url.pathname === '/policy.js') {
    res.setHeader('Content-Type', 'text/javascript');
    res.end(bundle.outputFiles[0].text);
  } else {
    res.setHeader('Content-Type', 'text/html');
    res.setHeader(
      'Content-Security-Policy',
      'sandbox allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox; ' +
        (['/confined', '/foreign'].includes(url.pathname) ? SCRIPT_URL_CSP : ''),
    );
    res.end(
      `<!doctype html><body>${['/confined', '/foreign'].includes(url.pathname) ? (url.pathname === '/confined' ? '<iframe src="/foreign"></iframe>' : '') + '<script src="/policy.js"></script>' : '<script>window.ready=true</script>'}</body>`,
    );
  }
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
origin = `http://127.0.0.1:${address.port}`;
const results = [];
try {
  for (const engine of [chromium, firefox]) {
    const browser = await launch(engine);
    try {
      const context = await browser.newContext();
      const native = await context.newPage();
      await native.goto(origin + '/native');
      const nativePopup = context.waitForEvent('page');
      await native.evaluate((origin) => {
        const a = document.createElement('a');
        a.href = origin + '/escape?token=native-' + navigator.userAgent;
        a.target = '_blank';
        document.body.append(a);
        a.click();
      }, origin);
      const popup = await nativePopup;
      await popup.waitForLoadState();
      assert(receipts.some((value) => value.startsWith('native-')));
      await popup.close();
      await native.close();
      const page = await context.newPage();
      await page.goto(origin + '/confined');
      await page.waitForFunction(() => window.ready === true);
      await page.waitForFunction(() => frames[0]?.ready === true);
      const checks = await page.evaluate((origin) => {
        const rows: Record<string, unknown> = {};
        const a = document.createElement('a');
        a.target = '_blank';
        rows.idl = a.target;
        a.setAttributeNS(null, 'target', '_blank');
        rows.ns = a.target;
        const attr = document.createAttribute('target');
        attr.value = '_blank';
        a.setAttributeNode(attr);
        rows.attributeNode = a.target;
        attr.value = '_blank';
        rows.attributeValue = a.target;
        attr.nodeValue = '_blank';
        rows.attributeNodeValue = a.target;
        attr.textContent = '_blank';
        rows.attributeText = a.target;
        a.removeAttributeNode(attr);
        rows.removal = [a.target, attr.ownerElement === null];
        a.toggleAttribute('target', false);
        rows.toggle = a.target;
        const form = document.createElement('form');
        form.target = '_blank';
        rows.form = form.target;
        const button = document.createElement('button');
        button.formTarget = '_blank';
        rows.button = button.formTarget;
        const input = document.createElement('input');
        input.formTarget = '_blank';
        rows.input = input.formTarget;
        const area = document.createElement('area');
        area.target = '_blank';
        rows.area = area.target;
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        const link = document.createElementNS(svg.namespaceURI, 'a');
        const target = link.target;
        target.baseVal = '_blank';
        rows.svgTarget = target.baseVal;
        const image = document.createElementNS(svg.namespaceURI, 'image');
        image.href.baseVal = '#local-image';
        rows.svgHref = image.href.baseVal;
        const foreign = frames[0];
        const foreignLink = document.createElementNS(svg.namespaceURI, 'a');
        const foreignGet = foreign.Object.getOwnPropertyDescriptor(
          foreign.SVGAElement.prototype,
          'target',
        ).get;
        const foreignValue = foreignGet.call(foreignLink);
        const localSet = Object.getOwnPropertyDescriptor(
          SVGAnimatedString.prototype,
          'baseVal',
        ).set;
        try {
          localSet.call(foreignValue, '_blank');
          rows.unknownForeign = false;
        } catch {
          rows.unknownForeign = true;
        }
        const foreignSet = foreign.Object.getOwnPropertyDescriptor(
          foreign.SVGAnimatedString.prototype,
          'baseVal',
        ).set;
        foreignSet.call(foreignValue, '_blank');
        rows.foreignTarget = foreignValue.baseVal;
        try {
          link.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:show', 'new');
          rows.xlinkShow = false;
        } catch {
          rows.xlinkShow = true;
        }
        const animation = document.createElementNS(svg.namespaceURI, 'set');
        try {
          animation.setAttribute('attributeName', 'target');
          rows.animation = false;
        } catch {
          rows.animation = true;
        }
        try {
          document.body.innerHTML = '<a target="_blank">Bad parser route</a>';
          rows.parser = false;
        } catch {
          rows.parser = true;
        }
        try {
          a.attributes.removeNamedItem('target');
          rows.namedRemoval = false;
        } catch {
          rows.namedRemoval = true;
        }
        const host = document.createElement('div');
        const shadow = host.attachShadow({ mode: 'closed' });
        a.href = origin + '/escape?token=confined';
        a.addEventListener('click', (event) => event.stopImmediatePropagation());
        shadow.append(a);
        document.body.append(host);
        a.click();
        rows.shadowTarget = a.target;
        return rows;
      }, origin);
      for (const key of [
        'idl',
        'ns',
        'attributeNode',
        'attributeValue',
        'attributeNodeValue',
        'attributeText',
        'toggle',
        'form',
        'button',
        'input',
        'area',
        'svgTarget',
        'shadowTarget',
        'foreignTarget',
      ])
        assert.equal(checks[key], '_self', key);
      assert.deepEqual(checks.removal, ['_self', true]);
      assert.equal(checks.svgHref, '#local-image');
      for (const key of [
        'animation',
        'parser',
        'namedRemoval',
        'unknownForeign',
        'xlinkShow',
      ])
        assert.equal(checks[key], true, key);
      await page.waitForTimeout(250);
      assert.equal(context.pages().length, 1);
      assert.equal(receipts.filter((value) => value === 'confined').length, 0);
      results.push({
        browser: engine.name(),
        version: browser.version(),
        checks,
        independentNativeHTTP: receipts.filter((value) => value.startsWith('native-'))
          .length,
        confinedHTTP: 0,
        provenance: await testProvenance(import.meta.url),
      });
      await context.close();
    } finally {
      await browser.close();
    }
  }
  await mkdir('results/contexts', { recursive: true });
  await writeFile(
    'results/contexts/navigation-targets.json',
    JSON.stringify(results, null, 2) + '\n',
  );
  console.log('Native browsing target gate passed in Chromium and Firefox.');
} finally {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
