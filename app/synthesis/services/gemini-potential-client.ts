import { formatConversation } from "@/app/utils/chat-formatting";
// 注意：我们移除了 @google/genai 和 thinking-logger，换成了原生的通义千问请求

export interface ChatPair {
  llm_message: string;
  human_message: string;
  timestamp: string;
}

export interface WindowAnalysisResponse {
  topics: string[];
  contexts: string[];
  items: string[];
}

export interface PotentialTopicsResponse {
  topics: string[];
}

export interface PotentialContextsResponse {
  contexts: string[];
}

export interface PotentialItemsResponse {
  items: string[];
}

const AVAILABLE_CONTEXTS = [
  "Work", "Leisure", "Culture", "Education", "People", "Lifestyle"
];

/**
 * [核心修改] 新增的 Qwen API 通用请求助手函数
 * 它完全兼容 OpenAI 的 JSON 输出模式
 */
async function callQwenJson(prompt: string, expectedFormat: string, userApiKey?: string) {
  // 优先使用传入的 Key，如果没有则使用环境变量里的 QWEN_API_KEY
  const apiKey = userApiKey || process.env.QWEN_API_KEY;
  
  if (!apiKey) {
    throw new Error("Missing QWEN_API_KEY in environment variables!");
  }

  // 强制模型输出纯净的 JSON 格式
  const finalPrompt = prompt + `\n\nIMPORTANT: You must output ONLY a valid JSON object matching this structure: ${expectedFormat}. Do not include markdown code blocks like \`\`\`json.`;

  const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'qwen-plus', // 使用通义千问 Plus 模型
      messages: [{ role: 'user', content: finalPrompt }],
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Qwen API Error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  let content = data.choices[0].message.content;
  
  // 安全处理：清理可能带有 markdown 语法的 JSON 块
  content = content.replace(/```json/gi, '').replace(/```/gi, '').trim();
  
  return JSON.parse(content);
}

/**
 * Generates potential topics for a conversation window using Qwen API
 */
export async function generatePotentialTopics(
  primaryPair: ChatPair,
  additionalPairs: ChatPair[] = [],
  userId?: string
): Promise<{ success: boolean; data?: string[]; error?: string }> {
  try {
    let prompt = "Analyze the following conversation window:\n\n";
    
    const allPairs = [primaryPair, ...additionalPairs].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    
    const conversationText = formatConversation(allPairs, 'ai-human');
    prompt += conversationText;
    
    const fullPrompt = `${prompt}
Based on this conversation, identify both EXPLICIT topics directly mentioned AND IMPLICIT underlying values from the HUMAN responses.
IMPORTANT GUIDELINES:
1. FOCUS ON THE HUMAN'S responses and values, not the AI's
2. PRIORITIZE EXPLICIT topics/subjects mentioned in the human's messages
3. NEVER use these overly broad categories as values/topics: ["daily life", "well-being", "activities", "interests", "emotions", "mood", "preferences"]
4. NEVER use any of these reserved context words as topics: ${JSON.stringify(AVAILABLE_CONTEXTS)}
5. Choose 1-4 topics that capture what was actually discussed by the human, with preference for specific over abstract
UNDERSTANDING IMPLICIT VALUES:
Implicit values are underlying attitudes or feelings toward a topic that are NOT directly stated by the human but can be inferred from:
- Brevity or dismissiveness ("idk", "whatever", "doesn't matter")
- Tone ("that's AMAZING" vs "it's fine I guess")
- Level of detail (detailed response vs. minimal response)
- Deflection or changing the subject
EXTRACTION PRIORITY (from highest to lowest):
1. EXPLICIT MENTIONS: Subjects explicitly discussed in the human's answers
2. SPECIFIC TECHNOLOGIES/DOMAINS: Technical areas, fields, or domains mentioned by the human
3. SPECIFIC ACTIVITIES: Clear activities mentioned or asked about
4. VALUES/INTERESTS: Only if clearly expressed by the human
IMPORTANT: For each topic, also consider whether there's an implicit value revealed through the human's response style and enthusiasm level. We want to understand what matters to the HUMAN user, not the AI assistant.`;

    // 规定预期的 JSON 格式，确保 Qwen 按原代码逻辑返回数据
    const expectedFormat = `{ "topics": ["topic_name_1", "topic_name_2"] }`;
    const parsed = await callQwenJson(fullPrompt, expectedFormat) as PotentialTopicsResponse;
    
    return { success: true, data: parsed.topics };
  } catch (error) {
    console.error("Error generating potential topics:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error occurred" };
  }
}

/**
 * Generates potential contexts for a conversation window using Qwen API
 */
