import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Page } from 'playwright';

async function events(manager: Page): Promise<unknown[]> {
  const frame = manager.frames().find((frame) => frame.url().endsWith('/connect.html'));
  assert(frame, 'Trusted manager connection missing');
  const reply: unknown = await frame.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const channel = new MessageChannel();
        const timer = setTimeout(() => reject(new Error('Event query timed out')), 5000);
        channel.port1.onmessage = (event) => {
          clearTimeout(timer);
          channel.port1.close();
          resolve(event.data);
        };
        if (!navigator.serviceWorker.controller)
          throw new Error('Manager controller missing');
        navigator.serviceWorker.controller.postMessage({ operation: 'events' }, [
          channel.port2,
        ]);
      }),
  );
  assert(
    reply &&
      typeof reply === 'object' &&
      'ok' in reply &&
      reply.ok === true &&
      'value' in reply &&
      Array.isArray(reply.value),
    'Manager event query refused',
  );
  return reply.value;
}
function markerPresent(entries: unknown[], marker: string) {
  return entries.some(
    (entry) =>
      entry && typeof entry === 'object' && 'url' in entry && entry.url === marker,
  );
}
async function wait(page: Page, condition: () => boolean, label: string) {
  const deadline = Date.now() + 10000;
  while (!condition()) {
    assert(Date.now() < deadline, label);
    await page.waitForTimeout(50);
  }
}

/** Test-only CDP control; the production worker and message paths are unchanged. */
export async function checkResourceRestart(
  manager: Page,
  page: Page,
  publisher: string,
  runtimeTraffic: readonly object[],
  publisherTraffic: readonly object[],
) {
  const session = await page.context().newCDPSession(page);
  const versions = new Map<string, string>();
  const transitions: Array<{ id: string; status: string }> = [];
  session.on('ServiceWorker.workerVersionUpdated', (event) => {
    for (const version of event.versions)
      if (version.scriptURL === 'http://127.0.0.1:4211/runtime/sw.js') {
        versions.set(version.versionId, version.runningStatus);
        transitions.push({ id: version.versionId, status: version.runningStatus });
      }
  });
  try {
    await session.send('ServiceWorker.enable');
    await wait(
      page,
      () => [...versions.values()].includes('running'),
      'Running controller missing',
    );
    const selected = [...versions].find(([, status]) => status === 'running');
    assert(selected);
    const start = runtimeTraffic.length;
    const publisherStart = publisherTraffic.length;
    const marker = publisher + '/restart-witness-' + randomUUID();
    assert(
      await page.evaluate(async (url) => {
        try {
          await fetch(url);
          return false;
        } catch {
          return true;
        }
      }, marker),
      'Unknown resource was not refused',
    );
    const before = await events(manager);
    assert(markerPresent(before, marker));
    assert(before.length < 300, 'Witness could be evicted from bounded event history');
    await session.send('ServiceWorker.stopWorker', { versionId: selected[0] });
    await wait(
      page,
      () => versions.get(selected[0]) === 'stopped',
      'Controller did not stop',
    );
    await page.locator('#result').evaluate((node) => {
      node.textContent = '';
    });
    await page.locator('#run').click();
    await page.locator('#result').filter({ hasText: '"sum"' }).waitFor();
    const result = await page.locator('#result').textContent();
    assert(result);
    const value: unknown = JSON.parse(result);
    assert(value && typeof value === 'object' && 'sum' in value && value.sum === 42);
    await wait(
      page,
      () => versions.get(selected[0]) === 'running',
      'Resource read did not awaken controller',
    );
    const after = await events(manager);
    assert(after.length < 300, 'Witness loss could be event-history eviction');
    assert(!markerPresent(after, marker), 'Controller global retained pre-stop state');
    await page.waitForTimeout(3000);
    const runtime = runtimeTraffic.slice(start),
      remote = publisherTraffic.slice(publisherStart);
    assert.deepEqual(runtime, []);
    assert.deepEqual(remote, []);
    return {
      versionId: selected[0],
      transitions,
      witness: marker,
      beforeEntries: before.length,
      afterEntries: after.length,
      witnessBefore: true,
      witnessAfter: false,
      result,
      observationMilliseconds: 3000,
      runtime,
      publisherTraffic: remote,
      witnessContract:
        'Production event history is a module-local array, initialized empty and modified only by append and a 300-entry cap. Histories below the cap exclude eviction as the cause of witness loss.',
    };
  } finally {
    await session.detach();
  }
}
