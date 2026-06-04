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
      console.log('[Thread] PROCESS_GRAPH received');
      sendResponse({ status: 'ok', action: 'PROCESS_GRAPH' });
      break;

    case 'INJECT_PAYLOAD':
      console.log('[Thread] INJECT_PAYLOAD received');
      sendResponse({ status: 'ok', action: 'INJECT_PAYLOAD' });
      break;

    default:
      sendResponse({ status: 'error', reason: 'unknown_action' });
  }
  return true;
});