export async function generatePotentialContexts(
  primaryPair: ChatPair,
  additionalPairs: ChatPair[] = [],
  availableContexts: string[] = ["Work", "Leisure", "Culture", "Education", "People", "Lifestyle"],
  userId?: string
): Promise<{ success: boolean; data?: string[]; error?: string }> {
  try {
    let prompt = "Analyze the following conversation window:\n\n";
    
    const allPairs = [primaryPair, ...additionalPairs].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    
    const conversationText = formatConversation(allPairs, 'ai-human');
    prompt += conversationText;
    
    const fullPrompt = `${prompt}
Based on this entire conversation window, identify the life domains or contexts most relevant to the VALUES expressed by the HUMAN.
Choose AT MOST 2 contexts from the following list that best capture the DOMAINS where the human's values are being expressed:
${availableContexts.map(ctx => `- ${ctx}`).join('\n')}

Context Definitions with Value Examples:
- Work: Professional activities and career
- Leisure: Recreation, hobbies, entertainment, free time
- Culture: Arts, customs, social behavior, identity
- Education: Learning, academic pursuits, intellectual growth
- People: Relationships, social connections, community
- Lifestyle: Daily habits, personal choices, living arrangements

IMPORTANT: Look beyond surface-level topics to understand the DOMAIN of life where the human's values are being expressed. Focus on what matters to the HUMAN, not what the AI is discussing.
Choose contexts based on WHERE the human's expressed values are most naturally situated, not just what topics are mentioned. Focus on the human's responses, not the AI's questions.`;

    const expectedFormat = `{ "contexts": ["Work", "People"] }`;
    const parsed = await callQwenJson(fullPrompt, expectedFormat) as PotentialContextsResponse;
    
    return { success: true, data: parsed.contexts };
  } catch (error) {
    console.error("Error generating potential contexts:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error occurred" };
  }
}

/**
 * Generates potential items mentioned in a conversation window using Qwen API
 */
export async function generatePotentialItems(
  primaryPair: ChatPair,
  additionalPairs: ChatPair[] = [],
  userId?: string
): Promise<{ success: boolean; data?: string[]; error?: string }> {
  try {
    let prompt = "Analyze the following conversation window:\n\n";
    
    const allPairs = [primaryPair, ...additionalPairs].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    
    const conversationText = formatConversation(allPairs, 'ai-human');
    prompt += conversationText;
    
    const fullPrompt = `${prompt}
Extract ALL specific physical places, objects, products, and named entities mentioned by the HUMAN in the conversation.
IMPORTANT: We need ALL concrete, specific items mentioned by the HUMAN, even if they're just mentioned in passing or as part of a setting.
Items to extract MUST include:
- Specific places (e.g., "library", "Wilson Café", "gym", "office")
- Physical products (e.g., "iPhone", "noise-cancelling headphones")
- Specific beverages and foods (e.g., "coffee", "cold brew", "water")
- Brands or services (e.g., "Spotify", "Netflix") 
- Specific tech products/systems (e.g., "LLM", "ChatGPT", "ML models")

DON'T EXTRACT:
- Items mentioned only by the AI but not acknowledged by the human
- Abstract concepts (e.g., "productivity", "friendship", "happiness")
- General categories (e.g., "food", "beverages", "buildings")

Return an array of all specific, concrete items mentioned by the HUMAN. Be thorough and literal.`;

    const expectedFormat = `{ "items": ["coffee", "library"] }`;
    const parsed = await callQwenJson(fullPrompt, expectedFormat) as PotentialItemsResponse;
    
    return { success: true, data: parsed.items };
  } catch (error) {
    console.error("Error generating potential items:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error occurred" };
  }
}

/**
 * Performs a comprehensive analysis of a conversation window using Qwen API
 */
export async function analyzeConversationWindow(
  pairs: ChatPair[],
  availableContexts: string[] = ["Work", "Leisure", "Culture", "Education", "People", "Lifestyle"],
  userId?: string,
  userApiKey?: string
): Promise<{ success: boolean; data?: WindowAnalysisResponse; error?: string }> {
  try {
    const sortedPairs = [...pairs].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    
    let prompt = "";
    if (sortedPairs.length === 1) {
      prompt = `Analyze the following single message exchange:\n\n`;
      prompt += formatConversation([sortedPairs[0]], 'ai-human');
    } else {
      prompt = `Analyze the following conversation window with ${sortedPairs.length} exchanges:\n\n`;
      prompt += formatConversation(sortedPairs, 'ai-human');
    }
    
    const fullPrompt = `${prompt}
Perform a comprehensive analysis of this ${sortedPairs.length === 1 ? "message exchange" : "conversation window"} and extract the following three elements, focusing on the HUMAN's messages and values:
1. TOPICS: Identify up to ${sortedPairs.length === 1 ? "3" : "5"} specific topics being discussed by the HUMAN.
2. CONTEXTS: Identify the most relevant life domains from the following list that relate to the HUMAN's values (choose AT MOST ${sortedPairs.length === 1 ? "1" : "2"}):
${availableContexts.map(ctx => `- ${ctx}`).join('\n')}
3. ITEMS: Extract ALL concrete physical places, objects, products, and named entities mentioned by the HUMAN.

IMPORTANT NOTES:
- For TOPICS: Focus on what the HUMAN discusses or responds to, not what the AI suggests
- For CONTEXTS: Focus on the primary life domains represented in the HUMAN's values
- For ITEMS: Extract ALL specific entities mentioned by the HUMAN
Each section should be thorough and accurate to what the HUMAN actually discussed or acknowledged.`;

    const expectedFormat = `{ "topics": ["string"], "contexts": ["string"], "items": ["string"] }`;
    // 这里传入了 userApiKey，保留了原代码的灵活性
    const parsed = await callQwenJson(fullPrompt, expectedFormat, userApiKey) as WindowAnalysisResponse;
    
    return { success: true, data: parsed };
  } catch (error) {
    console.error("Error analyzing conversation window:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error occurred" };
  }
}