# Standalone native text codecs

`src/guest/text-policy.ts` routes `TextEncoder` and `TextDecoder` through the shared
`createNativeHost` codec and a private `NativePolicy` registry. It registers the two
constructors, their immediate native prototypes, standard attributes, `encode`,
`encodeInto` and `decode`. Native methods perform conversion and decoding directly,
including decoder state retained between streaming calls. The policy supplies no
stream constructors, network operations or callback-registration methods.

The trusted browser environment supplies both constructors from the same realm.
Registration captures their prototype descriptors and native function identities.
The encoder's captured `encoding` getter and the decoder's captured `encoding`,
`fatal` and `ignoreBOM` getters identify native internal slots without reading any
application-defined property. A real codec with another immediate prototype is
claimed by this family and refused during admission, preventing fallback to a
broader host. Unrelated objects and text stream instances remain unclaimed.

The registry checks reviewed descriptor identity before invoking a member. An
unknown getter is rejected before it executes, including a getter already present
when the policy is created. Method and accessor wrappers retain stable identities
and expose their captured names and lengths. Constructor/prototype links resolve
to the same reviewed values; the shared codec returns the native intrinsic
boundaries for the engine to map to guest `Object.prototype` and `Function.prototype`.

Encoding returns the native `Uint8Array`; `encodeInto` writes the supplied native
buffer view and returns the ordinary native result record. These results pass back
through the existing engine and binary owner. Text ownership covers codec instances,
constructors and reviewed wrappers, not buffers, views or result records. Buffer
mapping, sharing and lifetime remain NativeBinary obligations.

`test/guest-text-policy.test.ts` checks native conversion once, fatal/BOM and
stateful decoding, buffer results and writes, exact descriptor/wrapper identities,
borrowed accessors, fake callables, altered native descriptors and foreign-prototype
brands. Its unknown-getter control first executes that getter natively, then proves
the policy refuses access without another invocation. TextEncoderStream and
TextDecoderStream are explicitly unclaimed.

`test/guest-text-bridge.ts` runs actual BrowserEnvironment/QuickJS fixtures in
Chromium and Firefox. It exercises the same conversions, buffer handoff and writes,
streaming/fatal decoding and reflection from guest code. Native codec instances
from another iframe realm must be claimed and refused. A temporary bundle omits
only the shared native-owner get route; a direct call to the real environment host
then executes the unreviewed native getter and the fixture fails. Guest descriptor
inspection independently rejects that getter, so the direct host control tests the
specific omitted route. Receipts include transitive bundled source hashes, browser
binary identities, engine and bundle hashes under
`results/quickjs-confinement/text-bridge.json`.

These checks rely on the supplied native constructors/getters implementing browser
internal-slot checks and on the existing NativePolicy/shared codec contracts. They
verify this local codec interface and its tested integration; they do not establish
complete confinement or the correctness of the binary bridge.
