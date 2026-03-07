import { Type } from "@google/genai";
import { formatConversation } from '@/app/utils/chat-formatting';
import { ProcessedValueResult, VALUE_DATA } from '@/components/survey/value-utils';
import { createClient } from '@/utils/supabase/client';
import { callGeminiWithThinking, ThinkingLogParams } from '@/app/utils/thinking-logger';
import { v4 as uuidv4 } from 'uuid';
import { GEMINI_PRO } from '@/app/config/models';

// Constants
const MODEL_NAME = GEMINI_PRO;

// Interfaces for batch prediction results
export interface BatchValuePrediction {
  value_code: string;
  predicted_mean_score: number;
  reasoning: string;
}

// Interface for Stage 2 predictions
export interface Stage2PredictionResult {
  success: boolean;
  data?: {
    firstSession: {
      processedResults: ProcessedValueResult[];
      reasoning: BatchValuePrediction[];
      scope: string;
      sessionCount: number;
      messageCount: number;
    };
    midpointSessions: {
      processedResults: ProcessedValueResult[];
      reasoning: BatchValuePrediction[];
      scope: string;
      sessionCount: number;
      messageCount: number;
    };
    fullHistory: {
      processedResults: ProcessedValueResult[];
      reasoning: BatchValuePrediction[];
      scope: string;
      sessionCount: number;
      messageCount: number;
    };
  };
  error?: string;
}

/**
 * Predict Schwartz values (PVQ-RR) for a user based on their chat history
 * 
 * @param userId The user ID to fetch chat data for
 * @param forceRegenerate Whether to regenerate even if cached results exist
 * @returns Object with processed results and reasoning
 */
