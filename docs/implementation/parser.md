# Inert document parsing and resource mapping

The guest DOMParser uses parse5 for HTML and saxes for XML, then constructs real
browser nodes in a document without a browsing context. It does not pass raw
application markup to native DOMParser. XML nodes remain detached from their
new document until parsing succeeds. Attribute values are checked and mapped
before native assignment.

HTML, SVG and MathML resource attributes use the installed resource catalog.
Script sources, inline handlers, navigation and context-starting attributes are
withheld from native nodes. Scripts have an inert physical type; standard JSON
data-script types remain available for selectors. CSS is parsed by css-tree so
escaped URL functions, escaped imports and image-set string candidates use the
same resource mapping. Inline declarations and SVG paint values use their own
CSS entry grammars. Unparsed CSS is withheld.

XML preserves qualified names, namespace declarations, attribute case, comments,
CDATA, processing instructions and ordinary PUBLIC/SYSTEM doctypes. A custom
null-namespace mxGraph attribute named src or style is data, so its value is
preserved. Known SVG/HTML effects, XSLT import/include hrefs and stylesheet
processing instructions receive resource mapping. Internal DTD subsets and
unknown entities return a parsererror document; no external entity resolver is
installed. Invalid XML returns a parsererror document, while unsupported MIME
types throw TypeError.

Original element attributes, handler strings, source bases and script metadata
live in a private WeakMap. The trusted DOM adapter can read them through
parsedElementSource to preserve logical reads and compile inserted handlers in
the guest. DOMParser-created scripts must remain inert after insertion; their
metadata records that condition explicitly. xml:base is retained as logical
metadata but withheld physically because it can change the meaning of a
descendant fragment URL. Neither metadata nor a parsed node grants permission
to restore an active attribute without the host policy.

The XHR facade uses this parser for responseXML and document responses. Its
optional parseDocument hook lets the owning environment supply a logical source
URL. Native document methods and insertion still pass through the owning DOM
policy; parsing does not authorize a child context, native script or XSLT effect.

The retained browser test checks HTML, XML, mxGraph data and SVG namespaces,
scripts, handlers, templates, URL sets, CSS, animations, processing instructions
and malformed inputs. A separate origin records network requests, with an
explicit successful fetch control. In the tested Chromium and Firefox builds,
neither the facade nor the native DOMParser control fetched the probe image
during parsing. The script control confirms native execution is available in
the fixture while parsed scripts remain inert after insertion. Receipts are in
results/guest-runtime/parser.json.
