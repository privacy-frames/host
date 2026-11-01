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
    id: 'script-url-admission',
    obligation:
      'Reserve native policies before application execution, verify URL enforcement, and keep minting authority and branded values private through captured native sinks.',
    invariants: ['C1', 'C2', 'C3', 'C5'],
    sources: [
      'src/runtime/enforcement/script-urls.ts',
      'src/runtime/enforcement/application-policies.ts',
      'src/shared/script-url-policy.ts',
      'src/runtime/response-policy.ts',
      'src/runtime/contexts/window-realm.ts',
      'src/runtime/contexts/worker-realm.ts',
      'src/runtime/enforcement/scripts.ts',
      'src/runtime/trusted/context.ts',
    ],
  },
  {
    id: 'root-publication',
    obligation: 'Prepare the root before rendering or executing publisher content.',
    invariants: ['C1', 'C3', 'C5', 'C8'],
    sources: [
      'src/runtime/guard.ts',
      'src/runtime/root-guard.ts',
      'src/runtime/bootstrap-source.ts',
      'src/runtime/controller-client.ts',
      'src/runtime/private-channel.ts',
      'src/runtime/content-broker.ts',
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
      'src/runtime/bootstrap-source.ts',
      'src/runtime/contexts/document-controller.ts',
      'src/runtime/contexts/document-client.ts',
      'src/runtime/contexts/document-parent.ts',
      'src/runtime/contexts/parent-channel.ts',
      'src/runtime/contexts/document-request.ts',
      'src/runtime/contexts/document-intents.ts',
      'src/runtime/contexts/document-protocol.ts',
    ],
  },
  {
    id: 'popup-publication',
    obligation:
      'Prepare each popup before exposing native authority, including retained opener and Window references.',
    invariants: ['C1', 'C2', 'C3', 'C6', 'C7'],
    sources: [
      'src/runtime/contexts/popup-factory.ts',
      'src/runtime/contexts/document-parent.ts',
    ],
  },
  {
    id: 'dedicated-worker-publication',
    obligation:
      'Issue the local guard source privately, bind its native client to an authenticated parent, and release application messages only after preparation.',
    invariants: ['C1', 'C2', 'C3', 'C5', 'C6', 'C7'],
    sources: [
      'scripts/trusted-policy.ts',
      'scripts/build.ts',
      'src/runtime/contexts/worker-factory.ts',
      'src/runtime/contexts/worker-control.ts',
      'src/runtime/contexts/worker-client.ts',
      'src/runtime/contexts/worker-protocol.ts',
      'src/runtime/contexts/worker-birth.ts',
      'src/runtime/contexts/worker-birth-protocol.ts',
      'src/runtime/contexts/worker-resource-protocol.ts',
      'src/runtime/contexts/classic-scripts.ts',
      'src/runtime/contexts/worker-aliases.ts',
      'src/shared/javascript-mime.ts',
      'src/runtime/resource-fetch.ts',
      'src/runtime/resource-broker.ts',
      'src/runtime/contexts/worker-guard.ts',
      'src/runtime/contexts/worker-realm.ts',
    ],
  },
  {
    id: 'local-module-delivery',
    obligation:
      'Deliver admitted JavaScript graphs locally, preserve import semantics, and establish native HTTP denial independently of mutable loader records.',
    invariants: ['C2', 'C3', 'C4', 'C5', 'C8'],
    sources: [
      'src/runtime/script-resources.ts',
      'src/runtime/document.ts',
      'src/runtime/contexts/document-protocol.ts',
      'src/runtime/contexts/document-controller.ts',
      'src/shared/module-source.ts',
      'src/shared/module-references.ts',
      'src/runtime/contexts/window-scripts.ts',
      'src/runtime/contexts/classic-scripts.ts',
      'src/runtime/contexts/document-renderer.ts',
      'src/runtime/module-loader.ts',
      'src/runtime/modules.ts',
      'src/runtime/resource-fetch.ts',
      'src/runtime/contexts/worker-realm.ts',
      'scripts/trusted-policy.ts',
      'src/runtime/response-policy.ts',
      'src/shared/script-url-policy.ts',
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
      'src/shared/shared-worker.ts',
      'src/shared/context-policy.ts',
    ],
  },
  {
    id: 'worklet-publication',
    obligation:
      'Authenticate the owning actor, prepare the host guard outside the application compiler graph, and install restrictions before publisher module execution.',
    invariants: ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8'],
    sources: [
      'src/runtime/contexts/worklet-factory.ts',
      'src/runtime/contexts/worklet-controller.ts',
      'src/runtime/contexts/worklet-guard.ts',
      'src/runtime/contexts/worklet-source.ts',
      'src/runtime/contexts/worklet-imports.ts',
      'src/runtime/contexts/worklet-store.ts',
      'src/runtime/contexts/worklet-graph.ts',
      'src/runtime/contexts/worklet-graph-schema.ts',
      'src/runtime/contexts/worklet-chunks.ts',
      'scripts/worklet-compiler.ts',
      'scripts/build.ts',
      'src/runtime/trusted/source.d.ts',
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
      'src/runtime/publisher/protocol.ts',
      'src/shared/context-policy.ts',
    ],
  },
  {
    id: 'context-authority',
    obligation:
      'Bind actual browser actors and preserve authorization through storage races, closure and revalidation.',
    invariants: ['C2', 'C3', 'C6', 'C7'],
    sources: [
      'src/runtime/contexts/model.ts',
      'src/shared/context-policy.ts',
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
    invariants: ['C1', 'C2', 'C4', 'C5', 'C6', 'C7', 'C8'],
    sources: [
      'src/runtime/worker.ts',
      'src/runtime/resource-broker.ts',
      'src/runtime/resource-fetch.ts',
      'src/runtime/resource-aliases.ts',
      'src/runtime/controller-client.ts',
      'src/runtime/private-channel.ts',
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
      'src/runtime/enforcement/native-attributes.ts',
      'src/shared/native-attributes.ts',
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
