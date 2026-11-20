# Capturing message transfers once

The browser environment previously invoked a native `postMessage` and then read
its original transfer options again to update the guest's buffer state. The
ConfinedWorker override also committed transfers. A worker send could therefore
read an options getter again after the browser effect and account for the same
transfer twice. A non-array iterable was also absent from the later accounting.

`captureMessageTransfer` captures an iterable overload or `options.transfer` into a
private native array. It reads the chosen getter and iterator method once;
`Array.from` consumes that retained iterator and closes it if entry conversion
fails. Entries must be objects; the native messaging operation checks whether they
are supported transferables and whether the message can be cloned.

The ConfinedWorker override sends using this array and commits detachment only
after the native operation returns. The factory retains the exact override
function identity. BrowserEnvironment recognizes that function's existing
accounting and forwards its arguments unchanged; other supported non-window
postMessage calls normalize before invocation and commit the same array afterward.
A thrown conversion or native send reaches no detachment callback. A missing
message remains a TypeError rather than becoming an explicit `undefined` message.

The three Node helper cases check dictionary/iterable conversion counts, iterable
overload selection, thrown conversion identity and iterator closure. The browser
fixture runs real Worker and MessagePort sends through BrowserEnvironment and
QuickJS in Chromium and Firefox. It checks getter/iterator counts, transferred
bytes, detached guest buffers and one accounting call per successful send. A
message containing a function must fail without detaching its buffer or committing
accounting. The fixture uses its own trusted native echo-worker bootstrap; it does
not test the confinement bootstrap protocol.

A temporary bundle restores the former browser bookkeeping. A direct native
adapter call then observes two transfer getter reads and two accounting calls for
one successful send, compared with one of each in production. Guest transfer and
buffer assertions run against the production bundle. Source, transitive bundle,
engine and outcome hashes are recorded in
`results/quickjs-confinement/message-transfer.json`.

Window-context messaging already sends and commits its selected transfer list in
one owner. Its iterable overloads can be reviewed separately. MessagePort policy
uses this same helper for its own effect and accounting; its authority and callback
lifecycle remain the port domain's contracts.
