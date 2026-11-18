import { createContext, evaluate } from './engine';
const context = await createContext();
const nativeWindow = context.newObject();
context.setProp(context.global, 'window', nativeWindow);
context.setProp(context.global, 'self', nativeWindow);
const getWindow = context.newFunction('getWindow', () => nativeWindow.dup());
context.setProp(context.global, 'getWindow', getWindow);
const callParent = context.newFunction('callParent', () => {
  const nested = parent.contextNested();
  return context.newNumber(nested + 1);
});
context.setProp(context.global, 'callParent', callParent);
globalThis.childGuest = (source) => evaluate(context, source);
parent.contextChildReady();
