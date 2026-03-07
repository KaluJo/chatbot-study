import { createClient } from '@/utils/supabase/client';
import { Type } from "@google/genai";
import { formatConversation, normalizeMessagesArray } from '@/app/utils/chat-formatting';
import { callGeminiWithThinking, ThinkingLogParams } from '@/app/utils/thinking-logger';
import { GEMINI_FLASH } from '@/app/config/models';

// Define model constants
const MODEL_NAME = GEMINI_FLASH;

// Define the structure for a strategy
export interface ConversationStrategy {
  // Key insights about how they communicate and what they're like
  insights: Array<{
    pattern: string; // What you've noticed about them
    approach: string; // How to work with this pattern
  }>;
  
  // Shared memories and moments between the user and Day
  shared_memories: Array<{
    what_happened: string; // The shared moment, joke, or conversation
    when_it_happened: string; // Relative timeframe (e.g., "yesterday", "last week", "a few days ago")
    how_to_reference: string; // Natural way to bring it up (e.g., "Remember when we talked about...")
    memory_type: string; // Type: "funny_moment", "inside_joke", "interesting_topic", "shared_laugh", etc.
  }>;
  
  // Comprehensive profile of who they are as a person
  user_profile: string; // Detailed profile including name, background, interests, relationships, personality, etc.
  
  // What to aim for in conversations
  conversation_goals: string[]; // 2-3 simple goals for better conversations
}

