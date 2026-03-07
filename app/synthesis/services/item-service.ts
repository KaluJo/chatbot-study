import { createClient } from '@/utils/supabase/client';
import { Type } from "@google/genai";
import { v4 as uuidv4 } from 'uuid';
import { ChatWindow, Item } from './types';
import { generateEmbedding } from './embedding-service';
import { formatConversation } from '@/app/utils/chat-formatting';
import { callGeminiWithThinking, ThinkingLogParams } from '@/app/utils/thinking-logger';
import { GEMINI_PRO } from '@/app/config/models';

// Constants
const MODEL_NAME = GEMINI_PRO;
const SIMILARITY_THRESHOLD = 0.7;
const MAX_ITEMS_TO_EXTRACT = 3;

// Interface for item candidates extracted from conversation
export interface ItemCandidate {
  name: string;
  confidence: number;
  reasoning: string;
}

/**
 * Extract specific items from a chat window
 * @param window The chat window to analyze
 * @param userId The user ID associated with the conversation
 * @param logger Optional logging function
 * @returns List of item candidates
 */
export async function extractSpecificItems(
  window: ChatWindow,
  userId: string,
  logger?: (message: string, type?: 'info' | 'error' | 'warning') => void
): Promise<{ success: boolean; data?: ItemCandidate[]; error?: string }> {
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

  log(`[Item Extraction] Starting item extraction for window ${window.id} with ${window.chat_data.length} conversations`);
  
  try {
    // Format the conversation using our utility function
    const conversationText = formatConversation(window.chat_data, 'ai-human');
    
    // Get potential items from the window for context
    const potentialItemsText = window.potential_items && window.potential_items.length > 0 
      ? window.potential_items.join(', ')
      : "No potential items were previously identified";
    
    log(`[Item Extraction] Using ${window.chat_data.length} exchanges and ${window.potential_items?.length || 0} potential items`);
    
    const prompt = `You are an expert at identifying specific items, tools, objects, brands, places, people, and concrete things mentioned in conversations.

Your task is to extract specific items that are mentioned in this conversation. Focus on concrete, tangible things that could be relevant for understanding what the person uses, owns, likes, or interacts with.

CONVERSATION:
${conversationText}

PREVIOUSLY IDENTIFIED POTENTIAL ITEMS:
${potentialItemsText}

GUIDELINES:
1. INCLUDE these types of items:
   - Specific products (e.g., "iPhone 15", "Tesla Model 3", "Wilson Café")
   - Brands and companies (e.g., "Apple", "Netflix", "Spotify")
   - Specific places (e.g., "Central Park", "Wilson Café", "UCLA")
   - People mentioned by name (e.g., "Sarah", "Dr. Smith")
   - Tools and software (e.g., "Figma", "Python", "Excel")
   - Books, movies, songs (e.g., "The Matrix", "Inception")
   - Specific food items or drinks (e.g., "iced cold brew", "margherita pizza")

2. EXCLUDE these types of items:
   - General categories (e.g., "coffee" - this should be a topic, not an item)
   - Abstract concepts (e.g., "happiness", "productivity")
   - Very common generic items (e.g., "water", "phone" unless it's a specific model)
   - Pronouns and generic references (e.g., "it", "that thing")

3. PRIORITIZE items that:
   - Are mentioned with enthusiasm or strong sentiment
   - Are discussed in detail
   - Seem important to the person's life or interests
   - Could be relevant for understanding their preferences

4. ITEM NAMES should be:
   - Specific and descriptive
   - Use the exact name mentioned when possible
   - Include important qualifiers (e.g., "iced cold brew" not just "coffee")
   - Proper capitalization for brands, places, names

5. For each item, provide:
   - Name: The specific name of the item
   - Category: What type of item it is (e.g., "beverage", "software", "place", "person")
   - Confidence: 0-1 score of how confident you are this is a meaningful item

6. Only include items with confidence >= 0.6

IMPORTANT: Focus on specificity. If someone mentions "my car", that's too generic. If they mention "my Tesla" or "my Honda Civic", those are specific items worth extracting.`;

    const thinkingParams: ThinkingLogParams = {
      userId,
      serviceName: 'item-service',
      operationName: 'extractSpecificItems',
      windowId: window.id,
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
                name: { type: Type.STRING },
                confidence: { type: Type.NUMBER },
                reasoning: { type: Type.STRING }
              },
              required: ["name", "confidence", "reasoning"]
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
    
    const responseText = response.text;
    if (!responseText) {
      log(`[Item Extraction] Empty response from AI`, 'error');
      return { success: false, error: 'Empty response from AI' };
    }
    
    try {
      const parsedData = JSON.parse(responseText) as ItemCandidate[];
      
      // Log detailed information about identified items
      log(`[Item Extraction] Identified ${parsedData.length} specific items`);
      parsedData.forEach((item, i) => {
        log(`[Item Extraction] Item ${i+1}: "${item.name}" (confidence: ${item.confidence.toFixed(2)})`);
        log(`[Item Extraction] Reasoning: ${item.reasoning.substring(0, 150)}...`);
      });
      
      return { success: true, data: parsedData };
      
    } catch (parseError) {
      log(`[Item Extraction] Error parsing AI response`, 'error');
      return { success: false, error: 'Failed to parse AI response' };
    }
    
  } catch (error) {
    log(`[Item Extraction] Error extracting items: ${error instanceof Error ? error.message : String(error)}`, 'error');
    
    // If Gemini is unavailable, fall back to potential_items if they exist
    if (window.potential_items && window.potential_items.length > 0) {
      log(`[Item Extraction] Falling back to ${Math.min(window.potential_items.length, MAX_ITEMS_TO_EXTRACT)} potential items due to API error`, 'warning');
      
      const fallbackItems = window.potential_items
        .slice(0, MAX_ITEMS_TO_EXTRACT)
        .map(item => ({
          name: item,
          confidence: 0.7,
          reasoning: "Using existing potential item due to API unavailability."
        }));
      
      return { success: true, data: fallbackItems };
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}

/**
 * Process an item candidate by checking for similar existing items and deciding
 * whether to create a new item or update an existing one
 */
export async function processItem(
  itemCandidate: ItemCandidate,
  chatIds: string[],
  userId: string,
  logger?: (message: string, type?: 'info' | 'error' | 'warning') => void
): Promise<{ success: boolean; data?: Item; isNew?: boolean; error?: string }> {
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
    log(`[Item Processing] Processing item candidate: ${itemCandidate.name}`);
    
    // Skip low confidence items
    if (itemCandidate.confidence < 0.65) {
      log(`[Item Processing] Item "${itemCandidate.name}" has low confidence (${itemCandidate.confidence.toFixed(2)}), skipping`, 'warning');
      return { success: false, error: 'Item confidence too low' };
    }
    
    // Generate embedding for similarity search
    log(`[Item Processing] Generating embedding for "${itemCandidate.name}"`);
    const embedding = await generateEmbedding(itemCandidate.name);
    
    if (!embedding) {
      log(`[Item Processing] Failed to generate embedding for "${itemCandidate.name}"`, 'error');
      return { success: false, error: 'Failed to generate embedding' };
    }
    
    // Search for similar items
    log(`[Item Processing] Searching for similar items to "${itemCandidate.name}"`);
    const supabase = createClient();
    
    const { data: similarItems, error: searchError } = await supabase.rpc(
      'find_similar_items',
      {
        search_embedding: embedding,
        similarity_threshold: SIMILARITY_THRESHOLD,
        max_results: 1,
        user_id_param: userId
      }
    );
    
    if (searchError) {
      log(`[Item Processing] Error searching for similar items: ${searchError.message}`, 'error');
      // Continue with creation since this is non-fatal
    }
    
    // If we found a similar item with high similarity, update it
    if (similarItems && similarItems.length > 0) {
      const mostSimilarItem = similarItems[0];
      log(`[Item Processing] Found similar existing item: "${mostSimilarItem.name}" (similarity: ${mostSimilarItem.similarity.toFixed(2)})`);
      
      // Get the full item details
      const { data: existingItem, error: getError } = await supabase
        .from('items')
        .select('*')
        .eq('id', mostSimilarItem.id)
        .single();
      
      if (getError) {
        log(`[Item Processing] Error fetching existing item: ${getError.message}`, 'error');
        return { success: false, error: `Error fetching existing item: ${getError.message}` };
      }
      
      // Merge chat IDs without duplicates
      const combinedChatIds = Array.from(new Set([...existingItem.chat_ids, ...chatIds]));
      
      // Update the item
      const { data: updatedItem, error: updateError } = await supabase
        .from('items')
        .update({
          chat_ids: combinedChatIds,
          updated_at: new Date().toISOString()
        })
        .eq('id', mostSimilarItem.id)
        .select()
        .single();
      
      if (updateError) {
        log(`[Item Processing] Error updating item: ${updateError.message}`, 'error');
        return { success: false, error: `Error updating item: ${updateError.message}` };
      }
      
      log(`[Item Processing] Successfully updated item "${updatedItem.name}" with new chat references`);
      return { success: true, data: updatedItem, isNew: false };
    }
    
    // If no similar item found, create a new one
    log(`[Item Processing] No similar item found, creating new item for "${itemCandidate.name}"`);
    
    const { data: newItem, error: createError } = await supabase
      .from('items')
      .insert({
        id: uuidv4(),
        name: itemCandidate.name,
        chat_ids: chatIds,
        embedding: embedding,
        user_id: userId
      })
      .select()
      .single();
    
    if (createError) {
      log(`[Item Processing] Error creating new item: ${createError.message}`, 'error');
      return { success: false, error: `Error creating new item: ${createError.message}` };
    }
    
    log(`[Item Processing] Successfully created new item "${newItem.name}"`);
    return { success: true, data: newItem, isNew: true };
    
  } catch (error) {
    log(`[Item Processing] Error processing item: ${error instanceof Error ? error.message : String(error)}`, 'error');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}

/**
 * Associate items with value nodes, ensuring proper validation and relevance
 */
export async function associateItemsWithValueNode(
  nodeId: string,
  itemIds: string[],
  logger?: (message: string, type?: 'info' | 'error' | 'warning') => void
): Promise<{ success: boolean; error?: string }> {
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
    if (!itemIds.length) {
      return { success: true }; // Nothing to associate
    }
    
    log(`[Item Association] Processing association of ${itemIds.length} items with value node ${nodeId}`);
    
    const supabase = createClient();
    
    // First get the existing node to get its current data
    const { data: existingNode, error: getError } = await supabase
      .from('value_nodes')
      .select('item_ids, topic_id, context_id, score')
      .eq('id', nodeId)
      .single();
    
    if (getError) {
      log(`[Item Association] Error fetching existing node: ${getError.message}`, 'error');
      return { success: false, error: `Error fetching existing node: ${getError.message}` };
    }
    
    if (!existingNode) {
      log(`[Item Association] Value node ${nodeId} not found`, 'error');
      return { success: false, error: 'Value node not found' };
    }
    
    // Validate that all items exist in the database
    const { data: validItems, error: validationError } = await supabase
      .from('items')
      .select('id, name')
      .in('id', itemIds);
    
    if (validationError) {
      log(`[Item Association] Error validating items: ${validationError.message}`, 'warning');
      // Continue with the process, but log the warning
    }
    
    const validItemIds = validItems ? validItems.map(item => item.id) : [];
    const invalidItemIds = itemIds.filter(id => !validItemIds.includes(id));
    
    if (invalidItemIds.length > 0) {
      log(`[Item Association] Warning: ${invalidItemIds.length} invalid item IDs will be excluded`, 'warning');
    }
    
    // Get the topic information to provide context for the linkage
    const { data: topicData, error: topicError } = await supabase
      .from('topics')
      .select('label')
      .eq('id', existingNode.topic_id)
      .single();
    
    if (topicError) {
      log(`[Item Association] Error fetching topic details: ${topicError.message}`, 'warning');
      // Continue despite this error - we're just missing some context info
    }
    
    const topicLabel = topicData ? topicData.label : 'unknown topic';
    
    // Get info about the valid items for logging purposes
    log(`[Item Association] Associating ${validItemIds.length} validated items with topic "${topicLabel}" in value node ${nodeId}`);
    
    if (validItems) {
      validItems.forEach(item => {
        log(`[Item Association] - Item: "${item.name}" (${item.id})`);
      });
    }
    
    // Combine existing and new item IDs without duplicates
    const existingItemIds = existingNode.item_ids || [];
    const newItemIds = existingItemIds.includes ? 
      validItemIds.filter(id => !existingItemIds.includes(id)) : 
      validItemIds;
    
    if (newItemIds.length === 0) {
      log(`[Item Association] All valid items are already associated with this value node`, 'info');
      return { success: true };
    }
    
    const combinedItemIds = Array.from(new Set([...existingItemIds, ...validItemIds]));
    
    log(`[Item Association] Adding ${newItemIds.length} new items to ${existingItemIds.length} existing items`);
    
    // Update the value_nodes record with the combined item IDs
    const { error } = await supabase
      .from('value_nodes')
      .update({ 
        item_ids: combinedItemIds,
        updated_at: new Date().toISOString()
      })
      .eq('id', nodeId);
    
    if (error) {
      log(`[Item Association] Error associating items with node: ${error.message}`, 'error');
      return { success: false, error: `Error associating items with node: ${error.message}` };
    }
    
    log(`[Item Association] Successfully associated items with value node ${nodeId} (total: ${combinedItemIds.length} items)`);
    return { success: true };
    
  } catch (error) {
    log(`[Item Association] Error associating items with node: ${error instanceof Error ? error.message : String(error)}`, 'error');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}