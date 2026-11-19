# Runtime enforcement map

Application JavaScript crosses the QuickJS boundary to use native browser objects.
The host mediates those operations before they reach the browser. Native rendering
uses local Blob or data URLs; guest resource reads use admitted catalog bytes.

| Surface                                                     | Implementation                                                                      | Checks                                                                          |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Guest values, prototypes, callbacks and promises            | `src/guest/engine.ts`, `guest-runtime.ts`                                           | `test/guest-engine.ts`, `guest-lifecycle.ts`                                    |
| Native property access, accessors, methods and constructors | `src/guest/browser.ts`                                                              | `test/guest-policy.ts`, `guest-context-windows.ts`                              |
| Initial and dynamic HTML, SVG, handlers and scripts         | `src/guest/dom.ts`, `parser.ts`                                                     | `test/guest-parser-browser.ts`, `guest-policy.ts`, `guest-examples.ts`          |
| CSS, images, fonts, media and unknown resources             | `src/guest/resources.ts`, `css.ts`                                                  | `test/guest-resources.test.ts`, `guest-context-maintenance.ts`                  |
| Fetch, XHR and navigator services                           | `src/guest/web-services.ts`                                                         | `test/guest-web-services.test.ts`, `guest-web-services-browser.ts`              |
| Dedicated and shared worker startup                         | `src/guest/contexts/worker-factory.ts`, `worker-registry.ts`, `worker-bootstrap.ts` | `test/guest-contexts.ts`, `guest-context-maintenance.ts`                        |
| Child windows, frames, messages and cancellation            | `src/guest/contexts/window-contexts.ts`, `documents.ts`                             | `test/guest-context-windows.ts`                                                 |
| Audio worklets                                              | `src/guest/contexts/audio-worklet.ts`, `worklet-entry.ts`                           | `test/guest-contexts.ts`, `guest-context-maintenance.ts`                        |
| Local storage APIs and host record integrity                | `src/guest/storage.ts`, `src/runtime/storage.ts`                                    | `test/guest-lifecycle.ts`, `runtime-admission.test.ts`, `guest-installation.ts` |
| Management authorization and installation publication       | `src/runtime/worker.ts`, `src/bridge/connect.ts`                                    | `test/guest-examples.ts`, `runtime-admission.test.ts`                           |
| Startup CSP and browser service-worker maintenance          | `src/runtime/worker.ts`, `src/guest/window.ts`                                      | `test/guest-context-maintenance.ts`, `guest-policy.ts`                          |
| Native Wasm imports, memory and shared binary operations    | `src/guest/native-wasm.ts`, `native-binary.ts`, `guest-binary.ts`                   | `test/guest-wasm.ts`, `guest-context-isolation.ts`                              |
| Custom element construction and lifecycle callbacks         | `src/guest/custom-elements.ts`                                                      | `test/guest-custom-elements.ts`                                                 |

The policy tests include native controls and observe an independent receiver.
Context tests check that guest-created contexts receive the same restrictions,
including synchronous callbacks and transferred objects. The maintenance fixture
compares private-bit inputs with quiet controls under fresh and forced-age
service-worker registrations.

Storage namespacing supports application compatibility. Host installation records,
bootstrap bytes and management channels still require integrity even though
cross-application storage isolation is outside this demonstration.

Application service-worker execution remains deferred. Broader
browser coverage and a machine-checked correspondence between the implementation
and its confinement requirements remain research work. Historical route inventories
and formal models under `formal/` describe the earlier native runtime.
