# Native string mapping

CSS declarations, stylesheet text and `Audio` sources now pass through private string-conversion wrappers. Native Web IDL decides when to consume each argument; the wrapper converts the original input once, maps that primitive, and returns a string. Property names, priorities, indices, missing arguments and optional `undefined` arguments retain their native conversion order and defaults.

`setProperty` values and supported CSS property setters treat `null` as empty, as their `LegacyNullToEmptyString` declarations require. `cssText` does not. `replace` and `replaceSync` normalize surrogate code units before mapping because their input type is `USVString`. CSSOM permits each browser to choose `DOMString` or `USVString` for `CSSOMString`; setup determines that choice using the captured native `CSS.escape` operation. Its identifier serializer preserves the distinction without running the CSS parser. Unexpected probe output rejects setup.

Operation matching uses captured native functions and setters. Supported CSS attributes are selected using CSSOM's attribute-name conversion and native `CSS.supports`. Firefox exposes these as prototype setters. Chromium exposes the same family through legacy own data properties: setup records supported names from a fresh trusted declaration; each write checks the native declaration brand and current data-descriptor shape. Unknown accessors and expandos receive their original values. Ordinary own data shadows remain ordinary where the browser supports them.

The focused browser fixture compares native and mediated coercion traces, errors and declarations. It also exercises the actual `BrowserEnvironment` and QuickJS bridge with URLs absent from the installed resource catalog. A temporary build removes the actual setter mapping; the independent mapped-URL assertion must then fail. Media and image loads are blocked by fixture CSP. This checks conversion and resource mapping without an external receiver.

`FontFace` source objects remain a known conversion gap. Its source is a string-or-BufferSource union, and workers can expose `FontFace` without the Window-only `CSS.escape` namespace. Extending the wrapper requires trusted propagation of the native CSSOM string mode and preservation of native BufferSource selection. The existing string-source path remains in place.

These adapters repair pre-effect string mapping for existing routes. Their callable selection still depends on the surrounding browser authorization boundary; this component does not establish complete DOM or CSS confinement.

Sources: pinned `@webref/idl` CSSOM and HTML interfaces; [CSSOM string type](https://drafts.csswg.org/cssom/#cssomstring-type), [CSS attribute declarations](https://drafts.csswg.org/cssom/#the-cssstyledeclaration-interface), [identifier serialization](https://drafts.csswg.org/cssom/#serialize-an-identifier), and [Web IDL string conversion](https://webidl.spec.whatwg.org/#es-DOMString).
