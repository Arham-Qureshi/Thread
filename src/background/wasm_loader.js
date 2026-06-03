let engineInstance = null;

export async function initWasm() {
  if (engineInstance) return engineInstance;

  const { default: createThreadEngine } = await import(
    /* webpackIgnore: true */ './thread_engine.js'
  );

  const wasmUrl = chrome.runtime.getURL('thread_engine.wasm');

  const module = await createThreadEngine({
    locateFile: (path) => (path.endsWith('.wasm') ? wasmUrl : path),
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