(function () {
  if (window.__threadInjectorReady) return;
  window.__threadInjectorReady = true;

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
    const lowerBoundary = window.innerHeight * 0.7;
    const candidates = Array.from(document.querySelectorAll('textarea, div[contenteditable="true"]'))
      .filter((el) => isEditable(el) && isVisible(el))
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          el,
          rect,
          score: (rect.top >= lowerBoundary ? 1000 : 0)
            + Math.max(0, rect.bottom - lowerBoundary)
            + rect.height,
        };
      })
      .filter(({ rect }) => rect.bottom >= lowerBoundary);

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]?.el || null;
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

  function injectPayload(jsonString) {
    const input = locateInput();
    if (!input) {
      throw new Error('No textarea or contenteditable input found in lower viewport');
    }

    focusInput(input);
    dispatchPaste(input, jsonString);
    setTimeout(() => dispatchEnter(input), 50);
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action !== 'THREAD_INJECT_PAYLOAD') return false;

    try {
      injectPayload(message.payload);
      sendResponse({ status: 'ok' });
    } catch (err) {
      sendResponse({ status: 'error', reason: err.message });
    }

    return false;
  });
})();
