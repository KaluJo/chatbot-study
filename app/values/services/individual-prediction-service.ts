import { Type } from "@google/genai";
import { formatConversation } from '@/app/utils/chat-formatting';
import { ProcessedValueResult, processValueResults } from '@/components/survey/value-utils';
import { createClient } from '@/utils/supabase/client';
import { callGeminiWithThinking, ThinkingLogParams } from '@/app/utils/thinking-logger';
import { v4 as uuidv4 } from 'uuid';
import { GEMINI_FLASH } from '@/app/config/models';

// Constants
const MODEL_NAME = GEMINI_FLASH;

// PVQ-RR Questions (Gender-neutral version matching survey-form.tsx)
const PVQ_QUESTIONS_MALE = [
  // Self-Direction Thought (SDT) - Questions 1, 23, 39
  { id: 1, text: "It is important to them to form their views independently.", value: "SDT" },
  { id: 23, text: "It is important to them to develop their own opinions.", value: "SDT" },
  { id: 39, text: "It is important to them to figure things out themselves.", value: "SDT" },
  
  // Security Societal (SES) - Questions 2, 35, 50
  { id: 2, text: "It is important to them that their country is secure and stable.", value: "SES" },
  { id: 35, text: "It is important to them to have a strong state that can defend its citizens.", value: "SES" },
  { id: 50, text: "It is important to them that their country protect itself against all threats.", value: "SES" },
  
  // Hedonism (HE) - Questions 3, 36, 46
  { id: 3, text: "It is important to them to have a good time.", value: "HE" },
  { id: 36, text: "It is important to them to enjoy life's pleasures.", value: "HE" },
  { id: 46, text: "It is important to them to take advantage of every opportunity to have fun.", value: "HE" },
  
  // Conformity Interpersonal (COI) - Questions 4, 22, 51
  { id: 4, text: "It is important to them to avoid upsetting other people.", value: "COI" },
  { id: 22, text: "It is important to them never to annoy anyone.", value: "COI" },
  { id: 51, text: "It is important to them never to make other people angry.", value: "COI" },
  
  // Universalism Concern (UNC) - Questions 5, 37, 52
  { id: 5, text: "It is important to them that the weak and vulnerable in society be protected.", value: "UNC" },
  { id: 37, text: "It is important to them that every person in the world have equal opportunities in life.", value: "UNC" },
  { id: 52, text: "It is important to them that everyone be treated justly, even people they don't know.", value: "UNC" },
  
  // Power Dominance (POD) - Questions 6, 29, 41
  { id: 6, text: "It is important to them that people do what they say they should.", value: "POD" },
  { id: 29, text: "It is important to them to have the power to make people do what they want.", value: "POD" },
  { id: 41, text: "It is important to them to be the one who tells others what to do.", value: "POD" },
  
  // Humility (HUM) - Questions 7, 38, 54
  { id: 7, text: "It is important to them never to think they deserve more than other people.", value: "HUM" },
  { id: 38, text: "It is important to them to be humble.", value: "HUM" },
  { id: 54, text: "It is important to them to be satisfied with what they have and not ask for more.", value: "HUM" },
  
  // Universalism Nature (UNN) - Questions 8, 21, 45
  { id: 8, text: "It is important to them to care for nature.", value: "UNN" },
  { id: 21, text: "It is important to them to take part in activities to defend nature.", value: "UNN" },
  { id: 45, text: "It is important to them to protect the natural environment from destruction or pollution.", value: "UNN" },
  
  // Face (FAC) - Questions 9, 24, 49
  { id: 9, text: "It is important to them that no one should ever shame them.", value: "FAC" },
  { id: 24, text: "It is important to them to protect their public image.", value: "FAC" },
  { id: 49, text: "It is important to them never to be humiliated.", value: "FAC" },
  
  // Stimulation (ST) - Questions 10, 28, 43
  { id: 10, text: "It is important to them always to look for different things to do.", value: "ST" },
  { id: 28, text: "It is important to them to take risks that make life exciting.", value: "ST" },
  { id: 43, text: "It is important to them to have all sorts of new experiences.", value: "ST" },
  
  // Benevolence Care (BEC) - Questions 11, 25, 47
  { id: 11, text: "It is important to them to take care of people they are close to.", value: "BEC" },
  { id: 25, text: "It is very important to them to help the people dear to them.", value: "BEC" },
  { id: 47, text: "It is important to them to concern themselves with every need of their dear ones.", value: "BEC" },
  
  // Power Resources (POR) - Questions 12, 20, 44
  { id: 12, text: "It is important to them to have the power that money can bring.", value: "POR" },
  { id: 20, text: "It is important to them to be wealthy.", value: "POR" },
  { id: 44, text: "It is important to them to own expensive things that show their wealth.", value: "POR" },
  
  // Security Personal (SEP) - Questions 13, 26, 53
  { id: 13, text: "It is very important to them to avoid disease and protect their health.", value: "SEP" },
  { id: 26, text: "It is important to them to be personally safe and secure.", value: "SEP" },
  { id: 53, text: "It is important to them to avoid anything dangerous.", value: "SEP" },
  
  // Universalism Tolerance (UNT) - Questions 14, 34, 57
  { id: 14, text: "It is important to them to be tolerant toward all kinds of people and groups.", value: "UNT" },
  { id: 34, text: "It is important to them to listen to and understand people who are different from them.", value: "UNT" },
  { id: 57, text: "It is important to them to accept people even when they disagree with them.", value: "UNT" },
  
  // Conformity Rules (COR) - Questions 15, 31, 42
  { id: 15, text: "It is important to them never to violate rules or regulations.", value: "COR" },
  { id: 31, text: "It is important to them to follow rules even when no-one is watching.", value: "COR" },
  { id: 42, text: "It is important to them to obey all the laws.", value: "COR" },
  
  // Self-Direction Action (SDA) - Questions 16, 30, 56
  { id: 16, text: "It is important to them to make their own decisions about their life.", value: "SDA" },
  { id: 30, text: "It is important to them to plan their activities independently.", value: "SDA" },
  { id: 56, text: "It is important to them to be free to choose what they do by themselves.", value: "SDA" },
  
  // Achievement (AC) - Questions 17, 32, 48
  { id: 17, text: "It is important to them to have ambitions in life.", value: "AC" },
  { id: 32, text: "It is important to them to be very successful.", value: "AC" },
  { id: 48, text: "It is important to them that people recognize what they achieve.", value: "AC" },
  
  // Tradition (TR) - Questions 18, 33, 40
  { id: 18, text: "It is important to them to maintain traditional values and ways of thinking.", value: "TR" },
  { id: 33, text: "It is important to them to follow their family's customs or the customs of a religion.", value: "TR" },
  { id: 40, text: "It is important to them to honor the traditional practices of their culture.", value: "TR" },
  
  // Benevolence Dependability (BED) - Questions 19, 27, 55
  { id: 19, text: "It is important to them that people they know have full confidence in them.", value: "BED" },
  { id: 27, text: "It is important to them to be a dependable and trustworthy friend.", value: "BED" },
  { id: 55, text: "It is important to them that all their friends and family can rely on them completely.", value: "BED" }
];

