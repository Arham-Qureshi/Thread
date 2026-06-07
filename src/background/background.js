import { initWasm, getEngine } from './wasm_loader.js';

let wasmReady = false;

initWasm()
  .then(() => {
    wasmReady = true;
    console.log('[Thread] WASM engine loaded');
  })
  .catch((err) => console.warn('[Thread] WASM not available, using JS fallback:', err.message));

function buildGraphJS(messages) {
  const nodes = [];
  const edges = [];
  let tIdx = 0, aIdx = 0;
  let prevId = null;

  for (const msg of messages) {
    const tid = 't' + tIdx++;

    let summary = msg.content || '';
    summary = summary.replace(/```[\s\S]*?```/g, '');
    if (summary.length > 120) summary = summary.slice(0, 120) + '...';

    nodes.push({ id: tid, type: 'task', role: msg.role, content: summary.trim() });

    if (prevId) edges.push({ source: prevId, target: tid, relation: 'sequence' });
    prevId = tid;

    const codeRx = /```(\w*)\n([\s\S]*?)```/g;
    let m;
    while ((m = codeRx.exec(msg.content)) !== null) {
      const aid = 'a' + aIdx++;
      nodes.push({ id: aid, type: 'artifact', subtype: 'code', language: m[1], content: m[2].trimEnd() });
      edges.push({ source: tid, target: aid, relation: 'contains' });
    }

    const linkRx = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
    while ((m = linkRx.exec(msg.content)) !== null) {
      const aid = 'a' + aIdx++;
      nodes.push({ id: aid, type: 'artifact', subtype: 'link', content: m[2] });
      edges.push({ source: tid, target: aid, relation: 'references' });
    }

    const boldRx = /\*\*(.{1,80}?)\*\*/g;
    while ((m = boldRx.exec(msg.content)) !== null) {
      const aid = 'a' + aIdx++;
      nodes.push({ id: aid, type: 'artifact', subtype: 'variable', content: m[1] });
      edges.push({ source: tid, target: aid, relation: 'mentions' });
    }
  }

  return { nodes, edges };
}

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
      const messages = Array.isArray(message.payload)
        ? message.payload
        : JSON.parse(message.payload);

      let graph;
      const engine = getEngine();

      if (engine) {
        const graphJson = engine.buildGraph(JSON.stringify(messages));
        graph = JSON.parse(graphJson);
        console.log('[Thread] Graph built via WASM');
      } else {
        graph = buildGraphJS(messages);
        console.log('[Thread] Graph built via JS fallback');
      }

      chrome.storage.local.set({ migrationState: graph });
      console.log('[Thread] Graph:', graph.nodes?.length, 'nodes,', graph.edges?.length, 'edges');
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