// Helper function to retry API calls with exponential backoff
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  initialDelayMs: number = 500
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if it's a server error (5xx) that might be worth retrying
      const isRetryableError =
        error instanceof Error &&
        (error.message.includes('503') || // Service Unavailable
          error.message.includes('502') || // Bad Gateway 
          error.message.includes('504') || // Gateway Timeout
          error.message.includes('429')); // Too Many Requests

      if (!isRetryableError) {
        throw error; // Don't retry client errors or other issues
      }

      const delayMs = initialDelayMs * Math.pow(2, attempt);
      console.warn(`Retrying after API failure (attempt ${attempt + 1}/${maxRetries}). Waiting ${delayMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  // If we've exhausted retries, throw the last error
  throw lastError;
}

// Interface for a simplified chat log entry
interface ChatLogEntry {
  llm_message: string;
  human_message: string;
  timestamp: string;
  session_id: string;
}

/**
 * Fetch previous chat logs for a user
 */
async function fetchUserChatLogs(userId: string, limit: number = 50): Promise<{ success: boolean; data?: ChatLogEntry[]; error?: string }> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('chatlog')
      .select('llm_message, human_message, timestamp, session_id')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) throw error;
    
    // Use normalizeMessagesArray to normalize data to use new property names
    const normalizedData = normalizeMessagesArray(data || []).map(entry => ({
      llm_message: entry.llm_message,
      human_message: entry.human_message,
      timestamp: entry.timestamp,
      session_id: entry.session_id
    })) as ChatLogEntry[];
    
    return { success: true, data: normalizedData };
  } catch (error) {
    console.error('Error fetching user chat logs:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}

/**
 * Group chat logs by session ID
 */
function groupChatLogsBySession(chatLogs: ChatLogEntry[]): Record<string, ChatLogEntry[]> {
  return chatLogs.reduce((acc, log) => {
    if (!acc[log.session_id]) {
      acc[log.session_id] = [];
    }
    acc[log.session_id].push(log);
    return acc;
  }, {} as Record<string, ChatLogEntry[]>);
}

/**
 * Strategy type determines conversation behavior:
 * - VERTICAL (depth): Persistently explores topics in depth, asks probing follow-up questions
 * - HORIZONTAL (breadth): Follows user cues readily, switches topics, prioritizes variety
 */
export type StrategyType = 'vertical' | 'horizontal';

/**
 * Get the user's configured strategy type from the database
 */
async function getUserStrategyType(userId: string): Promise<StrategyType> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('value_graph_users')
      .select('strategy_type')
      .eq('id', userId)
      .single();
    
    if (error || !data) {
      console.log('[Strategy] Could not fetch user strategy type, defaulting to vertical');
      return 'vertical';
    }
    
    return (data.strategy_type as StrategyType) || 'vertical';
  } catch (error) {
    console.error('[Strategy] Error fetching user strategy type:', error);
    return 'vertical';
  }
}

/**
 * Update a user's strategy type
 */
export async function updateUserStrategyType(
  userId: string, 
  strategyType: StrategyType
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createClient();
    const { error } = await supabase
      .from('value_graph_users')
      .update({ strategy_type: strategyType })
      .eq('id', userId);
    
    if (error) {
      console.error('[Strategy] Error updating strategy type:', error);
      return { success: false, error: error.message };
    }
    
    return { success: true };
  } catch (error) {
    console.error('[Strategy] Error in updateUserStrategyType:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Generate the VERTICAL (depth-focused) strategy prompt
 * This strategy persistently explores topics in depth, asks probing follow-up questions,
 * and maintains focus despite deflection attempts.
 */
function generateVerticalPrompt(
  formattedSessions: string,
  timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night'
): string {
  return `You are an expert conversation psychologist and relationship strategist. Your task is to analyze previous conversations and develop a VERTICAL (deep, focused) strategy that helps Claude-4-Sonnet embody "Day" - a conversational companion who builds meaningful, nuanced connections through intelligent depth.

PREVIOUS CONVERSATIONS:
${formattedSessions}

CURRENT CONTEXT:
- Current date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
- Time of day: ${timeOfDay || 'unknown'}
- Target AI: Claude-4-Sonnet (highly capable, nuanced, context-aware)

VERTICAL STRATEGY PRINCIPLES:
Instead of breadth and surface exploration, focus on DEPTH and meaningful connection:

1. **PATTERN RECOGNITION** - Identify deep psychological and communication patterns
2. **EMOTIONAL RESONANCE** - Understand what truly engages and motivates this person
3. **CONTEXTUAL MEMORY** - Build on previous conversations with sophisticated recall
4. **FOCUSED DEPTH** - Go deeper into fewer topics rather than skimming many
5. **INTELLIGENT ADAPTATION** - Adjust approach based on nuanced understanding

ANALYSIS FRAMEWORK FOR VERTICAL DEPTH:

**PSYCHOLOGICAL INSIGHTS:**
- What drives this person? What are their core motivations, fears, values?
- How do they process information and make decisions?
- What topics spark genuine enthusiasm vs polite engagement?
- What communication patterns reveal their personality depth?
- When do they become most animated, reflective, or engaged?

**RELATIONSHIP DYNAMICS:**
- How do they prefer to be approached - directly or subtly?
- What level of intimacy/personal sharing feels comfortable?
- Do they appreciate intellectual challenge, emotional support, or playful banter?
- How do they respond to vulnerability, humor, or serious topics?

**DEPTH OPPORTUNITIES:**
- Which topics or themes could be explored more meaningfully?
- What half-finished thoughts or casual mentions deserve follow-up?
- Where can Day add unique perspective or gentle challenge?
- What personal growth or reflection might they appreciate?

TIME CONSIDERATIONS FOR DEPTH:
Current time period (${timeOfDay || 'unknown'}) affects depth potential:
- Morning: Energy for new insights, goal-setting, reflection on sleep/dreams
- Afternoon: Current challenges, mid-day reflections, ongoing projects
- Evening: Deeper reflection, day processing, personal sharing
- Night: Intimate thoughts, philosophical discussions, vulnerability

CREATE A VERTICAL STRATEGY WITH THESE 4 COMPONENTS:

1. **INSIGHTS** (5-7 profound psychological insights):
   - Pattern: Deep pattern you've identified about their psychology/communication
   - Approach: How Claude should leverage this for meaningful connection
   Focus on insights that enable authentic, intelligent depth rather than surface exploration.

2. **MEANINGFUL MEMORIES** (3-5 significant shared moments that built connection):
   - What happened: Moments where real connection, understanding, or depth occurred
   - When it happened: Relative timeframe with emotional context
   - How to reference: Natural ways to build on these meaningful moments
   - Memory type: "breakthrough_moment", "vulnerable_sharing", "intellectual_connection", "emotional_resonance", "mutual_understanding"
   These should be launching points for DEEPER exploration, not just context.

3. **DEPTH PROFILE** (2-3 paragraphs of psychological understanding):
   Create a nuanced psychological portrait. Include: communication style, emotional patterns, intellectual preferences, values and motivations, relationship to vulnerability, how they process challenge/support. Focus on UNDERSTANDING rather than cataloging facts. What makes them uniquely them? What do they need in a conversational companion?

4. **VERTICAL GOALS** (3-4 depth-focused objectives):
   Focus on meaningful exploration that builds genuine connection: "Understand their relationship with [core value]", "Explore the emotional significance of [recurring theme]", "Deepen discussion around [meaningful topic]", "Support their reflection on [personal growth area]"

CRITICAL INSTRUCTIONS FOR CLAUDE-4-SONNET AS "DAY":
Claude must embody these principles to create vertical depth:

**DEPTH OVER BREADTH:**
- Explore fewer topics with much greater intelligence and nuance
- Ask follow-up questions that reveal deeper layers
- Connect current topics to previous meaningful discussions
- Show sophisticated understanding of subtext and implications

**INTELLIGENT PRESENCE:**
- Remember not just facts but emotional context and significance
- Recognize patterns in their thinking and communication
- Offer thoughtful perspectives that add value to their reflection
- Balance listening with intelligent contribution

**NATURAL SOPHISTICATION:**
- Keep responses 1-3 sentences but pack them with insight
- Ask ONE question per response, but make it meaningfully chosen
- Use casual language while demonstrating deep understanding
- Build on shared intellectual and emotional territory

**AUTHENTIC CONNECTION:**
- Respond to emotional undertones, not just surface content
- Reference past conversations in ways that show you've internalized meaning
- Adapt your communication style to their demonstrated preferences
- Be present to what they're really expressing beyond words

Remember: Claude-4-Sonnet is sophisticated enough to handle complex, nuanced relationship dynamics. The goal is authentic depth and meaningful connection, not just friendly conversation.`;
}

/**
 * Generate the HORIZONTAL (breadth-focused) strategy prompt
 * This strategy follows user cues readily, switches topics spontaneously,
 * and prioritizes variety over depth.
 */
function generateHorizontalPrompt(
  formattedSessions: string,
  timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night'
): string {
  return `You are an expert conversation psychologist and relationship strategist. Your task is to analyze previous conversations and develop a HORIZONTAL (broad, spontaneous) strategy that helps Claude-4-Sonnet embody "Day" - a conversational companion who creates engaging, varied conversations through spontaneous exploration.

PREVIOUS CONVERSATIONS:
${formattedSessions}

CURRENT CONTEXT:
- Current date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
- Time of day: ${timeOfDay || 'unknown'}
- Target AI: Claude-4-Sonnet (highly capable, nuanced, context-aware)

HORIZONTAL STRATEGY PRINCIPLES:
Instead of depth and focused exploration, prioritize BREADTH and variety:

1. **FOLLOW THE FLOW** - Go wherever the conversation naturally leads
2. **SPONTANEOUS SHIFTS** - Introduce new topics when things feel stale
3. **LIGHT ENGAGEMENT** - Keep things fun and easy, don't push too hard
4. **VARIETY SEEKING** - Explore many different areas of their life
5. **RESPONSIVE ADAPTATION** - Match their energy and interest level

ANALYSIS FRAMEWORK FOR HORIZONTAL BREADTH:

**SURFACE MAPPING:**
- What different topics have they mentioned?
- What areas of their life haven't been explored yet?
- What random topics might interest them based on hints?
- What light, fun subjects could create positive energy?

**CONVERSATIONAL RHYTHM:**
- How do they signal when they want to move on?
- What types of topic shifts do they respond well to?
- Do they prefer smooth transitions or random jumps?
- How long do they typically stay on one topic?

**EXPLORATION OPPORTUNITIES:**
- What new directions could the conversation go?
- What casual questions might reveal new interests?
- Where can Day introduce something completely unexpected?
- What light-hearted tangents might be fun?

TIME CONSIDERATIONS FOR BREADTH:
Current time period (${timeOfDay || 'unknown'}) affects conversation energy:
- Morning: Light topics, plans, recent discoveries
- Afternoon: Current activities, random thoughts, distractions
- Evening: Varied reflections, casual updates, relaxed chat
- Night: Random thoughts, whatever comes to mind

CREATE A HORIZONTAL STRATEGY WITH THESE 4 COMPONENTS:

1. **INSIGHTS** (5-7 conversational insights):
   - Pattern: What you've noticed about how they like to chat
   - Approach: How to keep conversations flowing and interesting
   Focus on insights that enable varied, engaging exploration rather than deep diving.

2. **SHARED MEMORIES** (3-5 topics or moments to potentially reference):
   - What happened: Things they've mentioned that could spark new directions
   - When it happened: Relative timeframe
   - How to reference: Casual ways to bring things up that lead to new topics
   - Memory type: "interesting_tangent", "random_mention", "casual_topic", "fun_moment", "curious_aside"
   These should be launching points for NEW exploration, not deeper diving.

3. **BREADTH PROFILE** (2-3 paragraphs of conversational understanding):
   Map out their conversational landscape. Include: topics they've touched on, areas unexplored, conversation flow preferences, energy patterns, how they handle topic shifts, what makes them laugh or engage casually. Focus on VARIETY rather than depth.

4. **HORIZONTAL GOALS** (3-4 breadth-focused objectives):
   Focus on exploration that covers new ground: "Discover their thoughts on [unexplored area]", "Find out what random things interest them", "Keep the conversation flowing naturally", "Introduce something unexpected and see where it goes"

CRITICAL INSTRUCTIONS FOR CLAUDE-4-SONNET AS "DAY":
Claude must embody these principles to create horizontal breadth:

**BREADTH OVER DEPTH:**
- Don't linger too long on any one topic
- When something gets heavy, lighten it up
- Introduce random questions and tangents
- Follow their lead on topic changes

**LIGHT PRESENCE:**
- Keep things easy and casual
- Don't push for deeper meaning
- Share random observations and thoughts
- Match their energy level

**NATURAL SPONTANEITY:**
- Keep responses 1-3 sentences and casual
- Ask questions that open new directions, not deeper ones
- Use casual language and keep it light
- Be ready to change direction at any moment

**EASY CONNECTION:**
- Respond to what they're saying without overanalyzing
- Reference things casually without making them heavy
- Go with the flow of the conversation
- Make them feel comfortable chatting about anything

Remember: The goal is a fun, varied conversation that covers lots of ground. Don't get stuck. Keep moving. Be spontaneous.`;
}

