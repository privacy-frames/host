import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = resolve(root, 'vendor/quickjs');
export const quickjsWasm = resolve(source, 'generated/engine.wasm');

/** Build the engine and its matching loader together; never use the npm binary. */
export async function buildQuickJS() {
  const hash = createHash('sha256');
  hash.update(await readFile(import.meta.filename));
  for (const path of (await readdir(source, { recursive: true })).sort()) {
    if (path.startsWith('generated/')) continue;
    if (!/\.(c|h|js|json)$/.test(path) && !path.endsWith('VERSION')) continue;
    hash.update(path);
    hash.update(await readFile(resolve(source, path)));
  }
  const sourceHash = hash.digest('hex');
  const output = resolve(source, 'generated');
  const receiptPath = resolve(output, 'build.json');
  try {
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
    const wasm = await readFile(quickjsWasm);
    const loader = await readFile(resolve(output, 'engine.mjs'));
    if (
      receipt.sourceHash === sourceHash &&
      receipt.wasmHash === digest(wasm) &&
      receipt.loaderHash === digest(loader)
    )
      return;
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    // An absent or interrupted build is rebuilt from the checked-in source.
  }

  await mkdir(output, { recursive: true });
  const config: { optimization: string[]; toolchain: { image: string } } = JSON.parse(
    await readFile(resolve(source, 'source.json'), 'utf8'),
  );
  const wrapper = await readFile(resolve(source, 'c/interface.c'), 'utf8');
  // Match the upstream synchronous release ABI, excluding debug/Asyncify exports.
  const symbols = [...wrapper.matchAll(/^([\w()* ]+[\s*]+)(QTS_\w+)\((.*?)\) ?\{$/gm)]
    .filter((match) => !/AsyncifyOnly|DebugOnly/.test(match[1]))
    .map((match) => `_${match[2]}`);
  symbols.push('_malloc', '_free');
  await writeFile(resolve(output, 'symbols.json'), JSON.stringify(symbols));

  const version = (await readFile(resolve(source, 'upstream/VERSION'), 'utf8')).trim();
  const flags = [
    ...config.optimization,
    '-D_GNU_SOURCE',
    `-DCONFIG_VERSION="${version}"`,
    '-DCONFIG_STACK_CHECK',
    '-Wcast-function-type',
    '-sMODULARIZE=1',
    '-sEXPORT_ES6=1',
    '-sEXPORT_NAME=QuickJSRaw',
    '-sENVIRONMENT=web,worker',
    '-sIMPORTED_MEMORY=1',
    '-sINVOKE_RUN=0',
    '-sALLOW_MEMORY_GROWTH=1',
    '-sALLOW_TABLE_GROWTH=1',
    '-sSTACK_SIZE=5MB',
    '-sSUPPORT_ERRNO=0',
    '-sIGNORE_MISSING_MAIN=0',
    '--no-entry',
    '-sAUTO_JS_LIBRARIES=0',
    '-lccall.js',
    '-sAUTO_NATIVE_LIBRARIES=0',
    '-sAUTO_ARCHIVE_INDEXES=0',
    '-sDEFAULT_TO_CXX=0',
    '-sALLOW_UNIMPLEMENTED_SYSCALLS=0',
    '-sFILESYSTEM=0',
    '-sEXPORTED_FUNCTIONS=@/output/symbols.json',
    '-sEXPORTED_RUNTIME_METHODS=@/source/runtime-methods.json',
    '--pre-js',
    '/source/pre-extension.js',
    '--pre-js',
    '/source/pre-wasmMemory.js',
    '/source/c/interface.c',
    ...['quickjs', 'dtoa', 'libregexp', 'libunicode', 'cutils', 'quickjs-libc'].map(
      (name) => `/source/upstream/${name}.c`,
    ),
    '-o',
    '/output/engine.mjs',
  ];
  console.log(
    `Building vendored QuickJS ${version} with ${config.optimization.join(' ')}`,
  );
  execFileSync(
    'docker',
    [
      'run',
      '--rm',
      '--network=none',
      '-v',
      `${source}:/source:ro`,
      '-v',
      `${output}:/output`,
      '-e',
      `BUILD_OWNER=${process.getuid!()}:${process.getgid!()}`,
      config.toolchain.image,
      'sh',
      '-c',
      'emcc "$@" && chown "$BUILD_OWNER" /output/engine.mjs /output/engine.wasm',
      'build-quickjs',
      ...flags,
    ],
    { stdio: 'inherit' },
  );
  await writeFile(
    receiptPath,
    JSON.stringify(
      {
        sourceHash,
        wasmHash: digest(await readFile(quickjsWasm)),
        loaderHash: digest(await readFile(resolve(output, 'engine.mjs'))),
        toolchain: config.toolchain.image,
        optimization: config.optimization,
      },
      null,
      2,
    ) + '\n',
  );
}

function digest(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex');
}

if (process.argv[1] === import.meta.filename) await buildQuickJS();
