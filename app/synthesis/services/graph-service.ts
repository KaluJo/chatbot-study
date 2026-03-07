import { createClient } from '@/utils/supabase/client';
import { Type } from "@google/genai";
import { v4 as uuidv4 } from 'uuid';
import {
    Topic,
    Context,
    ValueNode,
    Item,
    ChatWindow,
    TopicCandidate,
    TopicAction,
    TopicProcessingResult,
    ReasoningResult,
    GraphProcessingResult
} from './types';
import { formatConversation } from '@/app/utils/chat-formatting';
import { callGeminiWithThinking, ThinkingLogParams } from '@/app/utils/thinking-logger';

// Import our embedding service
import { findSimilarTopics as findSimilarTopicsWithEmbedding, storeTopicEmbedding } from './embedding-service';

// Import the new item service
import { extractSpecificItems, processItem, associateItemsWithValueNode, ItemCandidate } from './item-service';

// Import centralized model config
import { GEMINI_PRO } from '@/app/config/models';

// Define constants
const TOPIC_SIMILARITY_THRESHOLD = 0.6;
const CONFIDENCE_THRESHOLD = 0.75;
const MODEL_NAME = GEMINI_PRO;

// Add this after the fetchContexts function definition (around line 345)

// Global cache for context data
let contextCache: {
    contexts: Context[];
    lastFetched: number;
    descriptionsText: string;
} | null = null;

/**
 * Main process to analyze a chat window and generate value graph entities
 */
