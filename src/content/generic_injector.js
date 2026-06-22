(function () {
  if (window.__threadInjectorReady) return;
  window.__threadInjectorReady = true;

  const MAX_RETRIES = 30;
  const RETRY_INTERVAL_MS = 400;

  const hostname = window.location.hostname;

  function getPlatform() {
    if (hostname.includes('chatgpt') || hostname.includes('chat.openai')) return 'chatgpt';
    if (hostname.includes('claude')) return 'claude';
    if (hostname.includes('gemini')) return 'gemini';
    return 'unknown';
  }

  function isVisible(el) {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 0
      && rect.height > 0
      && style.visibility !== 'hidden'
      && style.display !== 'none'
      && style.opacity !== '0';
  }

  function isEditable(el) {
    if (el.matches('textarea')) return !el.disabled && !el.readOnly;
    return el.matches('div[contenteditable="true"], [contenteditable="true"]');
  }

  function locateInput() {
    const platform = getPlatform();

    const platformSelectors = {
      chatgpt: [
        '#prompt-textarea',
        'textarea[placeholder*="Message"]',
        'textarea[placeholder*="Ask"]',
        'div[contenteditable="true"][role="textbox"]',
      ],
      claude: [
        'div[contenteditable="true"].ProseMirror',
        'div[contenteditable="true"][role="textbox"]',
        'textarea',
      ],
      gemini: [
        'div[contenteditable="true"][role="textbox"]',
        'div[contenteditable="true"]:not([aria-hidden="true"])',
      ],
    };

    if (platform !== 'unknown') {
      const selectors = platformSelectors[platform];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && isEditable(el) && isVisible(el)) return el;
      }
    }

    const candidates = Array.from(document.querySelectorAll('textarea, div[contenteditable="true"], [contenteditable="true"]'))
      .filter((el) => isEditable(el) && isVisible(el))
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width < 100 || rect.height < 20) return false;
        const role = el.getAttribute('role');
        if (role && ['dialog', 'alertdialog', 'menubar', 'listbox'].includes(role)) return false;
        const ariaHidden = el.getAttribute('aria-hidden');
        if (ariaHidden === 'true') return false;
        return true;
      })
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return { el, rect, score: rect.top + rect.height };
      });

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]?.el || null;
  }

  function locateInputWithRetry() {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const timer = setInterval(() => {
        const input = locateInput();
        if (input) {
          clearInterval(timer);
          resolve(input);
          return;
        }
        attempts++;
        if (attempts >= MAX_RETRIES) {
          clearInterval(timer);
          reject(new Error('No chat input found after ' + (MAX_RETRIES * RETRY_INTERVAL_MS / 1000) + 's'));
        }
      }, RETRY_INTERVAL_MS);
    });
  }

  function focusInput(input) {
    input.focus();
    if (input.isContentEditable) {
      const range = document.createRange();
      range.selectNodeContents(input);
      range.collapse(false);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  function insertTextContentEditable(input, text) {
    focusInput(input);
    if (document.execCommand && document.execCommand('insertText', false, text)) {
      return true;
    }
    const pasted = dispatchPaste(input, text);
    if (pasted) return true;
    input.textContent = text;
    input.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
    return true;
  }

  function setNativeValue(input, text) {
    if (input.matches('textarea')) {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, 'value'
      )?.set;

      if (nativeSetter) {
        nativeSetter.call(input, text);
      } else {
        input.value = text;
      }

      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }

    if (input.isContentEditable) {
      return insertTextContentEditable(input, text);
    }

    return false;
  }

  function dispatchPaste(input, text) {
    const data = new DataTransfer();
    data.setData('text/plain', text);

    const pasteEvent = new ClipboardEvent('paste', {
      clipboardData: data,
      bubbles: true,
      cancelable: true,
    });

    return input.dispatchEvent(pasteEvent);
  }

  async function injectPayload(text) {
    const input = await locateInputWithRetry();
    setNativeValue(input, text);
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action !== 'THREAD_INJECT_PAYLOAD') return false;

    injectPayload(message.payload)
      .then(() => sendResponse({ status: 'ok' }))
      .catch((err) => sendResponse({ status: 'error', reason: err.message }));

    return true;
  });
})();
