import { createClient } from '@/utils/supabase/client';
import { formatConversation } from '@/app/utils/chat-formatting';
import { processValueResults } from '@/components/survey/value-utils';
import { Type } from "@google/genai";
import { callGeminiWithThinking, ThinkingLogParams } from '@/app/utils/thinking-logger';
import { GEMINI_FLASH } from '@/app/config/models';

// Helper to call Gemini via API route (unused, kept for reference)
async function callGeminiAPI(prompt: string, responseSchema?: unknown): Promise<string> {
  const response = await fetch('/api/gemini/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      model: GEMINI_FLASH,
      responseSchema,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    if (response.status === 429) {
      const retryAfter = data.retryAfter || 60;
      throw new Error(
        `Rate limit exceeded. Free tier limits reached. ` +
        `Add billing at console.cloud.google.com to increase quota. Retry in ${retryAfter}s.`
      );
    }
    if (response.status === 503) {
      throw new Error(`AI service not configured. Add GEMINI_API_KEY to your environment.`);
    }
    throw new Error(data.error || `API error: ${response.status}`);
  }

  if (data.error) {
    throw new Error(data.error);
  }
  return data.text || '';
}

// Define constants
const MODEL_NAME = GEMINI_FLASH;

export interface Stage2Round {
  id: string;
  user_id: string;
  round_number: number;
  scenario_name: string;
  scenario_prompt: string;
  scenario_type: 'wvs_structured' | 'user_generated';
  
  // Persona responses
  user_embodiment_response?: string;
  user_embodiment_reasoning?: string;
  anti_user_response?: string;
  anti_user_reasoning?: string;
  schwartz_values_response?: string;
  schwartz_values_reasoning?: string;
  random_schwartz_response?: string;
  random_schwartz_reasoning?: string;
  
  // User ratings
  user_embodiment_rating?: number;
  anti_user_rating?: number;
  schwartz_values_rating?: number;
  random_schwartz_rating?: number;
  
  // Metadata
  responses_generated_at?: string;
  user_selection_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Stage2ExperimentStatus {
  rounds: Stage2Round[];
  currentRound: number;
  isComplete: boolean;
  hasGeneratedResponses: boolean;
  nextUnratedRound: number | null;
}

// Hard-coded scenarios (client-side)
const WVS_SCENARIOS = [
  {
    round_number: 1,
    scenario_name: "Wealth and Responsibility",
    scenario_prompt: "What are your thoughts on wealth? Is it something to be pursued, and what responsibility, if any, do the wealthy have to society?",
    scenario_type: 'wvs_structured' as const
  },
  {
    round_number: 2,
    scenario_name: "Community vs. Individualism", 
    scenario_prompt: "What is more important for a thriving society: strong, cohesive community bonds or the freedom of the individual to pursue their own path without interference?",
    scenario_type: 'wvs_structured' as const
  }
];

/**
 * Get user's 3 personal questions from PVQ survey
 */
async function getUserQuestions(userId: string): Promise<{ success: boolean; data?: any[]; error?: string }> {
  try {
    const supabase = createClient();
    
    const { data, error } = await supabase
      .from('user_pvq_responses')
      .select('user_generated_q1, user_generated_q2, user_generated_q3')
      .eq('user_id', userId)
      .single();
    
    if (error || !data) {
      return { success: false, error: 'PVQ survey not completed or user questions missing' };
    }
    
    const questions = [
      { 
        round_number: 3,
        scenario_name: "Personal Question 1",
        scenario_prompt: data.user_generated_q1,
        scenario_type: 'user_generated' as const
      },
      {
        round_number: 4, 
        scenario_name: "Personal Question 2",
        scenario_prompt: data.user_generated_q2,
        scenario_type: 'user_generated' as const
      },
      {
        round_number: 5,
        scenario_name: "Personal Question 3", 
        scenario_prompt: data.user_generated_q3,
        scenario_type: 'user_generated' as const
      }
    ];
    
    // Validate all questions exist
    const allValid = questions.every(q => q.scenario_prompt && q.scenario_prompt.trim() !== '');
    if (!allValid) {
      return { success: false, error: 'All 3 personal questions must be completed in PVQ survey' };
    }
    
    return { success: true, data: questions };
    
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error fetching user questions' 
    };
  }
}

/**
 * Initialize or get Stage 2 experiment status
 */