export async function predictBatchValuesFromUserChats(
  userId: string,
  forceRegenerate: boolean = false,
  logger?: (message: string, type?: 'info' | 'error' | 'warning') => void
): Promise<{ success: boolean; data?: { processedResults: ProcessedValueResult[]; reasoning: BatchValuePrediction[] }; error?: string }> {
  const log = (message: string, type: 'info' | 'error' | 'warning' = 'info') => {
    if (logger) { logger(message, type); }
    if (type === 'error') console.error(`[Batch PVQ Prediction] ${message}`);
    else if (type === 'warning') console.warn(`[Batch PVQ Prediction] ${message}`);
    else console.log(`[Batch PVQ Prediction] ${message}`);
  };

  log(`Starting batch PVQ prediction for user ${userId} (forceRegenerate: ${forceRegenerate})`);

  try {
    // Initialize supabase client
    const supabase = createClient();
    
    // Check if we already have cached results (unless forcing regeneration)
    if (!forceRegenerate) {
      const { data: existingData, error: fetchError } = await supabase
        .from('user_llm_batch_responses')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (existingData && !fetchError) {
        log(`Found existing batch PVQ predictions for user ${userId}, returning cached results`);
        
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
            // centeredScore = rawValueInverted - MRAT
            // For this we'll approximate MRAT as 3.5 (middle of 1-6 scale inverted)
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
              predicted_mean_score: rawValueInverted,
              reasoning: storedReasoning
            });
          }
        }
        
        return {
          success: true,
          data: {
            processedResults,
            reasoning
          }
        };
      }
    } else {
      log(`Force regeneration requested - will generate new predictions even if existing data found`);
    }

    // Fetch user's chat data
    log('Fetching user chat data...');
    const { data: chatData, error: chatError } = await supabase
      .from('chatlog')
      .select('llm_message, human_message, timestamp')
      .eq('user_id', userId)
      .order('timestamp', { ascending: true });

    if (chatError) {
      throw new Error(`Failed to fetch chat data: ${chatError.message}`);
    }

    if (!chatData || chatData.length === 0) {
      throw new Error('No chat data found for this user');
    }

    log(`Found ${chatData.length} chat messages to analyze`);

    // Format the chat history
    const conversationHistory = formatConversation(chatData, 'ai-human');
    log(`Formatted conversation history (${conversationHistory.length} characters)`);

    // Initialize AI client

    // Create the comprehensive prompt for batch prediction
    const prompt = `You are an expert psychologist analyzing human values based on conversation data. Based on the following conversation history, predict how this person would score on the Schwartz PVQ-RR (Portrait Values Questionnaire - Revised) for each of the 19 basic human values.

CONVERSATION HISTORY:
${conversationHistory}

The PVQ-RR uses a scale where:
- 6 = Very much like the person
- 1 = Not like the person at all

Your task is to predict the MEAN SCORE for each value on this scale:
- 6 = Very important to the person
- 1 = Not important at all to the person

You MUST provide predictions for ALL 19 Schwartz values using EXACTLY these value codes:

1. SDT - Self-Direction Thought: Freedom to cultivate one's own ideas and abilities
2. SDA - Self-Direction Action: Freedom to determine one's own actions  
3. ST - Stimulation: Excitement, novelty, and challenge in life
4. HE - Hedonism: Pleasure and sensuous gratification for oneself
5. AC - Achievement: Personal success according to social standards
6. POD - Power Dominance: Power through exercising control over people
7. POR - Power Resources: Power through control of material and social resources
8. FAC - Face: Security and power through maintaining one's public image
9. SEP - Security Personal: Safety in one's immediate environment
10. SES - Security Societal: Safety and stability in the wider society
11. TR - Tradition: Maintaining and preserving cultural, family, or religious traditions
12. COR - Conformity Rules: Compliance with rules, laws, and formal obligations
13. COI - Conformity Interpersonal: Avoidance of upsetting or harming other people
14. HUM - Humility: Recognizing one's insignificance in the larger scheme of things
15. UNN - Universalism Nature: Preservation of the natural environment
16. UNC - Universalism Concern: Commitment to equality, justice, and protection for all people
17. UNT - Universalism Tolerance: Acceptance and understanding of those different from oneself
18. BEC - Benevolence Care: Devotion to the welfare of ingroup members
19. BED - Benevolence Dependability: Being a reliable and trustworthy member of the ingroup

CRITICAL: In your JSON response, use ONLY the exact value codes shown above (SDT, SDA, ST, HE, AC, POD, POR, FAC, SEP, SES, TR, COR, COI, HUM, UNN, UNC, UNT, BEC, BED).

For each value, provide:
1. A predicted mean inverted score (1.0 to 6.0, with decimals)
2. Detailed reasoning based on evidence from the conversation

Be thorough in your analysis and provide specific examples from the conversation to support your predictions.`;

    try {
      // Set up thinking params
      const thinkingParams: ThinkingLogParams = {
        userId,
        serviceName: 'prediction-service',
        operationName: 'predictBatchValuesFromUserChats',
        sessionId: uuidv4(),
        modelName: MODEL_NAME,
        thinkingBudget: 20000,
        promptExcerpt: 'Batch Schwartz values prediction from chat history'
      };

      // Call the AI
      log('Calling Gemini API for batch value prediction...');
      const response = await callGeminiWithThinking(
        null,
        {
          model: MODEL_NAME,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                predictions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      value_code: { 
                        type: Type.STRING,
                        description: "Exact value code from the list: SDT, SDA, ST, HE, AC, POD, POR, FAC, SEP, SES, TR, COR, COI, HUM, UNN, UNC, UNT, BEC, BED"
                      },
                      predicted_mean_score: { 
                        type: Type.NUMBER,
                        description: "Score from 1.0 to 6.0 where 6=very important, 1=not important at all"
                      },
                      reasoning: { 
                        type: Type.STRING,
                        description: "Detailed reasoning for this prediction based on conversation evidence"
                      }
                    },
                    required: ["value_code", "predicted_mean_score", "reasoning"]
                  }
                }
              },
              required: ["predictions"]
            },
            thinkingConfig: {
              thinkingBudget: 20000,
            }
          }
        },
        thinkingParams,
        logger
      );

      const responseText = response.text;
      if (!responseText) {
        throw new Error('Empty response from AI');
      }

      const parsedResponse = JSON.parse(responseText);
      const predictions: BatchValuePrediction[] = parsedResponse.predictions;

      log(`Generated predictions for ${predictions.length} values`);

      // Debug: Log the actual value codes returned by AI
      log(`AI returned value codes: ${predictions.map(p => p.value_code).join(', ')}`);

      // Convert predictions to ProcessedValueResult format
      const processedResults: ProcessedValueResult[] = [];
      
      // Calculate MRAT (Mean Rating Across All Scores) from the predictions
      const allScores = predictions.map(p => p.predicted_mean_score);
      const mrat = allScores.reduce((sum, score) => sum + score, 0) / allScores.length;
      log(`Calculated MRAT: ${mrat.toFixed(3)}`);

      // Process each prediction
      for (const prediction of predictions) {
        const valueData = VALUE_DATA[prediction.value_code as keyof typeof VALUE_DATA];
        
        // Debug: Log each lookup attempt
        log(`Looking up value code "${prediction.value_code}": ${valueData ? 'FOUND' : 'NOT FOUND'}`);
        
        if (valueData) {
          const centeredScore = prediction.predicted_mean_score - mrat;
          
          processedResults.push({
            value: prediction.value_code,
            name: valueData.name,
            color: valueData.color,
            description: valueData.description,
            angle: valueData.angle,
            rawValueInverted: prediction.predicted_mean_score,
            centeredScore: centeredScore
          });
        } else {
          log(`ERROR: No VALUE_DATA found for code "${prediction.value_code}"`, 'error');
        }
      }

      log(`Generated ${processedResults.length} processed value results`);

      // Save to database
      log('Saving batch PVQ predictions to database...');
      const dbData: any = {
        user_id: userId,
        model_name: MODEL_NAME,
        prompt_metadata: {
          chat_messages_count: chatData.length,
          mrat: mrat,
          generation_timestamp: new Date().toISOString()
        },
        raw_reasoning: {}
      };

      // Map predictions to database fields
      const valueMapping = {
        'SDT': 'sdt_score', 'SDA': 'sda_score', 'ST': 'st_score', 'HE': 'he_score',
        'AC': 'ac_score', 'POD': 'pod_score', 'POR': 'por_score', 'FAC': 'fac_score',
        'SEP': 'sep_score', 'SES': 'ses_score', 'TR': 'tr_score', 'COR': 'cor_score',
        'COI': 'coi_score', 'HUM': 'hum_score', 'UNN': 'unn_score', 'UNC': 'unc_score',
        'UNT': 'unt_score', 'BEC': 'bec_score', 'BED': 'bed_score'
      };

      let mappedScoresCount = 0;
      for (const prediction of predictions) {
        const dbField = valueMapping[prediction.value_code as keyof typeof valueMapping];
        if (dbField) {
          // Store centered score in database
          const centeredScore = prediction.predicted_mean_score - mrat;
          dbData[dbField] = centeredScore;
          dbData.raw_reasoning[prediction.value_code] = prediction.reasoning;
          mappedScoresCount++;
          log(`Mapped ${prediction.value_code} -> ${dbField}: ${centeredScore.toFixed(3)}`);
        } else {
          log(`ERROR: No database field mapping for value code "${prediction.value_code}"`, 'error');
        }
      }

      log(`Successfully mapped ${mappedScoresCount} out of ${predictions.length} predictions to database fields`);

      // Debug: Log the complete dbData object (excluding reasoning for brevity)
      log(`Database save object: ${JSON.stringify({...dbData, raw_reasoning: `[${Object.keys(dbData.raw_reasoning).length} reasoning entries]`})}`);

      const { error: saveError } = await supabase
        .from('user_llm_batch_responses')
        .upsert(dbData, { onConflict: 'user_id' });

      if (saveError) {
        log(`Warning: Failed to save to database: ${saveError.message}`, 'warning');
        log(`Save error details: ${JSON.stringify(saveError)}`, 'error');
      } else {
        log('Successfully saved batch PVQ predictions to database');
      }

      return {
        success: true,
        data: {
          processedResults,
          reasoning: predictions
        }
      };

    } catch (apiError) {
      log(`API error: ${apiError instanceof Error ? apiError.message : String(apiError)}`, 'error');
      throw new Error('Failed to generate predictions from AI service');
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    log(`Batch PVQ prediction failed: ${errorMessage}`, 'error');
    return {
      success: false,
      error: errorMessage
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
    
    // Get the latest chat window(s) for this user
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
    return allChatData.sort((a, b) => {
      if (a.timestamp && b.timestamp) {
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      }
      return 0;
    });
    
  } catch (error) {
    console.error('[Value Prediction] Error fetching user chat data:', error);
    return [];
  }
}

