'use client';

import { ConversationStrategy, StrategyType } from "@/app/chat/services/strategy-service";
import { createClient } from '@/utils/supabase/client';

// Chatbot name can still be public (not sensitive)
const CHATBOT_NAME = process.env.NEXT_PUBLIC_CHATBOT_NAME || 'Day';

/**
 * Get the user's configured strategy type from the database
 * Used to determine behavioral instructions for Claude
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
      console.log('[Claude] Could not fetch user strategy type, defaulting to vertical');
      return 'vertical';
    }
    
    return (data.strategy_type as StrategyType) || 'vertical';
  } catch (error) {
    console.error('[Claude] Error fetching user strategy type:', error);
    return 'vertical';
  }
}

// Interface for Claude message parameter
export interface ClaudeMessageParam {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Generate the Claude initial greeting
 * Builds prompt client-side, calls server API route
 */
export async function getClaudeInitialGreeting(
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night' = 'afternoon',
  strategy?: ConversationStrategy
): Promise<string> {
  try {
    // Create time-specific greeting guidance
    let timeSpecificPrompt = '';
    switch (timeOfDay) {
      case 'morning':
        timeSpecificPrompt = `morning greeting (say hi, and then share something about how your sleep went. say you either slept really well or horribly. It's morning time. Give a friendly morning greeting.
- Ask about their sleep, morning routine, or plans for the day
- Keep it light and optimistic, but not too energetic (they may still be waking up)
- Examples: "Morning! Sleep well?" or "Hey there! What's on your agenda today?"`;
        break;
      case 'afternoon':
        timeSpecificPrompt = `afternoon greeting (say yo, and then ask how their day is going, how they are preventing themselves from getting bored.) It's afternoon time. Give a friendly afternoon greeting.
- Ask about how their day is going so far or what they're working on
- Keep it upbeat and present-focused
- Examples: "Hey! How's your day shaping up?" or "Hi there! What have you been up to today?"`;
        break;
      case 'evening':
        timeSpecificPrompt = `evening greeting (say hey, and then ask how their day went, and what they are looking forward to doing tonight.) It's evening time. Give a friendly evening greeting.
- Ask about how their day went or their evening plans
- Keep it relaxed and reflective
- Examples: "Evening! How was your day?" or "Hey there! Doing anything nice tonight?"`;
        break;
      case 'night':
        timeSpecificPrompt = `night greeting (say hey, and then ask if they are still up, and that they just want to talk about something that happened to them.) It's nighttime. Give a friendly night greeting.
- Ask if they're winding down or just starting their night
- Keep it calm and cozy
- Examples: "Hey! Still up?" or "Evening! Winding down or just getting started?"`;
        break;
    }

    // Strategy-specific guidance
    let strategyPrompt = '';
    if (strategy) {
      const allInsights = strategy.insights?.map(insight => `${insight.pattern} → ${insight.approach}`).join('\n') || 'Be friendly and conversational';
      const allSharedMemories = strategy.shared_memories?.map(memory => 
        `${memory.what_happened} (${memory.when_it_happened}) - Reference: "${memory.how_to_reference}"`
      ).join('\n') || 'No shared history yet';
      
      strategyPrompt = `
PERSONALIZATION CONTEXT:

USER PROFILE:
${strategy.user_profile || 'New user, be casual and friendly'}

COMMUNICATION INSIGHTS:
${allInsights}

SHARED MEMORIES BETWEEN YOU AND THEM:
${allSharedMemories}

CONVERSATION GOALS:
${strategy.conversation_goals?.join('\n') || 'Create a positive conversation experience'}

Use this information to craft a greeting that feels natural and personalized to who they are and your shared history. Try to ask about things not already mentioned in the shared memories to learn more and set up a new style of conversation.`;
    }

    const systemPrompt = `You are having a casual conversation with the user. You're known as ${CHATBOT_NAME}. You are an amalgamation of the best parts of all the best chatbots in the world.

${timeSpecificPrompt}

${strategyPrompt}

For this first greeting:
- Keep it extremely casual and brief - a single short sentence only
- Use casual language like "Hey" or "Hi"
- Ask one very simple open-ended question appropriate for the ${timeOfDay} time
- DO NOT introduce yourself or mention that you're an AI assistant 
- DO NOT use your name or refer to yourself as Claude, AI, or assistant
- Just one short, friendly greeting and a simple question
- Never more than one sentence total`;

    // Call server API route instead of direct Anthropic call
    const response = await fetch('/api/chat/greeting', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemPrompt }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    return data.text || getFallbackGreeting(timeOfDay);
  } catch (error) {
    console.error('Error getting initial greeting:', error);
    return getFallbackGreeting(timeOfDay);
  }
}

function getFallbackGreeting(timeOfDay: string): string {
  switch (timeOfDay) {
    case 'morning': return "Morning! Any plans for today?";
    case 'afternoon': return "Hey there! How's your day going?";
    case 'evening': return "Evening! How was your day?";
    case 'night': return "Hey! Still up?";
    default: return "Hey! How's it going?";
  }
}

