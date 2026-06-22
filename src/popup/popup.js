import cytoscape from 'cytoscape';
import { generateMigrationPayload } from './payload_formatter.js';

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
  let tooltipTimer = null;
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
    const edges = (graph.edges || []).map((edge, index) => ({
      data: {
        id: edge.id || edge.source + '-' + edge.target + '-' + index,
        source: edge.source,
        target: edge.target,
        label: edge.relation || '',
      },
    }));

    const degreeMap = {};
    for (const edge of edges) {
      const src = edge.data.source;
      const tgt = edge.data.target;
      degreeMap[src] = (degreeMap[src] || 0) + 1;
      degreeMap[tgt] = (degreeMap[tgt] || 0) + 1;
    }

    const nodes = (graph.nodes || []).map((node) => {
      const rawType = node.role || node.subtype || node.type || 'artifact';
      const type = rawType === 'code' ? 'artifact' : rawType;
      return {
        data: {
          id: node.id,
          label: generateNodeLabel(node.content, type),
          type: type,
          degree: degreeMap[node.id] || 0,
        },
      };
    });

    return [...nodes, ...edges];
  }

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function renderGraph(graph) {
    resetLegendFilters();
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
            'font-size': 11,
            color: '#fff',
            'text-valign': 'bottom',
            'text-halign': 'center',
            'text-margin-y': 6,
            'text-wrap': 'wrap',
            'text-max-width': 100,
            'text-background-color': '#1e1e1e',
            'text-background-opacity': 0.8,
            'text-background-shape': 'roundrectangle',
            'text-background-padding': 4,
            'border-width': 1,
            'border-color': borderColor,
            width: 'mapData(degree, 0, 8, 26, 56)',
            height: 'mapData(degree, 0, 8, 26, 56)',
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
        {
          selector: 'node.filtered',
          style: { display: 'none' },
        },
        {
          selector: 'edge.filtered',
          style: { display: 'none' },
        },
      ],
      layout: {
        name: 'cose',
        animate: false,
        fit: true,
        padding: 28,
      },
    });
    setTimeout(() => showLegendTooltip(), 200);
  }

  function toggleNodeType(type) {
    if (!cy) return;
    const nodes = cy.nodes(`[type = "${type}"]`);
    if (!nodes.length) return;
    nodes.toggleClass('filtered');
    cy.edges().forEach(edge => {
      const srcFiltered = edge.source().hasClass('filtered');
      const tgtFiltered = edge.target().hasClass('filtered');
      edge.toggleClass('filtered', srcFiltered || tgtFiltered);
    });
  }

  function resetLegendFilters() {
    hideLegendTooltip();
    document.querySelectorAll('#graph-legend .legend-item').forEach(item => {
      item.classList.remove('dimmed');
    });
    if (cy) {
      cy.elements().removeClass('filtered');
    }
  }

  function showLegendTooltip() {
    const tooltip = document.getElementById('legend-tooltip');
    if (!tooltip) return;
    clearTimeout(tooltipTimer);
    tooltip.classList.remove('hidden', 'dismissed');
    tooltipTimer = setTimeout(() => {
      tooltip.classList.add('dismissed');
    }, 6000);
  }

  function hideLegendTooltip() {
    const tooltip = document.getElementById('legend-tooltip');
    if (!tooltip) return;
    clearTimeout(tooltipTimer);
    tooltip.classList.add('hidden', 'dismissed');
  }

  function setupLegendFilters() {
    document.querySelectorAll('#graph-legend .legend-item').forEach(item => {
      const type = item.dataset.type;
      if (type === 'user' || type === 'assistant') return;
      item.addEventListener('click', () => {
        hideLegendTooltip();
        toggleNodeType(type);
        item.classList.toggle('dimmed');
      });
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

  const injectMenu = document.getElementById('inject-menu');
  const actionBar = document.getElementById('action-bar');
  const injectOptions = document.querySelectorAll('.inject-option');
  const injectCancel = document.querySelector('.inject-cancel');
  let currentMigrationPayload = null;

  function showInjectMenu() {
    actionBar.style.display = 'none';
    injectMenu.classList.remove('hidden');
  }

  function hideInjectMenu() {
    injectMenu.classList.add('hidden');
    actionBar.style.display = '';
    injectOptions.forEach(opt => {
      opt.disabled = false;
      opt.textContent = opt.dataset.platform
        ? opt.dataset.platform.charAt(0).toUpperCase() + opt.dataset.platform.slice(1)
        : 'Copy to Clipboard';
    });
  }

  function handleMigration(platformId, btn) {
    showToast('Opening ' + platformId + '…');
    btn.disabled = true;
    btn.textContent = 'Opening…';

    const payload = 'Reconstruct our current state based on this graph. '
      + 'Use it as compact context for the next task, then wait for my instruction.\n\n'
      + currentMigrationPayload;

    chrome.runtime.sendMessage(
      { action: 'MIGRATE_PAYLOAD', platform: platformId, payload },
      (res) => {
        btn.disabled = false;
        btn.textContent = platformId.charAt(0).toUpperCase() + platformId.slice(1);
        if (chrome.runtime.lastError || res?.status === 'error') {
          showToast('Migration failed: ' + (res?.reason || chrome.runtime.lastError?.message));
        } else {
          showToast('Context injected into ' + platformId);
          hideInjectMenu();
        }
      }
    );
  }

  injectOptions.forEach((opt) => {
    opt.addEventListener('click', () => {
      const platform = opt.dataset.platform;
      if (platform) {
        handleMigration(platform, opt);
      } else {
        chrome.storage.local.get('migrationState', (data) => {
          if (!data.migrationState) {
            showToast('Nothing to copy — extract first');
            return;
          }
          const payload = generateMigrationPayload(data.migrationState);
          navigator.clipboard.writeText(payload).then(() => {
            showToast('Copied to clipboard');
            hideInjectMenu();
          }).catch(err => {
            showToast('Clipboard failed: ' + err.message);
          });
        });
      }
    });
  });

  injectCancel.addEventListener('click', hideInjectMenu);

  // Inject
  injectBtn.addEventListener('click', () => {
    chrome.storage.local.get('migrationState', (data) => {
      if (!data.migrationState) {
        showToast('Nothing to inject — extract first');
        return;
      }
      currentMigrationPayload = JSON.stringify(data.migrationState);
      showInjectMenu();
    });
  });

  setupLegendFilters();
});