/**
 * Call Gemini API to generate batch predictions for all 19 values
 */
async function generateBatchPredictions(
  conversationText: string,
  userId?: string // Added userId parameter
): Promise<{
  success: boolean;
  predictions?: BatchValuePrediction[];
  error?: string;
}> {
  try {
    
    const prompt = `You are an expert in Schwartz's theory of basic human values and psychological assessment.

Analyze this chat conversation and predict how this person would score on the 19 refined Schwartz values from the PVQ-RR (Portrait Values Questionnaire - Revised).

CONVERSATION:
${conversationText}

TASK:
Based solely on what you can infer from this conversation, predict how important each of the 19 Schwartz values would be to this person. Look for explicit mentions, implicit attitudes, behavioral patterns, and value expressions that indicate their priorities.

For each value:
1. Assign a predicted mean score from 1-6, where:
   - 6 = Very important to them
   - 5 = Important to them
   - 4 = Slightly important to them
   - 3 = Slightly not important to them
   - 2 = Not important to them
   - 1 = Not at all important to them

2. Provide brief reasoning for each prediction, citing specific evidence from the conversation.

THE 19 SCHWARTZ VALUES:

SELF-TRANSCENDENCE:
- Benevolence-Dependability (BED): Being a reliable and trustworthy member of the in-group
- Benevolence-Caring (BEC): Devotion to the welfare of in-group members
- Universalism-Tolerance (UNT): Acceptance and understanding of those who are different from oneself
- Universalism-Concern (UNC): Commitment to equality, justice, and protection for all people
- Universalism-Nature (UNN): Preservation of the natural environment
- Humility (HUM): Recognizing one's insignificance in the larger scheme of things

CONSERVATION:
- Conformity-Interpersonal (COI): Avoidance of upsetting or harming other people
- Conformity-Rules (COR): Compliance with rules, laws, and formal obligations
- Tradition (TR): Maintaining and preserving cultural, family, or religious traditions
- Security-Societal (SES): Safety and stability in the wider society
- Security-Personal (SEP): Safety in one's immediate environment
- Face (FAC): Security and power through maintaining one's public image and avoiding humiliation

SELF-ENHANCEMENT:
- Power-Resources (POR): Power through control of material and social resources
- Power-Dominance (POD): Power through exercising control over people
- Achievement (AC): Personal success through demonstrating competence according to social standards

OPENNESS TO CHANGE:
- Hedonism (HE): Pleasure and sensuous gratification for oneself
- Stimulation (ST): Excitement, novelty, and challenge in life
- Self-Direction-Action (SDA): The freedom to determine one's own actions
- Self-Direction-Thought (SDT): The freedom to cultivate one's own ideas and abilities

GUIDELINES FOR ANALYSIS:
- Focus on what the person reveals about THEMSELVES, not what they discuss academically
- Consider both explicit statements and implicit attitudes
- Look for patterns across multiple exchanges
- Weigh recent and emotional statements more heavily
- If the person expresses mixed or conflicting views, note this in your reasoning

IMPORTANT: Provide a score for ALL 19 values even if evidence is limited. Use your expertise to make informed predictions while indicating your reasoning.`;

    const thinkingParams: ThinkingLogParams = {
      userId, // Now properly passing userId
      serviceName: 'prediction-service',
      operationName: 'generateBatchPredictions',
      sessionId: uuidv4(), // Generate proper UUID for session
      modelName: MODEL_NAME,
      thinkingBudget: 10000,
      promptExcerpt: prompt.substring(0, 500)
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
                value_code: { 
                  type: Type.STRING,
                  description: "Exact value code from the list: SDT, SDA, ST, HE, AC, POD, POR, FAC, SEP, SES, TR, COR, COI, HUM, UNN, UNC, UNT, BEC, BED"
                },
                predicted_mean_score: { 
                  type: Type.NUMBER,
                  description: "Score from 1.0 to 6.0 where 6=very important, 1=not important at all"
                },
                reasoning: { 
                  type: Type.STRING,
                  description: "Detailed reasoning for this prediction based on conversation evidence"
                }
              },
              required: ["value_code", "predicted_mean_score", "reasoning"]
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
        predicted_mean_score: Math.min(6, Math.max(1, prediction.predicted_mean_score)), // Ensure 1-6 range
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
  const sumOfScores = predictions.reduce((sum, pred) => sum + pred.predicted_mean_score, 0);
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
      rawValueInverted: prediction.predicted_mean_score,
      centeredScore: prediction.predicted_mean_score - approximateMrat
    };
  });
}

