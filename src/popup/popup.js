document.addEventListener('DOMContentLoaded', () => {
    const testBtn = document.getElementById('test-extract-btn');

    if (testBtn) {
        testBtn.addEventListener('click', async () => {
            console.log('[Popup] Extract button clicked — injecting content script...');

            try {
                // Get the currently active tab
                const [tab] = await chrome.tabs.query({
                    active: true,
                    currentWindow: true
                });

                if (!tab || !tab.id) {
                    console.error('[Popup] No active tab found.');
                    return;
                }

                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['generic_extractor.bundle.js']
                });

                console.log('[Popup] Content script injected. Sending EXTRACT_DOM...');

                // handles the exttract dom button
                chrome.tabs.sendMessage(
                    tab.id,
                    { action: 'EXTRACT_DOM' },
                    (response) => {
                        if (chrome.runtime.lastError) {
                            console.error('[Popup] Message error:', chrome.runtime.lastError.message);
                            return;
                        }
                        console.log('[Popup] Extraction response:', response);
                    }
                );
            } catch (err) {
                console.error('[Popup] Failed to inject/extract:', err);
            }
        });
    }
});