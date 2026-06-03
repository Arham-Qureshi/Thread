document.addEventListener('DOMContentLoaded', () => {
  const extractBtn = document.getElementById('btn-extract');
  const status = document.getElementById('status');

  extractBtn.addEventListener('click', () => {
    status.textContent = 'Extracting...';
    chrome.runtime.sendMessage({ action: 'EXTRACT_DOM' }, (response) => {
      if (chrome.runtime.lastError) {
        status.textContent = 'Error: ' + chrome.runtime.lastError.message;
        return;
      }
      if (response.status === 'error') {
        status.textContent = 'Failed: ' + response.reason;
        return;
      }
      setTimeout(() => {
        chrome.storage.local.get('extractedData', (data) => {
          const turns = data.extractedData;
          status.textContent = turns?.length
            ? 'Extracted ' + turns.length + ' turns'
            : 'No conversation found on this page';
        });
      }, 500);
    });
  });
});
