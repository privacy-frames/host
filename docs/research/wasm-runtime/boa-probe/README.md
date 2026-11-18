# Reproduce the Boa browser probe

This fixture runs guest JavaScript inside pinned Boa Wasm. Its browser bridge admits fixed operations only. It is not an application runtime or DOM library. The result files intentionally retain a generated Web IDL compatibility failure, so the probe currently exits 1.

Prerequisites: Rust with `wasm32-unknown-unknown`, wasm-bindgen CLI 0.2.130, Node 24 and Playwright Chromium/Firefox. Install the CLI with `cargo install wasm-bindgen-cli --version 0.2.130 --locked` and the Rust target with `rustup target add wasm32-unknown-unknown` if missing.

From this directory:

```sh
npm ci
npx playwright install chromium firefox
npm run build
npm run typecheck
PITCH_SOURCE=/absolute/path/to/original/pitch-main-current.js npm run probe
```

The Pitch source must be the original 287,996-byte bundle with SHA-256 `5bf9a6fd27798274c5a5c03473a66ee96ecc6bfe8bd4c04c78ac1c93d55ca5ff`. The default local source path is recorded in run.ts. This publisher bundle is not redistributed here. The generated Web IDL fixture is retained locally; `GENERATED_SOURCE` can explicitly override it. `PLAYWRIGHT_PACKAGE` optionally selects another installed package.json for resolving Playwright.

For the failing callback-source-evaluation control, use `CALLBACK_MODE=eval npm run probe`. This deliberately replaces function calls with nested evaluation. Results are written as `receipts/*-nested-eval-control.json`. Normal probe results use `receipts/chromium.json` and `receipts/firefox.json`.

For Intl:

```sh
cargo build --locked --target wasm32-unknown-unknown --release --features intl
wasm-bindgen target/wasm32-unknown-unknown/release/boa_browser_probe.wasm --target web --out-dir pkg
BUILD_VARIANT=intl npm run probe
```

`BUILD_VARIANT` labels receipts; it does not change the binary. The embedding source and Cargo.lock determine features. The `.gitignore` excludes compiled output and node_modules. JSON receipts record the actual binary hash and size. The original report explains which claims are executed, failed, inferred or untested.

`fixtures/generated-guest.js` was copied without edits from the companion binding study's esbuild output. Its source is webidl2js 21.2.0 plus the study's `StudyNode` fixture and webidl-conversions 8.0.0. Hash: `694ed34dd15e3e6043d0358180738d626580118c559d4b528e4150abb7131579`. The companion study retains the generator inputs and dependency lock. Third-party license notices accompany the bundle.
