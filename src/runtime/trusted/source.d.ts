declare module 'trusted:policy-source' {
  const source: string;
  export default source;
}
declare module 'trusted:worker-source' {
  const source: string;
  export default source;
}

declare module 'trusted:module-loader-source' {
  const source: string;
  export default source;
}

declare module 'trusted:worklet-compiler' {
  export { rollup } from '@rollup/browser';
}