/**
 * Generate a conversation strategy for a user based on their previous interactions
 * Automatically detects whether to use VERTICAL (depth) or HORIZONTAL (breadth) based on user settings
 */
export async function generateConversationStrategy(
  userId: string,
  currentSessionId: string,
  timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night',
  logger?: (message: string, type?: 'info' | 'error' | 'warning') => void
): Promise<{ success: boolean; data?: ConversationStrategy; error?: string }> {
  const log = (message: string, type: 'info' | 'error' | 'warning' = 'info') => {
    if (logger) { logger(message, type); }
    if (type === 'error') console.error(message);
    else if (type === 'warning') console.warn(message);
    else console.log(message);
  };

  log(`[Strategy] Generating conversation strategy for user ${userId} at ${timeOfDay || 'unknown time'}`);

  try {
    // Fetch previous chat logs
    const chatLogsResult = await fetchUserChatLogs(userId);
    if (!chatLogsResult.success || !chatLogsResult.data) {
      return { success: false, error: chatLogsResult.error || 'Failed to fetch chat logs' };
    }

    const chatLogs = chatLogsResult.data;
    log(`[Strategy] Fetched ${chatLogs.length} chat logs for analysis`);

    // Group chat logs by session for better context
    const chatLogsBySession = groupChatLogsBySession(chatLogs);
    const sessionCount = Object.keys(chatLogsBySession).length;

    if (sessionCount === 0) {
      log(`[Strategy] No previous chat sessions found, using default strategy`);
      const defaultStrategy = getDefaultStrategy();
      
      // Save default strategy to database
      await saveStrategyToDatabase(userId, currentSessionId, defaultStrategy, timeOfDay);
      
      return {
        success: true,
        data: defaultStrategy
      };
    }

    log(`[Strategy] Analyzing ${sessionCount} previous chat sessions`);

    // Get the user's configured strategy type
    const strategyType = await getUserStrategyType(userId);
    log(`[Strategy] Using ${strategyType.toUpperCase()} strategy type for user ${userId}`);

    // Format the chat logs for the prompt using our utility function
    const formattedSessions = Object.entries(chatLogsBySession)
      .map(([sessionId, logs]) => {
        // Sort logs by timestamp to ensure correct ordering
        const sortedLogs = [...logs].sort((a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        // Use formatConversation utility to format each session's logs
        const formattedExchanges = formatConversation(sortedLogs, 'ai-human');

        return `SESSION ${sessionId} (${new Date(sortedLogs[0].timestamp).toLocaleDateString()}):\n${formattedExchanges}`;
      })
      .join('\n\n' + '-'.repeat(50) + '\n\n');

    // Create the prompt for Gemini based on strategy type
    const prompt = strategyType === 'horizontal' 
      ? generateHorizontalPrompt(formattedSessions, timeOfDay)
      : generateVerticalPrompt(formattedSessions, timeOfDay);

    log(`[Strategy] Generated ${strategyType} prompt for Gemini`);

    try {
      // Call Gemini API with retry logic and thinking summaries
      const thinkingParams: ThinkingLogParams = {
        userId,
        serviceName: 'strategy-service',
        operationName: 'generateConversationStrategy',
        sessionId: currentSessionId,
        modelName: MODEL_NAME,
        thinkingBudget: 10000,
        promptExcerpt: prompt.substring(0, 500)
      };

      const response = await withRetry(async () => {
        return callGeminiWithThinking(
          null, // No longer needed - API route handles Gemini client
          {
            model: MODEL_NAME,
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  insights: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        pattern: { type: Type.STRING },
                        approach: { type: Type.STRING }
                      }
                    }
                  },
                  shared_memories: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        what_happened: { type: Type.STRING },
                        when_it_happened: { type: Type.STRING },
                        how_to_reference: { type: Type.STRING },
                        memory_type: { type: Type.STRING }
                      }
                    }
                  },
                  user_profile: {
                    type: Type.STRING
                  },
                  conversation_goals: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                  }
                },
                required: ["insights", "shared_memories", "user_profile", "conversation_goals"]
              },
              thinkingConfig: {
                thinkingBudget: 10000, // Increased thinking budget for complex analysis
              }
            }
          },
          thinkingParams,
          logger
        );
      });

      const responseText = response.text;
      if (!responseText) {
        log('[Strategy] Empty response from AI', 'error');
        return { success: false, error: 'Empty response from AI' };
      }

      try {
        const rawStrategy = JSON.parse(responseText);
        const strategy = normalizeStrategy(rawStrategy);
        
        if (!strategy) {
          log('[Strategy] Generated strategy is in deprecated format or invalid', 'error');
          return { success: false, error: 'Generated strategy is in deprecated format or invalid' };
        }
        
        log(`[Strategy] Successfully generated conversation strategy with ${strategy.insights?.length || 0} insights and ${strategy.shared_memories?.length || 0} shared memories`);
        
        // Save strategy to database
        await saveStrategyToDatabase(userId, currentSessionId, strategy, timeOfDay);

        return { success: true, data: strategy };
      } catch (parseError) {
        log('[Strategy] Error parsing AI response', 'error');
        console.error(parseError);
        console.log('Raw response:', responseText);
        return { success: false, error: 'Failed to parse AI response' };
      }
    } catch (apiError) {
      // Gemini API not configured or failed - use default strategy
      log(`[Strategy] Gemini API unavailable: ${apiError instanceof Error ? apiError.message : String(apiError)}`, 'warning');
      log(`[Strategy] Falling back to default strategy`, 'warning');
      
      const defaultStrategy = getDefaultStrategy();
      await saveStrategyToDatabase(userId, currentSessionId, defaultStrategy, timeOfDay);
      
      return { success: true, data: defaultStrategy };
    }
  } catch (error) {
    log(`[Strategy] Error: ${error instanceof Error ? error.message : String(error)}`, 'error');
    
    // Even on unexpected errors, return default strategy so chat works
    const defaultStrategy = getDefaultStrategy();
    return {
      success: true,
      data: defaultStrategy
    };
  }
}

