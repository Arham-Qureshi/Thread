(function () {
  function findChatContainer() {
    const main = document.querySelector('main');
    if (main) {
      const scrollable = findDeepestScrollable(main);
      return scrollable || main;
    }
    return findDeepestScrollable(document.body) || document.body;
  }

  function findDeepestScrollable(root) {
    let best = null;
    let bestScore = 0;
    for (const el of root.querySelectorAll('*')) {
      if (el.scrollHeight <= el.clientHeight + 50 || el.children.length < 2) continue;
      const score = el.scrollHeight * el.children.length;
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }
    return best;
  }

  function findTurnElements(container) {
    const articles = container.querySelectorAll('article');
    if (articles.length >= 2) return Array.from(articles);

    let best = [];
    let bestScore = 0;
    const queue = [container];

    for (let depth = 0; depth < 8 && queue.length; depth++) {
      const next = [];
      for (const parent of queue) {
        const children = Array.from(parent.children).filter(
          (el) => el.offsetHeight > 0 && el.textContent.trim().length > 20
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

  function detectRole(element, index) {
    const walk = [element, element.parentElement, element.parentElement?.parentElement];
    for (const el of walk) {
      if (!el || !el.attributes) continue;
      for (const attr of el.attributes) {
        const v = attr.value.toLowerCase();
        if (v.includes('user') || v.includes('human')) return 'user';
        if (v.includes('assistant') || v.includes('model') || v.includes('bot')) return 'assistant';
      }
    }
    return index % 2 === 0 ? 'user' : 'assistant';
  }

  function extractContent(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const tag = node.tagName.toLowerCase();
    if (['button', 'svg', 'img', 'input', 'nav', 'script', 'style'].includes(tag)) return '';
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

  function extractChatHistory() {
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

  const result = extractChatHistory();
  chrome.runtime.sendMessage({ action: 'EXTRACT_COMPLETE', payload: result });
})();