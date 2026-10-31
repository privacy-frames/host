import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTEXT_POLICY_VERSION } from '../src/shared/context-policy.ts';
import { sharedWorkerKey, parseSharedWorkerKey } from '../src/shared/shared-worker.ts';
import { publisherName, parsePublisherName } from '../src/runtime/publisher/protocol.ts';

const owner = { application: 'application', installationGeneration: 'generation' };
const source = {
  source: 'https://publisher.test/worker.js',
  type: 'classic',
  name: '',
} as const;

test('native namespaces require the current host policy and retain application names', () => {
  const shared = sharedWorkerKey(owner, source);
  assert.equal(sharedWorkerKey(owner, source), shared);
  const decoded = parseSharedWorkerKey(shared);
  assert(decoded);
  assert.equal(decoded.name, '');
  assert.equal(decoded.application, owner.application);
  assert.equal(decoded.installationGeneration, owner.installationGeneration);
  const publisher = publisherName(
    owner.application,
    owner.installationGeneration,
    'registration',
  );
  assert.deepEqual(parsePublisherName(publisher), [
    'application',
    'generation',
    'registration',
  ]);
  for (const version of [CONTEXT_POLICY_VERSION - 1, CONTEXT_POLICY_VERSION + 1]) {
    assert.equal(
      parseSharedWorkerKey(
        shared.replace('-policy-' + CONTEXT_POLICY_VERSION, '-policy-' + version),
      ),
      undefined,
    );
    assert.throws(
      () =>
        parsePublisherName(
          publisher.replace('-policy-' + CONTEXT_POLICY_VERSION, '-policy-' + version),
        ),
      /namespace/,
    );
  }
  assert.equal(
    parseSharedWorkerKey(
      'privacy-shared-v1:' +
        JSON.stringify([
          owner.application,
          owner.installationGeneration,
          source.source,
          source.type,
          source.name,
        ]),
    ),
    undefined,
  );
  assert.throws(
    () =>
      parsePublisherName(
        'privacy-publisher-v1:["application","generation","registration"]',
      ),
    /namespace/,
  );
});

test('native namespaces separate owners, generations, sources, types and logical names', () => {
  const key = sharedWorkerKey(owner, source);
  const different = [
    sharedWorkerKey({ ...owner, application: 'other' }, source),
    sharedWorkerKey({ ...owner, installationGeneration: 'other' }, source),
    sharedWorkerKey(owner, { ...source, source: source.source + '?other' }),
    sharedWorkerKey(owner, { ...source, type: 'module' }),
    sharedWorkerKey(owner, { ...source, name: 'other' }),
  ];
  assert.equal(new Set([key, ...different]).size, 6);
  const publisher = publisherName('application', 'generation', 'registration');
  assert.equal(
    new Set([
      publisher,
      publisherName('other', 'generation', 'registration'),
      publisherName('application', 'other', 'registration'),
      publisherName('application', 'generation', 'other'),
    ]).size,
    4,
  );
});