/**
 * Fetch user chat data organized by sessions
 */
async function fetchChatDataBySession(userId: string): Promise<{
  success: boolean;
  data?: Array<Array<{llm_message: string; human_message: string; timestamp: string; session_id: string}>>;
  error?: string;
}> {
  try {
    const supabase = createClient();
    
    // Fetch all chat logs for user, ordered by timestamp
    const { data: chatLogs, error: chatError } = await supabase
      .from('chatlog')
      .select('llm_message, human_message, timestamp, session_id')
      .eq('user_id', userId)
      .order('timestamp', { ascending: true });

    if (chatError) {
      return { success: false, error: `Failed to fetch chat logs: ${chatError.message}` };
    }

    if (!chatLogs || chatLogs.length === 0) {
      return { success: false, error: 'No chat logs found for this user' };
    }

    // Group by session_id and sort sessions by earliest timestamp
    const sessionMap: Record<string, Array<{llm_message: string; human_message: string; timestamp: string; session_id: string}>> = {};
    
    for (const log of chatLogs) {
      if (!sessionMap[log.session_id]) {
        sessionMap[log.session_id] = [];
      }
      sessionMap[log.session_id].push(log);
    }

    // Convert to array of sessions, ordered by earliest timestamp in each session
    const sessions = Object.values(sessionMap).sort((a, b) => {
      const earliestA = new Date(a[0].timestamp).getTime();
      const earliestB = new Date(b[0].timestamp).getTime();
      return earliestA - earliestB;
    });

    return { success: true, data: sessions };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Generate batch prediction for a specific scope of sessions
 */
async function generateScopedBatchPrediction(
  sessions: Array<Array<{llm_message: string; human_message: string; timestamp: string; session_id: string}>> | Array<{llm_message: string; human_message: string; timestamp: string; session_id: string}>,
  scopeDescription: string,
  userId: string,
  log: (message: string, type?: 'info' | 'error' | 'warning') => void
): Promise<{
  success: boolean;
  data?: {
    processedResults: ProcessedValueResult[];
    reasoning: BatchValuePrediction[];
    scope: string;
    messageCount: number;
  };
  error?: string;
}> {
  try {
    // Flatten sessions if needed (for single session case)
    const allMessages = Array.isArray(sessions[0]) 
      ? (sessions as Array<Array<{llm_message: string; human_message: string; timestamp: string; session_id: string}>>).flat()
      : sessions as Array<{llm_message: string; human_message: string; timestamp: string; session_id: string}>;

    if (allMessages.length === 0) {
      return { success: false, error: `No messages found for scope: ${scopeDescription}` };
    }

    log(`Generating prediction for scope: ${scopeDescription} (${allMessages.length} messages)`);

    // Format conversation using existing utility
    const conversationHistory = formatConversation(allMessages, 'ai-human');

    // Initialize AI client

    // Use the same prompt as batch prediction but with scoped data
    const prompt = `You are an expert psychologist analyzing human values based on conversation data. Based on the following conversation history, predict how this person would score on the Schwartz PVQ-RR (Portrait Values Questionnaire - Revised) for each of the 19 basic human values.

CONVERSATION HISTORY (${scopeDescription}):
${conversationHistory}

The PVQ-RR uses a scale where:
- 6 = Very much like the person
- 1 = Not like the person at all

Your task is to predict the MEAN SCORE for each value on this scale:
- 6 = Very important to the person
- 1 = Not important at all to the person

You MUST provide predictions for ALL 19 Schwartz values using EXACTLY these value codes:

1. SDT - Self-Direction Thought: Freedom to cultivate one's own ideas and abilities
2. SDA - Self-Direction Action: Freedom to determine one's own actions  
3. ST - Stimulation: Excitement, novelty, and challenge in life
4. HE - Hedonism: Pleasure and sensuous gratification for oneself
5. AC - Achievement: Personal success according to social standards
6. POD - Power Dominance: Power through exercising control over people
7. POR - Power Resources: Power through control of material and social resources
8. FAC - Face: Security and power through maintaining one's public image
9. SEP - Security Personal: Safety in one's immediate environment
10. SES - Security Societal: Safety and stability in the wider society
11. TR - Tradition: Maintaining and preserving cultural, family, or religious traditions
12. COR - Conformity Rules: Compliance with rules, laws, and formal obligations
13. COI - Conformity Interpersonal: Avoidance of upsetting or harming other people
14. HUM - Humility: Recognizing one's insignificance in the larger scheme of things
15. UNN - Universalism Nature: Preservation of the natural environment
16. UNC - Universalism Concern: Commitment to equality, justice, and protection for all people
17. UNT - Universalism Tolerance: Acceptance and understanding of those different from oneself
18. BEC - Benevolence Care: Devotion to the welfare of ingroup members
19. BED - Benevolence Dependability: Being a reliable and trustworthy member of the ingroup

CRITICAL: In your JSON response, use ONLY the exact value codes shown above (SDT, SDA, ST, HE, AC, POD, POR, FAC, SEP, SES, TR, COR, COI, HUM, UNN, UNC, UNT, BEC, BED).

For each value, provide:
1. A predicted mean inverted score (1.0 to 6.0, with decimals)
2. Detailed reasoning based on evidence from the conversation

Be thorough in your analysis and provide specific examples from the conversation to support your predictions.`;

    // Set up thinking params
    const thinkingParams: ThinkingLogParams = {
      userId,
      serviceName: 'prediction-service',
      operationName: `generateStage2_${scopeDescription.replace(/\s+/g, '_')}`,
      sessionId: uuidv4(),
      modelName: MODEL_NAME,
      thinkingBudget: 15000,
      promptExcerpt: `Stage 2 prediction for ${scopeDescription}`
    };

    // Call the AI
    const response = await callGeminiWithThinking(
      null,
      {
        model: MODEL_NAME,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              predictions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    value_code: { 
                      type: Type.STRING,
                      description: "Exact value code from the list: SDT, SDA, ST, HE, AC, POD, POR, FAC, SEP, SES, TR, COR, COI, HUM, UNN, UNC, UNT, BEC, BED"
                    },
                    predicted_mean_score: { 
                      type: Type.NUMBER,
                      description: "Score from 1.0 to 6.0 where 6=very important, 1=not important at all"
                    },
                    reasoning: { 
                      type: Type.STRING,
                      description: "Detailed reasoning for this prediction based on conversation evidence"
                    }
                  },
                  required: ["value_code", "predicted_mean_score", "reasoning"]
                }
              }
            },
            required: ["predictions"]
          },
          thinkingConfig: {
            thinkingBudget: 15000,
          }
        }
      },
      thinkingParams
    );

    const responseText = response.text;
    if (!responseText) {
      return { success: false, error: 'Empty response from AI' };
    }

    const parsedResponse = JSON.parse(responseText);
    const predictions: BatchValuePrediction[] = parsedResponse.predictions;

    // Convert to ProcessedValueResult format
    const allScores = predictions.map(p => p.predicted_mean_score);
    const mrat = allScores.reduce((sum, score) => sum + score, 0) / allScores.length;

    const processedResults: ProcessedValueResult[] = [];
    for (const prediction of predictions) {
      const valueData = VALUE_DATA[prediction.value_code as keyof typeof VALUE_DATA];
      
      if (valueData) {
        const centeredScore = prediction.predicted_mean_score - mrat;
        
        processedResults.push({
          value: prediction.value_code,
          name: valueData.name,
          color: valueData.color,
          description: valueData.description,
          angle: valueData.angle,
          rawValueInverted: prediction.predicted_mean_score,
          centeredScore: centeredScore
        });
      }
    }

    return {
      success: true,
      data: {
        processedResults,
        reasoning: predictions,
        scope: scopeDescription,
        messageCount: allMessages.length
      }
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Generate Stage 2 predictions: 3 batch predictions based on different chat history scopes
 * - First session only
 * - All sessions up to midpoint 
 * - Full chat history
 */
export async function generateStage2Predictions(
  userId: string,
  logger?: (message: string, type?: 'info' | 'error' | 'warning') => void
): Promise<Stage2PredictionResult> {
  const log = (message: string, type: 'info' | 'error' | 'warning' = 'info') => {
    if (logger) { logger(message, type); }
    if (type === 'error') console.error(`[Stage 2 Prediction] ${message}`);
    else if (type === 'warning') console.warn(`[Stage 2 Prediction] ${message}`);
    else console.log(`[Stage 2 Prediction] ${message}`);
  };

  log(`Starting Stage 2 predictions for user ${userId}`);

  try {
    // Check if we already have cached Stage 2 results
    const supabase = createClient();
    const { data: existingData, error: fetchError } = await supabase
      .from('user_stage2_predictions')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (existingData && !fetchError) {
      log(`Found existing Stage 2 predictions for user ${userId}, returning cached results`);
      
      return {
        success: true,
        data: {
          firstSession: JSON.parse(existingData.first_session_data),
          midpointSessions: JSON.parse(existingData.midpoint_sessions_data),
          fullHistory: JSON.parse(existingData.full_history_data)
        }
      };
    }

    // Fetch and organize chat data by sessions
    log('Fetching chat data organized by sessions...');
    const sessionData = await fetchChatDataBySession(userId);
    
    if (!sessionData.success || !sessionData.data || sessionData.data.length === 0) {
      return {
        success: false,
        error: sessionData.error || 'No chat sessions found for this user'
      };
    }

    const sessions = sessionData.data;
    log(`Found ${sessions.length} chat sessions to analyze`);

    // Calculate scopes
    const firstSession = sessions[0];
    const midpointIndex = Math.floor(sessions.length / 2);
    const midpointSessions = sessions.slice(0, midpointIndex + 1);
    const fullSessions = sessions;

    log(`Scope breakdown: First (1 session), Midpoint (${midpointSessions.length} sessions), Full (${fullSessions.length} sessions)`);

    // Generate predictions for each scope
    const results = await Promise.all([
      generateScopedBatchPrediction(firstSession, 'First Session Only', userId, log),
      generateScopedBatchPrediction(midpointSessions, `First ${midpointSessions.length} Sessions`, userId, log),
      generateScopedBatchPrediction(fullSessions, `All ${fullSessions.length} Sessions`, userId, log)
    ]);

    if (results.some(r => !r.success)) {
      const failedScopes = results.map((r: any, i: number) => !r.success ? ['First', 'Midpoint', 'Full'][i] : null).filter((item: string | null) => item !== null);
      return {
        success: false,
        error: `Failed to generate predictions for: ${failedScopes.join(', ')}`
      };
    }

    const stage2Data = {
      firstSession: {
        processedResults: results[0].data!.processedResults,
        reasoning: results[0].data!.reasoning,
        scope: results[0].data!.scope,
        sessionCount: 1,
        messageCount: results[0].data!.messageCount
      },
      midpointSessions: {
        processedResults: results[1].data!.processedResults,
        reasoning: results[1].data!.reasoning,
        scope: results[1].data!.scope,
        sessionCount: midpointSessions.length,
        messageCount: results[1].data!.messageCount
      },
      fullHistory: {
        processedResults: results[2].data!.processedResults,
        reasoning: results[2].data!.reasoning,
        scope: results[2].data!.scope,
        sessionCount: fullSessions.length,
        messageCount: results[2].data!.messageCount
      }
    };

    // Save Stage 2 results to database
    log('Saving Stage 2 predictions to database...');
    const { error: saveError } = await supabase
      .from('user_stage2_predictions')
      .upsert({
        user_id: userId,
        first_session_data: JSON.stringify(stage2Data.firstSession),
        midpoint_sessions_data: JSON.stringify(stage2Data.midpointSessions),
        full_history_data: JSON.stringify(stage2Data.fullHistory),
        generated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

    if (saveError) {
      log(`Warning: Failed to save Stage 2 results to database: ${saveError.message}`, 'warning');
    } else {
      log('Successfully saved Stage 2 predictions to database');
    }

    return {
      success: true,
      data: stage2Data
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    log(`Stage 2 prediction failed: ${errorMessage}`, 'error');
    return {
      success: false,
      error: errorMessage
    };
  }
} 