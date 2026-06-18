/**
 * @param {Object} graphData
 * @returns {string}
 */
export function generateMigrationPayload(graphData) {
  const jsonString = JSON.stringify(graphData, null, 2);

  return `You are an AI assistant inheriting context from a previous session. Below is a structured Property Graph representing the conversation state, rules, and artifacts. Acknowledge this context and wait for my prompt:\n\njson\n${jsonString}\n`;
}
