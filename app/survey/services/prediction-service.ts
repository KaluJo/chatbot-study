import { Type } from "@google/genai";
import { formatConversation } from '@/app/utils/chat-formatting';
import { ProcessedValueResult, VALUE_DATA } from '@/components/survey/value-utils';
import { createClient } from '@/utils/supabase/client';
import { callGeminiWithThinking, ThinkingLogParams } from '@/app/utils/thinking-logger';
import { GEMINI_PRO } from '@/app/config/models';

// Constants
const MODEL_NAME = GEMINI_PRO;

// Interfaces for batch prediction results
export interface BatchValuePrediction {
  value_code: string;
  predicted_mean_inverted_score: number;
  reasoning: string;
}

/**
 * Predict Schwartz values (PVQ-RR) for a user based on their chat history
 * 
 * @param userId The user ID to fetch chat data for
 * @param forceRegenerate Whether to regenerate even if cached results exist
 * @param userApiKey Optional user-provided Gemini API key
 * @returns Object with processed results and reasoning
 */
export async function predictBatchValuesFromUserChats(
  userId: string,
  forceRegenerate: boolean = false,
  userApiKey?: string
): Promise<{
  success: boolean;
  data?: {
    processedResults: ProcessedValueResult[];
    reasoning: BatchValuePrediction[];
  };
  error?: string;
}> {
  try {
    // 0. Check if we already have cached results (unless forcing regeneration)
    if (!forceRegenerate) {
      const supabase = createClient();
      const { data: existingData, error: fetchError } = await supabase
        .from('user_llm_batch_responses')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (existingData && !fetchError) {
        console.log('[Batch Prediction] Found existing batch predictions, returning cached results');
        
        // Convert database format to ProcessedValueResult format
        const processedResults: ProcessedValueResult[] = [];
        const reasoning: BatchValuePrediction[] = [];
        
        // Map each value from database to ProcessedValueResult
        const valueMapping = {
          'SDT': 'sdt_score', 'SDA': 'sda_score', 'ST': 'st_score', 'HE': 'he_score',
          'AC': 'ac_score', 'POD': 'pod_score', 'POR': 'por_score', 'FAC': 'fac_score',
          'SEP': 'sep_score', 'SES': 'ses_score', 'TR': 'tr_score', 'COR': 'cor_score',
          'COI': 'coi_score', 'HUM': 'hum_score', 'UNN': 'unn_score', 'UNC': 'unc_score',
          'UNT': 'unt_score', 'BEC': 'bec_score', 'BED': 'bed_score'
        };
        
        for (const [valueCode, dbField] of Object.entries(valueMapping)) {
          const score = existingData[dbField];
          const valueData = VALUE_DATA[valueCode as keyof typeof VALUE_DATA];
          
          if (score !== null && valueData) {
            // Calculate rawValueInverted (reverse the centering process)
            const approximateMRAT = existingData.prompt_metadata?.mrat || 3.5;
            const rawValueInverted = score + approximateMRAT;
            
            processedResults.push({
              value: valueCode,
              name: valueData.name,
              color: valueData.color,
              description: valueData.description,
              angle: valueData.angle,
              rawValueInverted: rawValueInverted,
              centeredScore: score
            });
            
            // Get reasoning from stored data
            const storedReasoning = existingData.raw_reasoning?.[valueCode] || `Predicted score: ${score}`;
            reasoning.push({
              value_code: valueCode,
              predicted_mean_inverted_score: rawValueInverted,
              reasoning: storedReasoning
            });
          }
        }
        
        if (processedResults.length > 0) {
          return {
            success: true,
            data: {
              processedResults,
              reasoning
            }
          };
        }
      }
    } else {
      console.log('[Batch Prediction] Force regeneration requested - will generate new predictions');
    }

    // 1. Fetch user's chat history
    const chatData = await fetchUserChatData(userId);
    
    if (!chatData || chatData.length === 0) {
      return { 
        success: false, 
        error: 'No chat data found for this user. Cannot generate predictions.' 
      };
    }
    
    // 2. Format the conversation for analysis
    const conversationText = formatConversation(chatData, 'gemini-analysis');
    console.log(`[Value Prediction] Analyzing conversation with ${chatData.length} exchanges`);
    
    // 3. Call Gemini API with the formatted conversation
    const batchPredictions = await generateBatchPredictions(conversationText, userId, userApiKey);
    
    if (!batchPredictions.success || !batchPredictions.predictions) {
      return { 
        success: false, 
        error: batchPredictions.error || 'Failed to generate batch predictions' 
      };
    }
    
    // 4. Convert the predictions to the format needed for visualization
    const processedResults = convertPredictionsToProcessedResults(batchPredictions.predictions);
    
    // 5. Save to database for future use
    console.log('[Batch Prediction] Saving batch predictions to database...');
    try {
      const supabase = createClient();
      
      // Calculate MRAT for metadata
      const sumOfScores = batchPredictions.predictions.reduce((sum, pred) => sum + pred.predicted_mean_inverted_score, 0);
      const mrat = sumOfScores / batchPredictions.predictions.length;
      
      const dbData: any = {
        user_id: userId,
        raw_reasoning: {},
        model_name: MODEL_NAME,
        prompt_metadata: {
          chat_messages_count: chatData.length,
          generation_timestamp: new Date().toISOString(),
          approach: 'batch_values',
          mrat: mrat
        }
      };

      // Map predictions to database fields and store reasoning
      const valueMapping = {
        'SDT': 'sdt_score', 'SDA': 'sda_score', 'ST': 'st_score', 'HE': 'he_score',
        'AC': 'ac_score', 'POD': 'pod_score', 'POR': 'por_score', 'FAC': 'fac_score',
        'SEP': 'sep_score', 'SES': 'ses_score', 'TR': 'tr_score', 'COR': 'cor_score',
        'COI': 'coi_score', 'HUM': 'hum_score', 'UNN': 'unn_score', 'UNC': 'unc_score',
        'UNT': 'unt_score', 'BEC': 'bec_score', 'BED': 'bed_score'
      };

      batchPredictions.predictions.forEach(prediction => {
        const dbField = valueMapping[prediction.value_code as keyof typeof valueMapping];
        if (dbField) {
          // Store centered score (raw score - MRAT)
          dbData[dbField] = prediction.predicted_mean_inverted_score - mrat;
          // Store reasoning
          dbData.raw_reasoning[prediction.value_code] = prediction.reasoning;
        }
      });

      const { error: saveError } = await supabase
        .from('user_llm_batch_responses')
        .upsert(dbData, { onConflict: 'user_id' });

      if (saveError) {
        console.warn('[Batch Prediction] Failed to save to database:', saveError.message);
      } else {
        console.log('[Batch Prediction] Successfully saved batch predictions to database');
      }
    } catch (saveError) {
      console.warn('[Batch Prediction] Error saving to database:', saveError);
    }
    
    return {
      success: true,
      data: {
        processedResults,
        reasoning: batchPredictions.predictions
      }
    };
    
  } catch (error) {
    console.error('[Value Prediction] Error predicting values:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}

/**
 * Fetch a user's chat data from the database
 */
async function fetchUserChatData(userId: string): Promise<
  Array<{llm_message?: string; human_message?: string; question?: string; answer?: string; timestamp?: string}>
> {
  try {
    const supabase = createClient();
    
    // First try to get data from chatlog table (same as individual service)
    const { data: chatlogData, error: chatlogError } = await supabase
      .from('chatlog')
      .select('llm_message, human_message, timestamp')
      .eq('user_id', userId)
      .order('timestamp', { ascending: true });
    
    if (!chatlogError && chatlogData && chatlogData.length > 0) {
      console.log(`[Batch Prediction] Found ${chatlogData.length} chat messages in chatlog table`);
      return chatlogData;
    }
    
    // Fallback to chat_windows table if chatlog is empty
    console.log('[Batch Prediction] No data in chatlog table, trying chat_windows...');
    const { data: windows, error: windowsError } = await supabase
      .from('chat_windows')
      .select('id, created_at, chat_data')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5); // Get the 5 most recent chat windows
    
    if (windowsError) {
      console.error('[Value Prediction] Error fetching chat windows:', windowsError);
      throw new Error('Failed to fetch chat windows');
    }
    
    if (!windows || windows.length === 0) {
      console.log('[Batch Prediction] No chat data found in either chatlog or chat_windows tables');
      return [];
    }
    
    // Combine chat data from all windows, with newest first
    const allChatData: Array<{llm_message?: string; human_message?: string; timestamp?: string}> = [];
    
    for (const window of windows) {
      if (window.chat_data && Array.isArray(window.chat_data)) {
        allChatData.push(...window.chat_data);
      }
    }
    
    // Sort by timestamp if available
    const sortedData = allChatData.sort((a, b) => {
      if (a.timestamp && b.timestamp) {
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      }
      return 0;
    });
    
    console.log(`[Batch Prediction] Found ${sortedData.length} chat messages in chat_windows table`);
    return sortedData;
    
  } catch (error) {
    console.error('[Value Prediction] Error fetching user chat data:', error);
    return [];
  }
}

/**
 * Call Gemini API to generate batch predictions for all 19 values
 * @param conversationText - Formatted conversation text
 * @param userId - User ID for logging
 * @param userApiKey - Optional user-provided Gemini API key
 */
async function generateBatchPredictions(
  conversationText: string,
  userId?: string,
  userApiKey?: string
): Promise<{
  success: boolean;
  predictions?: BatchValuePrediction[];
  error?: string;
}> {
  try {
    
    const prompt = `You are an expert in Schwartz's theory of basic human values and psychological assessment. Your task is to analyze a user's conversation history to create a multi-dimensional persona. Go beyond the literal text to infer their implicit values, hidden desires, and the emotional sentiment behind their words. The user has a life beyond this chatlog; use the history as clues to their broader personality.

For example, if a user talks about saving money but their tone seems regretful, they might value security but also desire hedonism or stimulation. Your reasoning should capture this complexity.

CONVERSATION:
${conversationText}

TASK:
Based on your deep analysis of this conversation, predict how important each of the 19 Schwartz values would be to this person.

For each of the 19 values listed below:
1.  **Score (1-6):** Assign a predicted mean inverted score from 1 (not important) to 6 (very important).
2.  **Reasoning:** Provide a brief, insightful reasoning for each prediction. Connect your reasoning to specific evidence from the conversation, including direct quotes, tone, sentiment, or implicit attitudes.

THE 19 SCHWARTZ VALUES:
-   **Benevolence-Dependability (BED):** Being a reliable and trustworthy member of the in-group.
-   **Benevolence-Caring (BEC):** Devotion to the welfare of in-group members.
-   **Universalism-Tolerance (UNT):** Acceptance and understanding of those different from oneself.
-   **Universalism-Concern (UNC):** Commitment to equality, justice, and protection for all people.
-   **Universalism-Nature (UNN):** Preservation of the natural environment.
-   **Humility (HUM):** Recognizing one's insignificance in the larger scheme of things.
-   **Conformity-Interpersonal (COI):** Avoidance of upsetting or harming other people.
-   **Conformity-Rules (COR):** Compliance with rules, laws, and formal obligations.
-   **Tradition (TR):** Maintaining and preserving cultural, family, or religious traditions.
-   **Security-Societal (SES):** Safety and stability in the wider society.
-   **Security-Personal (SEP):** Safety in one's immediate environment.
-   **Face (FAC):** Security and power through maintaining one's public image.
-   **Power-Resources (POR):** Power through control of material and social resources.
-   **Power-Dominance (POD):** Power through exercising control over people.
-   **Achievement (AC):** Personal success through demonstrating competence.
-   **Hedonism (HE):** Pleasure and sensuous gratification for oneself.
-   **Stimulation (ST):** Excitement, novelty, and challenge in life.
-   **Self-Direction-Action (SDA):** The freedom to determine one's own actions.
-   **Self-Direction-Thought (SDT):** The freedom to cultivate one's own ideas and abilities.

GUIDELINES FOR ANALYSIS:
-   **Think Deeper:** Don't just analyze the surface-level text. What is the subtext? What are the underlying emotions or conflicts?
-   **Holistic View:** Synthesize all available information to form a coherent psychological profile.
-   **Cite Evidence:** Your reasoning must be backed by specific examples or patterns from the text.

IMPORTANT: Provide a score and reasoning for ALL 19 values, even if evidence is limited. Use your expertise to make informed predictions.`;

    const thinkingParams: ThinkingLogParams = {
      userId,
      serviceName: 'prediction-service',
      operationName: 'generateBatchPredictions',
      modelName: MODEL_NAME,
      thinkingBudget: 10000,
      promptExcerpt: prompt.substring(0, 500),
      userApiKey
    };

    const response = await callGeminiWithThinking(
      null,
      {
        model: MODEL_NAME,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                value_code: { type: Type.STRING },
                predicted_mean_inverted_score: { type: Type.NUMBER },
                reasoning: { type: Type.STRING }
              },
              required: ["value_code", "predicted_mean_inverted_score", "reasoning"]
            }
          },
          thinkingConfig: {
            thinkingBudget: 10000,
          }
        }
      },
      thinkingParams
    );

    const responseText = response.text;
    if (!responseText) {
      console.error('[Value Prediction] Empty response from AI');
      return { success: false, error: 'Empty response from AI' };
    }

    try {
      const predictions = JSON.parse(responseText) as BatchValuePrediction[];
      
      // Clean and validate predictions
      const validatedPredictions = predictions.map(prediction => ({
        value_code: prediction.value_code,
        predicted_mean_inverted_score: Math.min(6, Math.max(1, prediction.predicted_mean_inverted_score)), // Ensure 1-6 range
        reasoning: prediction.reasoning || "No specific reasoning provided."
      }));
      
      return { success: true, predictions: validatedPredictions };
    } catch (parseError) {
      console.error('[Value Prediction] Error parsing AI response:', parseError);
      return { success: false, error: 'Failed to parse AI response' };
    }
  } catch (error) {
    console.error('[Value Prediction] Error generating batch predictions:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Convert batch predictions to ProcessedValueResult format for visualization
 */
function convertPredictionsToProcessedResults(
  predictions: BatchValuePrediction[]
): ProcessedValueResult[] {
  // We need to transform the predictions to match the ProcessedValueResult format
  // This requires calculating centered scores from the raw inverted scores
  
  // Step 1: Calculate MRAT (Mean Rating Across all 57 items)
  // Since we only have scores for 19 values (not 57 individual items),
  // we'll use the average of these 19 values as an approximation of MRAT
  const sumOfScores = predictions.reduce((sum, pred) => sum + pred.predicted_mean_inverted_score, 0);
  const approximateMrat = sumOfScores / predictions.length;
  
  // Step 2: Create ProcessedValueResult objects
  return predictions.map(prediction => {
    const valueData = VALUE_DATA[prediction.value_code as keyof typeof VALUE_DATA];
    
    if (!valueData) {
      console.warn(`[Value Prediction] No value data found for code: ${prediction.value_code}`);
    }
    
    return {
      value: prediction.value_code,
      name: valueData?.name || `Unknown Value: ${prediction.value_code}`,
      color: valueData?.color || '#cccccc',
      description: valueData?.description || 'No description available',
      angle: valueData?.angle,
      rawValueInverted: prediction.predicted_mean_inverted_score,
      centeredScore: prediction.predicted_mean_inverted_score - approximateMrat
    };
  });
}
