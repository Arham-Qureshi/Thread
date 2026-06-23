import { extractGemini } from './gemini_extractor.js';

(function () {
  function detectPlatform() {
    const host = window.location.hostname;
    if (host.includes('chat.openai') || host.includes('chatgpt')) return 'chatgpt';
    if (host.includes('claude')) return 'claude';
    if (host.includes('gemini')) return 'gemini';
    return 'generic';
  }

  // specific obj for contained platform
  const PLATFORM_CONFIG = {
    'chatgpt.com': { container: 'main', messageBlock: '[data-message-author-role]', roleAttr: 'data-message-author-role' },
    'chat.openai.com': { container: 'main', messageBlock: '[data-message-author-role]', roleAttr: 'data-message-author-role' },
    'claude.ai': { container: '.flex-1.overflow-y-auto, main', messageBlock: '[data-is-streaming], .font-claude-message, .font-user-message' },
  };

  //matching the platform_config
  function getConfigForHost() {
    const host = window.location.hostname;
    for (const [domain, config] of Object.entries(PLATFORM_CONFIG)) {
      if (host.includes(domain.replace('www.', ''))) return config;
    }
    return null;
  }

  // chat for chat area to parse for a graph it 
  // otherwise it will whole sidebar context and kaboom!
  const EXCLUDED_TAGS = new Set(['nav', 'aside', 'header', 'footer']);
  const EXCLUDED_ROLES = new Set([
    'navigation', 'complementary', 'banner', 'contentinfo', 'menubar',
  ]);
  const EXCLUDED_PATTERN = /sidebar|history|menu|drawer|panel|nav[-_]/i;

  function isExcludedZone(el) {
    let node = el;
    while (node && node !== document.body) {
      const tag = node.tagName?.toLowerCase();
      if (EXCLUDED_TAGS.has(tag)) return true;
      const role = node.getAttribute?.('role');
      if (role && EXCLUDED_ROLES.has(role)) return true;
      const id = node.id || '';
      const cls = typeof node.className === 'string' ? node.className : '';
      if (EXCLUDED_PATTERN.test(id + ' ' + cls)) return true;
      node = node.parentElement;
    }
    return false;
  }
  // searching for chat container
  function findChatContainer() {
    const platform = detectPlatform();
    const main = document.querySelector('main');
    const root = (main && !isExcludedZone(main)) ? main : document.body;

    let best = null;
    let bestScore = 0;

    for (const el of root.querySelectorAll('*')) {
      if (el.scrollHeight <= el.clientHeight + 50 || el.children.length < 2) continue;
      if (isExcludedZone(el)) continue;

      let score = el.scrollHeight * el.children.length;

      // try hit method ,main is used by generally major platform
      if (el.tagName.toLowerCase() === 'main') {
        score += platform !== 'generic' ? 1500 : 500;
      }

      // chat containers typically dominate the viewport width
      const rect = el.getBoundingClientRect();
      if (rect.width > window.innerWidth * 0.5) score += 500;

      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }

    return best || root;
  }

  function findTurnElements(container) {
    const articles = Array.from(container.querySelectorAll('article'))
      .filter((el) => !isExcludedZone(el));
    if (articles.length >= 2) return articles;

    let best = [];
    let bestScore = 0;
    const queue = [container];

    for (let depth = 0; depth < 8 && queue.length; depth++) {
      const next = [];
      for (const parent of queue) {
        const children = Array.from(parent.children).filter(
          (el) => el.offsetHeight > 0 && el.textContent.trim().length > 20 && !isExcludedZone(el)
        );
        if (children.length >= 2) {
          const sameTags = children.every((c) => c.tagName === children[0].tagName);
          const score = children.length * (sameTags ? 2 : 1);
          if (score > bestScore) {
            bestScore = score;
            best = children;
          }
        }
        next.push(...Array.from(parent.children).filter((c) => c.children.length > 0));
      }
      queue.length = 0;
      queue.push(...next);
    }
    return best;
  }

  function detectRole(element, index, roleAttr) {
    // checking role attribute
    if (roleAttr) {
      const walk = [element, element.parentElement, element.parentElement?.parentElement];
      for (const el of walk) {
        if (!el) continue;
        const val = el.getAttribute(roleAttr);
        if (val) {
          const v = val.toLowerCase();
          if (v.includes('user') || v.includes('human')) return 'user';
          if (v.includes('assistant') || v.includes('model') || v.includes('bot') || v.includes('system')) return 'assistant';
        }
      }
    }

    // 2. Generic attribute scan (heuristic fallback)
    const walk = [element, element.parentElement, element.parentElement?.parentElement];
    for (const el of walk) {
      if (!el || !el.attributes) continue;
      for (const attr of el.attributes) {
        const v = attr.value.toLowerCase();
        if (v.includes('user') || v.includes('human')) return 'user';
        if (v.includes('assistant') || v.includes('model') || v.includes('bot')) return 'assistant';
      }
    }

    // 3. Even/odd index fallback
    return index % 2 === 0 ? 'user' : 'assistant';
  }

  function extractContent(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const tag = node.tagName.toLowerCase();
    if (['button', 'svg', 'img', 'input', 'nav', 'aside', 'header', 'footer', 'script', 'style'].includes(tag)) return '';
    if (node.offsetHeight === 0 || node.hidden) return '';

    if (tag === 'pre') {
      const code = node.querySelector('code');
      const src = code || node;
      const lang = code?.className?.match(/(?:language-|lang-)(\w+)/)?.[1] || '';
      return '\n```' + lang + '\n' + src.textContent + '\n```\n';
    }
    if (tag === 'code') return '`' + node.textContent + '`';
    if (tag === 'strong' || tag === 'b') return '**' + childContent(node) + '**';
    if (tag === 'em' || tag === 'i') return '*' + childContent(node) + '*';
    if (tag === 'a') return '[' + node.textContent + '](' + node.href + ')';
    if (tag === 'br') return '\n';
    if (tag === 'p') return childContent(node) + '\n\n';
    if (tag === 'blockquote') return '> ' + childContent(node).trim() + '\n\n';
    if (/^h[1-6]$/.test(tag)) return '#'.repeat(+tag[1]) + ' ' + node.textContent.trim() + '\n\n';

    if (tag === 'ul') {
      return Array.from(node.querySelectorAll(':scope > li'))
        .map((li) => '- ' + childContent(li).trim())
        .join('\n') + '\n\n';
    }
    if (tag === 'ol') {
      return Array.from(node.querySelectorAll(':scope > li'))
        .map((li, i) => (i + 1) + '. ' + childContent(li).trim())
        .join('\n') + '\n\n';
    }

    return childContent(node);
  }

  function childContent(el) {
    let out = '';
    for (const c of el.childNodes) out += extractContent(c);
    return out;
  }

  function extractChatStructure() {
    const config = getConfigForHost();

    // first check for platform_config then fallback to heuristic (prev extractor)
    // Attempt 1: Config-driven extraction
    if (config) {
      try {
        const container = document.querySelector(config.container);
        if (container) {
          const blocks = Array.from(container.querySelectorAll(config.messageBlock))
            .filter((el) => el.offsetHeight > 0 && el.textContent.trim().length > 10 && !isExcludedZone(el));

          if (blocks.length >= 2) {
            const messages = [];
            for (let i = 0; i < blocks.length; i++) {
              const content = extractContent(blocks[i]).trim();
              if (!content) continue;
              messages.push({ role: detectRole(blocks[i], i, config.roleAttr), content });
            }
            if (messages.length >= 2) return messages;
          }
        }
      } catch (_) {
      }
    }

    //  heuristic (prev extractor)
    const container = findChatContainer();
    if (!container) return [];

    const turns = findTurnElements(container);
    if (!turns.length) return [];

    const messages = [];
    for (let i = 0; i < turns.length; i++) {
      const content = extractContent(turns[i]).trim();
      if (!content) continue;
      messages.push({ role: detectRole(turns[i], i), content });
    }
    return messages;
  }

  function extractFromSelection() {
    const raw = window.getSelection().toString().trim();
    if (!raw) return [];

    const rolePattern = /^(You|User|Human|Assistant|ChatGPT|Claude|AI|Model)\s*:/im;
    const segments = raw.split(new RegExp(`(?=^(?:You|User|Human|Assistant|ChatGPT|Claude|AI|Model)\\s*:)`, 'im'));
    const messages = [];

    for (const seg of segments) {
      const text = seg.trim();
      if (!text) continue;

      const match = text.match(rolePattern);
      let role = messages.length % 2 === 0 ? 'user' : 'assistant';
      let content = text;

      if (match) {
        const label = match[1].toLowerCase();
        role = ['you', 'user', 'human'].includes(label) ? 'user' : 'assistant';
        content = text.slice(match[0].length).trim();
      }

      if (content) messages.push({ role, content });
    }

    if (!messages.length && raw) {
      messages.push({ role: 'user', content: raw });
    }

    return messages;
  }

  let result = [];
  if (window.location.hostname.includes('gemini.google.com')) {
    result = extractGemini();
  } else {
    result = extractChatStructure();
    if (!result.length) result = extractFromSelection();
  }
  
  chrome.runtime.sendMessage({ action: 'EXTRACT_COMPLETE', payload: result });
})();