# Choose the DOM and browser binding boundary

Type: grilling
Label: wayfinder:grilling
Status: resolved
Assignee: DamenH
Blocked by: 01-quickjs-capabilities.md, 02-boa-capabilities.md, 03-current-demo-contract.md

## Question

Should the application use the browser's real DOM, HTML/CSS layout and rendering
through mediated guest objects, or should the new host implement a virtual
browser/renderer? What behavior must this strategy preserve?

## Answer

Damen agreed to native browser DOM and rendering on 2026-11-17. Do not implement
HTML/CSS layout or replace the application's HTML interface with canvas rendering.
The guest receives mediated representations of browser objects; application
callbacks execute in the guest engine. Native canvas and other browser facilities
remain available for applications that actually use them.

Preserve synchronous DOM reads/mutations and event behavior. This selects the
binding strategy, not a completed implementation or proof. Binding-library reuse,
object identity, callback reentry, code-execution routes and external effects
still require investigation and contracts on the remaining tickets.
