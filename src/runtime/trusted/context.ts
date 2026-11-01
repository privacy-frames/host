import { prepareScriptURLs } from '../enforcement/script-urls.ts';

export type TrustedCall = (operation: string, serialized: string) => string;

/** This factory runs before publisher code and never publishes its frame/callable. */
export function createTrustedContext(source: string): TrustedCall {
  const apply = Reflect.apply;
  let result: unknown;
  const frame = document.createElementNS('http://www.w3.org/1999/xhtml', 'iframe');
  if (!(frame instanceof HTMLIFrameElement))
    throw new Error('Trusted frame construction unavailable');
  frame.hidden = true;
  document.documentElement.appendChild(frame);
  try {
    const frameWindow = frame.contentWindow;
    if (!frameWindow) throw new Error('Trusted frame unavailable');
    prepareScriptURLs(frameWindow);
    const evaluate: unknown = Reflect.get(frameWindow, 'eval');
    if (typeof evaluate !== 'function')
      throw new Error('Trusted frame evaluator unavailable');
    result = apply(evaluate, frameWindow, [source]);
  } finally {
    frame.remove();
  }
  if (typeof result !== 'function') throw new Error('Trusted computation missing');
  return (operation, serialized) => {
    if (typeof operation !== 'string' || typeof serialized !== 'string')
      throw new TypeError('Trusted computation accepts text only');
    // Only private trusted code can supply the result. An unexpected exception
    // becomes a local error, never a foreign object exposed through a DOM hook.
    let reply: unknown;
    try {
      reply = apply(result, undefined, [operation, serialized]);
    } catch {
      throw new Error('Trusted computation failed');
    }
    if (typeof reply !== 'string') throw new TypeError('Invalid trusted reply');
    return reply;
  };
}