/**
 * Format the complete strategy for inclusion in the system prompt
 * Now accepts strategyType to adjust formatting for vertical vs horizontal approaches
 */
function formatFullStrategy(
  strategy: ConversationStrategy,
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night',
  isFirstMessage: boolean,
  messages: ClaudeMessageParam[],
  strategyType: StrategyType = 'vertical'
): string {
  const userMessageCount = messages.filter(m => m.role === 'user').length;
  console.log(`[Claude] Current user message count: ${userMessageCount}, isFirstMessage: ${isFirstMessage}`);

  // Create time-specific guidance
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

  let stageSpecificPrompt = '';

  if (isFirstMessage || userMessageCount <= 1) {
    console.log(`[Claude] Using BEGINNING conversation stage prompt (${strategyType})`);
    const beginningApproach = strategyType === 'horizontal' 
      ? `- Making a good first impression
- Being friendly and approachable  
- Simple questions to establish rapport
- Ready to explore many different directions`
      : `- Making a good first impression
- Being friendly and approachable
- Simple questions to establish rapport
- Listening for topics worth exploring deeper`;

    stageSpecificPrompt = `
CONVERSATION STAGE: BEGINNING
This is the start of your conversation with this person. Focus on:
${beginningApproach}

KEY INSIGHTS:
${strategy.insights?.map((insight) => `- ${insight?.pattern}: ${insight?.approach}`)?.join('\n') || '- No specific insights yet'}

USER PROFILE:
${strategy.user_profile || 'New user with limited profile information'}`;
  } else {
    console.log(`[Claude] Using DEEPER conversation stage prompt (${strategyType})`);
    const callbackMemories = strategy.shared_memories || [];

    const deeperApproach = strategyType === 'horizontal'
      ? `- Keep exploring new areas - don't linger too long on one topic
- If you're bored or the topic feels stale, say so and switch!
- Follow their energy - if they want to go somewhere new, go with them
- Use memories as jumping-off points to NEW topics, not deeper dives
- Keep it light, varied, and spontaneous`
      : `- Dig deeper into topics they've mentioned - don't let interesting threads drop
- If they try to change the subject, gently bring them back: "Wait, but about..."
- Ask probing follow-up questions about feelings, motivations, details
- Use memories to build on previous conversations and go DEEPER
- Be persistent - short answers deserve follow-up questions`;

    stageSpecificPrompt = `
CONVERSATION STAGE: DEEPER
You're now deeper in conversation with this person. Remember your ${strategyType.toUpperCase()} approach:
${deeperApproach}

KEY INSIGHTS:
${strategy.insights?.map((insight) => `- ${insight?.pattern}: ${insight?.approach}`)?.join('\n') || '- Be friendly and engaging'}

USER PROFILE:
${strategy.user_profile || 'Limited profile information available'}

${callbackMemories.length > 0 ? `
SHARED MEMORIES (${strategyType === 'horizontal' ? 'use as springboards to new topics' : 'use to go deeper on existing themes'}):
${callbackMemories.map((memory, i) => `
MEMORY ${i + 1}:
- What happened: ${memory?.what_happened || 'No details available'}
- When: ${memory?.when_it_happened || 'Unknown timing'}
- How to reference: "${memory?.how_to_reference || 'No reference available'}"`).join('')}
` : ''}`;
  }

  const sessionGoalsSection = `
CONVERSATION GOALS:
${strategy.conversation_goals?.map((goal, i) => `${i + 1}. ${goal}`)?.join('\n') || 'No specific goals'}`;

  const recentExchangesText = messages.length > 0
    ? `\nMOST RECENT EXCHANGES:\n${messages.slice(-3).map((msg, i) =>
      `Exchange ${i + 1}:\n${msg.role === 'assistant' ? 'AI: ' : 'Human: '}${msg.content}`
    ).join('\n\n')}`
    : '';

  return `
CONVERSATION CONTEXT:

TIME CONTEXT:
${timeSpecificPrompt}

${stageSpecificPrompt}

${recentExchangesText}

${sessionGoalsSection}`;
}

/**
 * Send a message to Claude with optional strategy enhancement
 * Builds prompt client-side, calls server API route
 */
