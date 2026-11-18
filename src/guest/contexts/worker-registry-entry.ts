export {};

interface Registration {
  application: string;
  generation: string;
  engineWasm: ArrayBuffer;
  workerBootstrap: { dedicated: ArrayBuffer; shared: ArrayBuffer };
}

const scope = self as unknown as SharedWorkerGlobalScope;
const bootstraps = new Map<string, { dedicated: string; shared: string }>();

async function fingerprint(bytes: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

scope.addEventListener('connect', (event) => {
  if (!event.isTrusted) return;
  const port = event.ports[0];
  if (!port) return;
  port.addEventListener('message', async (message: MessageEvent<Registration>) => {
    const request = message.data;
    try {
      if (
        !request ||
        typeof request.application !== 'string' ||
        typeof request.generation !== 'string' ||
        !(request.engineWasm instanceof ArrayBuffer) ||
        !(request.workerBootstrap?.dedicated instanceof ArrayBuffer) ||
        !(request.workerBootstrap.shared instanceof ArrayBuffer)
      )
        throw new TypeError('Invalid trusted worker bootstrap registration');
      const { dedicated, shared } = request.workerBootstrap;
      const key = JSON.stringify([
        request.application,
        request.generation,
        await fingerprint(request.engineWasm),
        await fingerprint(dedicated),
        await fingerprint(shared),
      ]);
      let urls = bootstraps.get(key);
      if (!urls) {
        urls = {
          dedicated: URL.createObjectURL(
            new Blob([dedicated], { type: 'text/javascript' }),
          ),
          shared: URL.createObjectURL(new Blob([shared], { type: 'text/javascript' })),
        };
        bootstraps.set(key, urls);
      }
      port.postMessage({ urls });
    } catch (error) {
      port.postMessage({ error: error instanceof Error ? error.message : String(error) });
    }
  });
  port.start();
});
