import { Type } from "@google/genai";
import { formatConversation } from "@/app/utils/chat-formatting";
import { callGeminiWithThinking, ThinkingLogParams, GEMINI_PRO } from "@/app/utils/thinking-logger";

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

// Define available contexts (to avoid overlap with topics)
const AVAILABLE_CONTEXTS = [
  "Work", "Leisure", "Culture", "Education", "People", "Lifestyle"
];

/**
 * Generates potential topics for a conversation window using Gemini API
 */
export async function generatePotentialTopics(
  primaryPair: ChatPair,
  additionalPairs: ChatPair[] = [],
  userId?: string
): Promise<{ success: boolean; data?: string[]; error?: string }> {
  try {
    
    // Build the conversation window prompt
    let prompt = "Analyze the following conversation window:\n\n";
    
    // Add all pairs in chronological order
    const allPairs = [primaryPair, ...additionalPairs].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    
    // Use the formatting utility
    const conversationText = formatConversation(allPairs, 'ai-human');
    prompt += conversationText;
    
    const thinkingParams: ThinkingLogParams = {
      userId,
      serviceName: 'gemini-potential-client',
      operationName: 'generatePotentialTopics',
      modelName: GEMINI_PRO,
      thinkingBudget: 10000,
      promptExcerpt: prompt.substring(0, 500)
    };

    const response = await callGeminiWithThinking(
      null,
      {
        model: GEMINI_PRO,
        contents: `${prompt}
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

Examples of extracting IMPLICIT VALUES:
- AI: "Walk me through your outfit today" Human: "idk, pants?"
  ✓ Topic: "fashion" (introduced by AI question)
  ✓ Implicit value: NEGATIVE attitude toward fashion (demonstrated by human's dismissiveness)

- AI: "How was the movie?" Human: "It was fine, I guess"
  ✓ Topic: "movies/entertainment" (introduced by AI question)
  ✓ Implicit value: NEUTRAL/SLIGHTLY NEGATIVE (human's lukewarm response)

- AI: "What did you think of the lecture?" Human: "I couldn't stop taking notes! The professor had so many insights!"
  ✓ Topic: "lectures/education" (introduced by AI question)
  ✓ Implicit value: STRONG POSITIVE (human's enthusiasm, detailed response)

- AI: "Are you excited about the party?" Human: "Let's talk about something else"
  ✓ Topic: "social events" (introduced by AI question) 
  ✓ Implicit value: NEGATIVE (human's deflection indicates discomfort or disinterest)

EXTRACTION PRIORITY (from highest to lowest):
1. EXPLICIT MENTIONS: Subjects explicitly discussed in the human's answers
   - Example: AI: "How was your morning?" Human: "I just rushed through it" → "morning routine" is a valid topic
   - Example: AI: "What did you think of the LLMs presentation?" Human: "It was interesting" → "LLMs" is a valid topic
2. SPECIFIC TECHNOLOGIES/DOMAINS: Technical areas, fields, or domains mentioned by the human
3. SPECIFIC ACTIVITIES: Clear activities mentioned or asked about
4. VALUES/INTERESTS: Only if clearly expressed by the human

Examples of GOOD topic extraction (focusing on human responses):
- If AI asks "How was your morning coffee?" and human answers "I'm not really a coffee person": 
  ✓ MUST INCLUDE: ["coffee"] 
  ✓ COULD ALSO INCLUDE: ["morning routine"] (introduced by AI question, but relevant to human's response)

- If AI asks "What did you think of the book?" and human answers "It was fine": 
  ✓ MUST INCLUDE: ["books", "reading"] 
  ✓ Even though human's answer is brief, the topic was clearly acknowledged in their response

- If AI asks "Are you going to the library today?" and human answers "Yeah, to work on my AI project": 
  ✓ MUST INCLUDE: ["library", "AI project"]
  ✓ Both topics are relevant to the human's response and interests

IMPORTANT: For each topic, also consider whether there's an implicit value revealed through the human's response style and enthusiasm level. We want to understand what matters to the HUMAN user, not the AI assistant.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              topics: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              }
            },
            required: ["topics"]
          },
          thinkingConfig: {
            thinkingBudget: 10000,
          }
        }
      },
      thinkingParams
    );
    
    const responseText = response.text;
    if (responseText) {
      const parsed = JSON.parse(responseText) as PotentialTopicsResponse;
      return { 
        success: true, 
        data: parsed.topics
      };
    } else {
      return {
        success: false,
        error: "Empty response from API"
      };
    }
  } catch (error) {
    console.error("Error generating potential topics:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error occurred" 
    };
  }
}

/**
 * Generates potential contexts for a conversation window using Gemini API
 */
export async function generatePotentialContexts(
  primaryPair: ChatPair,
  additionalPairs: ChatPair[] = [],
  availableContexts: string[] = ["Work", "Leisure", "Culture", "Education", "People", "Lifestyle"],
  userId?: string
): Promise<{ success: boolean; data?: string[]; error?: string }> {
  try {
    
    // Build the conversation window prompt
    let prompt = "Analyze the following conversation window:\n\n";
    
    // Add all pairs in chronological order
    const allPairs = [primaryPair, ...additionalPairs].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    
    // Use the formatting utility
    const conversationText = formatConversation(allPairs, 'ai-human');
    prompt += conversationText;
    
    const thinkingParams: ThinkingLogParams = {
      userId,
      serviceName: 'gemini-potential-client',
      operationName: 'generatePotentialContexts',
      modelName: GEMINI_PRO,
      thinkingBudget: 10000,
      promptExcerpt: prompt.substring(0, 500)
    };

    const response = await callGeminiWithThinking(
      null,
      {
        model: GEMINI_PRO,
        contents: `${prompt}
Based on this entire conversation window, identify the life domains or contexts most relevant to the VALUES expressed by the HUMAN.

Choose AT MOST 2 contexts from the following list that best capture the DOMAINS where the human's values are being expressed:
${availableContexts.map(ctx => `- ${ctx}`).join('\n')}

Context Definitions with Value Examples:
- Work: Professional activities and career
  VALUES EXAMPLE: Achievement, recognition, purpose, dedication, creativity, competence
  
- Leisure: Recreation, hobbies, entertainment, free time
  VALUES EXAMPLE: Enjoyment, relaxation, exploration, curiosity, self-expression
  
- Culture: Arts, customs, social behavior, identity
  VALUES EXAMPLE: Heritage, diversity, tradition, aesthetic appreciation, belonging
  
- Education: Learning, academic pursuits, intellectual growth
  VALUES EXAMPLE: Knowledge, discovery, intellectual stimulation, curiosity, mastery
  
- People: Relationships, social connections, community
  VALUES EXAMPLE: Belonging, love, friendship, family bonds, social connection
  
- Lifestyle: Daily habits, personal choices, living arrangements
  VALUES EXAMPLE: Health, comfort, sustainability, simplicity, balance

IMPORTANT: Look beyond surface-level topics to understand the DOMAIN of life where the human's values are being expressed. Focus on what matters to the HUMAN, not what the AI is discussing.

EXAMPLES WITH NUANCE:

1. Conversation about enjoying coffee with a friend:
   - If human focuses on the friendship → Context: "People" (primary)
   - If human focuses on the leisure activity → Context: "Leisure" (secondary)
   - The KEY is determining which aspect matters more to the HUMAN in the conversation

2. Conversation about learning to play piano:
   - If human expresses it as personal enrichment → Context: "Education" (learning focus)
   - If human expresses it as relaxation/hobby → Context: "Leisure" (enjoyment focus)
   - Look for clues about WHY it matters to the human to determine the right context

3. Conversation about workplace relationships:
   - Primary Context: "Work" (setting and primary domain)
   - Secondary Context: "People" (relationship aspect)
   - The work setting is primary, with relationships as a dimension within it

Choose contexts based on WHERE the human's expressed values are most naturally situated, not just what topics are mentioned. Focus on the human's responses, not the AI's questions.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              contexts: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              }
            },
            required: ["contexts"]
          },
          thinkingConfig: {
            thinkingBudget: 10000,
          }
        }
      },
      thinkingParams
    );
    
    const responseText = response.text;
    if (responseText) {
      const parsed = JSON.parse(responseText) as PotentialContextsResponse;
      return { 
        success: true, 
        data: parsed.contexts
      };
    } else {
      return {
        success: false,
        error: "Empty response from API"
      };
    }
  } catch (error) {
    console.error("Error generating potential contexts:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error occurred" 
    };
  }
}