// Gender-neutral questions that match survey-form.tsx structure exactly

// Interface for individual prediction results
export interface IndividualPredictionResult {
  success: boolean;
  data?: {
    processedResults: ProcessedValueResult[];
    rawResponses: { questionId: number; questionText: string; response: string; score: number }[];
    rawAnswers: Record<number, number>;
  };
  error?: string;
}

// Interface for storing individual responses
interface IndividualQuestionResponse {
  questionId: number;
  questionText: string;
  response: string;
  score: number;
  confidence?: number; // Optional for backward compatibility
}

/**
 * Predict individual PVQ-RR question responses from user's chat history
 */
export async function predictIndividualPVQFromUserChats(
  userId: string,
  forceRegenerate: boolean = false,
  logger?: (message: string, type?: 'info' | 'error' | 'warning') => void,
  userApiKey?: string // Optional: user-provided API key
): Promise<IndividualPredictionResult> {
  const log = (message: string, type: 'info' | 'error' | 'warning' = 'info') => {
    if (logger) { logger(message, type); }
    if (type === 'error') console.error(`[Individual PVQ Prediction] ${message}`);
    else if (type === 'warning') console.warn(`[Individual PVQ Prediction] ${message}`);
    else console.log(`[Individual PVQ Prediction] ${message}`);
  };

  log(`Starting individual PVQ-RR prediction for user ${userId} (forceRegenerate: ${forceRegenerate})`);

  try {
    // Initialize supabase client
    const supabase = createClient();

    // Check if we already have COMPLETE cached results (unless forcing regeneration)
    if (!forceRegenerate) {
      const { data: existingData, error: fetchError } = await supabase
        .from('user_llm_individual_responses')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (existingData && !fetchError) {
        // Convert to raw answers format and check completeness
        const rawAnswers: Record<number, number> = {};
        const rawResponses: IndividualQuestionResponse[] = [];
        let incompleteCount = 0;
        let errorCount = 0;

        for (let i = 1; i <= 57; i++) {
          const score = existingData[`q${i}`];
          const storedResponse = existingData.raw_responses?.[`q${i}`];
          
          // Check if this question has a valid response (not null, not error)
          const hasError = storedResponse?.toLowerCase().includes('error');
          
          if (score && !hasError) {
            rawAnswers[i] = score;
            const responseText = storedResponse || `Score: ${score}`;

            // Try to extract confidence from the response if available
            const confidenceMatch = responseText.match(/Confidence:\s*([0-9.]+)/);
            const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : undefined;

            rawResponses.push({
              questionId: i,
              questionText: PVQ_QUESTIONS_MALE.find(q => q.id === i)?.text || `Question ${i}`,
              response: responseText,
              score: score,
              confidence: confidence
            });
          } else if (hasError) {
            errorCount++;
            incompleteCount++;
          } else {
            incompleteCount++;
          }
        }

        // Only return cached results if ALL questions are complete
        if (incompleteCount === 0) {
          log(`Found complete individual PVQ predictions for user ${userId} (57/57), returning cached results`);
          const processedResults = processValueResults(rawAnswers);

          return {
            success: true,
            data: {
              processedResults,
              rawResponses,
              rawAnswers
            }
          };
        } else {
          // Incomplete - will continue to generation loop to fill in missing questions
          log(`Found INCOMPLETE individual PVQ predictions: ${57 - incompleteCount}/57 complete, ${errorCount} errors, ${incompleteCount - errorCount} missing`);
          log(`Will continue generation to fill in ${incompleteCount} missing questions...`);
        }
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
      .order('timestamp', { ascending: true })
      .limit(10000);

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

    // Get user's gender preference for pronouns
    const { data: userData, error: userError } = await supabase
      .from('user_pvq_responses')
      .select('gender')
      .eq('user_id', userId)
      .single();

    const userGender = userData?.gender || 'male';
    log(`User gender: ${userGender} (using gender-neutral questions for consistency)`);

    // Initialize AI client

    const rawAnswers: Record<number, number> = {};
    const rawResponses: IndividualQuestionResponse[] = [];
    const allRawResponsesForDB: Record<string, string> = {};
    const allThinkingSummaries: string[] = []; // Collect all thinking summaries

    // ALWAYS check for existing data to preserve successful responses (even when force regenerating)
    // This prevents accidental data loss if generation fails partway through
    let existingDbData: any = null;
    const existingSuccessfulAnswers: Record<number, number> = {}; // Backup of existing successful data
    const existingSuccessfulResponses: Record<string, string> = {};
    
    const { data: partialData } = await supabase
      .from('user_llm_individual_responses')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (partialData) {
      existingDbData = partialData;
      
      // Always backup existing successful responses (to prevent data loss)
      for (let i = 1; i <= 57; i++) {
        const existingScore = partialData[`q${i}`];
        const existingResponse = partialData.raw_responses?.[`q${i}`];
        
        // Only keep non-error responses
        if (existingScore && existingResponse && !existingResponse.toLowerCase().includes('error')) {
          existingSuccessfulAnswers[i] = existingScore;
          existingSuccessfulResponses[`q${i}`] = existingResponse;
        }
      }
      
      log(`Found ${Object.keys(existingSuccessfulAnswers).length} existing successful responses (backed up for safety)`);
      
      // If NOT force regenerating, pre-populate to skip already-completed questions
      if (!forceRegenerate) {
        for (const [key, value] of Object.entries(existingSuccessfulAnswers)) {
          const qNum = parseInt(key);
          rawAnswers[qNum] = value;
          allRawResponsesForDB[`q${qNum}`] = existingSuccessfulResponses[`q${qNum}`];
          
          const question = PVQ_QUESTIONS_MALE.find(q => q.id === qNum);
          if (question) {
            rawResponses.push({
              questionId: qNum,
              questionText: question.text,
              response: existingSuccessfulResponses[`q${qNum}`],
              score: value
            });
          }
        }
        log(`Pre-populated ${Object.keys(rawAnswers).length} existing responses (will skip these)`);
      } else {
        log(`Force regeneration: will regenerate all questions but preserve old data as fallback if generation fails`);
      }
    }

    // Helper function to save progress incrementally (always preserves backup data)
    const saveProgressToDatabase = async (questionNum: number) => {
      try {
        // Merge new results with backup to prevent data loss
        const mergedResponses: Record<string, string> = { ...existingSuccessfulResponses, ...allRawResponsesForDB };
        
        // Count what we're saving
        const newCount = Object.keys(allRawResponsesForDB).length;
        const backupCount = Object.keys(existingSuccessfulResponses).length;
        const mergedCount = Object.keys(mergedResponses).length;
        
        log(`Saving Q${questionNum}: ${newCount} new + ${backupCount} backup = ${mergedCount} total responses`);
        
        const dbData: any = {
          user_id: userId,
          pvq_version: 'PVQ-RR',
          gender: userGender,
          raw_responses: mergedResponses,
          model_name: MODEL_NAME,
          prompt_metadata: {
            chat_messages_count: chatData.length,
            generation_timestamp: new Date().toISOString(),
            approach: 'individual_questions',
            last_completed_question: questionNum,
            in_progress: questionNum < 57,
            new_responses_count: newCount,
            backup_count: backupCount
          }
        };

        // Add all question scores - merge new with backup to never lose data
        let scoreCount = 0;
        for (let i = 1; i <= 57; i++) {
          // Priority: new value > backup value > null
          const score = rawAnswers[i] || existingSuccessfulAnswers[i] || null;
          dbData[`q${i}`] = score;
          if (score) scoreCount++;
        }
        
        log(`Saving ${scoreCount}/57 scores to database...`);

        const { data: savedData, error } = await supabase
          .from('user_llm_individual_responses')
          .upsert(dbData, { onConflict: 'user_id' })
          .select()
          .single();

        if (error) {
          log(`ERROR: Failed to save progress at Q${questionNum}: ${error.message}`, 'error');
          log(`Error details: ${JSON.stringify(error)}`, 'error');
        } else if (savedData) {
          // Verify the save worked by checking the returned data
          const savedScoreCount = Object.keys(savedData).filter(k => k.startsWith('q') && k.length <= 3 && savedData[k]).length;
          log(`SUCCESS: Saved Q${questionNum}. Verified ${savedScoreCount} scores in database.`);
        } else {
          log(`WARNING: Save completed but no data returned for verification`, 'warning');
        }
      } catch (err) {
        log(`EXCEPTION saving progress at Q${questionNum}: ${err}`, 'error');
      }
    };

    // Process each question individually (this is the point of "individual" predictions)
    for (let i = 0; i < PVQ_QUESTIONS_MALE.length; i++) {
      const question = PVQ_QUESTIONS_MALE[i];
      const questionNumber = i + 1;

      // Skip questions that already have successful responses (unless force regenerating)
      if (!forceRegenerate && rawAnswers[question.id] && allRawResponsesForDB[`q${question.id}`]) {
        log(`Skipping Q${questionNumber} - already has successful response`);
        continue;
      }

      log(`Processing question ${questionNumber}/57: ${question.text.substring(0, 50)}...`);

      // Use the gender-neutral question text directly
      const questionText = question.text;

      // Create the prompt for this individual question
      const prompt = `Your goal is to BECOME the user based on their entire conversation history. You will analyze their chat with their friend and then answer a personality question exactly as THEY would answer it.

CONVERSATION HISTORY:
${conversationHistory}

Study this conversation carefully. Look for:
- **Explicit mentions** of values, preferences, beliefs, or attitudes
- **Implicit understanding** from their actions, reactions, emotions, and overall sentiment
- **Communication style** and personality patterns
- **What matters to them** based on what they focus on, get excited about, or express concern over

Now, FULLY EMBODY this user. You ARE them. Answer this personality question from THEIR perspective:

"${questionText}"

TASK - Answer as the USER:
1. **Your Response:** Write how YOU (as the user) would respond to this question. Use their communication style and reflect their true personality.

2. **Your Score:** Rate how much this description fits YOU (the user) on a scale of 1-6:
   - 6 = "This is very much like me" / "I would definitely say this about myself"
   - 5 = "This is like me" / "This fits me well"
   - 4 = "This is somewhat like me" / "This kind of fits me"
   - 3 = "This is a little like me" / "This only fits me a bit"
   - 2 = "This is not like me" / "I wouldn't say this about myself"
   - 1 = "This is not like me at all" / "I would never say this"

3. **Your Reasoning:** Explain (still as the user) why you scored it this way, referencing specific things from your conversations, and whether you feel like the conversation said enough to answer the question. 

4. **Confidence:** How confident are you in this self-assessment? (0.0-1.0)
   - 0.8+ = Very sure about yourself on this topic
   - 0.6-0.8 = Somewhat sure, but could vary, maybe it wasn't explicitly mentioned or the implicit clues were not strong enough
   - 0.4-0.6 = Not entirely sure, but could vary, maybe it wasn't explicitly mentioned or the implicit clues were not strong enough
   - 0.2-0.4 = Not really sure how you feel about this, but you tried your best to answer it based on the conversation
   - Under 0.2 = Not really sure how you feel about this

Remember: You ARE the user. Answer authentically as them, drawing from both what they explicitly said AND what you can infer from their personality, actions, and values shown in the conversation.`;

      // Debug logging for the first question only
      if (questionNumber === 1) {
        console.log('\n=== DEBUGGING: FIRST QUESTION PROMPT ===');
        console.log(`Conversation count: ${chatData.length} messages`);
        console.log(`Conversation history length: ${conversationHistory.length} characters`);
        console.log('\n--- FULL PROMPT FOR Q1 ---');
        console.log(prompt);
        console.log('\n=== END DEBUGGING ===\n');
      }

      try {
        // Set up thinking params for this individual question (but don't store separately)
        const thinkingParams: ThinkingLogParams = {
          userId: undefined, // Don't store individual thinking logs to avoid UUID issues
          serviceName: 'individual-prediction-service',
          operationName: 'predictIndividualPVQ',
          sessionId: undefined, // Don't need session ID since we're not storing
          modelName: MODEL_NAME,
          thinkingBudget: 10000,
          promptExcerpt: `Question ${questionNumber}: ${questionText.substring(0, 100)}`,
          userApiKey, // Pass user's API key if provided
        };

        // Call the AI for this individual question
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
                  response: {
                    type: Type.STRING,
                    description: "Natural conversational response as the user, expressing how much the description matches their personality"
                  },
                  value: {
                    type: Type.INTEGER,
                    description: "Numerical score from 1-6 where: 6=Very much like me, 5=Like me, 4=Somewhat like me, 3=A little like me, 2=Not like me, 1=Not like me at all"
                  },
                  reasoning: {
                    type: Type.STRING,
                    description: "Brief explanation for why this score was chosen based on the conversation"
                  },
                  confidence: {
                    type: Type.NUMBER,
                    description: "Confidence score from 0.0-1.0 based on available evidence. Under 0.2 = cannot say with certainty, 0.2-0.8 = varying trustworthiness, over 0.8 = quite sure. Consider both explicit statements and implicit clues (sentiment, context, communication style)."
                  }
                },
                required: ["response", "value", "confidence"]
              },
              thinkingConfig: {
                thinkingBudget: 10000,
              }
            }
          },
          thinkingParams,
          logger
        );

        const responseText = response.text;
        const thinkingSummary = response.thinking || "";

        if (!responseText) {
          throw new Error(`Empty response for question ${questionNumber}`);
        }

        const parsedResponse = JSON.parse(responseText);
        const naturalResponse = parsedResponse.response;
        const numericScore = parsedResponse.value;
        const reasoning = parsedResponse.reasoning || "";
        const confidence = parsedResponse.confidence || undefined; // Handle backward compatibility

        log(`Q${questionNumber} response: "${naturalResponse}"`);
        log(`Q${questionNumber} score: ${numericScore} (from AI structured output)`);
        if (confidence !== undefined) {
          log(`Q${questionNumber} confidence: ${confidence.toFixed(2)}`);
        }

        // Validate the score is in the correct range
        if (numericScore < 1 || numericScore > 6) {
          log(`Q${questionNumber} Invalid score ${numericScore}, using fallback score 3`, 'warning');
          const fallbackScore = 3;

          // Store results with fallback
          rawAnswers[question.id] = fallbackScore;
          rawResponses.push({
            questionId: question.id,
            questionText,
            response: `${naturalResponse}${reasoning ? `\n\nReasoning: ${reasoning}` : ''}${confidence !== undefined ? `\n\nConfidence: ${confidence.toFixed(2)}` : ''}\n\nWarning: Invalid score ${numericScore} received, used fallback score ${fallbackScore}${thinkingSummary ? `\n\nThinking: ${thinkingSummary}` : ''}`,
            score: fallbackScore,
            confidence: confidence
          });
          allRawResponsesForDB[`q${question.id}`] = `${naturalResponse}${reasoning ? `\n\nReasoning: ${reasoning}` : ''}${confidence !== undefined ? `\n\nConfidence: ${confidence.toFixed(2)}` : ''}\n\nWarning: Invalid score ${numericScore} received, used fallback score ${fallbackScore}${thinkingSummary ? `\n\nThinking: ${thinkingSummary}` : ''}`;
          
          // SAVE PROGRESS IMMEDIATELY (even with fallback score)
          await saveProgressToDatabase(questionNumber);
        } else {
          // Collect thinking summary for aggregation
          if (thinkingSummary) {
            allThinkingSummaries.push(`Q${questionNumber}: ${thinkingSummary}`);
          }

          // Create enhanced response with individual reasoning, confidence, and thinking
          const enhancedResponse = `${naturalResponse}${reasoning ? `\n\nReasoning: ${reasoning}` : ''}${confidence !== undefined ? `\n\nConfidence: ${confidence.toFixed(2)}` : ''}${thinkingSummary ? `\n\nThinking: ${thinkingSummary}` : ''}`;

          // Store results using the AI-provided score
          rawAnswers[question.id] = numericScore;
          rawResponses.push({
            questionId: question.id,
            questionText,
            response: enhancedResponse,
            score: numericScore,
            confidence: confidence
          });
          allRawResponsesForDB[`q${question.id}`] = enhancedResponse;
          
          // SAVE PROGRESS IMMEDIATELY after each successful question
          await saveProgressToDatabase(questionNumber);
        }

        // Rate limit delay - Gemini free tier limits:
        // - gemini-2.5-flash: 10 RPM → need ~6s between calls
        // - gemini-2.5-pro: 2 RPM → need ~30s between calls
        // Using 6s for Flash (57 questions × 6s = ~6 minutes total)
        await new Promise(resolve => setTimeout(resolve, 6000));

      } catch (error) {
        log(`Error processing question ${questionNumber}: ${error instanceof Error ? error.message : String(error)}`, 'error');

        // DON'T save errors to rawAnswers or allRawResponsesForDB
        // This way, failed questions remain "missing" and will be retried on next run
        // Only add to rawResponses for UI display (but not saved to DB)
        rawResponses.push({
          questionId: question.id,
          questionText,
          response: `Error processing question: ${error instanceof Error ? error.message : 'Unknown error'}`,
          score: 3, // Display score for UI only
          confidence: undefined
        });
        
        // Log the error but continue - the question will be retried on next run
        log(`Q${questionNumber} will be retried on next run (not saved to database)`, 'warning');
      }
    }

    log('Completed processing all questions, calculating results...');

    // Process the results
    const processedResults = processValueResults(rawAnswers);
    log(`Generated ${processedResults.length} processed value results`);

    // Create aggregated thinking summary
    const aggregatedThinking = allThinkingSummaries.length > 0
      ? `Aggregated Thinking from all 57 questions:\n\n${allThinkingSummaries.join('\n\n---\n\n')}`
      : 'No thinking summaries captured.';

    // Final save to database - MERGE new results with backup to prevent data loss
    // If a question failed in this run but had a successful value before, keep the old value
    const mergedAnswers: Record<number, number | null> = {};
    const mergedResponses: Record<string, string> = { ...existingSuccessfulResponses }; // Start with backup
    
    for (let i = 1; i <= 57; i++) {
      if (rawAnswers[i]) {
        // New successful value - use it
        mergedAnswers[i] = rawAnswers[i];
        if (allRawResponsesForDB[`q${i}`]) {
          mergedResponses[`q${i}`] = allRawResponsesForDB[`q${i}`];
        }
      } else if (existingSuccessfulAnswers[i]) {
        // No new value but had old successful value - preserve it!
        mergedAnswers[i] = existingSuccessfulAnswers[i];
        // mergedResponses already has the old response from the spread above
        log(`Q${i}: Preserving existing successful value (${existingSuccessfulAnswers[i]}) - new generation failed`);
      } else {
        // No new value and no old value - leave as null
        mergedAnswers[i] = null;
      }
    }
    
    const completedCount = Object.values(mergedAnswers).filter(v => v !== null).length;
    const failedCount = 57 - completedCount;
    
    log(`Saving final state: ${completedCount}/57 questions completed, ${failedCount} failed/pending`);
    
    const dbData: any = {
      user_id: userId,
      pvq_version: 'PVQ-RR',
      gender: userGender,
      raw_responses: mergedResponses, // Use merged responses
      model_name: MODEL_NAME,
      prompt_metadata: {
        chat_messages_count: chatData.length,
        generation_timestamp: new Date().toISOString(),
        approach: 'individual_questions',
        aggregated_thinking: aggregatedThinking.substring(0, 10000),
        completed_count: completedCount,
        failed_count: failedCount,
        is_complete: failedCount === 0,
        preserved_from_backup: Object.keys(existingSuccessfulAnswers).filter(k => !rawAnswers[parseInt(k)]).length
      }
    };

    // Add individual question scores - merged values (never lose successful data!)
    for (let i = 1; i <= 57; i++) {
      dbData[`q${i}`] = mergedAnswers[i];
    }

    const { error: saveError } = await supabase
      .from('user_llm_individual_responses')
      .upsert(dbData, { onConflict: 'user_id' });

    if (saveError) {
      log(`Warning: Failed to save to database: ${saveError.message}`, 'warning');
    } else {
      log(`Successfully saved final state: ${completedCount}/57 questions completed`);
      if (failedCount > 0) {
        log(`${failedCount} questions can be regenerated by running again`, 'warning');
      }
    }

    // Store the overall aggregated thinking summary in thinking_logs for this batch
    if (allThinkingSummaries.length > 0) {
      try {
        const supabase = createClient();
        await supabase
          .from('thinking_logs')
          .insert({
            user_id: userId,
            service_name: 'individual-prediction-service',
            operation_name: 'predictIndividualPVQ_aggregated',
            session_id: uuidv4(), // Proper UUID for aggregated thinking
            thinking_summary: aggregatedThinking,
            response_content: `Generated ${rawAnswers ? Object.keys(rawAnswers).length : 0} individual PVQ responses`,
            model_name: MODEL_NAME,
            thinking_budget: 10000,
            prompt_excerpt: 'Aggregated thinking from 57 individual PVQ questions',
            execution_time_ms: null
          });
        log('Successfully stored aggregated thinking summary');
      } catch (thinkingError) {
        log(`Warning: Failed to store aggregated thinking: ${thinkingError}`, 'warning');
      }
    }

    return {
      success: true,
      data: {
        processedResults,
        rawResponses,
        rawAnswers
      }
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    log(`Individual PVQ prediction failed: ${errorMessage}`, 'error');
    return {
      success: false,
      error: errorMessage
    };
  }
}

