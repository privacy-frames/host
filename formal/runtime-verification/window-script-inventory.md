# Window script inventory

Before rendering application content, the host sends each Window a resource map.
Policy 11 adds the canonical URLs of installed JavaScript to that metadata. Root
documents, child documents and workers use one MIME classifier, including the
existing extension fallback when a resource has no recorded content type.

The Window parser requires a bounded, dense script list. Each entry must be a
unique canonical URL in the admitted resource map. Missing lists, foreign URLs,
unknown query or fragment variants, duplicates and sparse arrays reject before
the Window installs its aliases. Alias parsing also rejects sparse arrays rather
than silently preserving holes. Data-property checks reject a script-list getter
without invoking it.

The controller constructs the list from installed resources; parsing establishes
its shape and membership. Resource ownership, immutable bytes and delivery still
require their existing controller and reader contracts. The new metadata is the
input used by [policy-12 local Window delivery](native-window-policy.md) before
publication. Independent native HTTP denial remains pending in production.

The protocol unit cases include malformed inventories and a root-document
inventory produced by the real installation path. The full regression suite,
native worker and document comparisons pass with policy 11 at the revision pinned
by [its evidence index](policy11-validation.json). Twenty-seven
authority-predicate contracts and their omission, false-rejection and vacuous
annotation controls also pass with the updated policy value. The
[policy-10 evidence](policy10-validation.json) retains its earlier source/build
scope; its generated-import counterexamples do not become policy-11 observations.
