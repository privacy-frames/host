# Local module graphs under a Window script policy

The [native comparison](window-module-policy.ts) exercises the production module
loader with intrinsic and Trusted Types preparation in a Window. Its fixed local
resource reader supplies three JavaScript modules. A later CSP admits Blob and
inline scripts while denying HTTP scripts and connections. Removing the policy's
meta element does not remove its enforcement.

All eighteen cases pass in Chromium, Firefox and Firefox with the registration
age check forced. Native graph loading calibrates live bindings, shared module
identity, computed import, logical `import.meta` URLs and top-level await. The local
graph returns the same results. Unrestricted native imports and mutations of the
loader's public registry reach the owned HTTP receiver. Under the stricter policy,
both attempts reject with native policy events and no observed HTTP during the
operation and three subsequent seconds.

The [receipt](window-module-policy.json) records source, build, runner and bundled
bootstrap hashes. These inputs remain stable throughout the comparison. The
initial event-snapshot receipt stops after eleven cases: it copied Firefox's
event array before the queued violation event arrived. The corrected runner
retrieves events after the observation interval. That initial receipt is a fixture
diagnostic; it does not establish an absence of browser policy enforcement.

This comparison establishes a prerequisite for removing native HTTP script
authority from application Windows. It does not prepare the complete production
Window or authenticate a production resource reader. Integration still needs
local initial and dynamic script delivery, classic script globals and handlers,
preparation before publication, and the policy inherited by child contexts.
Production policy continues to permit runtime-origin HTTP, including the two
generated-import maintenance effects in the policy-10 comparison.

Run after building:

```sh
node formal/runtime-verification/window-module-policy.ts
```
