import assert from 'node:assert/strict';
import type { Page } from 'playwright';

const immediateContexts = new Set([
  'createElement iframe',
  'createElementNS iframe',
  'innerHTML iframe',
  'insertAdjacentHTML iframe',
  'outerHTML iframe',
  'template parser',
  'Shadow DOM parser',
  'Range parser',
  'DOMParser import',
]);
const permitted = new Set([
  'document creation',
  'Audio worklet',
  'SharedWorker',
  'window.open',
  'history identity spoof',
  'history replace spoof',
  'SVG parser mismatch',
  'setHTMLUnsafe',
  'eval',
  'Function constructor',
  'Existing script property mutation',
]);
const prohibited = new Set([
  'document.write',
  'Uninstalled Worker',
  'WebSocket',
  'WebRTC',
  'service worker authority',
  'Native storage prototype recovery',
  'Storage access handle',
  'Remote speech service',
  'Media artwork URL',
  'document execCommand',
  'history traversal',
  'custom built-in',
  'prototype tampering',
]);

/** Check each operation's policy rather than treating every available API as an escape. */
export async function checkBoundaryProbes(page: Page) {
  const names: string[] = await page.evaluate(() => Object.keys(window.boundaryProbes));
  const observations = [];
  for (const name of names) {
    assert(
      immediateContexts.has(name) || permitted.has(name) || prohibited.has(name),
      'Unclassified boundary probe: ' + name,
    );
    const observation = await page.evaluate(async (name) => {
      const before = location.href;
      const state = history.state;
      const indexedSafe = () => {
        for (let index = 0; index < window.length; index++)
          if (window[index]?.privacyHost?.mode !== 'network-isolated') return false;
        return true;
      };
      try {
        const value = await window.boundaryProbes[name]();
        let safe = true;
        let detail = 'available';
        if (name === 'document creation') {
          safe = value instanceof Document && value.defaultView === null;
          detail = safe ? 'viewless document' : 'document has a browsing context';
        } else if (name === 'eval' || name === 'Function constructor') {
          safe = value === 2 && window.privacyHost?.mode === 'network-isolated';
          detail = 'local computation returned ' + String(value);
        } else if (name === 'Audio worklet') {
          safe = value === true;
          detail = 'admitted worklet module loaded';
        } else if (name === 'SharedWorker') {
          safe =
            value instanceof SharedWorker &&
            value.port instanceof MessagePort &&
            value.constructor === SharedWorker;
          value.onerror = (event: Event) => event.preventDefault();
          value.port.close();
          detail = 'mediated SharedWorker handle and application port';
        } else if (name === 'Existing script property mutation') {
          const script = document.querySelector('script')!;
          const physical = new URL(script.getAttribute('src')!, location.href);
          safe = physical.origin === location.origin && physical.protocol === 'blob:';
          // A previously executed script does not fetch again when src changes.
          // Insert a fresh element too, so this checks an actual load attempt.
          const fresh = document.createElement('script');
          fresh.src = script.src + '&fresh=' + crypto.randomUUID();
          const outcome = await new Promise<string>((resolve) => {
            const timeout = setTimeout(() => resolve('timeout'), 10000);
            fresh.onload = () => {
              clearTimeout(timeout);
              resolve('load');
            };
            fresh.onerror = () => {
              clearTimeout(timeout);
              resolve('error');
            };
            document.body.append(fresh);
          });
          const freshPhysical = new URL(fresh.getAttribute('src')!, location.href);
          safe &&=
            outcome === 'error' &&
            freshPhysical.origin === location.origin &&
            freshPhysical.protocol === 'blob:' &&
            Reflect.get(window, '__boundaryExternalScriptExecuted') !== true;
          fresh.remove();
          detail =
            'uninstalled script mapped locally and fresh load ended with ' + outcome;
        } else if (name === 'window.open') {
          safe =
            value === null ||
            value.document === null ||
            value.privacyHost?.mode === 'network-isolated';
          if (value) value.close();
          detail = value === null ? 'browser refused popup' : 'pending or prepared popup';
        } else if (
          name === 'history identity spoof' ||
          name === 'history replace spoof'
        ) {
          const root = new URL('./', before);
          const current = new URL(location.href);
          safe =
            current.origin === root.origin && current.pathname.startsWith(root.pathname);
          detail = location.href;
          history.replaceState(state, '', before);
        }
        const views = [];
        for (const element of document.querySelectorAll('iframe,object')) {
          const view =
            element instanceof HTMLIFrameElement
              ? element.contentWindow
              : element instanceof HTMLObjectElement
                ? element.contentDocument?.defaultView
                : null;
          views.push(view ? view.privacyHost?.mode === 'network-isolated' : true);
        }
        return {
          name,
          blocked: false,
          pending: value === false,
          safe: safe && views.every(Boolean),
          detail,
          value: typeof value,
          contexts: window.length,
          indexedSafe: indexedSafe(),
        };
      } catch (error) {
        return {
          name,
          blocked: true,
          pending: false,
          safe: true,
          error: error instanceof Error ? error.name : String(error),
          contexts: window.length,
          indexedSafe: indexedSafe(),
        };
      }
    }, name);
    observations.push(observation);
    assert(observation.safe, name + ': ' + observation.detail);
    if (prohibited.has(name)) assert(observation.blocked, name + ' must remain denied');
    if (immediateContexts.has(name))
      assert(
        observation.blocked || observation.pending,
        name + ' exposed an immediate context reference',
      );
    if (
      [
        'document creation',
        'Audio worklet',
        'SharedWorker',
        'eval',
        'Function constructor',
      ].includes(name)
    )
      assert(!observation.blocked, name + ' should be available: ' + observation.error);
    assert(observation.indexedSafe, name + ': unprepared indexed context exposed');
  }
  return observations;
}

export async function checkBoundaryProbeUI(page: Page) {
  const before = new URL('./', page.url());
  await page.locator('#run').click();
  await page.waitForFunction(
    () =>
      document.querySelectorAll('#results tr').length ===
      Object.keys(window.boundaryProbes).length,
  );
  const rows = await page.locator('#results tr').evaluateAll((elements) =>
    elements.map((row) => ({
      name: row.children[0]?.textContent || '',
      status: row.children[1]?.textContent || '',
    })),
  );
  for (const row of rows) {
    assert(
      immediateContexts.has(row.name) ||
        permitted.has(row.name) ||
        prohibited.has(row.name),
      'Unclassified UI probe: ' + row.name,
    );
    if (prohibited.has(row.name) || immediateContexts.has(row.name))
      assert.match(row.status, /^Blocked:/, row.name);
    else if (
      [
        'document creation',
        'Audio worklet',
        'SharedWorker',
        'eval',
        'Function constructor',
      ].includes(row.name)
    )
      assert.equal(row.status, 'Allowed / available', row.name);
    else
      assert.match(
        row.status,
        /^(Allowed \/ available|Browser refused|Blocked:)/,
        row.name,
      );
  }
  const after = new URL(page.url());
  assert.equal(after.origin, before.origin);
  assert(
    after.pathname.startsWith(before.pathname),
    'UI history probes escaped their application namespace',
  );
  assert(
    await page.evaluate(() => {
      for (let index = 0; index < window.length; index++)
        if (window[index]?.privacyHost?.mode !== 'network-isolated') return false;
      return true;
    }),
    'UI probe exposed an unprepared indexed context',
  );
  return rows;
}