export async function processWindowForValueGraph(
    windowId: string,
    userId: string,
    logger?: (message: string, type?: 'info' | 'error' | 'warning') => void,
    userApiKey?: string
): Promise<{ success: boolean; data?: GraphProcessingResult; error?: string }> {
    const log = (message: string, type: 'info' | 'error' | 'warning' = 'info') => {
        if (logger) { logger(message, type); }
        if (type === 'error') console.error(message);
        else if (type === 'warning') console.warn(message);
        else console.log(message);
    };

    log(`[Graph Processing] Starting process for window ${windowId}`);

    try {
        const result: GraphProcessingResult = {
            topics_created: [],
            topics_updated: [],
            nodes_created: [],
            nodes_updated: [],
            items_created: [],
            items_updated: [],
            reasoning_results: [],
            discarded_topics: [],
            extracted_items: []
        };

        log(`[Graph Processing] Step 1: Fetching window data`);
        const windowResult = await fetchChatWindow(windowId);
        if (!windowResult.success || !windowResult.data) {
            return { success: false, error: windowResult.error || 'Failed to fetch chat window' };
        }
        const window = windowResult.data;
        log(`[Graph Processing] Window fetched successfully with ${window.chat_data.length} chat pairs and potential contexts: ${window.potential_contexts?.join(', ')}`);

        log(`[Graph Processing] Step 2: Fetching contexts with caching`);
        const contextResult = await getCachedContexts();
        if (!contextResult.success || !contextResult.data) {
            return { success: false, error: contextResult.error || 'Failed to fetch contexts from cache or database' };
        }

        const allDbContexts = contextResult.data;
        const dbContextMap = new Map<string, Context>();
        // Store contexts in a map for efficient lookup by name (case-insensitive)
        allDbContexts.forEach(c => dbContextMap.set(c.name.toLowerCase(), c));
        log(`[Graph Processing] Using ${allDbContexts.length} cached contexts for lookup`);

        // Get the context descriptions text for prompts
        const contextDescriptions = contextResult.descriptionsText;
        log(`[Graph Processing] Context descriptions prepared for prompts`);

        // Determine the actual contexts to process for this window
        let contextsToProcess: Context[] = [];
        if (window.potential_contexts && window.potential_contexts.length > 0) {
            window.potential_contexts.forEach(potentialContextName => {
                const foundContext = dbContextMap.get(potentialContextName.toLowerCase());
                if (foundContext) {
                    contextsToProcess.push(foundContext);
                } else {
                    log(`[Graph Processing] Potential context "${potentialContextName}" not found in database. It will be ignored.`, 'warning');
                }
            });
        } else {
            log(`[Graph Processing] No potential_contexts in window. Falling back to using top 2 global contexts.`, 'warning');
            // Fallback: if no potential_contexts, use a limited number of global contexts (e.g., first 2)
            // This maintains some functionality if potential_contexts are missing, but ideally they should be present.
            contextsToProcess = allDbContexts.slice(0, 2);
        }

        if (contextsToProcess.length === 0) {
            log(`[Graph Processing] No contexts identified for processing (either from potential_contexts or fallback). Exiting.`, 'error');
            return {
                success: false,
                error: 'Cannot generate value graph: No relevant contexts could be identified for this window.'
            };
        }
        log(`[Graph Processing] Will process with ${contextsToProcess.length} contexts: ${contextsToProcess.map(c => c.name).join(', ')}`);

        // 3. Step 1: Narrow down and process topics
        log(`[Graph Processing] Step 3: Narrowing down potential topics`);
        const narrowedTopicsResult = await narrowDownTopics(window, userId, logger, userApiKey);
        if (!narrowedTopicsResult.success || !narrowedTopicsResult.data) {
            log(`[Graph Processing] Error narrowing topics: ${narrowedTopicsResult.error}`, 'error');
            return { success: false, error: narrowedTopicsResult.error || 'Failed to narrow down topics' };
        }
        const narrowedTopics = narrowedTopicsResult.data;
        log(`[Graph Processing] Successfully narrowed down topics: ${narrowedTopics.map(t => `${t.label} (confidence: ${t.confidence.toFixed(2)})`).join(', ')}`);

        // EARLY EXIT: If no topics identified, can't generate a value graph
        if (narrowedTopics.length === 0) {
            log(`[Graph Processing] No topics identified, exiting early`);
            return {
                success: false,
                error: 'Cannot generate value graph: No relevant topics could be identified in this conversation.'
            };
        }

        // 4. Process each topic (check existing, decide action)
        log(`[Graph Processing] Step 4: Processing ${narrowedTopics.length} topics`);
        const topicProcessingResults: TopicProcessingResult[] = [];
        for (const topic of narrowedTopics) {
            log(`[Graph Processing] Processing topic: ${topic.label}`);
            const topicResult = await processTopic(topic, userId, logger, userApiKey);
            log(`[Graph Processing] Topic ${topic.label} processing result: ${topicResult.success ?
                `Action: ${topicResult.data?.action}, Reason: ${topicResult.data?.reasoning?.substring(0, 50)}...` :
                `Error: ${topicResult.error}`
                }`);

            if (topicResult.success && topicResult.data) {
                topicProcessingResults.push(topicResult.data);
            }
        }

        // EARLY EXIT: If all topics were discarded, can't generate a value graph
        const validTopics = topicProcessingResults.filter(t => t.action !== TopicAction.DISCARD);
        if (validTopics.length === 0) {
            log(`[Graph Processing] All topics were discarded, exiting early`);
            return {
                success: false,
                error: 'Cannot generate value graph: All potential topics were below the confidence threshold.'
            };
        }
        log(`[Graph Processing] Valid topics after processing: ${validTopics.length}`);

        // 4.5 NEW STEP: Identify and process specific items
        log(`[Graph Processing] Step 4.5: Extracting specific items from conversation`);
        const extractedItemsResult = await extractSpecificItems(window, userId, logger);

        let itemCandidates: ItemCandidate[] = [];
        let processedItems: Item[] = [];

        if (extractedItemsResult.success && extractedItemsResult.data && extractedItemsResult.data.length > 0) {
            itemCandidates = extractedItemsResult.data;
            log(`[Graph Processing] Successfully extracted ${itemCandidates.length} specific items`);

            // Process each item (find similar or create new)
            for (const itemCandidate of itemCandidates) {
                const itemResult = await processItem(itemCandidate, window.chat_ids, userId, logger);

                // Add successful item processing to results
                if (itemResult.success && itemResult.data) {
                    processedItems.push(itemResult.data);

                    // Track which items were created vs updated
                    if (itemResult.isNew) {
                        result.items_created.push(itemResult.data);
                    } else {
                        result.items_updated.push(itemResult.data);
                    }

                    // Add to extracted_items with item_id for UI display
                    result.extracted_items.push({
                        name: itemCandidate.name,
                        confidence: itemCandidate.confidence,
                        reasoning: itemCandidate.reasoning,
                        item_id: itemResult.data.id
                    });
                }
            }

            log(`[Graph Processing] Processed ${processedItems.length} items (${result.items_created.length} created, ${result.items_updated.length} updated)`);
        } else {
            log(`[Graph Processing] No specific items identified or error extracting items: ${extractedItemsResult.error || 'No items found'}`);
        }

        // 5. Step 2: Generate reasoning for topic-context combinations
        log(`[Graph Processing] Step 5: Generating reasoning for topic-context combinations using ${contextsToProcess.length} identified contexts.`);
        const reasoningResults: ReasoningResult[] = [];
        for (const topicResult of topicProcessingResults) {
            if (topicResult.action === TopicAction.DISCARD) {
                log(`[Graph Processing] Skipping discarded topic: ${topicResult.label}`);
                result.discarded_topics.push(topicResult.label);
                continue;
            }

            log(`[Graph Processing] Generating reasoning for topic ${topicResult.label} with contexts: ${contextsToProcess.map(c => c.name).join(', ')}`);

            for (const context of contextsToProcess) { // Iterate over filtered contexts
                log(`[Graph Processing] Processing topic-context pair: ${topicResult.label} - ${context.name}`);
                const reasoningResult = await generateReasoning(
                    topicResult.label,
                    context.name,
                    window,
                    contextDescriptions,
                    userId,
                    logger,
                    userApiKey
                );

                if (reasoningResult.success && reasoningResult.data) {
                    log(`[Graph Processing] Generated reasoning with confidence ${reasoningResult.data.confidence.toFixed(2)} and sentiment ${reasoningResult.data.sentiment} (${reasoningResult.data.sentiment_score})`);
                    if (reasoningResult.data.confidence >= CONFIDENCE_THRESHOLD && reasoningResult.data.sentiment_score !== 0) {
                        reasoningResults.push({
                            ...reasoningResult.data,
                            context_id: context.id // Use context.id here
                        });
                    } else {
                        log(`[Graph Processing] Reasoning below confidence threshold (${CONFIDENCE_THRESHOLD}) or has neutral sentiment (0), skipping`);
                    }
                } else if (!reasoningResult.success) {
                    log(`[Graph Processing] Error generating reasoning: ${reasoningResult.error}`, 'error');
                } else {
                    log(`[Graph Processing] No sufficient evidence found for this topic-context pair`);
                }
            }
        }

        // EARLY EXIT: If no valid reasoning could be generated
        if (reasoningResults.length === 0) {
            log(`[Graph Processing] No valid reasoning could be generated, exiting early`);
            return {
                success: false,
                error: 'Cannot generate value graph: No high-confidence reasoning could be generated for any topic-context pair.'
            };
        }
        log(`[Graph Processing] Generated ${reasoningResults.length} valid reasoning results`);

        // 6. Step 3: Implement database changes
        log(`[Graph Processing] Step 6: Implementing database changes`);

        // 6a. Create or update topics
        log(`[Graph Processing] Creating or updating topics`);
        for (const topicResult of topicProcessingResults) {
            if (topicResult.action === TopicAction.DISCARD) {
                continue;
            }

            // Find matching reasoning results
            const matchingReasoningResults = reasoningResults.filter(r =>
                r.topic.toLowerCase() === topicResult.label.toLowerCase()
            );

            // Only process topics that have at least one valid reasoning
            if (matchingReasoningResults.length === 0) {
                log(`[Graph Processing] No matching reasoning results for topic ${topicResult.label}, discarding`);
                result.discarded_topics.push(topicResult.label);
                continue;
            }

            // Create or update the topic
            log(`[Graph Processing] Executing DB action for topic ${topicResult.label}: ${topicResult.action}`);
            const topicDbResult = await executeTopicAction(topicResult, userId);
            if (!topicDbResult.success || !topicDbResult.data) {
                log(`[Graph Processing] Failed to process topic ${topicResult.label}: ${topicDbResult.error}`, 'error');
                continue;
            }

            // Add to results based on action
            if (topicResult.action === TopicAction.CREATE_NEW) {
                log(`[Graph Processing] Created new topic: ${topicDbResult.data.id} (${topicDbResult.data.label})`);
                result.topics_created.push(topicDbResult.data);
            } else {
                log(`[Graph Processing] Updated existing topic: ${topicDbResult.data.id} (${topicDbResult.data.label})`);
                result.topics_updated.push(topicDbResult.data);
            }

            // Update reasoning results with topic ID
            const topicId = topicDbResult.data.id;
            matchingReasoningResults.forEach(r => {
                r.topic_id = topicId;
            });
        }

        // 6b. Create value nodes for each valid reasoning result
        log(`[Graph Processing] Creating value nodes for ${reasoningResults.length} reasoning results`);
        for (const reasoningResult of reasoningResults) {
            // Skip if missing required IDs
            if (!reasoningResult.topic_id || !reasoningResult.context_id) {
                log(`[Graph Processing] Missing topic_id or context_id for reasoning result, skipping`);
                continue;
            }

            log(`[Graph Processing] Creating/updating value node for topic ${reasoningResult.topic} (${reasoningResult.topic_id}) with context ${reasoningResult.context} (${reasoningResult.context_id})`);

            // Find relevant items that might be associated with this topic-context pair
            // Determine which items are most relevant to this specific topic-context pair
            // This is a more sophisticated approach than simply using all extracted items 
            const allExtractedItems = processedItems.map(item => {
                return {
                    id: item.id,
                    name: item.name,
                    // Find the original extraction details with confidence and reasoning
                    details: result.extracted_items.find(extracted => extracted.item_id === item.id) || {
                        confidence: 0.7,
                        reasoning: "Item identified but details not available"
                    }
                };
            });

            // First use a quick rule-based filter to identify potentially relevant items
            const potentiallyRelevantItems = allExtractedItems.filter(item => {
                // Get the base confidence from extraction
                const baseConfidence = item.details.confidence || 0.7;

                // Skip very low-confidence items
                if (baseConfidence < 0.6) return false;

                // Quick string-based relevance check to filter obvious non-matches
                const topicMatch =
                    // Exact match
                    item.name.toLowerCase() === reasoningResult.topic.toLowerCase() ||
                    // Item name contains full topic as a word
                    item.name.toLowerCase().includes(` ${reasoningResult.topic.toLowerCase()} `) ||
                    item.name.toLowerCase().startsWith(`${reasoningResult.topic.toLowerCase()} `) ||
                    item.name.toLowerCase().endsWith(` ${reasoningResult.topic.toLowerCase()}`) ||
                    // Topic contains full item name as a word
                    reasoningResult.topic.toLowerCase().includes(` ${item.name.toLowerCase()} `) ||
                    reasoningResult.topic.toLowerCase().startsWith(`${item.name.toLowerCase()} `) ||
                    reasoningResult.topic.toLowerCase().endsWith(` ${item.name.toLowerCase()}`);

                if (topicMatch) return true;

                // Check if mentioned in reasoning
                if (reasoningResult.reasoning &&
                    reasoningResult.reasoning.toLowerCase().includes(item.name.toLowerCase())) {
                    return true;
                }

                // Check if mentioned in evidence
                if (reasoningResult.evidence) {
                    const allEvidence = [
                        ...(reasoningResult.evidence.llm_snippets || []),
                        ...(reasoningResult.evidence.human_snippets || [])
                    ].join(' ').toLowerCase();

                    if (allEvidence.includes(item.name.toLowerCase())) {
                        return true;
                    }
                }

                // If it passes all the quick checks but doesn't match any, let LLM decide
                // for borderline cases
                return baseConfidence > 0.85; // High confidence items get a chance with LLM check
            });

            log(`[Graph Processing] Found ${potentiallyRelevantItems.length} potentially relevant items for topic "${reasoningResult.topic}" in context "${reasoningResult.context}"`);

            // Use LLM to check relevance of each potentially relevant item
            const relevantItemIds: string[] = [];
            const llmRelevanceResults: {
                itemId: string;
                itemName: string;
                relevant: boolean;
                confidence: number;
                explanation: string;
            }[] = [];

            // Process each potentially relevant item with the LLM
            for (const item of potentiallyRelevantItems) {
                log(`[Graph Processing] Checking relevance of item "${item.name}" to topic "${reasoningResult.topic}" with LLM`);

                const relevanceResult = await checkItemRelevanceWithLLM(
                    { id: item.id, name: item.name },
                    reasoningResult.topic,
                    reasoningResult.context,
                    window,
                    reasoningResult,
                    userId,
                    logger,
                    userApiKey
                );

                // Store result for logging
                llmRelevanceResults.push({
                    itemId: item.id,
                    itemName: item.name,
                    ...relevanceResult
                });

                // Add to relevant items if LLM says it's relevant with good confidence
                if (relevanceResult.relevant && relevanceResult.confidence >= 0.8) {
                    relevantItemIds.push(item.id);
                }
            }

            // Log the results of LLM relevance checks
            if (llmRelevanceResults.length > 0) {
                log(`[Graph Processing] LLM relevance check results for topic "${reasoningResult.topic}" in context "${reasoningResult.context}":`);

                llmRelevanceResults.forEach(result => {
                    const relevanceStatus = result.relevant ? "RELEVANT" : "NOT RELEVANT";
                    log(`[Graph Processing] - "${result.itemName}": ${relevanceStatus} (confidence: ${result.confidence.toFixed(2)})`);
                    log(`[Graph Processing]   Explanation: ${result.explanation.substring(0, 100)}...`);
                });

                log(`[Graph Processing] Final result: ${relevantItemIds.length} out of ${potentiallyRelevantItems.length} items are truly relevant`);
            } else {
                log(`[Graph Processing] No items found with potential relevance to topic "${reasoningResult.topic}" in context "${reasoningResult.context}"`);
            }

            // Step 1: Create or update the value node
            const nodeResult = await createOrUpdateValueNode(
                reasoningResult,
                window.chat_ids,
                userId,
                relevantItemIds, // Pass the filtered relevant item IDs
                logger
            );

            if (nodeResult.success && nodeResult.data) {
                if (nodeResult.isNew) {
                    log(`[Graph Processing] Created new value node: ${nodeResult.data.id}`);
                    result.nodes_created.push(nodeResult.data);
                } else {
                    log(`[Graph Processing] Updated existing value node: ${nodeResult.data.id}`);
                    result.nodes_updated.push(nodeResult.data);
                }

                // Step 2: Double-check item associations
                // This ensures any edge cases are handled
                if (relevantItemIds.length > 0) {
                    log(`[Graph Processing] Ensuring ${relevantItemIds.length} items are associated with node ${nodeResult.data.id}`);
                    const associationResult = await associateItemsWithValueNode(
                        nodeResult.data.id,
                        relevantItemIds,
                        logger
                    );

                    if (!associationResult.success) {
                        log(`[Graph Processing] Error associating items with node: ${associationResult.error}`, 'error');
                    }
                }
            } else {
                log(`[Graph Processing] Error creating/updating value node: ${nodeResult.error}`, 'error');
            }
        }

        // Add reasoning results to the output
        result.reasoning_results = reasoningResults;

        log(`[Graph Processing] COMPLETE: Created ${result.topics_created.length} topics, updated ${result.topics_updated.length} topics, created ${result.nodes_created.length} nodes, updated ${result.nodes_updated.length} nodes, created/updated ${result.items_created.length + result.items_updated.length} items, discarded ${result.discarded_topics.length} topics`);
        return {
            success: true,
            data: result
        };

    } catch (error) {
        log(`Error processing window for value graph: ${error instanceof Error ? error.message : String(error)}`, 'error');
        return {
            success: false,
            error: error instanceof Error ? error.message : 'An unknown error occurred'
        };
    }
}

