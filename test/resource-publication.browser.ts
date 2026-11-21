import { admitInstallation } from '../src/runtime/admission.ts';
import { getApp, putApp, deleteApp, getResource } from '../src/runtime/storage.ts';
import { createGuestCatalog } from '../src/guest/catalog.ts';
import { digest, safePath } from '../src/shared/policy.ts';
import type { PreparedInstallation } from '../src/shared/types.ts';

async function installation(name: string): Promise<PreparedInstallation> {
  const source = `https://publisher.test/${name}/`;
  const paths = ['index.html', '\uffffsuffix'];
  const resources = await Promise.all(
    paths.map(async (path) => {
      const bytes = new TextEncoder().encode(name + ':' + path).buffer;
      return {
        path,
        url: new URL(path, source).href,
        bytes,
        sha256: await digest(bytes),
        contentType: path.endsWith('.html') ? 'text/html' : 'text/plain',
      };
    }),
  );
  return admitInstallation(
    {
      format: 'offline-resources-v1',
      id: name + '-' + (await digest(new TextEncoder().encode(source))),
      source,
      manifest: { id: name, name, entry: 'index.html' },
      resources,
      capture: { additionalResources: [], unavailableResources: [] },
    },
    new URL('https://runtime.test/'),
  );
}
async function body(id: string, path: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const opened = indexedDB.open('privacy-frames-resources', 1);
    opened.onerror = () => reject(opened.error);
    opened.onsuccess = () => {
      const database = opened.result;
      const transaction = database.transaction('resources', 'readonly');
      const request = transaction.objectStore('resources').get([id, path]);
      transaction.oncomplete = () => {
        database.close();
        resolve(request.result);
      };
      transaction.onabort = () => {
        database.close();
        reject(transaction.error);
      };
    };
  });
}
const rejects = async (action: () => Promise<unknown>) => {
  try {
    await action();
    return false;
  } catch {
    return true;
  }
};

export async function runResourcePublication() {
  const app = await installation('primary');
  const unrelated = await installation('other');
  const unicode = '\uffffsuffix';
  const checks: Record<string, boolean> = {};
  checks.literalPathAdmitted = safePath(unicode) === unicode;
  try {
    safePath('%EF%BF%BFsuffix');
    checks.encodedPathRefused = false;
  } catch {
    checks.encodedPathRefused = true;
  }
  checks.nativeRange =
    indexedDB.cmp([app.id, unicode], [app.id, []]) < 0 &&
    !IDBKeyRange.bound([app.id, ''], [app.id, '\uffff']).includes([app.id, unicode]) &&
    IDBKeyRange.bound([app.id, ''], [app.id, []], false, true).includes([
      app.id,
      unicode,
    ]);
  await putApp(app);
  await putApp(unrelated);
  const stored = await getApp(app.id);
  if (!stored) throw new Error('Missing stored installation');
  checks.metadataOmitsBodies = stored.resources.every(
    (item) => !Object.hasOwn(item, 'bytes'),
  );
  const captured = await getResource(app.id, unicode, stored.generation);
  const catalog = await createGuestCatalog(
    stored,
    new URL('https://runtime.test/'),
    new ArrayBuffer(0),
    {
      dedicated: new ArrayBuffer(0),
      shared: new ArrayBuffer(0),
      worklet: new ArrayBuffer(0),
    },
  );
  checks.catalogGeneration =
    catalog.generation === stored.generation &&
    catalog.resources.length === 2 &&
    new TextDecoder().decode(catalog.resources[1].bytes) === 'primary:' + unicode;
  await putApp(
    await admitInstallation(
      {
        ...app,
        resources: app.resources.filter((item) => item.path !== unicode),
      },
      new URL('https://runtime.test/'),
    ),
  );
  const replaced = await getApp(app.id);
  if (!replaced) throw new Error('Missing replacement');
  checks.freshGeneration = replaced.generation !== stored.generation;
  checks.cleanupReplace = (await body(app.id, unicode)) === undefined;
  checks.staleGenerationRefused = await rejects(() =>
    getResource(app.id, 'index.html', stored.generation),
  );
  checks.missingBodyRefused = await rejects(() =>
    getResource(app.id, 'missing', replaced.generation),
  );
  checks.removedBodyRefused = await rejects(() =>
    getResource(app.id, unicode, replaced.generation),
  );
  await putApp(app);
  await deleteApp(app.id);
  checks.cleanupRemove =
    (await body(app.id, unicode)) === undefined &&
    (await body(app.id, 'index.html')) === undefined &&
    (await getApp(app.id)) === undefined;
  checks.capturedBytesRemainLocal =
    new TextDecoder().decode(captured) === 'primary:' + unicode &&
    new TextDecoder().decode(catalog.resources[1].bytes) === 'primary:' + unicode;
  const other = await getApp(unrelated.id);
  checks.unrelatedRetained =
    !!other &&
    new TextDecoder().decode(await getResource(other.id, unicode, other.generation)) ===
      'other:' + unicode;
  return checks;
}
Object.assign(globalThis, { runResourcePublication });