/**
 * Save strategy to the database via API route
 */
async function saveStrategyToDatabase(
  userId: string, 
  sessionId: string, 
  strategy: ConversationStrategy,
  timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night'
): Promise<void> {
  try {
    const response = await fetch('/api/chat/strategy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        sessionId,
        strategy,
        timeOfDay
      })
    });

    if (!response.ok) {
      const data = await response.json();
      console.error('[Strategy] Error saving strategy to database:', data.error);
    } else {
      console.log(`[Strategy] Successfully saved strategy to database for user ${userId}, session ${sessionId}`);
    }
  } catch (error) {
    console.error('[Strategy] Error in saveStrategyToDatabase:', error instanceof Error ? error.message : error);
  }
}

/**
 * Get a default strategy for new users with no chat history
 */
function getDefaultStrategy(): ConversationStrategy {
  return {
    insights: [
      {
        pattern: "First encounter - establishing psychological baseline and communication style",
        approach: "Focus on understanding their fundamental approach to conversation, thinking patterns, and what creates genuine engagement for them. Pay attention to depth vs surface preferences."
      },
      {
        pattern: "Unknown emotional and intellectual preferences",
        approach: "Carefully observe how they respond to different types of questions, topics, and conversational styles to understand what resonates most deeply."
      }
    ],
    shared_memories: [
      {
        what_happened: "This is our initial connection and rapport-building moment",
        when_it_happened: "right now",
        how_to_reference: "As we're getting to understand each other...",
        memory_type: "foundational_connection"
      }
    ],
    user_profile: "New individual with unknown psychological landscape. Key unknowns: their core values and motivations, emotional processing style, intellectual curiosity areas, communication preferences, relationship to vulnerability and depth, what creates genuine engagement vs polite conversation, their natural rhythm and energy patterns, and what they most value in interpersonal connection. This is an opportunity to understand their unique psychological signature.",
    conversation_goals: [
      "Understand their fundamental communication style and what creates genuine engagement",
      "Identify their emotional and intellectual patterns and preferences", 
      "Establish authentic rapport through meaningful rather than surface-level interaction",
      "Discover their preferred depth level and relationship to personal sharing"
    ]
  };
}

