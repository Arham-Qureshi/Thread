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
  const expandBtn = document.getElementById('btn-expand');
  const iconExpand = document.getElementById('icon-expand');
  const iconCollapse = document.getElementById('icon-collapse');
  const canvasArea = document.getElementById('canvas-area');

  let toastTimer = null;
  let cy = null;

  const spinnerSvg = `<svg class="spinner-icon" viewBox="0 0 50 50"><circle cx="25" cy="25" r="20"></circle></svg>`;

  function setLoading(btn, isLoading) {
    const iconContainer = btn.querySelector('.btn-icon');
    if (isLoading) {
      btn.dataset.originalIcon = iconContainer.innerHTML;
      iconContainer.innerHTML = spinnerSvg;
      btn.classList.add('loading');
      btn.disabled = true;
    } else {
      if (btn.dataset.originalIcon) {
        iconContainer.innerHTML = btn.dataset.originalIcon;
      }
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }

  function showToast(msg, duration = 2500) {
    toast.textContent = msg;
    toast.classList.remove('hidden');
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), duration);
  }

  function extractKeywords(text) {
    if (!text || typeof text !== 'string') return '';
    const words = text.match(/\b[A-Za-z_][A-Za-z0-9_]*\b/g) || [];
    const scores = new Map();

    for (const word of words) {
      // Skip very short words
      if (word.length <= 3 && word === word.toLowerCase()) continue;

      let score = 1;
      if (/^[A-Z]/.test(word)) score += 2;
      // analyzing code pattern
      if (/[0-9_]/.test(word) || (/[a-z]/.test(word) && /[A-Z]/.test(word))) score += 3;
      score += Math.min(word.length / 5, 2);

      const key = word.toLowerCase();
      scores.set(key, (scores.get(key) || 0) + score);
    }

    const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]);
    if (!sorted.length) return text.split(' ').slice(0, 2).join(' ').substring(0, 20);
    return sorted.slice(0, 2).map(e => e[0].charAt(0).toUpperCase() + e[0].slice(1)).join(' ');
  }

  function extractUrlLabel(urlStr) {
    try {
      const url = new URL(urlStr);
      const parts = url.hostname.replace(/^www\./, '').split('.');
      const domain = parts.length > 1 ? parts[parts.length - 2] : parts[0];

      if (['github', 'google', 'wikipedia', 'npmjs', 'youtube'].includes(domain) && url.pathname.length > 1) {
        const pathSeg = url.pathname.split('/').find(Boolean);
        if (pathSeg) return pathSeg.charAt(0).toUpperCase() + pathSeg.slice(1);
      }
      return domain.charAt(0).toUpperCase() + domain.slice(1);
    } catch (e) {
      return extractKeywords(urlStr);
    }
  }

  function generateNodeLabel(content, type) {
    if (!content) return type.charAt(0).toUpperCase() + type.slice(1);
    if (type === 'link') return extractUrlLabel(content);
    return extractKeywords(content);
  }

  function graphElements(graph) {
    const nodes = (graph.nodes || []).map((node) => {
      const type = node.role || node.subtype || node.type || 'artifact';
      return {
        data: {
          id: node.id,
          label: generateNodeLabel(node.content, type),
          type: type,
        },
      };
    });

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
    const userColor = cssVar('--node-user');
    const assistantColor = cssVar('--node-assistant');
    const variableColor = cssVar('--node-variable');
    const linkColor = cssVar('--node-link');
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
          selector: 'node[type = "user"]',
          style: {
            shape: 'round-rectangle',
            'background-color': userColor,
            color: '#fff',
            'border-width': 0,
          },
        },
        {
          selector: 'node[type = "assistant"]',
          style: {
            shape: 'round-rectangle',
            'background-color': assistantColor,
            color: '#fff',
            'border-width': 0,
          },
        },
        {
          selector: 'node[type = "variable"]',
          style: {
            shape: 'ellipse',
            'background-color': variableColor,
            color: '#fff',
            'border-width': 0,
          },
        },
        {
          selector: 'node[type = "link"]',
          style: {
            shape: 'hexagon',
            'background-color': linkColor,
            color: '#fff',
            'border-width': 0,
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

  // Toggle Expanded View
  expandBtn.addEventListener('click', () => {
    const isExpanded = canvasArea.classList.toggle('expanded');
    if (isExpanded) {
      iconExpand.style.display = 'none';
      iconCollapse.style.display = 'block';
    } else {
      iconExpand.style.display = 'block';
      iconCollapse.style.display = 'none';
    }
    setTimeout(() => {
      if (cy) {
        cy.resize();
        cy.fit(undefined, 28);
      }
    }, 400);
  });

  // Extract Context
  extractBtn.addEventListener('click', () => {
    setLoading(extractBtn, true);
    showToast('Extracting from active tab…');

    chrome.runtime.sendMessage({ action: 'EXTRACT_DOM' }, (res) => {
      setLoading(extractBtn, false);

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

  // Migration Modal
  const migrationModal = document.getElementById('migration-modal');
  const modalCloseBtn = document.getElementById('modal-close');
  const platformCards = document.querySelectorAll('.platform-card');
  let currentMigrationPayload = null;

  function openModal() {
    migrationModal.classList.remove('hidden');
  }

  function closeModal() {
    migrationModal.classList.add('hidden');
  }

  function handleMigration(platformId) {
    closeModal();
    showToast('Migrating to ' + platformId + '…');
    console.log('[Thread] Migration target:', platformId);
    console.log('[Thread] Payload:', currentMigrationPayload);
  }

  modalCloseBtn.addEventListener('click', closeModal);

  migrationModal.addEventListener('click', (e) => {
    if (e.target === migrationModal) closeModal();
  });

  platformCards.forEach((card) => {
    card.addEventListener('click', () => {
      handleMigration(card.dataset.platform);
    });
  });

  // Inject (opens migration modal)
  injectBtn.addEventListener('click', () => {
    chrome.storage.local.get('migrationState', (data) => {
      if (!data.migrationState) {
        showToast('Nothing to inject — extract first');
        return;
      }
      currentMigrationPayload = JSON.stringify(data.migrationState);
      openModal();
    });
  });
});