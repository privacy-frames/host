# Audio worklet ownership and closure

The manager loads a trusted bootstrap into the native audio worklet. That bootstrap
creates a private guest engine and supplies application processors through its
message port. Application processor code remains unchanged and executes in QuickJS.
Native audio callbacks, ports and output buffers remain browser operations.

## Owner and publication rules

`audio-worklet.ts` records an installation and generation for each native audio
context. Managers claim ownership before awaiting bootstrap completion. If the
last owner closes while preparation is pending, preparation cannot create a new
controller. A surviving owner can finish preparation even when the original manager
has closed. Module request identities belong to the shared controller and use the
verified bounded allocator; separate managers cannot restart that identity domain.

`worklet-entry.ts` gives each bootstrap its own engine, helper, module and constructor
port state. The state owns a fresh publication token. It never calls the generic
publication kernel's begin operation, so worklet closure is terminal. Closing first
invalidates the token, then clears private references, disposes the engine and
closes the port. All asynchronous initialization and module-completion paths require
the captured token to remain current before publishing a result.

An engine whose creation finishes after closure is disposed before worklet helper
installation or a ready message. Its own trusted engine initialization may already
have completed. An application module that finishes after closure cannot publish a
module acknowledgment. Registered processor callbacks retain their original owner
and token, and refuse construction or return inactive after that owner closes.

The shared publication kernel has separately checked state-update contracts.
Applying those contracts here requires the private state to own its writable token
and closed fields, and the saved token to remain private. The source creates those
fields together in a host-owned record and does not expose the record through the
guest API. The worklet caller and browser message/lifetime behavior are additional
premises; the kernel's token theorem alone is not a proof of the complete worklet.

## Guest-side bookkeeping

`worklet-runtime.ts` captures the operations used for private maps, reflection,
name conversion and buffer copying before application code executes. It uses owned
record fields, null-prototype parameter dictionaries and explicit data-property
writes for cached channel arrays. Processor instance IDs use the same allocator
body as the native host; exhaustion rejects before application construction.

Both the guest registration helper and native registration boundary reject the
host's `privacy-frames:` processor namespace. The native boundary uses the same
name conversion helper as native `AudioWorkletNode` construction. The string checked
is the string consumed by native registration, including when name conversion runs
application code. The namespace is reserved authority, not a secret.

## Executable checks

Run the focused source/helper checks:

```sh
node --import tsx --test test/guest-audio-worklet.test.ts test/guest-worklet-bootstrap.test.ts test/guest-worklet-runtime.test.ts
```

The tests exercise late initialization, late module completion, pending-owner
retention, per-controller IDs, terminal closure, captured operations, reserved names,
allocation exhaustion and parameter-record ownership. A control removes the actual
late-close guard from a temporary bundle and observes the created engine remaining
live. The ordinary source disposes it before helper setup. Native interfaces are
controlled fixtures in these tests; they do not establish browser behavior.

The verification wrapper records source hashes, checks that the owned inputs stay
unchanged during execution and records the exact served browser bundles:

```sh
node --import tsx formal/quickjs/worklets/check.ts --browser
```

Omitting `--browser` runs only the controlled checks and marks browser integration
as unrequested in its receipt at `results/quickjs-confinement/worklets.json`.

Run the existing context integration driver for the native browser comparison:

```sh
node --import tsx test/guest-contexts.ts
```

The current Chromium and Firefox checks retain the expected 0.25 offline-audio
sample, processor messages, transferred-buffer detachment and native Wasm availability.
Results are candidate-source evidence, not deployed-upgrade verification.

The worklet host still has general native get/set/call/construct forwarding.
Complete mediation of that host belongs to the native-operation policy work.
Private bootstrap delivery, engine-module provenance, MessagePort ordering and
browser worklet lifetime require their own contracts and browser evidence.
