document.addEventListener('DOMContentLoaded', () => {
  const extractBtn = document.getElementById('btn-extract');
  const clearBtn = document.getElementById('btn-clear');
  const injectBtn = document.getElementById('btn-inject');
  const modelStatus = document.getElementById('model-status');
  const placeholder = document.getElementById('canvas-placeholder');
  const stateInfo = document.getElementById('state-info');
  const nodeCount = document.getElementById('node-count');
  const edgeCount = document.getElementById('edge-count');
  const toast = document.getElementById('status-toast');

  let toastTimer = null;

  function showToast(msg, duration = 2500) {
    toast.textContent = msg;
    toast.classList.remove('hidden');
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), duration);
  }

  function updateUI(graph) {
    if (graph && graph.nodes && graph.nodes.length) {
      placeholder.style.display = 'none';
      stateInfo.classList.remove('hidden');
      nodeCount.textContent = graph.nodes.length + ' nodes';
      edgeCount.textContent = graph.edges.length + ' edges';
      modelStatus.textContent = graph.nodes.length + ' nodes extracted';
      clearBtn.disabled = false;
      injectBtn.disabled = false;
    } else {
      placeholder.style.display = '';
      stateInfo.classList.add('hidden');
      modelStatus.textContent = 'No context loaded';
      clearBtn.disabled = true;
      injectBtn.disabled = true;
    }
  }

  // Load persisted state on popup open
  chrome.storage.local.get('migrationState', (data) => {
    updateUI(data.migrationState);
  });

  // Extract Context
  extractBtn.addEventListener('click', () => {
    extractBtn.classList.add('loading');
    extractBtn.disabled = true;
    showToast('Extracting from active tab…');

    chrome.runtime.sendMessage({ action: 'EXTRACT_DOM' }, (res) => {
      if (chrome.runtime.lastError || res?.status === 'error') {
        showToast('Extraction failed: ' + (res?.reason || chrome.runtime.lastError?.message));
        extractBtn.classList.remove('loading');
        extractBtn.disabled = false;
        return;
      }

      // Wait for content script to finish, then process the graph
      setTimeout(() => {
        chrome.storage.local.get('extractedData', (data) => {
          const turns = data.extractedData;
          if (!turns || !turns.length) {
            showToast('No conversation found on this page');
            extractBtn.classList.remove('loading');
            extractBtn.disabled = false;
            return;
          }

          showToast('Building graph from ' + turns.length + ' turns…');
          chrome.runtime.sendMessage({ action: 'PROCESS_GRAPH', payload: turns }, (graphRes) => {
            extractBtn.classList.remove('loading');
            extractBtn.disabled = false;

            if (graphRes?.status === 'ok') {
              updateUI(graphRes.graph);
              showToast('Graph ready — ' + graphRes.graph.nodes.length + ' nodes');
            } else {
              showToast('Graph processing failed: ' + (graphRes?.reason || 'unknown'));
            }
          });
        });
      }, 600);
    });
  });

  // Clear State
  clearBtn.addEventListener('click', () => {
    chrome.storage.local.remove(['migrationState', 'extractedData'], () => {
      updateUI(null);
      showToast('State cleared');
    });
  });

  // Inject Context
  injectBtn.addEventListener('click', () => {
    chrome.storage.local.get('migrationState', (data) => {
      if (!data.migrationState) {
        showToast('Nothing to inject — extract first');
        return;
      }
      injectBtn.classList.add('loading');
      injectBtn.disabled = true;
      chrome.runtime.sendMessage(
        { action: 'INJECT_PAYLOAD', payload: data.migrationState },
        (res) => {
          injectBtn.classList.remove('loading');
          injectBtn.disabled = false;
          if (res?.status === 'ok') {
            showToast('Context injected into active tab');
          } else {
            showToast('Injection failed: ' + (res?.reason || 'unknown'));
          }
        }
      );
    });
  });
});