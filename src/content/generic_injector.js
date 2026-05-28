(function () {
  if (window.__threadInjectorReady) return;
  window.__threadInjectorReady = true;

  const MAX_RETRIES = 10;
  const RETRY_INTERVAL_MS = 500;

  function isVisible(el) {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 0
      && rect.height > 0
      && style.visibility !== 'hidden'
      && style.display !== 'none';
  }

  function isEditable(el) {
    if (el.matches('textarea')) return !el.disabled && !el.readOnly;
    return el.matches('div[contenteditable="true"]');
  }

  function locateInput() {
    const candidates = Array.from(document.querySelectorAll('textarea, div[contenteditable="true"]'))
      .filter((el) => isEditable(el) && isVisible(el))
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return { el, rect, score: rect.top + rect.height };
      });

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]?.el || null;
  }

  // handles framework hydration delays
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
          reject(new Error('No textarea or contenteditable input found after ' + (MAX_RETRIES * RETRY_INTERVAL_MS / 1000) + 's'));
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
      focusInput(input);
      const pasted = dispatchPaste(input, text);
      if (!pasted) {
        input.textContent = text;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return true;
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

  function dispatchEnter(input) {
    const eventInit = {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
    };

    input.dispatchEvent(new KeyboardEvent('keydown', eventInit));
    input.dispatchEvent(new KeyboardEvent('keyup', eventInit));
  }

  async function injectPayload(text) {
    const input = await locateInputWithRetry();
    focusInput(input);
    setNativeValue(input, text);
    setTimeout(() => dispatchEnter(input), 150);
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action !== 'THREAD_INJECT_PAYLOAD') return false;

    injectPayload(message.payload)
      .then(() => sendResponse({ status: 'ok' }))
      .catch((err) => sendResponse({ status: 'error', reason: err.message }));

    return true; // Keep message channel open for async response
  });
})();
