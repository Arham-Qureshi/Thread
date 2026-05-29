import { initWasm, getEngine } from './wasm_loader.js';

const wasmReady = initWasm()
  .then(() => {
    console.log('[Thread] WASM engine loaded');
  })
  .catch((err) => {
    console.error('[Thread] WASM engine failed to load:', err);
    throw err;
  });

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'EXTRACT_DOM':
      chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['generic_extractor.bundle.js'],
        }).then(() => {
          sendResponse({ status: 'injected', tabId: tab.id });
        }).catch((err) => {
          sendResponse({ status: 'error', reason: err.message });
        });
      });
      return true;

    case 'EXTRACT_COMPLETE':
      console.log('[Thread] Extraction complete:', message.payload?.length, 'turns');
      chrome.storage.local.set({ extractedData: message.payload });
      sendResponse({ status: 'stored', count: message.payload?.length });
      break;

    case 'PROCESS_GRAPH':
      (async () => {
        try {
          const messages = Array.isArray(message.payload)
            ? message.payload
            : JSON.parse(message.payload);

          await wasmReady;

          const engine = getEngine();
          if (!engine) {
            throw new Error('WASM engine initialized without an engine instance');
          }

          const graphJson = engine.buildGraph(JSON.stringify(messages));
          const graph = JSON.parse(graphJson);

          chrome.storage.local.set({ migrationState: graph });
          console.log('[Thread] Graph built via WASM');
          console.log('[Thread] Graph:', graph.nodes?.length, 'nodes,', graph.edges?.length, 'edges');
          sendResponse({ status: 'ok', graph });
        } catch (err) {
          console.error('[Thread] Graph processing failed:', err);
          sendResponse({ status: 'error', reason: err.message });
        }
      })();
      return true;

    case 'INJECT_PAYLOAD':
      chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
        const payload = typeof message.payload === 'string'
          ? message.payload
          : JSON.stringify(message.payload);

        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['generic_injector.bundle.js'],
        }).then(() => chrome.tabs.sendMessage(tab.id, {
          action: 'THREAD_INJECT_PAYLOAD',
          payload,
        })).then((res) => {
          sendResponse(res || { status: 'ok' });
        }).catch((err) => {
          sendResponse({ status: 'error', reason: err.message });
        });
      });
      return true;

    default:
      sendResponse({ status: 'error', reason: 'unknown_action' });
  }
  return true;
});