/**
 * Generates potential items mentioned in a conversation window using Gemini API
 */
export async function generatePotentialItems(
  primaryPair: ChatPair,
  additionalPairs: ChatPair[] = [],
  userId?: string
): Promise<{ success: boolean; data?: string[]; error?: string }> {
  try {
    
    // Build the conversation window prompt
    let prompt = "Analyze the following conversation window:\n\n";
    
    // Add all pairs in chronological order
    const allPairs = [primaryPair, ...additionalPairs].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    
    // Use the formatting utility
    const conversationText = formatConversation(allPairs, 'ai-human');
    prompt += conversationText;
    
    const thinkingParams: ThinkingLogParams = {
      userId,
      serviceName: 'gemini-potential-client',
      operationName: 'generatePotentialItems',
      modelName: GEMINI_PRO,
      thinkingBudget: 10000,
      promptExcerpt: prompt.substring(0, 500)
    };

    const response = await callGeminiWithThinking(
      null,
      {
        model: GEMINI_PRO,
        contents: `${prompt}
Extract ALL specific physical places, objects, products, and named entities mentioned by the HUMAN in the conversation.

IMPORTANT: We need ALL concrete, specific items mentioned by the HUMAN, even if they're just mentioned in passing or as part of a setting.

Items to extract MUST include:
- Specific places (e.g., "library", "Wilson Café", "gym", "office")
- Physical products (e.g., "iPhone", "noise-cancelling headphones")
- Specific beverages and foods (e.g., "coffee", "cold brew", "water")
- Brands or services (e.g., "Spotify", "Netflix") 
- Specific tech products/systems (e.g., "LLM", "ChatGPT", "ML models")
- Any specifically named entity that's a concrete thing, not an abstract concept

DO EXTRACT items mentioned by the HUMAN as settings or parts of activities:
- Human: "I'm going to the library" → Extract: ["library"] 
- Human: "I drink mostly water" → Extract: ["water"]
- Human: "I work on LLMs" → Extract: ["LLMs"]
- Human: "I'm not really a coffee person" → Extract: ["coffee"]

DON'T EXTRACT:
- Items mentioned only by the AI but not acknowledged by the human
- Abstract concepts (e.g., "productivity", "friendship", "happiness")
- General categories (e.g., "food", "beverages", "buildings")
- Activities without specific items (e.g., "walking", "working", "studying")

EMPHASIS: Being comprehensive about what the HUMAN mentions is important. Extract ALL concrete items mentioned by the HUMAN even if they seem:
- Passing mentions ("I'll stop by the library")
- Background elements ("I usually drink water")
- Negative preferences ("I don't like coffee")

Return an array of all specific, concrete items mentioned by the HUMAN. Be thorough and literal.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              items: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              }
            },
            required: ["items"]
          },
          thinkingConfig: {
            thinkingBudget: 10000,
          }
        }
      },
      thinkingParams
    );
    
    const responseText = response.text;
    if (responseText) {
      const parsed = JSON.parse(responseText) as PotentialItemsResponse;
      return { 
        success: true, 
        data: parsed.items
      };
    } else {
      return {
        success: false,
        error: "Empty response from API"
      };
    }
  } catch (error) {
    console.error("Error generating potential items:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error occurred" 
    };
  }
}

/**
 * Performs a comprehensive analysis of a conversation window using Gemini API
 * and returns topics, contexts, and items in a single call
 */
export async function analyzeConversationWindow(
  pairs: ChatPair[],
  availableContexts: string[] = ["Work", "Leisure", "Culture", "Education", "People", "Lifestyle"],
  userId?: string,
  userApiKey?: string
): Promise<{ success: boolean; data?: WindowAnalysisResponse; error?: string }> {
  try {
    
    // Sort pairs by timestamp
    const sortedPairs = [...pairs].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    
    // Build the conversation window prompt
    let prompt = "";
    
    // Adjust the prompt depending on how many messages are in the window
    if (sortedPairs.length === 1) {
      // Single message analysis
      prompt = `Analyze the following single message exchange:\n\n`;
      prompt += formatConversation([sortedPairs[0]], 'ai-human');
    } else {
      // Multiple message analysis
      prompt = `Analyze the following conversation window with ${sortedPairs.length} exchanges:\n\n`;
      prompt += formatConversation(sortedPairs, 'ai-human');
    }
    
    const thinkingParams: ThinkingLogParams = {
      userId,
      serviceName: 'gemini-potential-client',
      operationName: 'analyzeConversationWindow',
      modelName: GEMINI_PRO,
      thinkingBudget: 10000,
      promptExcerpt: prompt.substring(0, 500),
      userApiKey
    };

    const response = await callGeminiWithThinking(
      null,
      {
        model: GEMINI_PRO,
        contents: `${prompt}
Perform a comprehensive analysis of this ${sortedPairs.length === 1 ? "message exchange" : "conversation window"} and extract the following three elements, focusing on the HUMAN's messages and values:

1. TOPICS: Identify up to ${sortedPairs.length === 1 ? "3" : "5"} specific topics being discussed by the HUMAN.
   - FOCUS ON TOPICS from the HUMAN's responses
   - While the AI might introduce topics with questions, only include them if the HUMAN engages with them
   - Examples:
     * AI: "How was your morning?" Human: "Just rushed through it" → "morning routine" is a valid topic
     * AI: "What did you think of the LLMs paper?" Human: "It was interesting" → "LLMs" is a valid topic
   - Focus on SPECIFIC rather than abstract topics when possible
   - Only use abstract categories when no specific topics are mentioned
   - Include specific topics even if mentioned briefly or negatively by the HUMAN

2. CONTEXTS: Identify the most relevant life domains from the following list that relate to the HUMAN's values (choose AT MOST ${sortedPairs.length === 1 ? "1" : "2"}):
${availableContexts.map(ctx => `- ${ctx}`).join('\n')}

Context Definitions:
- Work: Professional activities, career, projects, work-related skills and learning
- Leisure: Recreation, hobbies, entertainment, free time pursuits
- Culture: Arts, customs, social behavior, cultural identity, languages
- Education: Formal learning, academic pursuits, intellectual development
- People: Relationships, social interactions, family, friends, community
- Lifestyle: Daily habits, living preferences, health routines, lifestyle choices

3. ITEMS: Extract ALL concrete physical places, objects, products, and named entities mentioned by the HUMAN.
   - Include: specific places, products, foods/drinks, technologies, media, brands
   - Focus on items mentioned in the HUMAN's responses
   - Examples:
     * AI: "Are you going to the library today?" Human: "Yes" → Item: "library"
     * AI: "How was your coffee?" Human: "I don't like coffee" → Item: "coffee"
   - Don't extract abstract concepts

IMPORTANT NOTES:
- For TOPICS: Focus on what the HUMAN discusses or responds to, not what the AI suggests
- For CONTEXTS: Focus on the primary life domains represented in the HUMAN's values
- For ITEMS: Extract ALL specific entities mentioned by the HUMAN

Each section should be thorough and accurate to what the HUMAN actually discussed or acknowledged.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              topics: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              contexts: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              items: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              }
            },
            required: ["topics", "contexts", "items"]
          },
          thinkingConfig: {
            thinkingBudget: 10000,
          }
        }
      },
      thinkingParams
    );
    
    const responseText = response.text;
    if (responseText) {
      const parsed = JSON.parse(responseText) as WindowAnalysisResponse;
      return { 
        success: true, 
        data: parsed
      };
    } else {
      return {
        success: false,
        error: "Empty response from API"
      };
    }
  } catch (error) {
    console.error("Error analyzing conversation window:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error occurred" 
    };
  }
} 