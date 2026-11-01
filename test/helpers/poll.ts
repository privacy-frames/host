import { setTimeout as delay } from 'node:timers/promises';

/** Await each Boolean result, including asynchronous browser observations. */
export async function waitUntil(
  predicate: () => boolean | Promise<boolean>,
  message: string,
  timeoutMs = 12000,
  intervalMs = 50,
): Promise<void> {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  try {
    await Promise.race([
      timeout,
      (async () => {
        while (!stopped) {
          if (await predicate()) return;
          await delay(intervalMs);
        }
      })(),
    ]);
  } finally {
    stopped = true;
    clearTimeout(timer);
  }
}
