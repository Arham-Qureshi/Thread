const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WASM_DIR = path.join(ROOT, 'src', 'wasm_engine');
const BUILD_DIR = path.join(WASM_DIR, 'build');
const EMSDK_DIR = path.join(ROOT, 'emsdk');
const LOCAL_EMCC = path.join(EMSDK_DIR, 'upstream', 'emscripten', 'emcc');

const SOURCES = ['GraphBuilder.cpp', 'textrank.cpp'];

const EMCC_FLAGS = [
  '-O2',
  '-s', 'MODULARIZE=1',
  '-s', 'EXPORT_NAME=createThreadEngine',
  '-s', 'EXPORT_ES6=1',
  '-s', 'ENVIRONMENT=worker',
  '-s', `EXPORTED_FUNCTIONS=['_processString','_buildGraph','_malloc','_free']`,
  '-s', `EXPORTED_RUNTIME_METHODS=['ccall','cwrap','UTF8ToString']`,
  '-s', 'ALLOW_MEMORY_GROWTH=1',
  '-s', 'NO_EXIT_RUNTIME=1',
  '--no-entry',
];

function findEmcc() {
  if (fs.existsSync(LOCAL_EMCC)) {
    console.log(`[wasm] Found local emcc at ${LOCAL_EMCC}`);
    return LOCAL_EMCC;
  }
  try {
    execSync('emcc --version', { stdio: 'ignore' });
    console.log('[wasm] Found emcc on system PATH');
    return 'emcc';
  } catch {
    return null;
  }
}

function downloadEmsdk() {
  console.log('[wasm] Emscripten SDK not found. Downloading...');

  if (!fs.existsSync(EMSDK_DIR)) {
    console.log('[wasm] Cloning emsdk repository...');
    try {
      execSync('git clone https://github.com/emscripten-core/emsdk.git', {
        cwd: ROOT,
        stdio: 'inherit',
      });
    } catch {
      throw new Error(
        'Failed to clone emsdk. Ensure git is installed, or manually install Emscripten:\n' +
        '  https://emscripten.org/docs/getting_started/downloads.html'
      );
    }
  }

  const isWin = process.platform === 'win32';
  const emsdkCmd = path.join(EMSDK_DIR, isWin ? 'emsdk.bat' : 'emsdk');

  console.log('[wasm] Installing latest Emscripten SDK (this may take a few minutes)...');

  if (fs.existsSync(emsdkCmd)) {
    execSync(`"${emsdkCmd}" install latest`, { cwd: EMSDK_DIR, stdio: 'inherit' });
    execSync(`"${emsdkCmd}" activate latest`, { cwd: EMSDK_DIR, stdio: 'inherit' });
  } else {
    execSync('python3 emsdk.py install latest', { cwd: EMSDK_DIR, stdio: 'inherit' });
    execSync('python3 emsdk.py activate latest', { cwd: EMSDK_DIR, stdio: 'inherit' });
  }

  if (fs.existsSync(LOCAL_EMCC)) {
    console.log('[wasm] Emscripten SDK installed successfully.');
    return LOCAL_EMCC;
  }

  throw new Error(
    'emcc not found after installation. Try installing manually:\n' +
    '  https://emscripten.org/docs/getting_started/downloads.html'
  );
}

function build(emcc) {
  fs.mkdirSync(BUILD_DIR, { recursive: true });

  const sources = SOURCES.map(s => path.join(WASM_DIR, s));
  const outJs = path.join(BUILD_DIR, 'thread_engine.js');
  const args = [...sources, '-o', outJs, ...EMCC_FLAGS];

  console.log('[wasm] Compiling WASM...');
  const result = spawnSync(emcc, args, {
    cwd: WASM_DIR,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error(`emcc compilation failed with exit code ${result.status}`);
  }

  console.log('[wasm] WASM build complete.');
}

try {
  const emcc = findEmcc() || downloadEmsdk();
  build(emcc);
} catch (err) {
  console.error('[wasm] Build failed:', err.message);
  process.exit(1);
}
