# Trusted bootstrap evaluation mode

This calibration connects the three privacy factory evaluations in `engine.ts` to their explicit global/strict SDK options. It extracts each factory and the identity allocator from the production TypeScript AST, reconstructs the actual evaluation templates, and runs the extracted bodies in the custom QuickJS Wasm module. It does not import factory functions and evaluate their TSX-transformed `toString()` output.

TypeScript ES2022 `transpileModule` erases types from a printed function expression. An outer compiler-generated `use strict` directive is excluded because it is not part of function source; the observed SDK options determine evaluation strictness. The extractor rejects additional runtime helper statements. Compiler correctness, QuickJS lexical environments, the SDK and the compiled module remain trusted premises.

For each production evaluation site, an actual SDK probe checks strict unbound `this`. An independent temporary AST removes precisely those strict options. The same semantic assertion then fails in QuickJS because unbound `this` becomes the global object. This is an evaluation-mode calibration rather than a text-only flag check. Application evaluation remains independently non-strict; the runner also checks the production `evaluate` method's default mode/options shape.

The actual guest runtime captures its native dispatch function, removes the temporary global name and uses that retained function through a small published proxy. Direct global-identity scans find neither the returned helper container/functions nor the binary installer's private arguments/alias container. The binary installer receives an empty description catalog for this check. Native binary behavior and transitive heap nonreachability are outside the scan's scope.

The receipt characterizes `caller`/`arguments` poison accessors for strict and non-strict functions and a published binary wrapper. Strict functions throw in this pin; inactive non-strict functions return `undefined`, including direct invocation of the inherited getters. The calibration makes no inference about active frames or private values. These observations describe the pinned QuickJS implementation; they do not establish a current escape or a complete C5 privacy proof.

Run the calibration from the repository root:

```sh
node --import tsx formal/quickjs/bootstrap-mode/check.ts
```

Results are written to `results/quickjs-confinement/bootstrap-mode/calibration.json` with source, extracted-body and toolchain hashes. Every input hash is checked again before publication.