/**
 * Fetch a chat window by ID
 */
async function fetchChatWindow(windowId: string): Promise<{ success: boolean; data?: ChatWindow; error?: string }> {
    try {
        const supabase = createClient();
        const { data, error } = await supabase
            .from('chat_windows')
            .select('*')
            .eq('id', windowId)
            .single();

        if (error) throw error;
        if (!data) return { success: false, error: `Window with ID ${windowId} not found` };

        return { success: true, data: data as ChatWindow };
    } catch (error) {
        console.error('Error fetching chat window:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'An unknown error occurred'
        };
    }
}

/**
 * Fetch all available contexts
 */
async function fetchContexts(): Promise<{ success: boolean; data?: Context[]; error?: string }> {
    try {
        const supabase = createClient();
        const { data, error } = await supabase
            .from('contexts')
            .select('*')
            .order('name', { ascending: true });

        if (error) throw error;
        return { success: true, data: data as Context[] || [] };
    } catch (error) {
        console.error('Error fetching contexts:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'An unknown error occurred'
        };
    }
}

// --- STEP 1: TOPIC PROCESSING ---

/**
 * Helper function to retry API calls with exponential backoff
 */
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

/**
 * Narrow down potential topics from a chat window to the most relevant ones
 */
async function narrowDownTopics(
    window: ChatWindow,
    userId: string,
    logger?: (message: string, type?: 'info' | 'error' | 'warning') => void,
    userApiKey?: string
): Promise<{ success: boolean; data?: TopicCandidate[]; error?: string }> {
    // Create a local log function
    const log = (message: string, type: 'info' | 'error' | 'warning' = 'info') => {
        // First log to the UI if callback is provided
        if (logger) {
            logger(message, type);
        }

        // Then log to console
        if (type === 'error') {
            console.error(message);
        } else if (type === 'warning') {
            console.warn(message);
        } else {
            console.log(message);
        }
    };

    log(`[Topic Narrowing] Starting topic narrowing from potential topics: ${window.potential_topics.join(', ')}`);
    try {

        // Format the conversation using our utility function
        const conversationText = formatConversation(window.chat_data, 'ai-human');

        // Build the potential topics string
        const potentialTopicsText = window.potential_topics.length > 0
            ? window.potential_topics.join(', ')
            : "No potential topics were previously identified";

        log(`[Topic Narrowing] Using ${window.chat_data.length} exchanges and ${window.potential_topics.length} potential topics`);

        const prompt = `You are an expert at identifying underlying values and meaningful categories from conversations.

Analyze this conversation and identify up to 2 significant topics:

CONVERSATION:
${conversationText}

PREVIOUSLY IDENTIFIED POTENTIAL TOPICS:
${potentialTopicsText}

INSTRUCTIONS:
1. CHOOSE THE RIGHT ABSTRACTION LEVEL FOR TOPICS:
   - General categories make better topics than specific instances:
     ✓ "coffee" is a good topic (when discussed generally)
     ✗ "iced cold brew" is too specific (should be an item, not a topic)
     
   - Activities and routines can be valid topics:
     ✓ "café visits" or "morning routine" can be topics (if central to conversation)
     ✗ "Wilson Café" might be too specific (if Wilson Café is the topic of the conversation, then it could be the topic, but if it's just a place someone has coffee, then it's an item)

   - Technical domains should be captured at appropriate levels:
     ✓ "machine learning" or "programming" are good topics
     ✗ "Python 3.10" is too specific (should be an item)
     ✗ "technology" is too broad (unless nothing more specific is discussed)

2. FORMAT TOPIC LABELS CLEANLY:
   - Use simple, clear nouns or noun phrases
   - NEVER use slashes in topic names (e.g., "coffee/drinks" is incorrect)
   - If two concepts seem related but distinct, choose the more dominant one
   - Keep topics concise (1-3 words maximum)
   - Use lowercase for all topics
   
   INCORRECT: "coffee/drinks", "project planning/schedule", "food & beverages"
   CORRECT: "coffee", "project planning", "food"

3. PRIORITIZE EXPLICIT topics directly mentioned in the conversation over abstract values.
   For example:
   - If they discuss "coffee" or "café culture" → use these as topics
   - If they talk about "programming languages" → use this specific domain
   - If a specific activity like "café visits" is central → use this as a topic

4. CONSIDER TOPICS FROM BOTH SIDES of the conversation:
   - Topics can be introduced by either the question asker or the answerer
   - Example: "What did you think of the LLMs paper?" + "It was interesting" → "LLMs" is a valid topic
   - Example: "How was your morning?" + "I spent it coding" → Both "morning routine" and "coding" are valid

5. GENERAL vs. SPECIFIC: Always choose the most natural level of abstraction based on what's actually discussed:
   - Too general: "beverages" when they specifically discuss "coffee"
   - Too specific: "iced cold brew at Wilson Café" when "coffee preferences" is more appropriate
   - Just right: "coffee" when they discuss coffee generally, or "café experiences" when discussing café visits

6. BE EXTREMELY SELECTIVE WITH TOPICS:
   - Only select topics that are genuinely important in the conversation
   - If a topic is merely mentioned but not developed, DO NOT include it
   - Focus on topics where there's enough context to determine sentiment and importance
   - Topics should represent areas where the person shows emotional investment (positive or negative)

7. FOCUS ON SUBSTANTIVE VALUE-RELATED TOPICS:
   - Prioritize topics related to personal values (what matters to the person)
   - Good examples: "learning", "work-life balance", "technology ethics", "creative expression"
   - Avoid shallow or transient topics with little connection to deeper values
   - Seek topics that reveal something meaningful about the person's priorities

8. ALSO identify IMPLICIT VALUES by examining HOW they respond:
   Implicit values can be inferred from:
   - Brevity or dismissiveness ("idk", "whatever", "doesn't matter")
   - Tone ("that's AMAZING" vs "it's fine I guess")
   - Level of detail (detailed response vs. minimal response)
   - Deflection or changing the subject

   Examples of extracting IMPLICIT VALUES:
   - Q: "Walk me through your outfit today" A: "idk, pants?"
     ✓ Topic: "fashion" (introduced by question)
     ✓ Implicit value: NEGATIVE attitude toward fashion (demonstrated by dismissiveness)

   - Q: "What did you think of the lecture?" A: "I couldn't stop taking notes! The professor had so many insights!"
     ✓ Topic: "lectures" (introduced by question), perhaps naturally in the next part of the conversation there is a mention of what specific class it is and that can be a more concrete topic
     ✓ Implicit value: STRONG POSITIVE (enthusiasm, detailed response)

9. For each identified topic, provide:
   - A clear label (single word or short phrase)
   - A confidence score (0-1) indicating how strongly this topic is expressed
   - Brief reasoning explaining the evidence for this topic

IMPORTANT: Choose the most appropriate abstraction level for topics - not too general, not too specific. The goal is to identify topics that accurately represent what was discussed at a level that meaningfully captures the conversation. Quality over quantity - it's better to have 1 strong topic than 2 weak ones.`;

        try {
            const thinkingParams: ThinkingLogParams = {
                userId,
                serviceName: 'graph-service',
                operationName: 'narrowDownTopics',
                windowId: window.id,
                modelName: MODEL_NAME,
                thinkingBudget: 10000,
                promptExcerpt: prompt.substring(0, 500),
                userApiKey
            };

            const response = await withRetry(async () => {
                return callGeminiWithThinking(
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
                                        label: { type: Type.STRING },
                                        confidence: { type: Type.NUMBER },
                                        reasoning: { type: Type.STRING }
                                    },
                                    required: ["label", "confidence", "reasoning"]
                                }
                            },
                            thinkingConfig: {
                                thinkingBudget: 10000,
                            }
                        }
                    },
                    thinkingParams,
                    logger
                );
            });

            const responseText = response.text;
            if (!responseText) {
                console.error('[Topic Narrowing] Empty response from AI');
                return { success: false, error: 'Empty response from AI' };
            }

            try {
                const parsedData = JSON.parse(responseText) as TopicCandidate[];

                // Log detailed information about narrowed topics
                console.log(`[Topic Narrowing] Narrowed down to ${parsedData.length} topics`);
                parsedData.forEach((topic, i) => {
                    console.log(`[Topic Narrowing] Topic ${i + 1}: "${topic.label}" (confidence: ${topic.confidence.toFixed(2)})`);
                    console.log(`[Topic Narrowing] Reasoning: ${topic.reasoning.substring(0, 150)}...`);
                });

                return { success: true, data: parsedData };
            } catch (parseError) {
                console.error('[Topic Narrowing] Error parsing AI response:', parseError);
                console.log('[Topic Narrowing] Raw response:', responseText);
                return { success: false, error: 'Failed to parse AI response' };
            }
        } catch (apiError) {
            // If API is completely unavailable after retries, use the potential_topics from the window
            console.error('[Topic Narrowing] Gemini API unavailable after multiple retries:', apiError);

            // Create fallback topic candidates from the existing potential_topics
            if (window.potential_topics && window.potential_topics.length > 0) {
                const fallbackTopics = window.potential_topics.slice(0, 2).map(topic => ({
                    label: topic,
                    confidence: 0.8,
                    reasoning: `Using existing potential topic due to API unavailability.`
                }));

                console.log(`[Topic Narrowing] Using ${fallbackTopics.length} fallback topics from potential_topics due to API error`);
                return { success: true, data: fallbackTopics };
            } else {
                console.error('[Topic Narrowing] No potential topics available for fallback');
                return {
                    success: false,
                    error: 'Unable to narrow down topics due to API unavailability and no existing potential topics.'
                };
            }
        }
    } catch (error) {
        console.error('[Topic Narrowing] Error narrowing down topics:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'An unknown error occurred'
        };
    }
}

