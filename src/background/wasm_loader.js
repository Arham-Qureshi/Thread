import createThreadEngine from '../wasm_engine/build/thread_engine.js';

let engineInstance = null;

export async function initWasm() {
  if (engineInstance) return engineInstance;

  const wasmUrl = chrome.runtime.getURL('thread_engine.wasm');
  const baseDir = chrome.runtime.getURL('');

  const module = await createThreadEngine({
    locateFile: (path) => (path.endsWith('.wasm') ? wasmUrl : baseDir + path),
    scriptDirectory: baseDir,
  });

  engineInstance = {
    processString: (input) => {
      const ptr = module.ccall('processString', 'number', ['string'], [input]);
      return module.UTF8ToString(ptr);
    },
    buildGraph: (jsonInput) => {
      const ptr = module.ccall('buildGraph', 'number', ['string'], [jsonInput]);
      return module.UTF8ToString(ptr);
    },
  };

  return engineInstance;
}

export function getEngine() {
  return engineInstance;
}