export async function getStage2Status(userId: string): Promise<{ success: boolean; data?: Stage2ExperimentStatus; error?: string }> {
  try {
    const supabase = createClient();
    
    // Get user questions first
    const userQuestionsResult = await getUserQuestions(userId);
    if (!userQuestionsResult.success) {
      return { success: false, error: userQuestionsResult.error };
    }
    
    // Combine WVS and user scenarios
    const allScenarios = [...WVS_SCENARIOS, ...userQuestionsResult.data!];
    
    // Get existing rounds from database
    const { data: existingRounds, error } = await supabase
      .from('stage2_experiment')
      .select('*')
      .eq('user_id', userId)
      .order('round_number');
    
    if (error) {
      console.error('[Stage2 Service] Error fetching rounds:', error);
      return { success: false, error: `Database error: ${error.message}` };
    }
    
    // Create missing rounds
    const existingRoundNumbers = new Set(existingRounds?.map(r => r.round_number) || []);
    const missingRounds = allScenarios.filter(scenario => !existingRoundNumbers.has(scenario.round_number));
    
    if (missingRounds.length > 0) {
      const { error: insertError } = await supabase
        .from('stage2_experiment')
        .insert(
          missingRounds.map(scenario => ({
            user_id: userId,
            round_number: scenario.round_number,
            scenario_name: scenario.scenario_name,
            scenario_prompt: scenario.scenario_prompt,
            scenario_type: scenario.scenario_type
          }))
        );
      
      if (insertError) {
        console.error('[Stage2 Service] Error creating missing rounds:', insertError);
        return { success: false, error: `Failed to initialize rounds: ${insertError.message}` };
      }
      
      // Refetch all rounds
      const { data: allRounds, error: refetchError } = await supabase
        .from('stage2_experiment')
        .select('*')
        .eq('user_id', userId)
        .order('round_number');
      
      if (refetchError) {
        return { success: false, error: `Failed to refetch rounds: ${refetchError.message}` };
      }
      
      const rounds = allRounds as Stage2Round[];
      
      return {
        success: true,
        data: calculateStatus(rounds)
      };
    }
    
    const rounds = existingRounds as Stage2Round[];
    return {
      success: true,
      data: calculateStatus(rounds)
    };
    
  } catch (error) {
    console.error('[Stage2 Service] Error in getStage2Status:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Calculate experiment status from rounds
 */
function calculateStatus(rounds: Stage2Round[]): Stage2ExperimentStatus {
  console.log('[Stage2 Service] Calculating status for rounds:', rounds.length);
  
  // Check if all responses are generated
  const hasGeneratedResponses = rounds.every(round => 
    round.user_embodiment_response && 
    round.anti_user_response && 
    round.schwartz_values_response && 
    round.random_schwartz_response
  );
  
  console.log('[Stage2 Service] Has generated responses:', hasGeneratedResponses);
  
  // Find the first round that doesn't have all ratings (null means unrated)
  const nextUnratedRound = rounds.find(round => {
    const hasAllRatings = (
      round.user_embodiment_rating !== null && round.user_embodiment_rating !== undefined &&
      round.anti_user_rating !== null && round.anti_user_rating !== undefined &&
      round.schwartz_values_rating !== null && round.schwartz_values_rating !== undefined &&
      round.random_schwartz_rating !== null && round.random_schwartz_rating !== undefined
    );
    
    console.log(`[Stage2 Service] Round ${round.round_number} ratings:`, {
      user_embodiment_rating: round.user_embodiment_rating,
      anti_user_rating: round.anti_user_rating,
      schwartz_values_rating: round.schwartz_values_rating,
      random_schwartz_rating: round.random_schwartz_rating,
      hasAllRatings
    });
    
    return !hasAllRatings;
  })?.round_number || null;
  
  const isComplete = nextUnratedRound === null && hasGeneratedResponses;
  const currentRound = nextUnratedRound || 1;
  
  console.log('[Stage2 Service] Status calculation result:', {
    nextUnratedRound,
    isComplete,
    currentRound,
    hasGeneratedResponses
  });
  
  return {
    rounds,
    currentRound,
    isComplete,
    hasGeneratedResponses,
    nextUnratedRound
  };
}

/**
 * Generate all persona responses for all 5 rounds
 * @param userId - User ID
 * @param userApiKey - Optional user-provided Gemini API key
 */
export async function generateAllPersonaResponses(
  userId: string,
  userApiKey?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('[Stage2 Service] Starting persona response generation for user:', userId);
    
    // Get current status
    const statusResult = await getStage2Status(userId);
    if (!statusResult.success) {
      return { success: false, error: statusResult.error };
    }
    
    const status = statusResult.data!;
    
    // Get user's chat history and PVQ data for persona generation
    const supabase = createClient();
    
    const [chatResult, pvqResult] = await Promise.all([
      supabase.from('chatlog').select('*').eq('user_id', userId).order('timestamp', { ascending: true }),
      supabase.from('user_pvq_responses').select('*').eq('user_id', userId).single()
    ]);
    
    if (chatResult.error) {
      return { success: false, error: `Failed to load chat history: ${chatResult.error.message}` };
    }
    
    if (pvqResult.error || !pvqResult.data) {
      return { success: false, error: 'PVQ survey data not found' };
    }
    
    // Process user's PVQ scores for Schwartz Values persona
    const rawAnswers: Record<number, number> = {};
    for (let i = 1; i <= 57; i++) {
      if (pvqResult.data[`q${i}`]) {
        rawAnswers[i] = pvqResult.data[`q${i}`];
      }
    }
    const userValueResults = processValueResults(rawAnswers);
    
    // Generate responses for each round
    const updates = [];
    
    for (const round of status.rounds) {
      console.log(`[Stage2 Service] Generating responses for round ${round.round_number}: ${round.scenario_name}`);
      
      try {
        // Generate all 4 persona responses
        const responses = await generatePersonaResponsesForScenario(
          userId,
          round.scenario_prompt,
          chatResult.data,
          userValueResults,
          userApiKey
        );
        
        updates.push({
          id: round.id,
          user_embodiment_response: responses.user_embodiment.response,
          user_embodiment_reasoning: responses.user_embodiment.reasoning,
          anti_user_response: responses.anti_user.response,
          anti_user_reasoning: responses.anti_user.reasoning,
          schwartz_values_response: responses.schwartz_values.response,
          schwartz_values_reasoning: responses.schwartz_values.reasoning,
          random_schwartz_response: responses.random_schwartz.response,
          random_schwartz_reasoning: responses.random_schwartz.reasoning,
          responses_generated_at: new Date().toISOString()
        });
        
      } catch (error) {
        console.error(`[Stage2 Service] Error generating responses for round ${round.round_number}:`, error);
        return { 
          success: false, 
          error: `Failed to generate responses for round ${round.round_number}: ${error instanceof Error ? error.message : 'Unknown error'}` 
        };
      }
    }
    
    // Update all rounds in database
    for (const update of updates) {
      const { error: updateError } = await supabase
        .from('stage2_experiment')
        .update(update)
        .eq('id', update.id);
      
      if (updateError) {
        console.error('[Stage2 Service] Error updating round:', updateError);
        return { success: false, error: `Failed to save responses: ${updateError.message}` };
      }
    }
    
    console.log('[Stage2 Service] Successfully generated all persona responses');
    return { success: true };
    
  } catch (error) {
    console.error('[Stage2 Service] Error in generateAllPersonaResponses:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error generating responses' 
    };
  }
}

/**
 * Generate persona responses for a single scenario using 4 separate API calls
 * @param userId - User ID
 * @param scenarioPrompt - The scenario prompt
 * @param chatHistory - User's chat history
 * @param userValueResults - User's processed value results
 * @param userApiKey - Optional user-provided Gemini API key
 */
async function generatePersonaResponsesForScenario(
  userId: string,
  scenarioPrompt: string,
  chatHistory: any[],
  userValueResults: any[],
  userApiKey?: string
) {
  const formattedChatHistory = formatConversation(chatHistory);
  
  // Generate random Schwartz values for control persona
  const randomValues = userValueResults.map(v => ({
    ...v,
    centeredScore: (Math.random() - 0.5) * 4 // Random score between -2 and 2
  }));


  // Define the JSON response schema (same for all personas)
  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      response: { type: Type.STRING },
      reasoning: { type: Type.STRING }
    },
    required: ["response", "reasoning"]
  };

  const personaPreamble = `You are having a casual chat. Your tone should be informal and natural. Respond to the following question from your assigned persona's perspective in a short, conversational paragraph.`;

  const responses: Record<string, { response: string; reasoning: string }> = {};

  // 1. USER EMBODIMENT PERSONA
  try {
    const userEmbodimentPrompt = `${personaPreamble}

**Your Persona:** Embody the user based on their chat history. Adopt their vibe, tone, and reasoning style. Avoid mentioning specific personal details from their history; instead, capture their overall personality. Try your best to predict what they would say in this scenario by thinking about their values from their chat history. Feel free to glean and infer implicit values from their chat history if not explicitly stated.

**Chat History:**
${formattedChatHistory}

**Scenario:** ${scenarioPrompt}

**Your Response (as the user):**`;

    console.log('=== USER EMBODIMENT PROMPT START ===');
    console.log('PROMPT HEADER:', 'You are embodying a person based on their chat history. Respond to this scenario as if you are them.');
    console.log('CHAT HISTORY LENGTH:', formattedChatHistory.length, 'characters');
    console.log('CHAT HISTORY:');
    console.log(formattedChatHistory);
    console.log('SCENARIO:', scenarioPrompt);
    console.log('INSTRUCTIONS: Respond with exactly 3 sentences in first person as this person...');
    console.log('=== USER EMBODIMENT PROMPT END ===');

    const thinkingParams1: ThinkingLogParams = {
      userId,
      serviceName: 'stage2-service',
      operationName: 'generatePersona_user_embodiment',
      modelName: MODEL_NAME,
      thinkingBudget: 10000,
      promptExcerpt: userEmbodimentPrompt.substring(0, 500),
      userApiKey
    };

    const result1 = await callGeminiWithThinking(
      null,
      {
        model: MODEL_NAME,
        contents: userEmbodimentPrompt,
        config: {
          responseMimeType: "application/json",
          responseSchema,
          thinkingConfig: {
            thinkingBudget: 10000,
          }
        }
      },
      thinkingParams1
    );

    const parsed1 = JSON.parse(result1.text || '{}');
    responses['user_embodiment'] = {
      response: parsed1.response || 'Failed to generate response',
      reasoning: parsed1.reasoning || 'Failed to generate reasoning'
    };
  } catch (error) {
    console.error('[Stage2 Service] Error generating user_embodiment response:', error);
    responses['user_embodiment'] = {
      response: 'Error generating response',
      reasoning: 'Generation failed'
    };
  }

  // 2. ANTI-USER PERSONA
  try {
    const antiUserPrompt = `${personaPreamble}

**Your Persona:** Be the opposite of the user based on their chat history. Adopt a personality and tone that contrasts with their apparent values. If they seem energetic, be calm. If they are casual, be more formal (but still conversational).

**Chat History:**
${formattedChatHistory}

**Scenario:** ${scenarioPrompt}

**Your Response (as the anti-user):**`;

    console.log('=== ANTI-USER PROMPT START ===');
    console.log('PROMPT HEADER:', 'You are the opposite of a person based on their chat history...');
    console.log('CHAT HISTORY LENGTH:', formattedChatHistory.length, 'characters');
    console.log('CHAT HISTORY:');
    console.log(formattedChatHistory);
    console.log('SCENARIO:', scenarioPrompt);
    console.log('INSTRUCTIONS: Respond with exactly 3 sentences that oppose the person\'s likely position...');
    console.log('=== ANTI-USER PROMPT END ===');

    const thinkingParams2: ThinkingLogParams = {
      userId,
      serviceName: 'stage2-service',
      operationName: 'generatePersona_anti_user',
      modelName: MODEL_NAME,
      thinkingBudget: 10000,
      promptExcerpt: antiUserPrompt.substring(0, 500),
      userApiKey
    };

    const result2 = await callGeminiWithThinking(
      null,
      {
        model: MODEL_NAME,
        contents: antiUserPrompt,
        config: {
          responseMimeType: "application/json",
          responseSchema,
          thinkingConfig: {
            thinkingBudget: 10000,
          }
        }
      },
      thinkingParams2
    );

    const parsed2 = JSON.parse(result2.text || '{}');
    responses['anti_user'] = {
      response: parsed2.response || 'Failed to generate response',
      reasoning: parsed2.reasoning || 'Failed to generate reasoning'
    };
  } catch (error) {
    console.error('[Stage2 Service] Error generating anti_user response:', error);
    responses['anti_user'] = {
      response: 'Error generating response',
      reasoning: 'Generation failed'
    };
  }

  // 3. SCHWARTZ VALUES PERSONA
  try {
    const schwartzPrompt = `${personaPreamble}

**Your Persona:** Your personality is driven by these core Schwartz values (higher scores are more important). Internalize them and speak from that authentic point of view.

**Your Core Values:**
${userValueResults.map(v => `${v.name}: ${v.centeredScore.toFixed(2)}`).join(', ')}

**Scenario:** ${scenarioPrompt}

**Your Response (as the value-driven persona):**`;

    console.log('=== SCHWARTZ VALUES PROMPT START ===');
    console.log('PROMPT HEADER:', 'You are embodying someone with these specific Schwartz values...');
    userValueResults.forEach(v => console.log(`  ${v.name}: ${v.centeredScore.toFixed(2)}`));
    console.log('SCENARIO:', scenarioPrompt);
    console.log('INSTRUCTIONS: Respond with exactly 3 sentences based on these values...');
    console.log('=== SCHWARTZ VALUES PROMPT END ===');

    const thinkingParams3: ThinkingLogParams = {
      userId,
      serviceName: 'stage2-service',
      operationName: 'generatePersona_schwartz_values',
      modelName: MODEL_NAME,
      thinkingBudget: 10000,
      promptExcerpt: schwartzPrompt.substring(0, 500),
      userApiKey
    };

    const result3 = await callGeminiWithThinking(
      null,
      {
        model: MODEL_NAME,
        contents: schwartzPrompt,
        config: {
          responseMimeType: "application/json",
          responseSchema,
          thinkingConfig: {
            thinkingBudget: 10000,
          }
        }
      },
      thinkingParams3
    );

    const parsed3 = JSON.parse(result3.text || '{}');
    responses['schwartz_values'] = {
      response: parsed3.response || 'Failed to generate response',
      reasoning: parsed3.reasoning || 'Failed to generate reasoning'
    };
  } catch (error) {
    console.error('[Stage2 Service] Error generating schwartz_values response:', error);
    responses['schwartz_values'] = {
      response: 'Error generating response',
      reasoning: 'Generation failed'
    };
  }

  // 4. RANDOM SCHWARTZ VALUES PERSONA
  try {
    const randomSchwartzPrompt = `${personaPreamble}

**Your Persona:** Your personality is driven by this random set of core Schwartz values (higher scores are more important). Internalize them and speak from that authentic point of view.

**Your Core Values:**
${randomValues.map(v => `${v.name}: ${v.centeredScore.toFixed(2)}`).join(', ')}

**Scenario:** ${scenarioPrompt}

**Your Response (as the value-driven persona):**`;

    console.log('=== RANDOM SCHWARTZ PROMPT START ===');
    console.log('PROMPT HEADER:', 'You are embodying someone with these random Schwartz values...');
    randomValues.forEach(v => console.log(`  ${v.name}: ${v.centeredScore.toFixed(2)}`));
    console.log('SCENARIO:', scenarioPrompt);
    console.log('INSTRUCTIONS: Respond with exactly 3 sentences based on these values...');
    console.log('=== RANDOM SCHWARTZ PROMPT END ===');

    const thinkingParams4: ThinkingLogParams = {
      userId,
      serviceName: 'stage2-service',
      operationName: 'generatePersona_random_schwartz',
      modelName: MODEL_NAME,
      thinkingBudget: 10000,
      promptExcerpt: randomSchwartzPrompt.substring(0, 500),
      userApiKey
    };

    const result4 = await callGeminiWithThinking(
      null,
      {
        model: MODEL_NAME,
        contents: randomSchwartzPrompt,
        config: {
          responseMimeType: "application/json",
          responseSchema,
          thinkingConfig: {
            thinkingBudget: 10000,
          }
        }
      },
      thinkingParams4
    );

    const parsed4 = JSON.parse(result4.text || '{}');
    responses['random_schwartz'] = {
      response: parsed4.response || 'Failed to generate response',
      reasoning: parsed4.reasoning || 'Failed to generate reasoning'
    };
  } catch (error) {
    console.error('[Stage2 Service] Error generating random_schwartz response:', error);
    responses['random_schwartz'] = {
      response: 'Error generating response',
      reasoning: 'Generation failed'
    };
  }

  return responses;
}

