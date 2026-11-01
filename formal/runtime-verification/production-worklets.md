# Local worklets in the installed runtime

The runtime now prepares worklet graphs through its private controller message
transport. The service worker resolves the native sending Window, checks its
installation generation and compiles admitted module bytes in its own realm.
Compilation supplies no network reader and executes no application code. Its
WASM parser is embedded in the trusted build.

The response contains graph data and host guard source. The Window validates the
graph, creates local Blob chunks and passes a separate wrapper to native
`addModule`. That wrapper imports host preparation before the application facade.
The dynamic-import rejection helper belongs to the application graph; the
mandatory guard does not. The former HTTP intent and graph routes are removed.

Each native Worklet retains private facade and wrapper caches. Later entries can
reuse prepared dependencies, including a module already loaded through another
entry. Cached facade information does not grant management authority. The
controller checks ownership again on each preparation request and rechecks the
current installation generation after asynchronous compilation and guard reads.
The production browser policy still needs independent HTTP denial: dependency
fetching can precede guard evaluation.

The installed-runtime comparison passes resource and Blob audio graphs, repeated
entries, a child-document audio graph and offline execution in Chromium and
Firefox. It also rejects replay of a Worklet identity from another actual Window
and confirms that the removed HTTP graph route fails. Captured native calls use
Blob module URLs. Chromium renders the expected paint-worklet pixel; Firefox
reports no paint-worklet API. Publisher and independent receiver observations
record no additional traffic during the measured confined operations.

The first production comparison failed because persistence decoding changed
identity property order. Guard source serialization interpreted that ordering
change as different preparation. Explicit metadata serialization fixes the
mismatch. A unit fixture now decodes records in a different property order, and
the failed browser receipt is retained as `production-worklet-first.json`.

The first full regression stopped at the prototype fixture's fixed 1.2-second
child sample. A focused comparison with explicit load readiness records prepared
children at 1.332 and 1.339 seconds. The fixture now awaits the load event before
checking the prepared child; its unprepared-child observations remain immediate.
All prototype-extension, socket and receiver assertions remain. The original
failure receipt and full-run log are retained separately.

Controller unit checks cover sender binding, foreign origins, MIME restrictions,
prepared-module data, and replacement during compilation. Their compiler double
checks controller decisions and reads; the separate native component comparison
checks actual Rollup compilation. Its preparation-removal controls still detect
guest execution after rejected metadata in both browsers.

These checks do not establish arbitrary compiler equivalence, complete caller
ownership, native termination on closure, registration lifetime, or complete
C1–C8. Production native HTTP denial and the retained maintenance counterexample
remain open. No production deployment accompanies this checkpoint.
