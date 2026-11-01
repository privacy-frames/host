import test from 'node:test';
import assert from 'node:assert/strict';
import { bootstrapSource } from '../src/runtime/bootstrap-source.ts';

const headers = { 'Content-Type': 'text/javascript;charset=utf-8' };

test('local kernel encoding preserves UTF-8 across chunk boundaries', async () => {
  const code = 'const value = "π🙂";\n'.repeat(4000);
  const source = await bootstrapSource(new Response(code, { headers }));
  assert(source.startsWith('data:text/javascript;charset=utf-8;base64,'));
  assert.equal(await (await fetch(source)).text(), code);
});

test('missing, refused and non-JavaScript kernel responses fail preparation', async () => {
  for (const response of [
    undefined,
    new Response('refused', { status: 403, headers }),
    new Response('<html>not code</html>', { headers: { 'Content-Type': 'text/html' } }),
  ])
    await assert.rejects(bootstrapSource(response), /Trusted bootstrap is unavailable/);
});

test('empty kernel bytes fail preparation', async () => {
  await assert.rejects(
    bootstrapSource(new Response('', { headers })),
    /bootstrap is empty/,
  );
});

test('a kernel body read failure propagates without a fallback', async () => {
  const failed = new ReadableStream({
    start(controller) {
      controller.error(new Error('Kernel body unavailable'));
    },
  });
  await assert.rejects(bootstrapSource(new Response(failed, { headers })), {
    message: 'Kernel body unavailable',
  });
});