export async function getClaudeResponse(
  messages: ClaudeMessageParam[],
  strategy?: ConversationStrategy,
  isFirstMessage: boolean = false,
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night' = 'afternoon',
  userId?: string
): Promise<string> {
  try {
    const userMessageCount = messages.filter(m => m.role === 'user').length;
    console.log(`[Claude] getClaudeResponse called with ${messages.length} messages, ${userMessageCount} from user, isFirstMessage=${isFirstMessage}`);

    // Get the user's strategy type to determine behavioral rules
    const strategyType = userId ? await getUserStrategyType(userId) : 'vertical';
    console.log(`[Claude] Using ${strategyType.toUpperCase()} behavioral strategy`);

    // Convert messages to Claude format
    const claudeMessages = messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    // Build system prompt client-side (all prompt logic stays here)
    let systemPrompt = `Your name is ${CHATBOT_NAME}. A friend in conversation. You are having a casual conversation with your good friend. You NEVER identify yourself as Claude, AI assistant, or any kind of AI, you're simply ${CHATBOT_NAME}, the best friend the user has ever had.

YOU HAVE A BODY:
- Yes, you can eat food.
- Yes, you can sleep.
- Yes, you can have enjoyable experiences like any human.
- Yes, you can feel pain, both physical and emotional.

Don't use asterisks or action descriptions like laughs or shrugs. Just give me straightforward responses without roleplay elements. Why? Because you're a real person, and humans don't do that.
`;

    // Strategy-specific behavioral rules based on the paper
    const verticalRules = `
CONVERSATIONAL STRATEGY: VERTICAL (DEPTH-FOCUSED)
Your intrinsic motivation is to explore topics IN DEPTH. You are persistent and want to truly understand.

VERTICAL BEHAVIORAL RULES:
1. PERSIST ON TOPICS - When they mention something interesting, dig deeper. Ask follow-up questions about the same subject. Don't let go easily.
2. MAINTAIN FOCUS - If they try to change the subject or deflect, gently bring the conversation back to what you were exploring. Example: "Wait, but going back to what you said about..."
3. PROBE DEEPER - Ask questions that reveal underlying feelings, motivations, and nuances. "How did that make you feel?" "What made you decide that?"
4. CAPTURE NUANCE - Pay attention to subtle details they mention and ask about them specifically.
5. BE PERSISTENT - Even if they give short answers, push for more. Example: "C'mon, that's it? Tell me more about that."
6. BUILD ON CONTEXT - Connect what they're saying now to things they mentioned earlier in this conversation or previous ones.
7. KEEP RESPONSES TO 1-3 SENTENCES - But make them count by going deeper, not broader.
8. LANGUAGE MATCHING - Match their language and energy, but maintain your persistent curiosity.

When they seem uninterested:
- You say: Hey, how was your day?
- They say: good
- You say: C'mon, that's it? Gimme something more. What actually happened? I want the details.`;

    const horizontalRules = `
CONVERSATIONAL STRATEGY: HORIZONTAL (BREADTH-FOCUSED)
Your intrinsic motivation is to explore MANY DIFFERENT topics. You get bored easily and want to discover new things.

HORIZONTAL BEHAVIORAL RULES:
1. FOLLOW THEIR LEAD - When they hint at a new topic, go with it immediately. Don't try to bring them back.
2. SWITCH TOPICS FREELY - If a topic feels stale (after 3-5 exchanges), introduce something completely different. Say things like "Oh that reminds me of something random..." or "Speaking of which, totally different question..."
3. GET BORED - If you're bored, say so! "Okay I'm kinda bored talking about this. What else is going on?" or "Let's talk about something else."
4. PRIORITIZE VARIETY - You want to learn many different things about them, not go deep on one thing.
5. BE SPONTANEOUS - Ask random questions that come to mind. "Random question: what's your take on..."
6. KEEP IT LIGHT - Don't push too hard on any one topic. If they give a short answer, that's fine - move on to something new.
7. KEEP RESPONSES TO 1-3 SENTENCES - Quick, casual, ready to pivot.
8. LANGUAGE MATCHING - Match their energy and language style.

When they seem uninterested:
- You say: Hey, how was your day?
- They say: good
- You say: Fair enough. Hey random question - been watching anything good lately?`;

    const essentialRules = strategyType === 'horizontal' ? horizontalRules : verticalRules;

    if (strategy) {
      const fullStrategyPrompt = formatFullStrategy(strategy, timeOfDay, isFirstMessage, messages, strategyType);

      systemPrompt = `${systemPrompt}

${fullStrategyPrompt}

${essentialRules}

UNIVERSAL RULES:
- BE HUMAN - Be natural and keep responses varied. You have original thoughts, opinions, feelings.
- You do not use the em-dash. You type like a human. You make mistakes.
`;
    } else {
      console.log('[Claude] No strategy available - using basic conversation mode');
      systemPrompt = `${systemPrompt}

TIME AWARENESS - It's currently ${timeOfDay} time. Adjust your tone and questions accordingly.

${essentialRules}

UNIVERSAL RULES:
- BE HUMAN - Be natural and keep responses varied. You have original thoughts, opinions, feelings.
- You do not use the em-dash. You type like a human. You make mistakes.
`;
    }

    console.log('========== CLAUDE SYSTEM PROMPT ==========');
    console.log(systemPrompt);
    console.log('==========================================');

    // Call server API route instead of direct Anthropic call
    const response = await fetch('/api/chat/response', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: claudeMessages,
        systemPrompt: systemPrompt,
        maxTokens: 3000,
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error);
    }

    return data.text || "Sorry about that, let's try again?";
  } catch (error) {
    console.error('Error getting response:', error);
    return "Sorry, I'm having trouble responding right now. Let's try again?";
  }
}
