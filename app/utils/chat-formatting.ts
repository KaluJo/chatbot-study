/**
 * Format a conversation for display or analysis
 * @param pairs Array of chat message pairs
 * @param format Output format (basic, ai-human, markdown)
 * @returns Formatted conversation string
 */
export function formatConversation(
  pairs: Array<{llm_message?: string; human_message?: string; question?: string; answer?: string; timestamp?: string}>,
  format: 'basic' | 'ai-human' | 'gemini-analysis' = 'basic'
): string {
  // Sort by timestamp if available
  const sortedPairs = [...pairs].sort((a, b) => {
    if (a.timestamp && b.timestamp) {
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    }
    return 0;
  });

  let result = '';
  
  for (let i = 0; i < sortedPairs.length; i++) {
    const pair = sortedPairs[i];
    // Handle both old and new property names
    const aiMessage = pair.llm_message || '';
    const humanMessage = pair.human_message || '';
    
    switch (format) {
      case 'ai-human':
        result += `Exchange ${i+1}:\n`;
        result += `AI Assistant said: ${aiMessage}\n`;
        result += `The Human said: ${humanMessage}\n\n`;
        break;
      case 'gemini-analysis':
        result += `Exchange ${i+1}:\n`;
        result += `AI Assistant said: ${aiMessage}\n`;
        result += `The Human said: ${humanMessage}\n\n`;
        break;
      case 'basic':
      default:
        result += `Exchange ${i+1}:\n`;
        result += `AI Assistant said: ${aiMessage}\n`;
        result += `The Human said: ${humanMessage}\n\n`;
        break;
    }
  }
  
  return result;
}

/**
 * Normalize a chat message object to use the current property names
 * @param message Chat message with either old or new property names
 * @returns Normalized message object with llm_message and human_message properties
 */
export function normalizeMessageProperties<T extends Record<string, any>>(message: T): T & {llm_message: string; human_message: string} {
  return {
    ...message,
    llm_message: message.llm_message || '',
    human_message: message.human_message || ''
  };
}

/**
 * Convert an array of chat messages to use the current property names
 * @param messages Array of chat messages with either old or new property names
 * @returns Array of normalized message objects
 */
export function normalizeMessagesArray<T extends Record<string, any>>(messages: T[]): (T & {llm_message: string; human_message: string})[] {
  return messages.map(normalizeMessageProperties);
} 