# QuickJS application qualification

The fork runs unchanged application files in QuickJS while retaining native
browser rendering. Each application check installs through the manager, performs
a useful task, reloads offline and checks the result again. Receipts under
`results/guest-runtime/` record browser versions and artifact hashes.

| Application    | Required interaction                                                                   |
| -------------- | -------------------------------------------------------------------------------------- |
| Notebook       | Save a note and restore it after offline reload                                        |
| Pitch Training | Submit an answer, play piano audio, detect microphone input and retain history offline |
| Wikipedia      | Render the article and scroll to its final section offline                             |
| Excalidraw     | Draw a rectangle and reopen the saved drawing offline                                  |
| diagrams.net   | Place a shape in the diagram and check the rendered result                             |
| StackEdit      | Edit Markdown, render its preview and reopen the saved file offline                    |
| CyberChef      | Run To Base64 and verify the expected output offline                                   |
| PhotoCraft     | Import an image, paint on it and verify the pixels in an approved PNG export offline   |
| Squoosh        | Change MozJPEG quality and export JPEG and threaded AVIF results offline               |

The required interactions pass in Chromium and Firefox. The corpus matrix covers
five third-party applications and a browser-interface fixture in both browsers;
Pitch Training and Notebook have separate installation checks.

`test/guest-corpus-matrix.ts` runs `test/guest-corpus.ts` for both browsers and
rejects stale receipts, changed build artifacts and failed tasks.
`test/guest-pitch.ts` also checks native microphone capture,
track shutdown and denied permission. `test/guest-examples.ts` checks local dynamic
evaluation, prototype extensions, prepared contexts and communication attempts
against an unrestricted receiver control.

`test/guest-wasm-apps.ts` compares PhotoCraft and Squoosh against native controls.
It decodes exported files independently, checks edited pixels or changed compressed
bytes, and repeats the confined task after an offline reload. Squoosh exercises
real shared memory and a 17-worker threaded AVIF path. The private image tasks
must produce no HTTP requests; every download requires host confirmation.

Firefox image checks need WebGL2. The Linux automation uses headed Firefox under
Xvfb with Mesa software rendering for both the native and confined cases; receipts
record the actual renderer. `npm run test:wasm-apps` runs these checks. The public
variant uses `WASM_APPS_PUBLIC=1 PUBLIC_DEPLOYMENT_READY=yes` after deployment and
writes separate public receipts.

Browser resource diagnostics and refused optional scripts remain in the receipts;
JavaScript exceptions, interpreter aborts and failed application tasks fail the
checks. Excalidraw font and export paths need separate qualification. Application
service workers are not executed.

The public results in older `results/evaluation/` files describe the earlier native
runtime. The implementation baseline before this fork is
[3013bd5](https://github.com/privacy-frames/host/tree/3013bd51d4fde27cd8adf327e7009430641c8e40).