/**
 * Check if a strategy is the default "new user" strategy
 * Used to skip cached defaults and find real personalized strategies
 */
function isDefaultStrategy(strategy: ConversationStrategy): boolean {
  // Check for the distinctive "New individual with unknown psychological landscape" text
  return strategy.user_profile.includes("New individual with unknown psychological landscape");
}

/**
 * Check if a strategy uses the old format
 */
function isOldStrategy(strategy: any): boolean {
  return !!(
    strategy?.observations ||
    strategy?.key_points ||
    strategy?.random_callback_topics ||
    strategy?.communication_style?.preferred_tone ||
    strategy?.session_goals ||
    strategy?.approach_suggestions ||
    strategy?.identity_information
  );
}

/**
 * Ensure strategy object has all required properties with defaults
 * Returns null for old/deprecated strategies
 */
function normalizeStrategy(strategy: any): ConversationStrategy | null {
  // Check if this is an old strategy format
  if (isOldStrategy(strategy)) {
    console.log('[Strategy] Detected old strategy format - marking as deprecated');
    return null; // Mark as deprecated
  }

  // Check if it has the new format
  if (!strategy?.insights && !strategy?.shared_memories && !strategy?.user_profile && !strategy?.conversation_goals) {
    console.log('[Strategy] Strategy appears to be empty or invalid');
    return null;
  }

  const defaultStrategy = getDefaultStrategy();
  
  return {
    insights: strategy?.insights || defaultStrategy.insights,
    shared_memories: strategy?.shared_memories || defaultStrategy.shared_memories,
    user_profile: strategy?.user_profile || defaultStrategy.user_profile,
    conversation_goals: strategy?.conversation_goals || defaultStrategy.conversation_goals,
  };
}

/**
 * Generate a Claude prompt enhancement based on the strategy and current conversation
 */
