# Logical application routes

Guest `location`, `origin`, `document.URL` and `document.documentURI` describe the
publisher URL. History operations can change its path, query and fragment within
the publisher origin. The browser keeps the admitted runtime document's physical
path and query; only its fragment changes.

Native history entries hold the logical URL and guest state, identified by the
installed application, generation and original source URL. Guest `history.state`
and trusted `popstate` events expose the guest state. Reload and browser back or
forward restore the logical route from that entry. Guest history traversal remains
disabled because it could leave the installed application.

Physical history entry counts can differ. In the Chromium 153 and Firefox 155
fixture, a synchronous push followed by two fragment assignments adds one entry
in the native control and three through the bridge. Both restore the same logical
URL and state when traversing their observed entries. The bridge uses native hash
assignments, which avoid a document request, rather than native `location.href`
navigation to reproduce that scheduling.

`test/guest-history.ts` compares native and guest routes, state, URL conversion,
relative fragment setters, reload and trusted browser traversal. It also checks
that an external history URL is refused and that the runtime path stays fixed.
