import { initWasm, getEngine } from './wasm_loader.js';

let wasmReady = false;

initWasm()
  .then(() => {
    wasmReady = true;
    console.log('[Thread] WASM engine loaded');
  })
  .catch((err) => console.warn('[Thread] WASM not available:', err.message));

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

    case 'PROCESS_GRAPH': {
      const engine = getEngine();
      if (!engine) {
        sendResponse({ status: 'error', reason: 'WASM not loaded' });
        break;
      }
      const jsonInput = typeof message.payload === 'string'
        ? message.payload
        : JSON.stringify(message.payload);
      const graphJson = engine.buildGraph(jsonInput);
      const graph = JSON.parse(graphJson);
      chrome.storage.local.set({ migrationState: graph });
      console.log('[Thread] Graph built:', graph.nodes?.length, 'nodes,', graph.edges?.length, 'edges');
      sendResponse({ status: 'ok', graph });
      break;
    }

    case 'INJECT_PAYLOAD':
      console.log('[Thread] INJECT_PAYLOAD received');
      sendResponse({ status: 'ok', action: 'INJECT_PAYLOAD' });
      break;

    default:
      sendResponse({ status: 'error', reason: 'unknown_action' });
  }
  return true;
});