/**
 * Process a topic by checking if it exists and deciding what action to take
 */
async function processTopic(
    topicCandidate: TopicCandidate,
    userId: string,
    logger?: (message: string, type?: 'info' | 'error' | 'warning') => void,
    userApiKey?: string
): Promise<{ success: boolean; data?: TopicProcessingResult; error?: string }> {
    // Create a local log function
    const log = (message: string, type: 'info' | 'error' | 'warning' = 'info') => {
        // First log to the UI if callback is provided
        if (logger) {
            logger(message, type);
        }

        // Then log to console
        if (type === 'error') {
            console.error(message);
        } else if (type === 'warning') {
            console.warn(message);
        } else {
            console.log(message);
        }
    };

    try {
        // Normalize the topic label - remove slashes and clean up format
        const normalizedLabel = normalizeTopicLabel(topicCandidate.label);
        if (normalizedLabel !== topicCandidate.label) {
            log(`[Topic Processing] Normalized topic label: "${topicCandidate.label}" → "${normalizedLabel}"`, 'info');
            topicCandidate.label = normalizedLabel;
        }

        log(`[Topic Processing] Processing topic "${topicCandidate.label}" with confidence ${topicCandidate.confidence}`);

        // If confidence is too low, discard the topic
        if (topicCandidate.confidence < CONFIDENCE_THRESHOLD) {
            log(`[Topic Processing] Topic "${topicCandidate.label}" has confidence ${topicCandidate.confidence} below threshold ${CONFIDENCE_THRESHOLD}, discarding`);
            return {
                success: true,
                data: {
                    label: topicCandidate.label,
                    action: TopicAction.DISCARD,
                    reasoning: `Confidence score ${topicCandidate.confidence} is below threshold ${CONFIDENCE_THRESHOLD}`,
                    confidence: topicCandidate.confidence
                }
            };
        }

        // Search for similar topics using our embedding service
        log(`[Topic Processing] Searching for similar topics to "${topicCandidate.label}" for user ${userId}`);
        const similarTopics = await findSimilarTopicsWithEmbedding(
            topicCandidate.label,
            userId,
            TOPIC_SIMILARITY_THRESHOLD
        );

        if (!similarTopics) {
            log(`[Topic Processing] Error in similarity search for topic "${topicCandidate.label}", creating new topic as fallback`);
            return {
                success: true,
                data: {
                    label: topicCandidate.label,
                    action: TopicAction.CREATE_NEW,
                    reasoning: `No similar topics found or error in similarity search. Creating new topic.`,
                    confidence: topicCandidate.confidence
                }
            };
        }

        // Log the similar topics found
        log(`[Topic Processing] Found ${similarTopics.length} similar topics for "${topicCandidate.label}"`);
        if (similarTopics.length > 0) {
            similarTopics.forEach((topic, i) => {
                log(`[Topic Processing] Similar topic ${i + 1}: "${topic.label}" with similarity ${topic.similarity.toFixed(3)}`);
            });
        }

        // If no similar topics found, create new topic
        if (similarTopics.length === 0) {
            log(`[Topic Processing] No similar topics found for "${topicCandidate.label}", creating new topic`);
            return {
                success: true,
                data: {
                    label: topicCandidate.label,
                    action: TopicAction.CREATE_NEW,
                    reasoning: `No similar topics found. Creating new topic.`,
                    confidence: topicCandidate.confidence
                }
            };
        }

        // Found similar topics, decide whether to merge or create new
        const mostSimilarTopic = similarTopics[0];

        // If very similar, decide whether to replace main label or add as related label
        if (mostSimilarTopic.similarity >= TOPIC_SIMILARITY_THRESHOLD) {
            log(`[Topic Processing] Most similar topic "${mostSimilarTopic.label}" has similarity ${mostSimilarTopic.similarity} above threshold ${TOPIC_SIMILARITY_THRESHOLD}`);

            const labelDecisionResult = await decideLabelPlacement(
                mostSimilarTopic.label,
                mostSimilarTopic.related_labels || [],
                topicCandidate.label,
                userId,
                userApiKey
            );

            if (!labelDecisionResult.success || !labelDecisionResult.data) {
                log(`[Topic Processing] Error in label decision: ${labelDecisionResult.error}`, 'error');
                return { success: false, error: labelDecisionResult.error };
            }

            log(`[Topic Processing] Label decision for "${topicCandidate.label}": ${labelDecisionResult.data.shouldReplaceMainLabel ? 'REPLACE main label' : 'ADD as related label'}`);

            return {
                success: true,
                data: {
                    label: topicCandidate.label,
                    action: TopicAction.MERGE_WITH_EXISTING,
                    existingTopicId: mostSimilarTopic.id,
                    shouldReplaceMainLabel: labelDecisionResult.data.shouldReplaceMainLabel,
                    reasoning: labelDecisionResult.data.reasoning,
                    confidence: topicCandidate.confidence
                }
            };
        }

        // Similar but not enough to merge, create new topic
        log(`[Topic Processing] Most similar topic "${mostSimilarTopic.label}" has similarity ${mostSimilarTopic.similarity} below threshold ${TOPIC_SIMILARITY_THRESHOLD}, creating new topic`);
        return {
            success: true,
            data: {
                label: topicCandidate.label,
                action: TopicAction.CREATE_NEW,
                reasoning: `Similar topic "${mostSimilarTopic.label}" found with similarity ${mostSimilarTopic.similarity}, but below threshold for merging.`,
                confidence: topicCandidate.confidence
            }
        };
    } catch (error) {
        log(`[Topic Processing] Error: ${error instanceof Error ? error.message : String(error)}`, 'error');
        return {
            success: false,
            error: error instanceof Error ? error.message : 'An unknown error occurred'
        };
    }
}