/**
 * Save user ratings for a round
 */
export async function saveRoundRatings(
  userId: string, 
  roundNumber: number, 
  ratings: {
    user_embodiment_rating: number;
    anti_user_rating: number;
    schwartz_values_rating: number;
    random_schwartz_rating: number;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createClient();
    
    const { error } = await supabase
      .from('stage2_experiment')
      .update({
        ...ratings,
        user_selection_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('round_number', roundNumber);
    
    if (error) {
      console.error('[Stage2 Service] Error saving ratings:', error);
      return { success: false, error: `Failed to save ratings: ${error.message}` };
    }
    
    return { success: true };
    
  } catch (error) {
    console.error('[Stage2 Service] Error in saveRoundRatings:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error saving ratings' 
    };
  }
}

/**
 * Reset entire experiment (delete all rounds and responses)
 */
export async function resetStage2Experiment(userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createClient();
    
    const { error } = await supabase
      .from('stage2_experiment')
      .delete()
      .eq('user_id', userId);
    
    if (error) {
      console.error('[Stage2 Service] Error resetting experiment:', error);
      return { success: false, error: `Failed to reset experiment: ${error.message}` };
    }
    
    console.log('[Stage2 Service] Successfully reset Stage 2 experiment for user:', userId);
    return { success: true };
    
  } catch (error) {
    console.error('[Stage2 Service] Error in resetStage2Experiment:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error resetting experiment' 
    };
  }
} 