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

The required interactions pass in Chromium and Firefox. The corpus matrix covers
five third-party applications and a browser-interface fixture in both browsers;
Pitch Training and Notebook have separate installation checks.

`test/guest-corpus-matrix.ts` runs `test/guest-corpus.ts` for both browsers and
rejects stale receipts, changed build artifacts and failed tasks. It covers the larger applications and an independent DOM
compatibility fixture. `test/guest-pitch.ts` also checks native microphone capture,
track shutdown and denied permission. `test/guest-examples.ts` checks local dynamic
evaluation, prototype extensions, prepared contexts and communication attempts
against an unrestricted receiver control.

PhotoCraft and Squoosh require application Wasm, which is deferred for this fork.
Excalidraw font and export paths that require Wasm need separate qualification.
Application service workers are not executed.

The public results in older `results/evaluation/` files describe the earlier native
runtime. The implementation baseline before this fork is
[3013bd5](https://github.com/privacy-frames/host/tree/3013bd51d4fde27cd8adf327e7009430641c8e40).