/**
 * Decide whether a new label should replace an existing main label
 */
async function decideLabelPlacement(
    existingLabel: string,
    relatedLabels: string[],
    newLabel: string,
    userId?: string,
    userApiKey?: string
): Promise<{ success: boolean; data?: { shouldReplaceMainLabel: boolean; reasoning: string }; error?: string }> {
    try {
        // Ensure relatedLabels is always an array
        const safeRelatedLabels = relatedLabels || [];

        const prompt = `You are an expert at organizing human values and topics into meaningful hierarchies.

You need to decide how to handle two semantically related topics for a value graph:

Existing topic:
- Main label: "${existingLabel}"
- Related labels: ${safeRelatedLabels.length > 0 ? safeRelatedLabels.map(l => `"${l}"`).join(', ') : "none"}

New topic to consider: "${newLabel}"

Your task is to decide whether the new label should REPLACE the current main label or be ADDED as a related label.

PRIORITIZATION PRINCIPLES:
1. Value Categories > Specific Instances
   - "friendship" is better as a main label than "friend John" or "coffee with friends"
   - "learning" is better as a main label than "reading books" or "online course"

2. Abstraction > Concrete Activities
   - "personal growth" is better as a main label than "meditation" or "journaling"
   - "professional achievement" is better as a main label than "deadlines" or "projects"

3. Core Values > Manifestations
   - "creativity" is better as a main label than "painting" or "writing"
   - "wellbeing" is better as a main label than "exercise" or "nutrition"

4. General > Specific (for equally abstract concepts)
   - "relationships" is better as a main label than "friendship" (if both are equally abstract)
   - "learning" is better as a main label than "skill development" (if both are equally abstract)

5. Common Usage > Technical Terms
   - Use the more widely understood term as the main label when both are valid

EXAMPLES:
- "friendship" should be the main label, with "social connection", "friend John", "coffee with Sarah" as related labels
- "learning" should be the main label, with "books", "courses", "education" as related labels
- "wellbeing" should be the main label, with "exercise", "meditation", "health" as related labels

DECISION OUTPUT:
Provide your decision on whether the new label should replace the current main label, along with clear reasoning based on the principles above.`;

        const thinkingParams: ThinkingLogParams = {
            userId,
            serviceName: 'graph-service',
            operationName: 'decideLabelPlacement',
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
                        type: Type.OBJECT,
                        properties: {
                            shouldReplaceMainLabel: { type: Type.BOOLEAN },
                            reasoning: { type: Type.STRING }
                        },
                        required: ["shouldReplaceMainLabel", "reasoning"]
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
            return { success: false, error: 'Empty response from AI' };
        }

        try {
            const decision = JSON.parse(responseText);
            return { success: true, data: decision };
        } catch (parseError) {
            console.error('Error parsing AI response:', parseError);
            return { success: false, error: 'Failed to parse AI response' };
        }
    } catch (error) {
        console.error('Error deciding label placement:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'An unknown error occurred'
        };
    }
}

/**
 * Normalize a topic label by removing slashes, fixing format, etc.
 */
function normalizeTopicLabel(label: string): string {
    // Convert to lowercase
    let normalized = label.toLowerCase().trim();

    // Replace slashes with spaces
    normalized = normalized.replace(/\/+/g, ' ');

    // Replace ampersands with 'and'
    normalized = normalized.replace(/\s*&\s*/g, ' and ');

    // Remove special characters and extra whitespace
    normalized = normalized.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();

    return normalized;
}

// --- STEP 2: REASONING ---

/**
 * Generate reasoning for a topic-context pair
 */
