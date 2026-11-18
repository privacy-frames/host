import assert from 'node:assert/strict';
import test from 'node:test';
import type { RuntimeInterfaceDefinition } from '../src/guest/interface-definitions.ts';
import { runtimeInterfaceProjection } from '../scripts/guest-bindings.ts';
import {
  browserBindings,
  exposedInterfaces as fullExposedInterfaces,
  globalInterfaceDefinitions as fullGlobalInterfaceDefinitions,
} from '../src/guest/interfaces.ts';
import {
  runtimeInterfaces,
  exposedInterfaces,
  globalInterfaceDefinitions,
} from '../src/guest/runtime-interfaces.ts';

test('runtime projection is generated from the complete pinned corpus', () => {
  assert.deepEqual(
    runtimeInterfaces,
    runtimeInterfaceProjection(browserBindings.interfaces),
  );
  assert.equal(runtimeInterfaces.length, browserBindings.interfaces.length);
  for (let index = 0; index < runtimeInterfaces.length; index++) {
    const compact: RuntimeInterfaceDefinition = runtimeInterfaces[index];
    const full = browserBindings.interfaces[index];
    assert.equal(compact.name, full.name);
    assert.equal(compact.parent, full.parent);
    assert.equal(compact.constructable, full.constructorArguments !== null);
    assert(!Object.hasOwn(compact, 'sources'));
    assert(!Object.hasOwn(compact, 'constructorArguments'));
  }
});

test('runtime exposure queries preserve interface provisioning in each context', () => {
  for (const globals of [
    ['Window'],
    ['Worker', 'DedicatedWorker'],
    ['Worker', 'SharedWorker'],
    ['AudioWorklet'],
  ]) {
    assert.deepEqual(
      exposedInterfaces(globals).map((definition) => definition.name),
      fullExposedInterfaces(globals).map((definition) => definition.name),
    );
    assert.deepEqual(
      globalInterfaceDefinitions(globals).map((definition) => ({
        name: definition.name,
        members: definition.members.map((member) => [member.name, member.kind]),
      })),
      fullGlobalInterfaceDefinitions(globals).map((definition) => ({
        name: definition.name,
        members: definition.members.map((member) => [member.name, member.kind]),
      })),
    );
  }
});

test('only global provisioning members are present in runtime data', () => {
  const element = runtimeInterfaces.find((definition) => definition.name === 'Element');
  assert(element);
  assert.deepEqual(element.members, []);
  const window = runtimeInterfaces.find((definition) => definition.name === 'Window');
  assert(window?.members.some((member) => member.name === 'onload'));
  for (const definition of runtimeInterfaces) {
    if (!definition.global.length) assert.equal(definition.members.length, 0);
    for (const member of definition.members) {
      for (const field of [
        'arguments',
        'requiredArguments',
        'type',
        'owner',
        'value',
        'types',
      ])
        assert(!Object.hasOwn(member, field), field);
    }
  }
});

test('runtime metadata still does not grant native effect authority', () => {
  assert(
    exposedInterfaces(['Window']).some((definition) => definition.name === 'WebSocket'),
  );
  assert(
    exposedInterfaces(['Window']).some(
      (definition) => definition.name === 'XSLTProcessor',
    ),
  );
});
