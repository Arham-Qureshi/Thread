import { initWasm, getEngine } from './wasm_loader.js';

const wasmReady = initWasm()
  .then(() => {
    console.log('[Thread] WASM engine loaded');
  })
  .catch((err) => {
    console.error('[Thread] WASM engine failed to load:', err);
    throw err;
  });

let pendingExtraction = null;

async function buildGraph(messages) {
  await wasmReady;

  const engine = getEngine();
  if (!engine) {
    throw new Error('WASM engine initialized without an engine instance');
  }

  const graphJson = engine.buildGraph(JSON.stringify(messages));
  return JSON.parse(graphJson);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'EXTRACT_DOM':
      if (pendingExtraction) {
        sendResponse({ status: 'error', reason: 'Extraction already in progress' });
        return true;
      }

      pendingExtraction = {
        sendResponse,
        timeoutId: setTimeout(() => {
          if (!pendingExtraction) return;
          pendingExtraction.sendResponse({ status: 'error', reason: 'Extraction timed out' });
          pendingExtraction = null;
        }, 8000),
      };

      chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['generic_extractor.bundle.js'],
        }).catch((err) => {
          if (pendingExtraction) clearTimeout(pendingExtraction.timeoutId);
          pendingExtraction = null;
          sendResponse({ status: 'error', reason: err.message });
        });
      });
      return true;

    case 'EXTRACT_COMPLETE':
      (async () => {
        const messages = Array.isArray(message.payload) ? message.payload : [];
        console.log('[Thread] Extraction complete:', messages.length, 'turns');
        await chrome.storage.local.set({ extractedData: messages });

        if (!pendingExtraction) {
          sendResponse({ status: 'stored', count: messages.length });
          return;
        }

        const pending = pendingExtraction;
        pendingExtraction = null;
        clearTimeout(pending.timeoutId);

        try {
          if (!messages.length) {
            throw new Error('No conversation found on this page');
          }

          const graph = await buildGraph(messages);
          await chrome.storage.local.set({ migrationState: graph });
          console.log('[Thread] Graph built via WASM');
          console.log('[Thread] Graph:', graph.nodes?.length, 'nodes,', graph.edges?.length, 'edges');
          pending.sendResponse({ status: 'ok', graph, count: messages.length });
          sendResponse({ status: 'stored', count: messages.length });
        } catch (err) {
          pending.sendResponse({ status: 'error', reason: err.message });
          sendResponse({ status: 'error', reason: err.message });
        }
      })();
      return true;

    case 'PROCESS_GRAPH':
      (async () => {
        try {
          const messages = Array.isArray(message.payload)
            ? message.payload
            : JSON.parse(message.payload);

          const graph = await buildGraph(messages);

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

    case 'MIGRATE_PAYLOAD':
      (async () => {
        const PLATFORM_URLS = {
          chatgpt: 'https://chatgpt.com/',
          claude: 'https://claude.ai/new',
          gemini: 'https://gemini.google.com/app',
        };

        const targetUrl = PLATFORM_URLS[message.platform];
        if (!targetUrl) {
          sendResponse({ status: 'error', reason: 'Unknown platform: ' + message.platform });
          return;
        }

        const payload = typeof message.payload === 'string'
          ? message.payload
          : JSON.stringify(message.payload);

        try {
          const tab = await chrome.tabs.create({ url: targetUrl });

          // Wait for the new tab to finish loading
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              chrome.tabs.onUpdated.removeListener(listener);
              reject(new Error('Tab load timed out after 15s'));
            }, 15000);

            function listener(tabId, changeInfo) {
              if (tabId === tab.id && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                clearTimeout(timeout);
                resolve();
              }
            }
            chrome.tabs.onUpdated.addListener(listener);
          });

          // Buffer for framework hydration
          await new Promise((r) => setTimeout(r, 1500));

          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['generic_injector.bundle.js'],
          });

          const res = await chrome.tabs.sendMessage(tab.id, {
            action: 'THREAD_INJECT_PAYLOAD',
            payload,
          });

          sendResponse(res || { status: 'ok' });
        } catch (err) {
          console.error('[Thread] Migration failed:', err);
          sendResponse({ status: 'error', reason: err.message });
        }
      })();
      return true;

    default:
      sendResponse({ status: 'error', reason: 'unknown_action' });
  }
  return true;
});