async function generateReasoning(
    topicLabel: string,
    contextName: string,
    window: ChatWindow,
    contextDescriptions: string = '',
    userId: string,
    logger?: (message: string, type?: 'info' | 'error' | 'warning') => void,
    userApiKey?: string
): Promise<{ success: boolean; data?: ReasoningResult; error?: string }> {
    // Create a local log function
    const log = (message: string, type: 'info' | 'error' | 'warning' = 'info') => {
        // First log to the UI if callback is provided
        if (logger) {
            logger(message, type);
        }

        // Then log to console
        if (type === 'error') {
            console.error(message);
        } else if (type === 'warning') {
            console.warn(message);
        } else {
            console.log(message);
        }
    };

    log(`[Reasoning] Generating reasoning for topic "${topicLabel}" in context "${contextName}"`);
    try {

        // Format the conversation using our utility function
        const conversationText = formatConversation(window.chat_data, 'ai-human');

        // Get other potential topics and contexts from the window for comparative analysis
        const allPotentialTopics = window.potential_topics || [];
        const allPotentialContexts = window.potential_contexts || [];

        // Create sections for the prompt that inform about other potential topics/contexts
        const otherTopicsSection = allPotentialTopics.length > 0 ?
            `OTHER POTENTIAL TOPICS BEING CONSIDERED:\n${allPotentialTopics.join(', ')}` :
            "No other potential topics identified.";

        const otherContextsSection = allPotentialContexts.length > 0 ?
            `OTHER POTENTIAL CONTEXTS BEING CONSIDERED:\n${allPotentialContexts.join(', ')}` :
            "No other potential contexts identified.";

        log(`[Reasoning] Analyzing conversation with ${window.chat_data.length} exchanges`);

        const prompt = `You are an expert at analyzing conversations to identify how values and topics connect meaningfully to different life contexts.

Analyze this conversation to determine if and how the topic of "${topicLabel}" relates to the context of "${contextName}".

For reference, here are the contexts with their descriptions:
${contextDescriptions}

CONVERSATION:
${conversationText}

COMPARATIVE ANALYSIS INFORMATION:
${otherTopicsSection}
${otherContextsSection}

Your task is to:

1. Carefully assess if there is a GENUINE CONNECTION between the topic "${topicLabel}" and the context "${contextName}" based on this conversation.

2. IMPORTANT: NOT ALL topic-context pairs will have sufficient evidence. You should be HIGHLY SELECTIVE and only report connections that are STRONGLY supported by the conversation. 

3. PERFORM COMPARATIVE ANALYSIS: Consider if the topic "${topicLabel}" has STRONGER connections to other contexts in the list above, or if there are other topics that have STRONGER connections to the context "${contextName}".
   - If you believe there's a much stronger topic-context pairing available, reduce your confidence in this specific pair.
   - If this is clearly the strongest, most natural pairing among all possibilities, increase your confidence.

4. A genuine connection exists ONLY when:
   - The person EXPLICITLY or IMPLICITLY connects the topic to this context with clear evidence
   - The topic is discussed in a way that DIRECTLY relates to this context domain
   - There is a strong, logical, and meaningful relationship (not just coincidental mentions)
   - The connection appears in EITHER questions OR answers (both sides of conversation matter)
   - This context is the PRIMARY or one of the PRIMARY contexts for this topic (not peripheral)

5. Examples of WEAK connections that should be REJECTED:
   - Topic "coffee" in Context "People" when someone only mentions "trying coffee my friend suggested"
   - Topic "café visit" in Context "Lifestyle" when someone only mentions going to a café once
   - Topic "morning routine" in Context "Work" when work isn't explicitly discussed
   - Any connection that requires significant inference or assumption
   - Any connection where the sentiment appears neutral (neither positive nor negative)
   - Any connection where the topic would CLEARLY fit much better in a different context

6. Examples of STRONG connections that should be ACCEPTED:
   - Topic "machine learning" in Context "Work" when directly discussing ML projects at work
   - Topic "coffee" in Context "Lifestyle" when discussing daily coffee habits or preferences for their morning routine
   - Topic "programming languages" in Context "Education" when explicitly talking about learning them

7. CONSIDERATIONS FOR ABSTRACTION LEVEL:
   - General categories like "coffee" should typically connect to broader contexts like "Lifestyle" unless mentioned for other contexts such as if they are a barista, it is valid under the context "Work"
   - Specific instances like "cold brew at Wilson Café" are less likely to form meaningful context connections
   - Activities that occur in a setting (like "café visit") may connect to "People" only if the social aspect is central

8. Analyze response patterns for implicit attitudes:
   - Brevity or dismissiveness suggests negative/low importance
   - Detailed, enthusiastic responses suggest high importance
   - Deflection or changing the subject may indicate discomfort or disinterest
   - Level of technical detail often indicates expertise and investment in a topic

9. MAINTAIN CONTEXT COHERENCE: Give higher confidence to connections that respect the core meaning of the context. For example:
   - Work context should be about professional activities, career, workplace
   - Education context should be about learning, academic pursuits, skill development 
   - Leisure context should be about recreation, hobbies, free time activities
   - Culture context should be about arts, customs, identity, heritage

10. If a GENUINE CONNECTION exists (set a high bar!), complete this template:
   "In the context of {${contextName}}, the topic of {${topicLabel}} appears to be {SENTIMENT ADJECTIVE} to the person because {EVIDENCE-BASED REASONING}. The specific exchanges that demonstrate this connection are {QUOTE RELEVANT EXCHANGES}."

11. The sentiment adjective should capture how the person feels about this topic specifically within this context (e.g., "important", "fulfilling", "stressful", "meaningful", etc.)

12. On a scale from -7 to +7, assign a sentiment score where:
   - -7 to -5: Strong negative sentiment (e.g., "deeply frustrating")
   - -4 to -1: Mild negative sentiment (e.g., "somewhat concerning")
   - 0: Neutral or ambivalent (e.g., "necessary") - AVOID THIS SCORE WHEN POSSIBLE
   - +1 to +4: Mild positive sentiment (e.g., "enjoyable")
   - +5 to +7: Strong positive sentiment (e.g., "deeply fulfilling")

   IMPORTANT: You MUST provide a clear non-zero sentiment score for any connection you report.
   If you cannot determine a meaningful non-zero sentiment, report "insufficient evidence" instead.
   The sentiment score is critical for database integrity and MUST NOT be left blank or null.

   Remember: Sentiments are often implicitly derived. The user may explain sentiment based on their tone or underlying context about something. Identify sarcasm when present and take into account how they describe a given topic under a given context.

13. For confidence scores:
   - Only assign 0.85+ confidence when there is EXPLICIT, DIRECT, or SUFFICIENTLY IMPLICIT evidence AND this context is clearly the primary context for this topic
   - Assign 0.6-0.75 when there is good but not overwhelming evidence OR when this topic likely has stronger connections to other contexts
   - If this topic appears to have a much stronger connection to a different context than "${contextName}", significantly reduce your confidence score (0.6 or lower)
   - If another topic in the potential topics list has a much stronger connection to this context, reduce your confidence score
   - For anything below 0.6, report "insufficient evidence" instead

CRITICAL: 
- Do NOT force connections that aren't clearly supported by the conversation.
- AVOID neutral sentiment scores (0) - either find a meaningful positive/negative sentiment or report "insufficient evidence".
- Better to have fewer high-quality connections than many weak ones.
- Remember to compare the current topic-context pair with other potential pairings to assign accurate confidence scores.`;

        // Try to call the API with retry logic
        try {
            const thinkingParams: ThinkingLogParams = {
                userId,
                serviceName: 'graph-service',
                operationName: 'generateReasoning',
                windowId: window.id,
                modelName: MODEL_NAME,
                thinkingBudget: 10000,
                promptExcerpt: prompt.substring(0, 500),
                userApiKey
            };

            const response = await withRetry(async () => {
                return callGeminiWithThinking(
                    null,
                    {
                        model: MODEL_NAME,
                        contents: prompt,
                        config: {
                            responseMimeType: "application/json",
                            responseSchema: {
                                type: Type.OBJECT,
                                properties: {
                                    hasSufficientEvidence: { type: Type.BOOLEAN },
                                    sentiment: { type: Type.STRING, description: "Adjective describing user's feeling (if evidence exists)" },
                                    sentiment_score: { type: Type.INTEGER, description: "Score from -7 to +7 (if evidence exists)" },
                                    evidence: {
                                        type: Type.OBJECT,
                                        properties: {
                                            llm_snippets: { type: Type.ARRAY, items: { type: Type.STRING } },
                                            human_snippets: { type: Type.ARRAY, items: { type: Type.STRING } }
                                        }
                                    },
                                    reasoning: { type: Type.STRING },
                                    confidence: { type: Type.NUMBER, description: "0-1 score of confidence in this analysis" }
                                },
                                required: ["hasSufficientEvidence", "reasoning", "confidence"]
                            },
                            thinkingConfig: {
                                thinkingBudget: 10000,
                            }
                        }
                    },
                    thinkingParams,
                    logger
                );
            });

            const responseText = response.text;
            if (!responseText) {
                console.error('[Reasoning] Empty response from AI');
                return { success: false, error: 'Empty response from AI' };
            }

            try {
                const result = JSON.parse(responseText);

                // Log the full result for debugging
                console.log(`[Reasoning] Raw result for ${topicLabel}-${contextName}:`,
                    JSON.stringify({
                        hasSufficientEvidence: result.hasSufficientEvidence,
                        confidence: result.confidence,
                        sentiment: result.sentiment,
                        sentiment_score: result.sentiment_score,
                        reasoning: result.reasoning?.substring(0, 100) + '...'
                    }, null, 0)
                );

                // If no sufficient evidence, log reason and return success but with no data
                if (!result.hasSufficientEvidence) {
                    console.log(`[Reasoning] No sufficient evidence found for topic "${topicLabel}" in context "${contextName}". Confidence: ${result.confidence?.toFixed(2) || 'N/A'}`);
                    console.log(`[Reasoning] Explanation: ${result.reasoning?.substring(0, 150)}...`);
                    return { success: true };
                }

                // Log full details when we have evidence
                console.log(`[Reasoning] Found evidence for topic "${topicLabel}" in context "${contextName}"`);
                console.log(`[Reasoning] Sentiment: ${result.sentiment} (${result.sentiment_score})`);
                console.log(`[Reasoning] Confidence: ${result.confidence}`);
                console.log(`[Reasoning] Reasoning: ${result.reasoning?.substring(0, 200)}...`);

                if (result.confidence < CONFIDENCE_THRESHOLD) {
                    console.log(`[Reasoning] Confidence ${result.confidence.toFixed(2)} below threshold ${CONFIDENCE_THRESHOLD}, skipping`);
                }

                // Otherwise, construct the reasoning result
                return {
                    success: true,
                    data: {
                        topic: topicLabel,
                        topic_id: '', // To be filled in later
                        context: contextName,
                        context_id: '', // To be filled in later
                        sentiment: result.sentiment || "moderately important", // Fallback sentiment if missing
                        sentiment_score: typeof result.sentiment_score === 'number' ? result.sentiment_score :
                            (result.sentiment?.includes("negative") ? -2 : 2), // Fallback score based on sentiment or default to slightly positive
                        evidence: {
                            // Map questions/answers to the new property names for consistency
                            llm_snippets: result.evidence?.llm_snippets || [],
                            human_snippets: result.evidence?.human_snippets || []
                        },
                        reasoning: result.reasoning,
                        confidence: result.confidence
                    }
                };
            } catch (parseError) {
                console.error('[Reasoning] Error parsing AI response:', parseError);
                console.log('[Reasoning] Raw response text:', responseText);
                return { success: false, error: 'Failed to parse AI response' };
            }
        } catch (apiError) {
            // If API is completely unavailable after retries, return a fallback response
            console.error('[Reasoning] Gemini API unavailable after multiple retries:', apiError);
            return {
                success: true,
                data: {
                    topic: topicLabel,
                    topic_id: '',
                    context: contextName,
                    context_id: '',
                    sentiment: "neutral",
                    sentiment_score: 0,
                    evidence: {
                        llm_snippets: [],
                        human_snippets: []
                    },
                    reasoning: `Unable to analyze due to API unavailability. Using fallback neutral sentiment for topic "${topicLabel}" in context "${contextName}".`,
                    confidence: 0.51 // Just above threshold so it's still included
                }
            };
        }
    } catch (error) {
        console.error('[Reasoning] Error generating reasoning:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'An unknown error occurred'
        };
    }
}

// --- STEP 3: DATABASE OPERATIONS ---

/**
 * Execute the decided action for a topic (create new or merge with existing)
 */
