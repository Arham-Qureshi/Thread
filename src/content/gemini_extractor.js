//seperate extractor for gemini becuase 
//gemini uses diff sets of id and tags
export function extractGemini() {
  const nodes = document.querySelectorAll(
    '[data-message-author-role], user-query, model-response, [class*="user-query"], [class*="model-response"]'
  );

  const messages = [];

  for (const node of nodes) {
    const text = node.innerText?.trim();
    if (!text) continue;

    const tag = node.tagName.toLowerCase();
    const roleAttr = node.getAttribute('data-message-author-role')?.toLowerCase();

    let role = 'assistant';
    if (tag === 'user-query' || roleAttr === 'user') {
      role = 'user';
    }

    messages.push({
      role,
      content: text
    });
  }

  return messages;
}