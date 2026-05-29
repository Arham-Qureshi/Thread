import cytoscape from 'cytoscape';

document.addEventListener('DOMContentLoaded', () => {
  const extractBtn = document.getElementById('btn-extract');
  const clearBtn = document.getElementById('btn-clear');
  const injectBtn = document.getElementById('btn-inject');
  const modelStatus = document.getElementById('model-status');
  const cyContainer = document.getElementById('cy-container');
  const placeholder = document.getElementById('canvas-placeholder');
  const stateInfo = document.getElementById('state-info');
  const nodeCount = document.getElementById('node-count');
  const edgeCount = document.getElementById('edge-count');
  const toast = document.getElementById('status-toast');

  let toastTimer = null;
  let cy = null;

  function showToast(msg, duration = 2500) {
    toast.textContent = msg;
    toast.classList.remove('hidden');
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), duration);
  }

  function graphElements(graph) {
    const nodes = (graph.nodes || []).map((node) => ({
      data: {
        id: node.id,
        label: node.subtype || node.role || node.type || node.id,
        type: node.type || 'artifact',
      },
    }));

    const edges = (graph.edges || []).map((edge, index) => ({
      data: {
        id: edge.id || edge.source + '-' + edge.target + '-' + index,
        source: edge.source,
        target: edge.target,
        label: edge.relation || '',
      },
    }));

    return [...nodes, ...edges];
  }

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function renderGraph(graph) {
    if (!graph || !graph.nodes || !graph.nodes.length) {
      cyContainer.classList.remove('has-graph');
      if (cy) {
        cy.destroy();
        cy = null;
      }
      return;
    }

    cyContainer.classList.add('has-graph');

    if (cy) cy.destroy();
    const textColor = cssVar('--text-primary');
    const borderColor = cssVar('--border-subtle');
    const taskColor = cssVar('--node-task');
    const artifactColor = cssVar('--node-artifact');

    cy = cytoscape({
      container: cyContainer,
      elements: graphElements(graph),
      style: [
        {
          selector: 'node',
          style: {
            label: 'data(label)',
            'font-family': 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            'font-size': 10,
            color: textColor,
            'text-valign': 'center',
            'text-halign': 'center',
            'text-wrap': 'wrap',
            'text-max-width': 72,
            width: 42,
            height: 42,
            'border-width': 1,
            'border-color': borderColor,
          },
        },
        {
          selector: 'node[type = "task"]',
          style: {
            shape: 'ellipse',
            'background-color': taskColor,
          },
        },
        {
          selector: 'node[type = "artifact"]',
          style: {
            shape: 'round-rectangle',
            'background-color': artifactColor,
          },
        },
        {
          selector: 'edge',
          style: {
            width: 1.5,
            'line-color': borderColor,
            'target-arrow-color': borderColor,
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
          },
        },
      ],
      layout: {
        name: 'cose',
        animate: false,
        fit: true,
        padding: 28,
      },
    });
  }

  function updateUI(graph) {
    if (graph && graph.nodes && graph.nodes.length) {
      placeholder.style.display = 'none';
      stateInfo.classList.remove('hidden');
      nodeCount.textContent = graph.nodes.length + ' nodes';
      edgeCount.textContent = (graph.edges || []).length + ' edges';
      modelStatus.textContent = graph.nodes.length + ' nodes extracted';
      clearBtn.disabled = false;
      injectBtn.disabled = false;
      renderGraph(graph);
    } else {
      placeholder.style.display = '';
      stateInfo.classList.add('hidden');
      modelStatus.textContent = 'No context loaded';
      clearBtn.disabled = true;
      injectBtn.disabled = true;
      renderGraph(null);
    }
  }

  new ResizeObserver(() => {
    if (cy) {
      cy.resize();
      cy.fit(undefined, 28);
    }
  }).observe(cyContainer);

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
      extractBtn.classList.remove('loading');
      extractBtn.disabled = false;

      if (chrome.runtime.lastError || res?.status === 'error') {
        showToast('Extraction failed: ' + (res?.reason || chrome.runtime.lastError?.message));
        return;
      }

      updateUI(res.graph);
      showToast('Graph ready — ' + res.graph.nodes.length + ' nodes');
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
      const payload = 'Reconstruct our current state based on this graph. Use it as compact context for the next task, then wait for my instruction.\n\n'
        + JSON.stringify(data.migrationState);

      chrome.runtime.sendMessage(
        { action: 'INJECT_PAYLOAD', payload },
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