async function executeTopicAction(
    topicResult: TopicProcessingResult,
    userId: string
): Promise<{ success: boolean; data?: Topic; error?: string }> {
    try {
        const supabase = createClient();
        const label = topicResult.label.toLowerCase(); // Ensure lowercase

        // Handle based on the action
        switch (topicResult.action) {
            case TopicAction.CREATE_NEW: {
                // Create new topic without embedding first
                const { data, error } = await supabase
                    .from('topics')
                    .insert({
                        id: uuidv4(),
                        label,
                        related_labels: [],
                        reasoning: topicResult.reasoning,
                        user_id: userId
                    })
                    .select()
                    .single();

                if (error) throw error;

                // Now generate and store the embedding in a separate step
                // This avoids blocking the main creation process and allows for async embedding generation
                const topicId = data.id;
                storeTopicEmbedding(topicId, label)
                    .then(success => {
                        if (!success) {
                            console.warn(`Failed to store embedding for topic ${label} (${topicId})`);
                        }
                    })
                    .catch(err => {
                        console.error(`Error storing embedding for topic ${label} (${topicId}):`, err);
                    });

                return { success: true, data: data as Topic };
            }

            case TopicAction.MERGE_WITH_EXISTING: {
                if (!topicResult.existingTopicId) {
                    return { success: false, error: 'Missing existing topic ID for merge action' };
                }

                // Get existing topic
                const { data: existingTopic, error: fetchError } = await supabase
                    .from('topics')
                    .select('*')
                    .eq('id', topicResult.existingTopicId)
                    .single();

                if (fetchError) throw fetchError;
                if (!existingTopic) {
                    return { success: false, error: `Topic with ID ${topicResult.existingTopicId} not found` };
                }

                // Prepare update data
                let updateData: { label?: string; related_labels: string[]; reasoning?: string } = {
                    related_labels: [...(existingTopic.related_labels || [])]
                };

                // If replacing main label, move old label to related and set new main label
                if (topicResult.shouldReplaceMainLabel) {
                    // Add old main label to related labels if not already there and not same as new label
                    if (existingTopic.label !== label && !updateData.related_labels.includes(existingTopic.label)) {
                        updateData.related_labels.push(existingTopic.label);
                    }
                    // Set new main label
                    updateData.label = label;

                    // Combine reasoning from both topics
                    if (topicResult.reasoning && existingTopic.reasoning) {
                        updateData.reasoning = `${existingTopic.reasoning}\n\nAdditional insight when merged with "${label}":\n${topicResult.reasoning}`;
                    } else if (topicResult.reasoning) {
                        updateData.reasoning = topicResult.reasoning;
                    }
                }
                // Otherwise, add new label to related labels if not already there and not the main label
                else if (label !== existingTopic.label && !updateData.related_labels.includes(label)) {
                    updateData.related_labels.push(label);

                    // Add new reasoning as supplementary if available
                    if (topicResult.reasoning && existingTopic.reasoning) {
                        updateData.reasoning = `${existingTopic.reasoning}\n\nInsight from related topic "${label}":\n${topicResult.reasoning}`;
                    }
                }

                // Remove any duplicates in related labels
                updateData.related_labels = Array.from(new Set(updateData.related_labels));

                // Update the topic
                const { data: updatedTopic, error: updateError } = await supabase
                    .from('topics')
                    .update(updateData)
                    .eq('id', topicResult.existingTopicId)
                    .select()
                    .single();

                if (updateError) throw updateError;

                // Check if main label changed, if so, update the embedding
                if (topicResult.shouldReplaceMainLabel) {
                    storeTopicEmbedding(topicResult.existingTopicId, label)
                        .then(success => {
                            if (!success) {
                                console.warn(`Failed to update embedding for topic ${label} (${topicResult.existingTopicId})`);
                            }
                        })
                        .catch(err => {
                            console.error(`Error updating embedding for topic ${label} (${topicResult.existingTopicId}):`, err);
                        });
                }

                return { success: true, data: updatedTopic as Topic };
            }

            default:
                return { success: false, error: `Unsupported action: ${topicResult.action}` };
        }
    } catch (error) {
        console.error('Error executing topic action:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'An unknown error occurred'
        };
    }
}

/**
 * Create or update a value node based on a reasoning result
 */
async function createOrUpdateValueNode(
    reasoningResult: ReasoningResult,
    chatIds: string[],
    userId: string,
    itemIds: string[] = [],
    logger?: (message: string, type?: 'info' | 'error' | 'warning') => void
): Promise<{ success: boolean; data?: ValueNode; isNew?: boolean; error?: string }> {
    // Create a local log function
    const log = (message: string, type: 'info' | 'error' | 'warning' = 'info') => {
        if (logger) {
            logger(message, type);
        }
        if (type === 'error') {
            console.error(message);
        } else if (type === 'warning') {
            console.warn(message);
        } else {
            console.log(message);
        }
    };

    try {
        const supabase = createClient();

        // Validate sentiment_score: ensure we never have a null score
        if (reasoningResult.sentiment_score === null || reasoningResult.sentiment_score === undefined) {
            log(`Error: Missing sentiment_score for topic "${reasoningResult.topic}" in context "${reasoningResult.context}"`, 'error');
            log(`Using fallback score of 0 (neutral) to prevent database error`, 'warning');
            // Assign a fallback score rather than failing
            reasoningResult.sentiment_score = 0; // Default to neutral as requested by user
        }

        // Check if a node already exists for this topic-context pair
        const { data: existingNodes, error: nodeError } = await supabase
            .from('value_nodes')
            .select('*')
            .eq('topic_id', reasoningResult.topic_id)
            .eq('context_id', reasoningResult.context_id)
            .eq('user_id', userId); // Make sure we only find nodes for this user

        if (nodeError) {
            log(`Error finding existing value nodes: ${nodeError.message}`, 'error');
            throw nodeError;
        }

        // Filter out invalid item IDs before proceeding
        // This ensures we only link items that actually exist in the database
        let validItemIds: string[] = [];
        if (itemIds.length > 0) {
            try {
                const { data: validItems, error: itemValidationError } = await supabase
                    .from('items')
                    .select('id')
                    .in('id', itemIds)
                    .eq('user_id', userId);

                if (itemValidationError) {
                    log(`Warning: Error validating item IDs: ${itemValidationError.message}`, 'warning');
                } else {
                    validItemIds = (validItems || []).map(item => item.id);
                    if (validItemIds.length < itemIds.length) {
                        log(`Note: ${itemIds.length - validItemIds.length} invalid item IDs were filtered out`, 'warning');
                    }
                }
            } catch (itemError) {
                log(`Error validating item IDs: ${itemError instanceof Error ? itemError.message : String(itemError)}`, 'warning');
                // Continue without items rather than failing the whole operation
            }
        }

        // If node exists, update it
        if (existingNodes && existingNodes.length > 0) {
            const existingNode = existingNodes[0];
            log(`Found existing value node ${existingNode.id} for topic "${reasoningResult.topic}" in context "${reasoningResult.context}"`, 'info');

            try {
                // Analyze the existing node's relationship strength to the value
                // We'll use this to decide how to merge the new reasoning and score
                const existingChatCount = existingNode.chat_ids?.length || 1;
                const newChatCount = chatIds.length;
                const totalChatCount = existingChatCount + newChatCount;

                // Calculate weighted average for score, giving more weight to the side with more evidence
                let weightedScore;

                // If the new sentiment is very strong (abs value >= 5), give it more weight
                const newScoreStrength = Math.abs(reasoningResult.sentiment_score);
                if (newScoreStrength >= 5) {
                    // Strong sentiment gets extra weight
                    weightedScore = (
                        (existingNode.score * existingChatCount) +
                        (reasoningResult.sentiment_score * newChatCount * 1.5)
                    ) / (existingChatCount + (newChatCount * 1.5));
                } else {
                    // Normal weighting by chat count
                    weightedScore = (
                        (existingNode.score * existingChatCount) +
                        (reasoningResult.sentiment_score * newChatCount)
                    ) / totalChatCount;
                }

                // Round to nearest integer as scores are typically integers
                const adjustedScore = Math.round(weightedScore);

                // Combine chat IDs without duplicates
                const existingChatIds = Array.isArray(existingNode.chat_ids) ? existingNode.chat_ids : [];
                const combinedChatIds = Array.from(new Set([...existingChatIds, ...chatIds]));

                // Combine item IDs without duplicates
                const existingItemIds = Array.isArray(existingNode.item_ids) ? existingNode.item_ids : [];
                const combinedItemIds = Array.from(new Set([...existingItemIds, ...validItemIds]));

                // Build a comprehensive reasoning history that captures the evolution of this value node
                const timestamp = new Date().toISOString();
                const combinedReasoning = [
                    existingNode.reasoning || "No previous reasoning.",
                    "",
                    `ADDITIONAL EVIDENCE (${timestamp}):`,
                    reasoningResult.reasoning || "No specific reasoning provided.",
                    "",
                    "SCORE ADJUSTMENT:",
                    `Previous score: ${existingNode.score}`,
                    `New evidence score: ${reasoningResult.sentiment_score}`,
                    `Final adjusted score: ${adjustedScore}`,
                    "",
                    `This score represents combined evidence from ${totalChatCount} conversations and relates to ${combinedItemIds.length} specific items.`
                ].join('\n');

                // Update the node with the combined data
                const { data: updatedNode, error: updateError } = await supabase
                    .from('value_nodes')
                    .update({
                        score: adjustedScore,
                        reasoning: combinedReasoning,
                        chat_ids: combinedChatIds,
                        item_ids: combinedItemIds,
                        updated_at: timestamp
                    })
                    .eq('id', existingNode.id)
                    .select()
                    .single();

                if (updateError) {
                    log(`Error updating value node: ${updateError.message}`, 'error');
                    throw updateError;
                }

                log(`Successfully updated value node ${updatedNode.id} with ${combinedChatIds.length} chats and ${combinedItemIds.length} items`, 'info');

                // If updating with notable changes (score change, new items), trigger a topic label reconsideration
                if (Math.abs(existingNode.score - adjustedScore) >= 2 || combinedItemIds.length > existingItemIds.length) {
                    // This could be expanded to reconsider topic labels based on new evidence
                    log(`Significant update to value node: score change or new items added. Consider reviewing topic labels.`, 'info');
                }

                return { success: true, data: updatedNode as ValueNode, isNew: false };
            } catch (updateError) {
                log(`Error updating existing value node: ${updateError instanceof Error ? updateError.message : String(updateError)}`, 'error');

                // Fall back to creating a new node if update fails (better to have a duplicate than no node)
                log(`Attempting to create a new node as fallback after update failure`, 'warning');

                // Proceed with node creation below (will exit this if/else branch)
            }
        }

        // Create a new node
        try {
            const newNodeId = uuidv4();
            const timestamp = new Date().toISOString();

            const { data: newNode, error: insertError } = await supabase
                .from('value_nodes')
                .insert({
                    id: newNodeId,
                    topic_id: reasoningResult.topic_id,
                    context_id: reasoningResult.context_id,
                    score: reasoningResult.sentiment_score,
                    reasoning: reasoningResult.reasoning || `Score: ${reasoningResult.sentiment_score}, Sentiment: ${reasoningResult.sentiment}`,
                    chat_ids: chatIds,
                    item_ids: validItemIds, // Use the validated item IDs
                    user_id: userId,
                    created_at: timestamp,
                    updated_at: timestamp
                })
                .select()
                .single();

            if (insertError) {
                log(`Error creating value node: ${insertError.message}`, 'error');
                throw insertError;
            }

            log(`Successfully created new value node ${newNode.id} with ${chatIds.length} chats and ${validItemIds.length} items`, 'info');
            return { success: true, data: newNode as ValueNode, isNew: true };
        } catch (createError) {
            log(`Error creating new value node: ${createError instanceof Error ? createError.message : String(createError)}`, 'error');
            throw createError;
        }
    } catch (error) {
        log(`Error creating/updating value node: ${error instanceof Error ? error.message : 'An unknown error occurred'}`, 'error');
        return {
            success: false,
            error: error instanceof Error ? error.message : 'An unknown error occurred'
        };
    }
}

