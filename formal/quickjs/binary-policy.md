# Native buffer operation policy

`src/guest/native-binary.ts` keeps native buffers and views usable by application
Wasm while mediating their JavaScript operations through `NativePolicy` and the
shared `NativeHost` codec. Native Wasm still accesses its own memory directly.
The policy replaces descriptor enumeration as a source of callable authority with
explicit catalogs for buffers, views, typed arrays, iteration and Atomics.

## Operations and producers

Only listed members present in the current engine are captured. A new browser
member receives no automatic permission. The same captured declarations generate
the guest-side binary descriptions, so reflection does not publish a separate,
broader set of operations. Native method identities remain stable for engine
synchronization, including the specialized `copyWithin` path.

| Operation                     | Admission and result contract                                                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Buffer/view geometry          | Captured native slot getters establish the brand; lengths, offsets and descriptor checks remain live.                                                        |
| Numeric typed-array access    | Canonical numeric keys retain native integer-indexed behavior. The indexed Wasm optimization has its separate bounds/lifetime obligations.                   |
| DataView numeric properties   | Ordinary application properties use an explicit descriptor adapter; they are not treated as typed-array indices.                                             |
| Ordinary own primitive data   | A data descriptor containing a primitive may shadow geometry or carry local state. This does not authorize an own getter, object or function.                |
| Buffer/view-producing methods | Reviewed constructors and methods retain the resulting native backing; species callbacks keep their existing engine synchronization.                         |
| Iteration                     | Only reviewed iteration methods admit their produced iterator. A shared native array-iterator prototype does not establish ownership of unrelated iterators. |
| Reductions                    | An application accumulator may be returned through the delegated-result contract. This grants no new callable token.                                         |
| Atomics                       | Only captured listed operations are exposed, with the browser's native shared-memory semantics.                                                              |

Native memory buffers, shared buffers and views over retained backings keep their
existing ownership rules. Private bindings can also operate on branded local
buffer mirrors without automatically making those buffers globally retained.
Immutable native brand identity is memoized; mutable geometry, descriptors and
index eligibility are not cached by that memo.

The guest runtime supplies ordinary arrays and objects to its captured QuickJS
implementation when a borrowed operation has no native binary receiver. The
backend does not widen a generic native call to arbitrary browser objects.

## Reflection and private constructor hooks

The registry admits a native value against its reviewed semantic prototype before
overlaying the private constructor hook used for guest species behavior. The
overlay retains the original reviewed lineage. Application reflection cannot
obtain the hook descriptor; native species algorithms can still invoke it through
the existing synchronous engine bridge.

The existing shared-buffer alias path and non-extensible-buffer fallback remain
described in
[native-binary-compatibility.md](../../docs/implementation/native-binary-compatibility.md).
The policy does not replace those browser constraints with simulated shared memory.

## Checks and remaining obligations

Run the focused native checks and actual interpreter/browser fixture:

```sh
node --import tsx --test test/native-binary.test.ts test/native-binary-policy.test.ts
node --import tsx test/guest-engine.ts
```

The native checks cover unknown getters, changed descriptors, unregistered
callables, iterator ownership, species, mixed local/native copies, primitive data
shadows, resizable/shared buffers and live geometry after detachment. The browser
fixture installs a native getter before engine creation: its unrestricted control
executes, while guest access through a Wasm memory buffer must leave it unexecuted.
Existing indexed-cache tests retain native data shadows and reentrant growth.

These checks rely on native slot/algorithm behavior, the engine's argument and
callback bridge, and its entry/exit synchronization. They do not prove all
histories of reentrant mutation or close the BrowserEnvironment forwarding and
cross-family reference obligations in the [security argument](README.md).
