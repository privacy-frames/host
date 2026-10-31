export type Invariant = 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6' | 'C7' | 'C8';

export interface Boundary {
  id: string;
  obligation: string;
  invariants: readonly Invariant[];
  sources: readonly string[];
}

/** Review entry points; this list does not establish complete browser coverage. */
export const boundaries: readonly Boundary[] = [
  {
    id: 'root-publication',
    obligation: 'Prepare the root before rendering or executing publisher content.',
    invariants: ['C1', 'C3', 'C5', 'C8'],
    sources: [
      'src/runtime/guard.ts',
      'src/runtime/root-guard.ts',
      'src/runtime/contexts/window-realm.ts',
      'src/runtime/enforcement/document-exit.ts',
    ],
  },
  {
    id: 'document-publication',
    obligation:
      'Keep pending child references mediated; authenticate preparation and parent publication before rendering.',
    invariants: ['C1', 'C2', 'C3', 'C6', 'C7'],
    sources: [
      'src/runtime/contexts/document-factory.ts',
      'src/runtime/contexts/document-publication.ts',
      'src/runtime/contexts/document-guard.ts',
      'src/runtime/contexts/document-main.ts',
      'src/runtime/contexts/document-controller.ts',
      'src/runtime/contexts/document-intents.ts',
      'src/runtime/contexts/document-protocol.ts',
    ],
  },
  {
    id: 'popup-publication',
    obligation:
      'Prepare each popup before exposing native authority, including retained opener and Window references.',
    invariants: ['C1', 'C2', 'C3', 'C6', 'C7'],
    sources: ['src/runtime/contexts/popup-factory.ts'],
  },
  {
    id: 'dedicated-worker-publication',
    obligation:
      'Return a mediated worker, authenticate bootstrap, and release queued messages only after preparation.',
    invariants: ['C1', 'C2', 'C3', 'C5', 'C7'],
    sources: [
      'src/runtime/contexts/worker-factory.ts',
      'src/runtime/contexts/worker-guard.ts',
      'src/runtime/contexts/worker-realm.ts',
    ],
  },
  {
    id: 'shared-worker-publication',
    obligation:
      'Authenticate each connection and current generation before exposing a prepared shared executor.',
    invariants: ['C1', 'C2', 'C3', 'C6', 'C7'],
    sources: [
      'src/runtime/contexts/shared-worker-factory.ts',
      'src/runtime/contexts/shared-worker-guard.ts',
      'src/runtime/contexts/shared-controller.ts',
      'src/runtime/contexts/shared-connections.ts',
    ],
  },
  {
    id: 'worklet-publication',
    obligation:
      'Authenticate the owning actor and install worklet restrictions before publisher module execution.',
    invariants: ['C1', 'C2', 'C3', 'C4', 'C6', 'C7'],
    sources: [
      'src/runtime/contexts/worklet-factory.ts',
      'src/runtime/contexts/worklet-controller.ts',
      'src/runtime/contexts/worklet-guard.ts',
      'src/runtime/contexts/worklet-source.ts',
      'src/runtime/contexts/worklet-store.ts',
    ],
  },
  {
    id: 'publisher-execution',
    obligation:
      'Execute publisher lifecycle code in a prepared executor without granting native service-worker authority.',
    invariants: ['C1', 'C2', 'C3', 'C4', 'C6', 'C7', 'C8'],
    sources: [
      'src/runtime/publisher/controller.ts',
      'src/runtime/publisher/guard.ts',
      'src/runtime/publisher/events.ts',
      'src/runtime/publisher/client.ts',
      'src/runtime/publisher/store.ts',
    ],
  },
  {
    id: 'context-authority',
    obligation:
      'Bind actual browser actors and preserve authorization through storage races, closure and revalidation.',
    invariants: ['C2', 'C3', 'C6', 'C7'],
    sources: [
      'src/runtime/contexts/model.ts',
      'src/runtime/contexts/controller-store.ts',
    ],
  },
  {
    id: 'admission-and-storage',
    obligation:
      'Validate admitted identities and immutable resources and maintain their installation-generation binding.',
    invariants: ['C6', 'C7', 'C8'],
    sources: [
      'src/runtime/admission.ts',
      'src/runtime/storage.ts',
      'src/shared/policy.ts',
      'src/shared/runtime-url.ts',
    ],
  },
  {
    id: 'resource-delivery',
    obligation:
      'Deliver only authorized local resources and bootstrap routes, with no outgoing fallback.',
    invariants: ['C1', 'C2', 'C4', 'C6', 'C7', 'C8'],
    sources: [
      'src/runtime/worker.ts',
      'src/runtime/contexts/resources.ts',
      'src/runtime/response-policy.ts',
    ],
  },
  {
    id: 'native-effects',
    obligation:
      'Mediate immediate and deferred native effects and every native reference exposed by these adapters.',
    invariants: ['C2', 'C3', 'C4', 'C5'],
    sources: [
      'src/runtime/enforcement/effects.ts',
      'src/runtime/enforcement/navigation.ts',
      'src/runtime/enforcement/navigation-targets.ts',
      'src/runtime/enforcement/dom.ts',
      'src/runtime/enforcement/scripts.ts',
    ],
  },
  {
    id: 'browser-owned-maintenance',
    obligation:
      'Account for update-script requests caused by local context/resource operations, including registration overlap; cache-only fetch responses do not establish maintenance independence.',
    invariants: ['C4'],
    sources: [
      'src/bridge/connect.ts',
      'src/manager/services/bootstrap.ts',
      'src/runtime/worker.ts',
      'src/runtime/contexts/worker-factory.ts',
      'src/runtime/contexts/document-factory.ts',
      'src/runtime/contexts/resources.ts',
    ],
  },
  {
    id: 'trusted-runtime-state',
    obligation:
      'Protect enforcement state and native captures while application prototypes remain mutable.',
    invariants: ['C2', 'C3', 'C5'],
    sources: [
      'src/shared/primordials.ts',
      'src/runtime/enforcement/native.ts',
      'src/runtime/intrinsics.ts',
      'src/runtime/trusted/context.ts',
      'src/runtime/trusted/client.ts',
    ],
  },
  {
    id: 'installation-and-management',
    obligation:
      'Authenticate management actors and isolate installation network activity from runtime private state.',
    invariants: ['C1', 'C2', 'C4', 'C6', 'C7', 'C8'],
    sources: [
      'src/installation/session.ts',
      'src/bridge/connect.ts',
      'src/manager/services/bootstrap.ts',
    ],
  },
];