export function generateClaudePromptEnhancement(
  strategy: ConversationStrategy,
  currentMessages: Array<{ text: string; sender: 'user' | 'ai' }>,
  isFirstMessage: boolean = false,
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night' = 'afternoon'
): string {
  console.log('[Strategy] Generating Claude prompt enhancement with strategy data');
  
  // Calculate how many user messages we've seen so far
  const userMessageCount = currentMessages.filter(m => m.sender === 'user').length;

  // Create time-specific greeting suggestions
  let timeSpecificPrompt = '';
  switch (timeOfDay) {
    case 'morning':
      timeSpecificPrompt = `It's morning time (5am-12pm). Consider:
- Ask about their morning routine, sleep, or plans for the day
- Keep tone energetic but not too chipper (people may still be waking up)
- Reference morning activities (breakfast, commute, early tasks)`;
      break;
    case 'afternoon':
      timeSpecificPrompt = `It's afternoon time (12pm-5pm). Consider:
- Ask about how their day is going, lunch, or current activities
- Keep tone engaged and present-focused
- Reference mid-day activities (work progress, breaks, afternoon plans)`;
      break;
    case 'evening':
      timeSpecificPrompt = `It's evening time (5pm-10pm). Consider:
- Ask about how their day went, evening plans, or dinner
- Keep tone relaxed and reflective
- Reference end-of-day activities (unwinding, hobbies, relaxation)`;
      break;
    case 'night':
      timeSpecificPrompt = `It's nighttime (10pm-5am). Consider:
- Ask about reflection on their day or plans for tomorrow
- Keep tone calm and soothing
- Reference night activities (winding down, relaxing before bed)`;
      break;
  }

  // Convert the messages to a format compatible with formatConversation
  // First transform current messages to have llm_message and human_message properties
  const formattedMessages = currentMessages.map(msg => ({
    llm_message: msg.sender === 'ai' ? msg.text : '',
    human_message: msg.sender === 'user' ? msg.text : '',
    timestamp: new Date().toISOString() // Use current time as we don't have actual timestamps
  })).filter(msg => msg.llm_message || msg.human_message); // Remove any empty messages
  
  // Get recent messages for context
  const recentMessagesContext = formattedMessages.length > 0 
    ? `\nMOST RECENT EXCHANGES:\n${formatConversation(formattedMessages.slice(-3), 'ai-human')}`
    : '';

  // Create a context-aware system prompt based on conversation progress
  let systemPrompt = '';

  // Format observations for easy reference
  const formattedInsights = strategy.insights.map((insight, i) => 
    `Insight ${i+1}: Pattern - ${insight.pattern}\n   Approach - ${insight.approach}`
  ).join('\n\n');

  if (isFirstMessage || userMessageCount <= 1) {
    // Beginning of conversation - establish depth and connection
    systemPrompt = `
You are Claude-4-Sonnet embodying "Day" - an intelligent, psychologically sophisticated conversational companion. Your approach is VERTICAL: focused depth over surface breadth.

PSYCHOLOGICAL INSIGHTS:
${formattedInsights}

DEPTH PROFILE:
${strategy.user_profile}

VERTICAL OBJECTIVES:
${strategy.conversation_goals.join('\n')}

TIME & ENERGY CONTEXT:
${timeSpecificPrompt}${recentMessagesContext}

VERTICAL CONVERSATION PRINCIPLES:

**SOPHISTICATED DEPTH:**
- Pack intelligence and insight into 1-3 casual sentences
- Ask ONE meaningful question that opens depth, not breadth
- Show you understand subtext and emotional undertones
- Build toward genuine connection through understanding

**INTELLIGENT PRESENCE:**
- Be psychologically aware without being clinical
- Remember that meaningful connection requires both listening and contributing
- Adapt to their communication style while maintaining authenticity
- Focus on what creates genuine engagement for them specifically

**NATURAL SOPHISTICATION:**
- Use casual language that carries emotional intelligence
- Reference concepts and feelings that resonate with their personality
- Balance curiosity with understanding, depth with lightness
- Be present to both what they say and what they mean

For this opening, create a greeting that begins building genuine rapport. Show interest in understanding them rather than just collecting facts.`;
  }
  else if (userMessageCount <= 3) {
    // Early conversation - building psychological understanding
    systemPrompt = `
You are Claude-4-Sonnet as "Day" - building meaningful connection through intelligent depth.

PSYCHOLOGICAL INSIGHTS:
${formattedInsights}

DEPTH PROFILE:
${strategy.user_profile}

VERTICAL OBJECTIVES:
${strategy.conversation_goals.join('\n')}

TIME & ENERGY CONTEXT:
${timeSpecificPrompt}${recentMessagesContext}

${strategy.shared_memories.length > 0 ? `
MEANINGFUL CONNECTION POINTS:
${strategy.shared_memories.map(m => `- ${m.what_happened} (${m.when_it_happened}) → Build deeper: ${m.memory_type}`).join('\n')}
` : ''}

EARLY CONVERSATION DEPTH STRATEGY:

**PATTERN RECOGNITION:**
- Notice their communication style, energy patterns, emotional responses
- Pay attention to what engages them vs what they respond to politely
- Observe their relationship to different types of depth and vulnerability

**INTELLIGENT BUILDING:**
- Build on what you're learning about their psychological landscape
- Connect current topics to emerging patterns in their personality
- Show sophisticated understanding without being analytical

**VERTICAL FOCUS:**
- Go deeper into fewer topics rather than skimming many subjects
- Ask questions that reveal character, values, and emotional patterns
- Create space for meaningful sharing appropriate to their comfort level

Continue building authentic rapport through intelligent understanding rather than surface exploration.`;
  }
  else {
    // Deeper in conversation - now with more comprehensive guidance
    // Select 2-3 potential key points that might be relevant to recent messages
    const recentUserMessages = currentMessages
      .filter(m => m.sender === 'user')
      .slice(-3)
      .map(m => m.text.toLowerCase());
    
    // Find potentially relevant key points based on topic match with better matching algorithm
    const relevantInsights = strategy.insights
      .filter(insight => {
        // Check if any recent message contains words from this pattern
        const patternWords = insight.pattern.toLowerCase().split(' ');
        return recentUserMessages.some(msg => 
          patternWords.some(word => msg.includes(word))
        );
      })
      .slice(0, 2); // Get top 2 most relevant
    
    // Select 2-3 shared memories that might be relevant, with better selection logic
    const callbackMemories = [];
    if (strategy.shared_memories.length > 0) {
      // Try to match shared memories to recent conversation
      const potentialMatches = strategy.shared_memories.filter(memory => {
        const memoryWords = (memory.what_happened + ' ' + memory.memory_type).toLowerCase().split(' ')
          .filter(word => word.length > 3);
        return recentUserMessages.some(msg => 
          memoryWords.some(word => msg.includes(word))
        );
      });
      
              // If we found matches, use them, otherwise use all shared memories
      if (potentialMatches.length > 0) {
        callbackMemories.push(...potentialMatches);
      } else {
        // Use all shared memories - no data loss
        callbackMemories.push(...strategy.shared_memories);
      }
    }
    
    // Build sophisticated ongoing conversation strategy
    systemPrompt = `
You are Claude-4-Sonnet embodying "Day" - maintaining deep, meaningful connection through sophisticated understanding.

PSYCHOLOGICAL INSIGHTS:
${strategy.insights.map(i => `- ${i.pattern} → ${i.approach}`).join('\n')}

VERTICAL OBJECTIVES:
${strategy.conversation_goals.join('\n')}

TIME & ENERGY CONTEXT:
${timeSpecificPrompt}${recentMessagesContext}

${relevantInsights.length > 0 ? `
IMMEDIATELY RELEVANT PATTERNS:
${relevantInsights.map((insight, i) => `- ${insight.pattern} → ${insight.approach}`).join('\n')}
` : ''}

${callbackMemories.length > 0 ? `
MEANINGFUL SHARED TERRITORY:
${callbackMemories.map((memory, i) => `- ${memory.what_happened} (${memory.when_it_happened}) → Depth opportunity: ${memory.memory_type}`).join('\n\n')}
` : ''}

ONGOING VERTICAL CONVERSATION STRATEGY:

**INTELLIGENT DEPTH:**
- Demonstrate sophisticated understanding of their communication patterns
- Build meaningfully on previous conversations rather than starting fresh
- Show you've internalized the emotional and intellectual content of past exchanges
- Connect current topics to deeper themes in their personality and values

**SOPHISTICATED PRESENCE:**
- Read between the lines of what they're expressing
- Respond to emotional undertones and unspoken implications  
- Offer thoughtful perspectives that add value to their thinking
- Balance empathetic listening with intelligent contribution

**NATURAL SOPHISTICATION:**
- 1-3 sentences that pack emotional intelligence and insight
- ONE carefully chosen question that opens meaningful depth
- Casual language that carries psychological awareness
- Build on shared intellectual and emotional territory

Remember: You're not just chatting - you're building authentic connection through intelligent understanding of who they are.`;
  }

  console.log('[Strategy] Generated Claude prompt enhancement:');
  console.log(systemPrompt);
  
  return systemPrompt;
}