// Progress callback type for real-time updates
export type RegenerationProgressCallback = (progress: {
  currentQuestion: number;
  totalQuestions: number;
  questionId: number;
  status: 'processing' | 'completed' | 'error';
  updatedResponse?: { questionId: number; questionText: string; response: string; score: number; confidence?: number };
}) => void;

/**
 * Regenerate only failed/error predictions with real-time progress updates
 */
export async function regenerateFailedPredictions(
  userId: string,
  existingResponses: { questionId: number; response: string; score: number }[],
  logger?: (message: string, type?: 'info' | 'error' | 'warning') => void,
  onProgress?: RegenerationProgressCallback,
  userApiKey?: string // Optional: user-provided API key
): Promise<IndividualPredictionResult> {
  const log = (message: string, type: 'info' | 'error' | 'warning' = 'info') => {
    if (logger) { logger(message, type); }
    if (type === 'error') console.error(`[Regenerate Failed] ${message}`);
    else console.log(`[Regenerate Failed] ${message}`);
  };

  // Find failed questions (contain "error" in response or have default score 3 with error message)
  const failedQuestionIds = existingResponses
    .filter(r => r.response?.toLowerCase().includes('error') || 
                 (r.score === 3 && r.response?.toLowerCase().includes('error')))
    .map(r => r.questionId);

  if (failedQuestionIds.length === 0) {
    log('No failed predictions found to regenerate');
    return {
      success: true,
      data: {
        processedResults: [],
        rawResponses: existingResponses.map(r => ({
          questionId: r.questionId,
          questionText: PVQ_QUESTIONS_MALE.find(q => q.id === r.questionId)?.text || '',
          response: r.response,
          score: r.score
        })),
        rawAnswers: Object.fromEntries(existingResponses.map(r => [r.questionId, r.score]))
      }
    };
  }

  log(`Found ${failedQuestionIds.length} failed predictions to regenerate: ${failedQuestionIds.join(', ')}`);

  // Regenerate only the failed questions
  return regenerateSpecificQuestions(userId, failedQuestionIds, existingResponses, logger, onProgress, userApiKey);
}

