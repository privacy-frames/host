import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applicationHistoryURL,
  isApplicationRoute,
} from '../src/shared/application-navigation.ts';

const entry = 'https://runtime.test/runtime/abcdefghijk/example/';
const source = 'https://publisher.test/tools/app/index.html';

test('publisher history routes map inside the installed application namespace', () => {
  for (const input of ['editor', '/editor', 'https://publisher.test/editor'])
    assert.equal(applicationHistoryURL(input, entry, entry, source), entry + 'editor');
  assert.equal(
    applicationHistoryURL(
      'https://publisher.test/tools/app/editor?size=2#image',
      entry,
      entry,
      source,
    ),
    entry + 'editor?size=2#image',
  );
  assert.equal(
    applicationHistoryURL('?size=3#result', entry + 'editor?size=2', entry, source),
    entry + 'editor?size=3#result',
  );
  assert.equal(applicationHistoryURL('#result', entry, entry, source), entry + '#result');
  assert.equal(
    applicationHistoryURL(entry + 'editor', entry, entry, source),
    entry + 'editor',
  );
  assert.equal(
    applicationHistoryURL('/runtime/abcdefghijk/example/editor', entry, entry, source),
    entry + 'editor',
  );
  assert.equal(
    applicationHistoryURL(
      'https://runtime.test/tools/app/editor?image=1',
      entry,
      entry,
      source,
    ),
    entry + 'editor?image=1',
  );
});

test('history mapping and browser identity reject foreign and internal addresses', () => {
  for (const target of [
    'https://foreign.test/editor',
    'https://runtime.test/runtime/connect.html',
    'https://runtime.test/runtime/anotherapp1/example/',
    entry + '__contexts/worker.js',
    entry + 'nested/__contexts/worker.js',
    entry + '%5f%5fcontexts/worker.js',
    entry + '%2f..%2fconnect.html',
    entry + '../outside/',
  ]) {
    assert.equal(isApplicationRoute(target, entry), false, target);
    assert.equal(applicationHistoryURL(target, entry, entry, source), undefined, target);
  }
  assert.equal(isApplicationRoute(entry + 'editor?image=1#view', entry), true);
  assert.equal(isApplicationRoute(entry + '?host-content=1', entry), true);
  assert.equal(isApplicationRoute('not a URL', entry), false);
});
