# Window writes require an attached guest engine

`BrowserEnvironment.set` now checks a native Window receiver before selecting a
native owner or reaching another write adapter. The private environment map must
contain a live environment with an attached engine. Otherwise the write returns
false. This covers unknown windows, windows whose preparation is still awaiting
engine creation, and windows whose environment has been disposed.

Prepared foreign-window writes retain their existing route through the target's
guest engine. The guard adds no native property assignment or context creation.
It addresses the write side of the preparation boundary; other Window operations
and the complete context-publication argument retain their own contracts.

The environment is registered during trusted construction, before asynchronous
engine preparation. `attach` assigns the engine before installing its globals.
Applying this guard to C1 therefore also requires the caller's existing startup
contract: no application code executes during trusted setup, and attachment
completes synchronously before application execution can observe the context.
Native Window branding and private environment-map ownership remain premises.

## Independent native checks

```sh
node --import tsx test/guest-window-writes.ts
```

The browser fixture creates initial blank frames in trusted test setup. A benign
native Window setter provides an unrestricted positive control. Actual QuickJS
assignment, a borrowed reflected setter and direct `environment.host.set` must
then leave both native setter and getter counters unchanged for each denied
window state.

One child uses actual `createGuestWindow` preparation, paused at the native
WebAssembly compilation dependency. The fixture temporarily substitutes that
trusted dependency to keep the environment registered without an engine, then
restores it before releasing preparation. After attachment, the same three write
routes must update the child guest engine while leaving its native marker alone.
Closing that child makes the routes refuse native writes again.

Native frames are created and loaded before the parent observer starts. The first
fixture inserted them afterward, allowing the parent's automatic frame-preparation
machinery to compete with the fixture-owned session. That run failed its prepared
positive control; `initial-fixture-failure.json` preserves the failed checkpoint.
It supplies no confinement result.

The final driver runs production and one temporary bundle with the actual Window
gate omitted, in Chromium and Firefox. Production must pass all assertions. The
omitted gate must fail the unprepared-assignment assertion after the native setter
executes. The tests use no navigation or network destination as a write value.

`results/quickjs-confinement/window-writes/browser.json` records checked source and
served bundle hashes, browser versions, explicit executable paths and executable
hashes verified before and after the run. It uses the existing browser-profile
launcher. These checks establish the listed Window write behavior; they do not
establish complete runtime confinement or cross-application isolation.