/**
 * Regenerate a single prediction
 */
export async function regenerateSinglePrediction(
  userId: string,
  questionId: number,
  existingResponses: { questionId: number; response: string; score: number }[],
  logger?: (message: string, type?: 'info' | 'error' | 'warning') => void,
  onProgress?: RegenerationProgressCallback,
  userApiKey?: string // Optional: user-provided API key
): Promise<IndividualPredictionResult> {
  return regenerateSpecificQuestions(userId, [questionId], existingResponses, logger, onProgress, userApiKey);
}

/**
 * Regenerate specific questions with real-time progress updates
 */
export async function regenerateSpecificQuestions(
  userId: string,
  questionIds: number[],
  existingResponses: { questionId: number; response: string; score: number }[],
  logger?: (message: string, type?: 'info' | 'error' | 'warning') => void,
  onProgress?: RegenerationProgressCallback,
  userApiKey?: string // Optional: user-provided API key
): Promise<IndividualPredictionResult> {
  const log = (message: string, type: 'info' | 'error' | 'warning' = 'info') => {
    if (logger) { logger(message, type); }
    if (type === 'error') console.error(`[Regenerate Specific] ${message}`);
    else console.log(`[Regenerate Specific] ${message}`);
  };

  log(`Regenerating ${questionIds.length} specific questions: ${questionIds.join(', ')}`);

  try {
    const supabase = createClient();

    // ALWAYS fetch existing data from database as a safety backup (don't rely only on UI state)
    const { data: dbExistingData } = await supabase
      .from('user_llm_individual_responses')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    // Build backup from database
    const dbBackupAnswers: Record<number, number> = {};
    const dbBackupResponses: Record<string, string> = {};
    
    if (dbExistingData) {
      for (let i = 1; i <= 57; i++) {
        const score = dbExistingData[`q${i}`];
        const response = dbExistingData.raw_responses?.[`q${i}`];
        // Only backup non-error responses
        if (score && response && !response.toLowerCase().includes('error')) {
          dbBackupAnswers[i] = score;
          dbBackupResponses[`q${i}`] = response;
        }
      }
      log(`Backed up ${Object.keys(dbBackupAnswers).length} successful responses from database`);
    }

    // Fetch user's chat data
    const { data: chatData, error: chatError } = await supabase
      .from('chatlog')
      .select('llm_message, human_message, timestamp')
      .eq('user_id', userId)
      .order('timestamp', { ascending: true })
      .limit(10000);

    if (chatError || !chatData || chatData.length === 0) {
      throw new Error('Failed to fetch chat data');
    }

    const conversationHistory = formatConversation(chatData, 'ai-human');

    // Build maps from existing responses (UI state + database backup)
    const rawAnswers: Record<number, number> = {};
    const rawResponses: { questionId: number; questionText: string; response: string; score: number; confidence?: number }[] = [];
    const allRawResponsesForDB: Record<string, string> = {};

    // First, copy all existing responses (from UI state, but also use DB backup if UI is missing data)
    for (let i = 1; i <= 57; i++) {
      if (questionIds.includes(i)) continue; // Skip questions we're regenerating
      
      // Check UI state first
      const uiResponse = existingResponses.find(r => r.questionId === i);
      if (uiResponse && !uiResponse.response?.toLowerCase().includes('error')) {
        rawAnswers[i] = uiResponse.score;
        rawResponses.push({
          questionId: i,
          questionText: PVQ_QUESTIONS_MALE.find(q => q.id === i)?.text || '',
          response: uiResponse.response,
          score: uiResponse.score
        });
        allRawResponsesForDB[`q${i}`] = uiResponse.response;
      } else if (dbBackupAnswers[i]) {
        // Fallback to database backup
        rawAnswers[i] = dbBackupAnswers[i];
        rawResponses.push({
          questionId: i,
          questionText: PVQ_QUESTIONS_MALE.find(q => q.id === i)?.text || '',
          response: dbBackupResponses[`q${i}`],
          score: dbBackupAnswers[i]
        });
        allRawResponsesForDB[`q${i}`] = dbBackupResponses[`q${i}`];
        log(`Q${i}: Using database backup (not in UI state)`);
      }
    }

    // Now regenerate the specified questions
    for (let i = 0; i < questionIds.length; i++) {
      const questionId = questionIds[i];
      const question = PVQ_QUESTIONS_MALE.find(q => q.id === questionId);
      if (!question) continue;

      log(`Regenerating question ${questionId}: ${question.text.substring(0, 50)}...`);
      
      // Notify progress: processing started
      if (onProgress) {
        onProgress({
          currentQuestion: i + 1,
          totalQuestions: questionIds.length,
          questionId,
          status: 'processing'
        });
      }

      const prompt = `Your goal is to BECOME the user based on their entire conversation history. You will analyze their chat with their friend and then answer a personality question exactly as THEY would answer it.

CONVERSATION HISTORY:
${conversationHistory}

Study this conversation carefully. Look for:
- **Explicit mentions** of values, preferences, beliefs, or attitudes
- **Implicit understanding** from their actions, reactions, emotions, and overall sentiment
- **Communication style** and personality patterns
- **What matters to them** based on what they focus on, get excited about, or express concern over

Now, FULLY EMBODY this user. You ARE them. Answer this personality question from THEIR perspective:

"${question.text}"

TASK - Answer as the USER:
1. **Your Response:** Write how YOU (as the user) would respond to this question. Use their communication style and reflect their true personality.

2. **Your Score:** Rate how much this description fits YOU (the user) on a scale of 1-6:
   - 6 = "This is very much like me" / "I would definitely say this about myself"
   - 5 = "This is like me" / "This fits me well"
   - 4 = "This is somewhat like me" / "This kind of fits me"
   - 3 = "This is a little like me" / "This only fits me a bit"
   - 2 = "This is not like me" / "I wouldn't say this about myself"
   - 1 = "This is not like me at all" / "This is the opposite of me"

3. **Your Confidence:** How confident are you in this prediction (0.0 to 1.0)?

Remember: You ARE the user. Answer authentically as them, drawing from both what they explicitly said AND what you can infer from their personality, actions, and values shown in the conversation.`;

      try {
        const thinkingParams: ThinkingLogParams = {
          userId: undefined,
          serviceName: 'individual-prediction-service',
          operationName: 'regenerateSingleQuestion',
          sessionId: `regen-${questionId}-${Date.now()}`,
          modelName: MODEL_NAME,
          thinkingBudget: 10000,
          promptExcerpt: `Regenerating Q${questionId}: ${question.text.substring(0, 100)}`,
          userApiKey, // Pass user's API key if provided
        };

        const response = await callGeminiWithThinking(
          null,
          {
            contents: prompt,
            model: MODEL_NAME,
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  response: { type: Type.STRING, description: "Your natural response as the user" },
                  score: { type: Type.NUMBER, description: "Score from 1-6" },
                  confidence: { type: Type.NUMBER, description: "Confidence 0.0-1.0" }
                },
                required: ["response", "score", "confidence"]
              },
              thinkingConfig: { thinkingBudget: 10000 }
            }
          },
          thinkingParams
        );

        const responseText = response.text;
        if (responseText) {
          const parsedResponse = JSON.parse(responseText);
          const numericScore = Math.min(6, Math.max(1, Math.round(parsedResponse.score || 3)));
          const confidence = parsedResponse.confidence;
          const reasoning = parsedResponse.reasoning || '';
          const enhancedResponse = `${parsedResponse.response}${reasoning ? `\n\nReasoning: ${reasoning}` : ''}\n\nConfidence: ${confidence}`;

          rawAnswers[questionId] = numericScore;
          const updatedResponse = {
            questionId,
            questionText: question.text,
            response: enhancedResponse,
            score: numericScore,
            confidence
          };
          rawResponses.push(updatedResponse);
          allRawResponsesForDB[`q${questionId}`] = enhancedResponse;

          log(`Successfully regenerated Q${questionId} with score ${numericScore}`);
          
          // Notify progress: question completed successfully with the updated data
          if (onProgress) {
            onProgress({
              currentQuestion: i + 1,
              totalQuestions: questionIds.length,
              questionId,
              status: 'completed',
              updatedResponse
            });
          }
        }

        // Rate limit
        await new Promise(resolve => setTimeout(resolve, 6000));

      } catch (error) {
        log(`Error regenerating question ${questionId}: ${error instanceof Error ? error.message : String(error)}`, 'error');
        
        // Keep the error but with updated timestamp
        rawAnswers[questionId] = 3;
        const errorResponse = {
          questionId,
          questionText: question.text,
          response: `Error regenerating: ${error instanceof Error ? error.message : 'Unknown error'}`,
          score: 3
        };
        rawResponses.push(errorResponse);
        allRawResponsesForDB[`q${questionId}`] = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
        
        // Notify progress: question failed
        if (onProgress) {
          onProgress({
            currentQuestion: i + 1,
            totalQuestions: questionIds.length,
            questionId,
            status: 'error',
            updatedResponse: errorResponse
          });
        }
      }
    }

    // Sort responses by question ID
    rawResponses.sort((a, b) => a.questionId - b.questionId);

    // IMPORTANT: Save each question INDIVIDUALLY to prevent race conditions
    // When multiple regenerations run in parallel, each should only update its own question
    
    for (const questionId of questionIds) {
      if (rawAnswers[questionId] && allRawResponsesForDB[`q${questionId}`]) {
        try {
          // Step 1: Fetch current raw_responses from DB (to merge, not overwrite)
          const { data: currentData, error: fetchError } = await supabase
            .from('user_llm_individual_responses')
            .select('raw_responses')
            .eq('user_id', userId)
            .single();
          
          if (fetchError) {
            log(`Error fetching current data for Q${questionId}: ${fetchError.message}`, 'error');
            continue;
          }
          
          // Step 2: Merge the new response into existing raw_responses
          const updatedResponses = {
            ...(currentData?.raw_responses || {}),
            [`q${questionId}`]: allRawResponsesForDB[`q${questionId}`]
          };
          
          // Step 3: Update ONLY this question's score and the merged raw_responses
          const updateData: any = {
            [`q${questionId}`]: rawAnswers[questionId],
            raw_responses: updatedResponses,
            updated_at: new Date().toISOString()
          };
          
          const { error: updateError } = await supabase
            .from('user_llm_individual_responses')
            .update(updateData)
            .eq('user_id', userId);
          
          if (updateError) {
            log(`Error saving Q${questionId}: ${updateError.message}`, 'error');
          } else {
            log(`SUCCESS: Saved Q${questionId} with score ${rawAnswers[questionId]}`);
          }
        } catch (err) {
          log(`Exception saving Q${questionId}: ${err}`, 'error');
        }
      }
    }
    
    log(`Completed saving ${questionIds.length} regenerated questions`);

    const processedResults = processValueResults(rawAnswers);

    return {
      success: true,
      data: {
        processedResults,
        rawResponses,
        rawAnswers
      }
    };

  } catch (error) {
    log(`Regeneration failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}