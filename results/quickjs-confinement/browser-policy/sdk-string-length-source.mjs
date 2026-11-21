import { readFile } from 'node:fs/promises';
import { newQuickJSWASMModuleFromVariant, newVariant } from 'quickjs-emscripten-core';
import { quickjsVariant } from '../../../src/guest/quickjs.ts';

const module = await newQuickJSWASMModuleFromVariant(newVariant(quickjsVariant, {
  wasmModule: await WebAssembly.compile(await readFile('vendor/quickjs/generated/engine.wasm')),
}));
const context = module.newContext();
const units = value => Array.from({length:value.length},(_,index)=>value.charCodeAt(index));
try {
  for (const [name, input] of [
    ['ascii','hello'],
    ['astral','A🐼é'],
    ['nul','before\u0000after'],
    ['lone-high','before\ud800after'],
    ['lone-low','before\udc00after'],
    ['replacement','before\ufffdafter'],
  ]) {
    const result = context.evalCode(JSON.stringify(input), 'diagnostic:string-value');
    if (result.error) {
      try { throw new Error(JSON.stringify(context.dump(result.error))); }
      finally { result.error.dispose(); }
    }
    const value = result.value;
    const length = context.getProp(value, 'length');
    try {
      const nativeLength = context.getLength(value);
      const recovered = context.getString(value);
      console.log(JSON.stringify({name,inputLength:input.length,inputUnits:units(input),
        sdkGetLengthType:typeof nativeLength,sdkGetLength:nativeLength??null,
        propertyLength:context.getNumber(length),sdkGetStringLength:recovered.length,
        sdkGetStringUnits:units(recovered),sdkGetStringMatches:recovered===input}));
    } finally { length.dispose(); value.dispose(); }
  }
  for(const expression of ['new String("hello")','[1,2,3]']) {
    const result=context.evalCode(expression,'diagnostic:object-control');
    if(result.error){try{throw new Error(JSON.stringify(context.dump(result.error)));}finally{result.error.dispose();}}
    const length=context.getProp(result.value,'length');
    try{console.log(JSON.stringify({expression,sdkGetLength:context.getLength(result.value),propertyLength:context.getNumber(length)}));}
    finally{length.dispose();result.value.dispose();}
  }
} finally {
  context.dispose();
  console.log(JSON.stringify({disposed:true}));
}