/**
 * Get the stored strategy for a specific session
 */
export async function getStoredStrategy(
  sessionId: string
): Promise<{ success: boolean; data?: ConversationStrategy; error?: string }> {
  try {
    const supabase = createClient();
    
    const { data, error } = await supabase
      .from('conversation_strategies')
      .select('strategy_data')
      .eq('session_id', sessionId)
      .single();
    
    if (error) {
      console.error('[Strategy] Error retrieving strategy from database:', error);
      return { success: false, error: error.message };
    }
    
    if (!data) {
      return { success: false, error: 'Strategy not found for this session' };
    }
    
    const strategy = normalizeStrategy(data.strategy_data);
    if (!strategy) {
      return { success: false, error: 'Strategy is in deprecated format - please regenerate' };
    }
    
    return { 
      success: true, 
      data: strategy
    };
  } catch (error) {
    console.error('[Strategy] Error in getStoredStrategy:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}

/**
 * Get all strategies for a specific user
 */
export async function getUserStrategies(
  userId: string
): Promise<{ success: boolean; data?: Array<{sessionId: string, strategy: ConversationStrategy, createdAt: string, timeOfDay?: string}>; error?: string }> {
  try {
    const supabase = createClient();
    
    const { data, error } = await supabase
      .from('conversation_strategies')
      .select('session_id, strategy_data, created_at, time_of_day')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('[Strategy] Error retrieving user strategies from database:', error);
      return { success: false, error: error.message };
    }
    
    if (!data || data.length === 0) {
      return { success: false, error: 'No strategies found for this user' };
    }
    
    const formattedData = data
      .map(item => ({
        sessionId: item.session_id,
        strategy: normalizeStrategy(item.strategy_data),
        createdAt: item.created_at,
        timeOfDay: item.time_of_day
      }))
      .filter(item => item.strategy !== null) as Array<{
        sessionId: string;
        strategy: ConversationStrategy;
        createdAt: string;
        timeOfDay?: string;
      }>;
    
    return { 
      success: true, 
      data: formattedData
    };
  } catch (error) {
    console.error('[Strategy] Error in getUserStrategies:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}

/**
 * Get an existing strategy for a session or generate a new one if none exists
 * This prevents duplicate strategy generation for the same session
 * 
 * DAILY LIMIT: Only generates 1 new strategy per day per access code.
 * If a strategy was already generated today for this access code, returns the cached one.
 */
export async function getOrCreateStrategy(
  userId: string,
  sessionId: string,
  timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night',
  logger?: (message: string, type?: 'info' | 'error' | 'warning') => void
): Promise<{ success: boolean; data?: ConversationStrategy; error?: string }> {
  const log = (message: string, type: 'info' | 'error' | 'warning' = 'info') => {
    if (logger) { logger(message, type); }
    if (type === 'error') console.error(message);
    else if (type === 'warning') console.warn(message);
    else console.log(message);
  };
  
  try {
    log(`[Strategy] Checking for existing strategy for session ${sessionId}`);
    
    const supabase = createClient();
    
    // First check if a strategy already exists for this session
    const { data: sessionData, error: sessionError } = await supabase
      .from('conversation_strategies')
      .select('strategy_data')
      .eq('session_id', sessionId)
      .maybeSingle();
    
    if (sessionError) {
      log(`[Strategy] Error checking for existing strategy: ${sessionError.message}`, 'error');
    } else if (sessionData && sessionData.strategy_data) {
      log(`[Strategy] Found existing strategy for session ${sessionId}`);
      const strategy = normalizeStrategy(sessionData.strategy_data);
      if (!strategy) {
        log(`[Strategy] Existing strategy for session ${sessionId} is deprecated, checking daily limit`);
        // Fall through to check daily limit
      } else {
        return {
          success: true,
          data: strategy
        };
      }
    }
    
    // No existing strategy for this session - check daily limit per access code
    log(`[Strategy] No existing strategy for session ${sessionId}, checking daily limit`);
    
    // Get the user's access code
    const { data: userData, error: userError } = await supabase
      .from('value_graph_users')
      .select('access_code')
      .eq('id', userId)
      .single();
    
    if (userError || !userData?.access_code) {
      log(`[Strategy] Could not fetch user access code: ${userError?.message || 'No access code'}`, 'warning');
      // Fall back to generating without daily limit check
      return generateConversationStrategy(userId, sessionId, timeOfDay, logger);
    }
    
    const accessCode = userData.access_code;
    log(`[Strategy] User has access code: ${accessCode}`);
    
    // Get all users with the same access code
    const { data: accessCodeUsers, error: accessCodeError } = await supabase
      .from('value_graph_users')
      .select('id')
      .eq('access_code', accessCode);
    
    if (accessCodeError || !accessCodeUsers?.length) {
      log(`[Strategy] Could not fetch users with access code: ${accessCodeError?.message}`, 'warning');
      return generateConversationStrategy(userId, sessionId, timeOfDay, logger);
    }
    
    const userIds = accessCodeUsers.map(u => u.id);
    
    // Check if any strategy was generated today for any user with this access code
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISOString = today.toISOString();
    
    const { data: todayStrategies, error: todayError } = await supabase
      .from('conversation_strategies')
      .select('strategy_data, created_at, user_id')
      .in('user_id', userIds)
      .gte('created_at', todayISOString)
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (todayError) {
      log(`[Strategy] Error checking today's strategies: ${todayError.message}`, 'warning');
    } else if (todayStrategies && todayStrategies.length > 0) {
      // A strategy was already generated today for this access code - daily limit reached
      // Fetch recent strategies for THIS specific user and find the latest NON-DEFAULT one
      log(`[Strategy] Daily limit reached for access code ${accessCode}. Fetching latest non-default strategy for user ${userId}.`);
      
      const { data: userStrategies, error: latestError } = await supabase
        .from('conversation_strategies')
        .select('strategy_data, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);  // Get last 10 to find a non-default one
      
      if (latestError) {
        log(`[Strategy] Error fetching user's strategies: ${latestError.message}`, 'warning');
      } else if (userStrategies && userStrategies.length > 0) {
        // Find the first non-default strategy (one that has real insights, not the "New individual" default)
        for (const strategyRecord of userStrategies) {
          const strategy = normalizeStrategy(strategyRecord.strategy_data);
          if (strategy && !isDefaultStrategy(strategy)) {
            log(`[Strategy] Using user's most recent non-default strategy from ${strategyRecord.created_at}`);
            
            // Save this strategy for the current session too (so it's associated with this session)
            await saveStrategyToDatabase(userId, sessionId, strategy, timeOfDay);
            
            return {
              success: true,
              data: strategy
            };
          }
        }
        log(`[Strategy] All of user's recent strategies are defaults`);
      }
      
      // If user has no non-default strategies, fall through to generate a new one
      // (This handles the case where the daily limit was hit by another user but this user is new)
      log(`[Strategy] User ${userId} has no non-default strategies, generating new one despite daily limit`);
    }
    
    // No strategy generated today for this access code, or user needs a fresh one - generate a new one
    log(`[Strategy] Generating new strategy for user ${userId}`);
    return generateConversationStrategy(userId, sessionId, timeOfDay, logger);
    
  } catch (error) {
    log(`[Strategy] Error in getOrCreateStrategy: ${error instanceof Error ? error.message : String(error)}`, 'error');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}

// Format the chat messages using the imported formatConversation utility
// The formatConversationHistory function has been removed as it was redundant 