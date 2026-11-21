# Native realm intrinsic identities

Trusted browser setup captures ordinary native constructors and their prototypes
before application references are exposed. Each capture belongs to a private
setup owner and its actual native document. Reusing an owner for another document
or global fails. The identity index stores weak keys and internal roles, without
retaining the owner's environment or engine.

Capture reads own data descriptors. It does not invoke global getters or classify
functions by their public names. The native binary adapter can supplement hidden
SharedArrayBuffer and optional Float16Array constructors through its existing
private alias producer. Those producer labels must belong to the closed role list.

The engine first seeds its own bootstrap aliases from captured records. After
installing binary support, it retains private handles for the final guest
constructors and prototypes. Encoding a registered foreign identity uses those
handles, even after application code replaces a guest global. Foreign DOM
constructors and prototypes keep their platform identities; their ordinary
ECMAScript prototype boundaries resolve to the receiving guest's intrinsics.

A known role without a supported guest counterpart is refused. An identity already
exposed as a generic proxy cannot be silently upgraded by later capture: encoding
and native operation dispatch reject it. The trusted binary installer retains its existing startup alias replacement.
Explicit trusted aliases affect new encodings without re-enabling old generic
proxies. The receiving engine releases its retained intrinsic handles on disposal.

`test/guest-realm-intrinsics.ts` compares native realm differences with actual
QuickJS identities, reflected descriptor values, guest prototype extensions,
replaced globals and ordinary foreign DOM callbacks. Separate temporary bundles
omit identity mapping and the receiving Function role. The fixture checks hidden
shared-buffer constructor/prototype aliases without cross-origin isolation and
actual native shared-buffer encoding with isolation enabled. An additional
non-isolated buffer-encoding attempt failed in the unchanged native binary
adapter's structured-clone path; that failure is preserved separately.

The catalog covers the ordinary constructor/prototype roles listed in
`native-intrinsics.ts`. Existing module-local async and generator aliases remain;
foreign dynamic constructors are unclaimed. Callers must keep pending Window and
document references opaque and finish capture before first publication. Other
native function operations retain their existing forwarding paths.