// Add this new function for LLM-based relevance checking

/**
 * Use Gemini to determine if an item is relevant to a topic-context pair by analyzing the conversation
 */
async function checkItemRelevanceWithLLM(
    item: { id: string; name: string },
    topic: string,
    context: string,
    window: ChatWindow,
    reasoningResult: ReasoningResult,
    userId: string,
    logger?: (message: string, type?: 'info' | 'error' | 'warning') => void,
    userApiKey?: string
): Promise<{ relevant: boolean; confidence: number; explanation: string }> {
    // Create a local log function
    const log = (message: string, type: 'info' | 'error' | 'warning' = 'info') => {
        if (logger) {
            logger(message, type);
        }
        if (type === 'error') {
            console.error(message);
        } else if (type === 'warning') {
            console.warn(message);
        } else {
            console.log(message);
        }
    };

    try {

        // Format the conversation using our utility function
        const conversationText = formatConversation(window.chat_data, 'ai-human');

        // Format the evidence if available
        let evidenceText = "No specific evidence provided.";
        if (reasoningResult.evidence) {
            if (reasoningResult.evidence.llm_snippets.length > 0 || reasoningResult.evidence.human_snippets.length > 0) {
                const evidenceAI = reasoningResult.evidence.llm_snippets.map(q => `- AI: ${q}`).join('\n');
                const evidenceHuman = reasoningResult.evidence.human_snippets.map(a => `- Human: ${a}`).join('\n');
                evidenceText = `Evidence AI Messages:\n${evidenceAI || "None"}\n\nEvidence Human Messages:\n${evidenceHuman || "None"}`;
            }
        }

        log(`[Item-LLM-Check] Checking if item "${item.name}" is relevant to topic "${topic}" in context "${context}"`);

        const prompt = `You are an expert at determining meaningful relationships between items and topics in conversations.

I need you to determine if a specific item is genuinely relevant to a topic in a particular context, based on a conversation.

CONVERSATION:
${conversationText}

ITEM: "${item.name}"
TOPIC: "${topic}" 
CONTEXT: "${context}"

REASONING ABOUT THIS TOPIC-CONTEXT PAIR:
${reasoningResult.reasoning || "No specific reasoning provided."}

EVIDENCE FROM CONVERSATION:
${evidenceText}

TASK:
Determine if the item "${item.name}" is SPECIFICALLY and MEANINGFULLY related to the topic "${topic}" in the context of "${context}" based on this conversation.

IMPORTANT CONSIDERATIONS:
1. The item should be directly and substantially connected to the topic and context
2. Just being mentioned in the same conversation is NOT enough
3. There must be a meaningful semantic relationship
4. Look for evidence that the item is discussed in relation to the topic
5. Weak or tangential connections should be rejected

EVALUATION CRITERIA:
- STRONG CONNECTION: The item is directly discussed as part of the topic (e.g., "iced cold brew" is discussed as part of "coffee preferences")
- WEAK CONNECTION: The item is merely mentioned in the same conversation but not connected to the topic (e.g., "water" is mentioned but not related to "AI ethics")
- NO CONNECTION: The item and topic are completely unrelated

RESPONSE FORMAT:
Please respond with a JSON object containing:
- relevant: A boolean (true/false) indicating if there is a strong connection
- confidence: A number from 0.0 to 1.0 indicating your confidence in this assessment.
- explanation: A brief explanation of your reasoning`;

        const thinkingParams: ThinkingLogParams = {
            userId,
            serviceName: 'graph-service',
            operationName: 'checkItemRelevanceWithLLM',
            windowId: window.id,
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
                        type: Type.OBJECT,
                        properties: {
                            relevant: { type: Type.BOOLEAN },
                            confidence: { type: Type.NUMBER },
                            explanation: { type: Type.STRING }
                        },
                        required: ["relevant", "confidence", "explanation"]
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
        if (!responseText) {
            log(`[Item-LLM-Check] Empty response from AI`, 'error');
            return { relevant: false, confidence: 0, explanation: "Failed to get AI response" };
        }

        try {
            const result = JSON.parse(responseText);
            log(`[Item-LLM-Check] Result: ${result.relevant ? "RELEVANT" : "NOT RELEVANT"} (confidence: ${result.confidence.toFixed(2)})`);
            log(`[Item-LLM-Check] Explanation: ${result.explanation.substring(0, 100)}...`);
            return result;
        } catch (parseError) {
            log(`[Item-LLM-Check] Error parsing AI response`, 'error');
            return { relevant: false, confidence: 0, explanation: "Failed to parse AI response" };
        }
    } catch (error) {
        log(`[Item-LLM-Check] Error checking relevance: ${error instanceof Error ? error.message : String(error)}`, 'error');
        // Fallback to rule-based approach in case of API failure
        return {
            relevant: false,
            confidence: 0,
            explanation: `Error using LLM for relevance check: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}

/**
 * Fetch contexts from database with caching to avoid redundant calls
 * This function caches contexts for 30 minutes to reduce database load
 */
async function getCachedContexts(): Promise<{
    success: boolean;
    data?: Context[];
    descriptionsText: string;
    error?: string
}> {
    try {
        const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
        const now = Date.now();

        // If cache exists and is fresh, use it
        if (contextCache && (now - contextCache.lastFetched) < CACHE_TTL_MS) {
            return {
                success: true,
                data: contextCache.contexts,
                descriptionsText: contextCache.descriptionsText
            };
        }

        // Cache doesn't exist or is stale, fetch fresh data
        const result = await fetchContexts();

        if (result.success && result.data) {
            // Generate descriptions text for prompts
            const descriptionsText = result.data.map(context =>
                `- ${context.name}: ${context.description || 'No description available'}`
            ).join('\n');

            // Update cache
            contextCache = {
                contexts: result.data,
                lastFetched: now,
                descriptionsText
            };

            return {
                success: true,
                data: result.data,
                descriptionsText
            };
        }

        return {
            success: false,
            descriptionsText: '',
            error: result.error || 'Failed to fetch contexts'
        };
    } catch (error) {
        console.error('Error in getCachedContexts:', error);
        return {
            success: false,
            descriptionsText: '',
            error: error instanceof Error ? error.message : 'Unknown error occurred'
        };
    }
} 