import { createClient } from '@/utils/supabase/client';
import { ChatWindow } from '../chat/services/chatlog-service';
import { Type } from "@google/genai";
import { DatabaseItem } from '@/components/visualization/types';
import { v4 as uuidv4 } from 'uuid';
import { ClientChatWindow } from './types';
import { formatConversation as formatChatConversation } from '@/app/utils/chat-formatting';
import { GEMINI_PRO } from '@/app/config/models';

// Helper to call Gemini via API route
async function callGeminiAPI(prompt: string, responseSchema?: unknown, userApiKey?: string): Promise<string> {
  const response = await fetch('/api/gemini/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      model: GEMINI_PRO,
      responseSchema,
      userApiKey, // Pass user's API key if provided
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
      throw new Error(`AI service not configured. Add GEMINI_API_KEY to your environment or provide your own key.`);
    }
    throw new Error(data.error || `API error: ${response.status}`);
  }

  if (data.error) {
    throw new Error(data.error);
  }
  return data.text || '';
}

// ================== Types ==================
export interface Topic {
  id: string;
  label: string;
  related_labels: string[];
  embedding?: number[];
  user_id?: string | null;
  reasoning?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ValueNode {
  id: string;
  topic_id: string;
  context_id: string;
  context_name?: string;
  score: number;
  reasoning?: string | null;
  chat_ids: string[];
  item_ids?: string[];
  user_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ValueItem {
  id: string;
  name: string;
  chat_ids: string[];
  embedding?: number[];
  user_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Context {
  id: string;
  name: string;
  description?: string;
  user_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ProcessedWindowData {
  topics: Topic[];
  nodes: ValueNode[];
  items: ValueItem[];
}

export interface TopicSimilarityResult {
  id: string;
  uuid: string;
  label: string;
  similarity: number;
}

export interface TopicLabelDecision {
  should_replace_main_label: boolean;
  main_label: string;
  related_labels: string[];
  reasoning: string;
}

export interface TopicSentimentAnalysis {
  topic: string;
  context: string;
  score: number;
  reasoning: string;
  chat_ids: string[];
}

export interface NodeScoreUpdate {
  should_update: boolean;
  new_score: number;
  change_reason: string;
}

export interface ValueAnalysisResult {
  topics: Topic[];
  nodes: ValueNode[];
  items: ValueItem[];
}

// ================== Vector Similarity Search ==================

/**
 * Search for similar topics using vector similarity
 */
export async function findSimilarTopics(
  searchTerm: string,
  similarityThreshold: number = 0.7
): Promise<{ success: boolean; data?: TopicSimilarityResult[]; error?: string }> {
  try {
    const supabase = createClient();
    
    // First get the embedding for the search term
    const embedding = await generateEmbedding(searchTerm);
    if (!embedding) {
      throw new Error("Failed to generate embedding for search term");
    }
    
    try {
      // First try with direct vector similarity (if vector extension is working)
      const { data, error } = await supabase
        .from('topics')
        .select('id, uuid, label');
      
      if (error) throw error;
      
      // Since we can't do vector operations directly in the query yet,
      // let's do a basic text-based fallback
      // For real vector similarity, we would use embedding comparison operation
      const results = data
        .map(topic => ({
          id: topic.id,
          uuid: topic.uuid,
          label: topic.label,
          // Simple string similarity as a fallback
          similarity: topic.label.toLowerCase() === searchTerm.toLowerCase() ? 0.98 : 
                      topic.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      searchTerm.toLowerCase().includes(topic.label.toLowerCase()) ? 0.9 : 0.5
        }))
        .filter(topic => topic.similarity >= similarityThreshold)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 5);
      
      return {
        success: true,
        data: results
      };
    } catch (innerError) {
      console.error("Direct query error, using simple fallback:", innerError);
      
      // If vector query fails, try a simple text match as last resort
      const { data, error } = await supabase
        .from('topics')
        .select('id, uuid, label')
        .ilike('label', `%${searchTerm}%`)
        .limit(5);
      
      if (error) throw error;
      
      const results = data.map(topic => ({
        id: topic.id,
        uuid: topic.uuid,
        label: topic.label,
        similarity: topic.label.toLowerCase() === searchTerm.toLowerCase() ? 0.98 : 0.85
      }));
      
      return {
        success: true,
        data: results
      };
    }
  } catch (error) {
    console.error("Error finding similar topics:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    };
  }
}

/**
 * Search for similar items using vector similarity
 */
export async function findSimilarItems(
  searchTerm: string,
  similarityThreshold: number = 0.7
): Promise<{ success: boolean; data?: ValueItem[]; error?: string }> {
  try {
    const supabase = createClient();
    
    // First get the embedding for the search term
    const embedding = await generateEmbedding(searchTerm);
    if (!embedding) {
      throw new Error("Failed to generate embedding for search term");
    }
    
    try {
      // Try direct query
      const { data, error } = await supabase
        .from('items')
        .select('id, uuid, name, chat_ids');
      
      if (error) throw error;
      
      // Do a simple text match as a fallback
      const results = data
        .filter(item => 
          item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          searchTerm.toLowerCase().includes(item.name.toLowerCase())
        )
        .slice(0, 5);
      
      return {
        success: true,
        data: results as ValueItem[]
      };
    } catch (innerError) {
      console.error("Direct item query error, using simple fallback:", innerError);
      
      // Simplest possible fallback
      const { data, error } = await supabase
        .from('items')
        .select('id, uuid, name, chat_ids')
        .ilike('name', `%${searchTerm}%`)
        .limit(5);
      
      if (error) throw error;
      
      return {
        success: true,
        data: data as ValueItem[] || []
      };
    }
  } catch (error) {
    console.error("Error finding similar items:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    };
  }
}

/**
 * Generate embedding for text using OpenAI API
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    // Implementation depends on which API you're using for embeddings
    // This is a placeholder - you would integrate with OpenAI, HuggingFace, etc.
    // For simplicity, we're returning a mock embedding
    console.log(`Would generate embedding for: ${text}`);
    
    // Mock embedding with 1536 dimensions (OpenAI ada-002 size)
    // In a real implementation, call the embedding API
    return Array(1536).fill(0).map(() => Math.random() - 0.5);
    
  } catch (error) {
    console.error("Error generating embedding:", error);
    return null;
  }
}

// ================== LLM Prompts ==================

/**
 * Decide whether a new label should replace an existing main label or be added to related labels
 */
export async function decideLabelPlacement(
  existingMainLabel: string,
  relatedLabels: string[],
  newLabel: string
): Promise<{ success: boolean; data?: TopicLabelDecision; error?: string }> {
  try {
    const prompt = `You are a helpful AI assistant managing a knowledge graph of topics. 
You need to decide how to handle a new topic label that is semantically similar to an existing topic.

Existing topic:
- Main label: "${existingMainLabel}"
- Related labels: ${relatedLabels.length > 0 ? relatedLabels.map(l => `"${l}"`).join(', ') : "none"}

New label to consider: "${newLabel}"

Please decide whether:
1. The new label should REPLACE the current main label (because it's a better/more general representation)
2. The new label should be ADDED to the related labels (because the current main label is better)

Consider these principles:
- Main labels should be more general/encompassing than related labels
- Main labels should be clear, concise, and represent the core concept
- If two terms are synonyms, choose the more commonly used one as the main label
- If a term is a subset of another, the broader term should be the main label

For example:
- "music" is better as a main label than "songs" (more general)
- "travel" is better as a main label than "trip" (more general)
- "career" might be better as a main label than "job" (more encompassing)

Provide your decision along with the reasoning.`;

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        should_replace_main_label: { type: Type.BOOLEAN },
        main_label: { type: Type.STRING },
        related_labels: { 
          type: Type.ARRAY,
          items: { type: Type.STRING }
        },
        reasoning: { type: Type.STRING }
      },
      required: ["should_replace_main_label", "main_label", "related_labels", "reasoning"]
    };
    
    const responseText = await callGeminiAPI(prompt, responseSchema);
    if (responseText) {
      const parsed = JSON.parse(responseText) as TopicLabelDecision;
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
    console.error("Error deciding label placement:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error occurred" 
    };
  }
}

/**
 * Analyze a chat window to determine topic sentiment in context
 */
export async function analyzeTopicSentiment(
  window: ChatWindow,
  potentialTopics: string[],
  availableContexts: string[] = ["Work", "Leisure", "Culture", "Education", "People", "Lifestyle"]
): Promise<{ success: boolean; data?: TopicSentimentAnalysis[]; error?: string }> {
  try {
    // Format the conversation for the prompt
    const conversationText = window.chat_data.map((pair, index) => 
      `Exchange ${index + 1}:\nASSISTANT: ${pair.llm_message}\nUSER: ${pair.human_message}`
    ).join('\n\n');
    
    const prompt = `Analyze this conversation to determine if there are any TRULY significant topics worthy of being added to a user's value graph.

Conversation:
${conversationText}

Potential topics identified in this conversation: ${potentialTopics.join(', ')}
Available contexts: ${availableContexts.join(', ')}

IMPORTANT: Be EXTREMELY selective and critical. Only include topics if there is SUBSTANTIAL evidence that:
1. The topic is a central focus of the conversation
2. The user has expressed a clear sentiment about it
3. It represents something meaningful to the user, not just a passing mention

For each potential topic:
1. Evaluate how confident you are that this topic is TRULY significant (score 1-10)
2. Identify the most relevant context from the available contexts
3. Determine which specific exchanges are relevant to this topic
4. Determine the user's sentiment towards this topic on a scale from -7 to +7

SCORING GUIDELINES:
- Strongly Positive (6-7): Clear enthusiasm or passion ("I LOVE coffee!")
- Positive (3-5): General positive sentiment ("Coffee is good")
- Mildly Positive (1-2): Slight preference ("I prefer coffee over tea")
- Neutral (0): Factual statements without emotion ("I drink coffee")
- Mildly Negative (-1-2): Slight dislike ("Coffee is alright, nothing special")
- Negative (-3-5): General negative sentiment ("I don't like coffee much")
- Strongly Negative (-6-7): Strong aversion ("I can't stand coffee")

CONFIDENCE ASSESSMENT:
- 9-10: Topic is central to the conversation with multiple explicit mentions and clear sentiment
- 7-8: Topic is important with clear evidence and sentiment
- 5-6: Topic is mentioned but with limited emotional engagement
- 1-4: Topic is tangential or only briefly mentioned

ONLY include topics with a confidence score of 8 or higher - be ruthless in filtering!

EXAMPLES OF TOPICS TO EXCLUDE:
1. Brief mentions without sentiment ("I had coffee this morning" - coffee mentioned but no clear feeling about it)
2. Topics that are mentioned but aren't central to the conversation
3. General small talk topics without emotional content
4. Topics where the user's sentiment is unclear or ambiguous

For each potential topic, first provide a critical assessment:
"Topic: [TOPIC]
Evidence: [SUMMARY OF MENTIONS]
Sentiment clues: [WORDS/PHRASES INDICATING SENTIMENT]
Should include? [YES/NO]
Reasoning: [DETAILED REASONING]"

Then, ONLY for topics you decide to include (max 1-2 topics from this conversation), provide the structured data.

If no topics meet the high threshold, it's perfectly acceptable to return an empty array.`;

    const responseSchema = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          topic: { type: Type.STRING },
          context: { type: Type.STRING },
          score: { type: Type.NUMBER },
          reasoning: { type: Type.STRING },
          confidence: { type: Type.NUMBER },
          relevant_exchanges: { 
            type: Type.ARRAY,
            items: { type: Type.NUMBER }
          }
        },
        required: ["topic", "context", "score", "reasoning", "confidence", "relevant_exchanges"]
      }
    };
    
    const responseText = await callGeminiAPI(prompt, responseSchema);
    if (responseText) {
      const parsed = JSON.parse(responseText) as any[];
      
      // Filter out topics with low confidence - set a higher threshold (8)
      const highConfidenceTopics = parsed.filter(analysis => analysis.confidence >= 8);
      
      // Further limit to max 2 topics, taking the highest confidence ones
      const limitedTopics = highConfidenceTopics
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 2);
      
      // Map exchange numbers to actual UUIDs
      const enhancedAnalysis = limitedTopics.map(analysis => {
        // Get the UUIDs for only the relevant exchanges
        const relevantUuids: string[] = [];
        
        // Ensure we don't go out of bounds
        for (const exchangeIndex of analysis.relevant_exchanges) {
          const adjustedIndex = exchangeIndex - 1; // Convert from 1-based to 0-based
          if (adjustedIndex >= 0 && adjustedIndex < window.chat_ids.length) {
            relevantUuids.push(window.chat_ids[adjustedIndex]);
          }
        }
        
        return {
          topic: analysis.topic,
          context: analysis.context,
          score: analysis.score,
          reasoning: analysis.reasoning,
          chat_ids: relevantUuids.length > 0 ? relevantUuids : window.chat_ids
        } as TopicSentimentAnalysis;
      });
      
      return { 
        success: true, 
        data: enhancedAnalysis
      };
    } else {
      return {
        success: false,
        error: "Empty response from API"
      };
    }
  } catch (error) {
    console.error("Error analyzing topic sentiment:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error occurred" 
    };
  }
}

/**
 * Decide whether and how to update a node's sentiment score based on new data
 */
export async function decideNodeScoreUpdate(
  existingNode: ValueNode,
  newSentimentScore: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _newConversationUUIDs: string[]
): Promise<{ success: boolean; data?: NodeScoreUpdate; error?: string }> {
  try {
    const prompt = `You are a helpful AI assistant managing a knowledge graph of user values. 
A value node represents how a user feels about a topic in a specific context, with a sentiment score from -7 to +7.

Existing node:
- Current score: ${existingNode.score}
- Based on ${existingNode.chat_ids.length} previous conversations

New data:
- New sentiment score: ${newSentimentScore}
- From a new conversation

Please decide how to update the node's score based on this new information. Consider:
1. Whether the new score reinforces or contradicts the existing score
2. The significance of the change
3. How to balance historical data with new insights

Provide a decision along with the reasoning.`;

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        should_update: { type: Type.BOOLEAN },
        new_score: { type: Type.NUMBER },
        change_reason: { type: Type.STRING }
      },
      required: ["should_update", "new_score", "change_reason"]
    };
    
    const responseText = await callGeminiAPI(prompt, responseSchema);
    if (responseText) {
      const parsed = JSON.parse(responseText) as NodeScoreUpdate;
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
    console.error("Error deciding node score update:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error occurred" 
    };
  }
}

// ================== Database Operations ==================

/**
 * Fallback function for topic creation when similarity search fails
 */
export async function createTopicFallback(
  label: string,
  reasoning?: string
): Promise<{ success: boolean; data?: Topic; error?: string }> {
  try {
    const supabase = createClient();
    
    // Convert label to lowercase for consistency
    const normalizedLabel = label.toLowerCase();
    
    // Create a new topic directly without similarity check
    const embedding = await generateEmbedding(normalizedLabel);
    if (!embedding) {
      throw new Error("Failed to generate embedding for new topic");
    }
    
    // Create the new topic
    const topicDataToInsert = {
      label: normalizedLabel,
      related_labels: [],
      embedding: embedding,
      reasoning: reasoning || `Fallback topic creation for "${normalizedLabel}"`,
      user_id: null,
    };
    const { data: newTopic, error: createError } = await supabase
      .from('topics')
      .insert(topicDataToInsert)
      .select()
      .single();
    
    if (createError) throw createError;
    
    console.log(`Created new topic with UUID ${newTopic.id} for label "${normalizedLabel}" (fallback mode)`);
    return { success: true, data: newTopic };
    
  } catch (error) {
    console.error("Error in fallback topic creation:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error occurred" 
    };
  }
}

/**
 * Create or update a topic based on a new label
 */
export async function createOrUpdateTopic(
  label: string,
  reasoning?: string
): Promise<{ success: boolean; data?: Topic; error?: string }> {
  try {
    const supabase = createClient();
    
    // Convert label to lowercase for consistency
    const normalizedLabel = label.toLowerCase();
    
    // Try to find similar topics first
    try {
      // Check for similar topics using vector similarity
      const similarTopicsResult = await findSimilarTopics(normalizedLabel);
      
      if (!similarTopicsResult.success) {
        throw new Error(`Error finding similar topics: ${similarTopicsResult.error}`);
      }
      
      // If we found a similar topic with high similarity
      if (similarTopicsResult.data && similarTopicsResult.data.length > 0) {
        const mostSimilarTopic = similarTopicsResult.data[0];
        
        // Only consider it a match if similarity is high enough
        if (mostSimilarTopic.similarity >= 0.95) {
          console.log(`Found similar topic: ${mostSimilarTopic.label} (similarity: ${mostSimilarTopic.similarity})`);
          
          // Get full topic details
          const { data: existingTopic, error: topicError } = await supabase
            .from('topics')
            .select('*')
            .eq('id', mostSimilarTopic.id)
            .single();
          
          if (topicError) throw topicError;
          if (!existingTopic) throw new Error(`Topic with ID ${mostSimilarTopic.id} not found`);
          
          // Decide whether to update the main label or add to related labels
          const labelDecisionResult = await decideLabelPlacement(
            existingTopic.label,
            existingTopic.related_labels || [],
            normalizedLabel
          );
          
          if (!labelDecisionResult.success || !labelDecisionResult.data) {
            throw new Error(`Error deciding label placement: ${labelDecisionResult.error}`);
          }
          
          const labelDecision = labelDecisionResult.data;
          
          // Update the topic based on the decision
          const { data: updatedTopic, error: updateError } = await supabase
            .from('topics')
            .update({
              label: labelDecision.main_label,
              related_labels: labelDecision.related_labels,
              reasoning: labelDecision.reasoning,
              updated_at: new Date().toISOString()
            })
            .eq('id', mostSimilarTopic.id)
            .select()
            .single();
          
          if (updateError) throw updateError;
          
          console.log(`Updated topic ${mostSimilarTopic.id}: ${labelDecision.reasoning}`);
          return { success: true, data: updatedTopic };
        }
      }
      
      // If no similar topic found or similarity below threshold, create a new topic
      console.log(`Creating new topic for: ${normalizedLabel}`);
      
      // Generate embedding for the new topic
      const embedding = await generateEmbedding(normalizedLabel);
      if (!embedding) {
        throw new Error("Failed to generate embedding for new topic");
      }
      
      // Create the new topic
      const topicDataToInsert = {
        label: normalizedLabel,
        related_labels: [],
        embedding: embedding,
        reasoning: reasoning || `New topic created for "${normalizedLabel}"`,
        user_id: null,
      };
      const { data: newTopic, error: createError } = await supabase
        .from('topics')
        .insert(topicDataToInsert)
        .select()
        .single();
      
      if (createError) throw createError;
      
      console.log(`Created new topic with ID ${newTopic.id} for label "${normalizedLabel}"`);
      return { success: true, data: newTopic };
    } catch (topicError) {
      // If there was an error in the normal flow, try the fallback
      console.warn("Error in normal topic flow, using fallback:", topicError);
      return await createTopicFallback(normalizedLabel, reasoning);
    }
  } catch (error) {
    console.error("Error creating or updating topic:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error occurred" 
    };
  }
}

/**
 * Create or update a value node based on topic sentiment analysis
 */
export async function createOrUpdateValueNode(
  topicId: string,
  contextId: string,
  sentimentScore: number,
  conversationUUIDs: string[],
  reasoning?: string
): Promise<{ success: boolean; data?: ValueNode; error?: string }> {
  try {
    const supabase = createClient();
    
    // Get the context name for display purposes
    const { data: contextData, error: contextError } = await supabase
      .from('contexts')
      .select('name')
      .eq('id', contextId)
      .single();
    
    if (contextError) {
      console.warn(`Could not fetch context name for ID ${contextId}: ${contextError.message}`);
    }
    
    const contextName = contextData?.name || 'Unknown Context';
    
    // Check if a node already exists for this topic-context pair
    const { data: existingNodes, error: nodeError } = await supabase
      .from('value_nodes')
      .select('*')
      .eq('topic_id', topicId)
      .eq('context_id', contextId);
    
    if (nodeError) throw nodeError;
    
    let resultNode: ValueNode;
    
    if (existingNodes && existingNodes.length > 0) {
      // Node exists, decide if we should update it
      const existingNode = existingNodes[0];
      
      // Get a decision about score based on new sentiment score
      const updateDecision = await decideNodeScoreUpdate(existingNode, sentimentScore, conversationUUIDs);
      
      if (!updateDecision.success || !updateDecision.data) {
        return { success: false, error: updateDecision.error || "Failed to decide on score update" };
      }
      
      // Update value node with new score if decided to change it
      const { data: updatedNode, error: updateError } = await supabase
        .from('value_nodes')
        .update({
          score: updateDecision.data.new_score,
          chat_ids: Array.from(new Set([...existingNode.chat_ids, ...conversationUUIDs])),
          reasoning: updateDecision.data.change_reason || existingNode.reasoning || reasoning,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingNode.id)
        .select()
        .single();
      
      if (updateError) throw updateError;
      resultNode = updatedNode;
      
      console.log(
        `Updated value node for topic "${topicId}" in context "${contextName}" with score ${updateDecision.data.new_score}.`
      );
    } else {
      // Create a new node
      const nodeUuid = uuidv4();
      const { data: newNode, error: insertError } = await supabase
        .from('value_nodes')
        .insert({
          id: nodeUuid,
          topic_id: topicId,
          context_id: contextId,
          score: sentimentScore,
          chat_ids: conversationUUIDs,
          reasoning: reasoning || `Initial sentiment score of ${sentimentScore} based on conversation analysis`,
          user_id: null,
        })
        .select()
        .single();
      
      if (insertError) throw insertError;
      resultNode = newNode;
      
      console.log(
        `Created new value node with ID ${nodeUuid} for topic "${topicId}" in context "${contextName}" with score ${sentimentScore}.`
      );
    }
    
    // Find any item UUIDs mentioned in the conversations for this value node
    // This will help with the visualization by connecting topics to their relevant items
    const mentionedItems = await findItemsInConversations(conversationUUIDs);
    if (mentionedItems.success && mentionedItems.data && mentionedItems.data.length > 0) {
      console.log(`Found ${mentionedItems.data.length} items related to this value node`);
      
      // For each item, connect it to the topic in the items table
      for (const item of mentionedItems.data) {
        const { error: topicItemError } = await supabase
          .from('items')
          .upsert({
            topic_id: topicId,
            item_id: item.id,
            relevance_score: 1.0 // Default relevance score
          }, {
            onConflict: 'topic_id,item_id'
          });
        
        if (topicItemError) {
          console.warn(`Error connecting item ${item.id} to topic ${topicId}: ${topicItemError.message}`);
        }
      }
    }
    
    // Add context_name to result for convenience
    resultNode.context_name = contextName;
    
    return { success: true, data: resultNode };
    
  } catch (error) {
    console.error("Error creating/updating value node:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error occurred" 
    };
  }
}

// Helper function to find items mentioned in a set of conversations
async function findItemsInConversations(conversationUUIDs: string[]): Promise<{ success: boolean; data?: DatabaseItem[]; error?: string }> {
  try {
    if (!conversationUUIDs.length) {
      return { success: true, data: [] };
    }
    
    const supabase = createClient();
    
    // Find items that have any of these conversation UUIDs
    const { data: items, error } = await supabase
      .from('items')
      .select('*')
      .contains('chat_ids', conversationUUIDs);
    
    if (error) throw error;
    
    return { success: true, data: items };
  } catch (error) {
    console.error("Error finding items in conversations:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error occurred"
    };
  }
}

/**
 * Create or update a value item
 */
export async function createOrUpdateValueItem(
  name: string,
  conversationUUIDs: string[]
): Promise<{ success: boolean; data?: ValueItem; error?: string }> {
  try {
    const supabase = createClient();
    
    // Check for similar items using vector similarity
    const similarItemsResult = await findSimilarItems(name);
    
    if (!similarItemsResult.success) {
      throw new Error(`Error finding similar items: ${similarItemsResult.error}`);
    }
    
    // If we found a similar item with high similarity
    if (similarItemsResult.data && similarItemsResult.data.length > 0) {
      const mostSimilarItem = similarItemsResult.data[0];
      
      // Get full item details
      const { data: existingItem, error: itemError } = await supabase
        .from('items')
        .select('*')
        .eq('id', mostSimilarItem.id)
        .single();
      
      if (itemError) throw itemError;
      if (!existingItem) throw new Error(`Item with ID ${mostSimilarItem.id} not found`);
      
      // Merge conversation UUIDs without duplicates
      const allConversationUUIDs = Array.from(
        new Set([...existingItem.chat_ids, ...conversationUUIDs])
      );
      
      // Update the item
      const { data: updatedItem, error: updateError } = await supabase
        .from('items')
        .update({
          chat_ids: allConversationUUIDs,
          updated_at: new Date().toISOString()
        })
        .eq('id', mostSimilarItem.id)
        .select()
        .single();
      
      if (updateError) throw updateError;
      
      console.log(`Updated item ${mostSimilarItem.id} with new conversation references`);
      return { success: true, data: updatedItem };
    }
    
    // If no similar item found, create a new item
    console.log(`Creating new item for: ${name}`);
    
    // Generate embedding for the new item
    const embedding = await generateEmbedding(name);
    if (!embedding) {
      throw new Error("Failed to generate embedding for new item");
    }
    
    // Create the new item
    const itemUuid = uuidv4();
    const { data: newItem, error: createError } = await supabase
      .from('items')
      .insert({
        id: itemUuid,
        name: name,
        chat_ids: conversationUUIDs,
        embedding: embedding,
        user_id: null,
      })
      .select()
      .single();
    
    if (createError) throw createError;
    
    console.log(`Created new item with ID ${itemUuid} for name "${name}"`);
    return { success: true, data: newItem };
    
  } catch (error) {
    console.error("Error creating or updating item:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error occurred" 
    };
  }
}

/**
 * Process a chat window to generate value graph entities
 */
export async function processChatWindowForValueGraph(
  windowUuid: string
): Promise<{ 
  success: boolean; 
  data?: { 
    topics: Topic[]; 
    nodes: ValueNode[];
    items: ValueItem[];
  }; 
  error?: string 
}> {
  try {
    const supabase = createClient();
    
    // Get the window data
    const { data: window, error: windowError } = await supabase
      .from('chat_windows')
      .select('*')
      .eq('window_uuid', windowUuid)
      .single();
    
    if (windowError) throw windowError;
    if (!window) throw new Error(`Window with UUID ${windowUuid} not found`);
    
    // Pre-fetch all available contexts to avoid lookup issues
    const { data: allContexts, error: contextsError } = await supabase
      .from('contexts')
      .select('id, name');
    
    if (contextsError) throw contextsError;
    if (!allContexts || allContexts.length === 0) {
      throw new Error("No contexts found in database");
    }

    // Create a helper function to find context IDs more flexibly
    const findContextId = (contextName: string): string | null => {
      // First try exact match
      const exactMatch = allContexts.find(c => c.name === contextName);
      if (exactMatch) return exactMatch.id;
      
      // Then try case-insensitive match
      const caseInsensitiveMatch = allContexts.find(
        c => c.name.toLowerCase() === contextName.toLowerCase()
      );
      if (caseInsensitiveMatch) return caseInsensitiveMatch.id;
      
      // Then try partial match (in case of "Lifestyle" vs "lifestyle context")
      const partialMatch = allContexts.find(
        c => contextName.toLowerCase().includes(c.name.toLowerCase()) ||
             c.name.toLowerCase().includes(contextName.toLowerCase())
      );
      if (partialMatch) return partialMatch.id;
      
      // If all fails, default to the first context
      console.warn(`Could not find context matching "${contextName}", using default`);
      return allContexts.length > 0 ? allContexts[0].id : null;
    };
    
    // Ensure the window has potential topics, contexts, and items
    if (!window.potential_topics || window.potential_topics.length === 0) {
      throw new Error("Window has no potential topics to analyze");
    }
    
    // 1. Analyze topic sentiment in context
    const contextNames = allContexts.map(c => c.name);
    const sentimentResult = await analyzeTopicSentiment(
      window,
      window.potential_topics,
      contextNames
    );
    
    if (!sentimentResult.success || !sentimentResult.data) {
      throw new Error(`Error analyzing topic sentiment: ${sentimentResult.error}`);
    }
    
    const topicSentiments = sentimentResult.data;
    
    // Create collections to store the results
    const createdTopics: Topic[] = [];
    const createdNodes: ValueNode[] = [];
    const createdItems: ValueItem[] = [];
    
    // 2. For each analyzed topic, create/update topics and nodes
    for (const sentiment of topicSentiments) {
      // Create or update the topic
      const topicResult = await createOrUpdateTopic(
        sentiment.topic, 
        sentiment.reasoning
      );
      
      if (!topicResult.success || !topicResult.data) {
        console.error(`Error creating/updating topic ${sentiment.topic}: ${topicResult.error}`);
        continue; // Skip to next sentiment
      }
      
      const topic = topicResult.data;
      createdTopics.push(topic);
      
      // Get the context ID using our flexible matching function
      const contextId = findContextId(sentiment.context);
      
      if (!contextId) {
        console.error(`Error finding context ${sentiment.context}`);
        continue; // Skip to next sentiment
      }
      
      // Create or update the node
      const nodeResult = await createOrUpdateValueNode(
        topic.id,
        contextId,
        sentiment.score,
        sentiment.chat_ids,
        sentiment.reasoning
      );
      
      if (!nodeResult.success || !nodeResult.data) {
        console.error(`Error creating/updating node: ${nodeResult.error}`);
        continue;
      }
      
      createdNodes.push(nodeResult.data);
    }
    
    // 3. For each potential item, create/update items
    if (window.potential_items && window.potential_items.length > 0) {
      for (const itemName of window.potential_items) {
        const itemResult = await createOrUpdateValueItem(
          itemName,
          window.chat_ids
        );
        
        if (!itemResult.success || !itemResult.data) {
          console.error(`Error creating/updating item ${itemName}: ${itemResult.error}`);
          continue;
        }
        
        createdItems.push(itemResult.data);
      }
    }
    
    return {
      success: true,
      data: {
        topics: createdTopics,
        nodes: createdNodes,
        items: createdItems
      }
    };
    
  } catch (error) {
    console.error("Error processing chat window for value graph:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error occurred" 
    };
  }
}

export async function getRelevantGraphDataForWindows(windowUUIDs: string[], userId: string): Promise<any> {
  // This function took windowUUIDs. Since window_uuid is gone, it needs window IDs (DB PKs).
  // Or, if it operates on client-side generated windows before they are saved, it needs their temporary identifiers.
  // For now, assuming it will receive DB IDs.
  if (!windowUUIDs || windowUUIDs.length === 0) return [];

  const supabase = createClient();
  // Fetch windows by their database IDs
  const { data: windows, error: windowsError } = await supabase
    .from('chat_windows')
    .select('*')
    .in('id', windowUUIDs) // Changed from window_uuid
    .eq('user_id', userId);

  if (windowsError) throw windowsError;
  if (!windows || windows.length === 0) return [];

  const allChatIdsInWindows = Array.from(new Set(windows.flatMap(w => w.chat_ids))); // Changed from chat_uuids

  // Fetch relevant items
  const { data: items, error: itemsError } = await supabase
    .from('items')
    .select('*')
    .overlaps('chat_ids', allChatIdsInWindows) // Use chat_ids instead of conversation_ids
    .eq('user_id', userId);
  if (itemsError) throw itemsError;

  // Fetch relevant value nodes
  const { data: nodes, error: nodesError } = await supabase
    .from('value_nodes')
    .select('*, topics!inner(id, label, related_labels), contexts!inner(id, name, description)')
    .overlaps('chat_ids', allChatIdsInWindows) // Use chat_ids instead of conversation_ids
    .eq('user_id', userId);
  if (nodesError) throw nodesError;

  // Re-structure nodes to include topic and context details directly
  const processedNodes = nodes?.map(node => ({
    ...node,
    topic_label: (node.topics as any)?.label,
    related_labels: (node.topics as any)?.related_labels,
    context_name: (node.contexts as any)?.name,
    context_description: (node.contexts as any)?.description,
    // Remove nested topics and contexts to avoid circular refs if any
    topics: undefined,
    contexts: undefined,
  })) || [];

  return {
    items: (items as ValueItem[]) || [],
    nodes: (processedNodes as any[]) || [], // Cast to any[] for now if processedNodes structure is complex
    links: [], // Link generation logic would also need to use correct IDs
  };
}

// Format the window data
export function formatWindowData(window: ChatWindow | ClientChatWindow): string {
  return formatChatConversation(window.chat_data, 'ai-human');
}

// Format the conversation for value analysis
const formatValueAnalysisConversation = (window: ChatWindow | ClientChatWindow): string => {
  return formatChatConversation(window.chat_data, 'gemini-analysis');
};

export async function analyzeWindowForValues(window: ChatWindow): Promise<ValueAnalysisResult> {
  try {
    // Format the conversation for the prompt using our utility
    const conversationText = formatChatConversation(window.chat_data, 'gemini-analysis');
    
    const prompt = `You are a value identification system that analyzes conversations.

IMPORTANT: In this conversation:
- Messages labeled "AI" are from the AI assistant (the system)
- Messages labeled "HUMAN" are from the human user

Your task is to ONLY analyze what the HUMAN says to identify their values and contexts.
DO NOT analyze or consider what the AI says except as context for understanding the human's responses.
The human is the user responding to the AI, and they are the only person whose values you should extract.

Identify core values the HUMAN expresses or implies in their messages. 
Look for what the HUMAN user cares about, what they prioritize, and what matters to them.

${conversationText}`;

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        topics: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              topic: { type: Type.STRING },
              context: { type: Type.STRING },
              score: { type: Type.NUMBER },
              reasoning: { type: Type.STRING },
              confidence: { type: Type.NUMBER },
              relevant_exchanges: { 
                type: Type.ARRAY,
                items: { type: Type.NUMBER }
              }
            },
            required: ["topic", "context", "score", "reasoning", "confidence", "relevant_exchanges"]
          }
        },
        nodes: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              topic_id: { type: Type.STRING },
              context_id: { type: Type.STRING },
              context_name: { type: Type.STRING },
              score: { type: Type.NUMBER },
              reasoning: { type: Type.STRING },
              chat_ids: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              item_ids: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              user_id: { type: Type.STRING },
              created_at: { type: Type.STRING },
              updated_at: { type: Type.STRING }
            },
            required: ["id", "topic_id", "context_id", "context_name", "score", "reasoning", "chat_ids", "item_ids", "user_id", "created_at", "updated_at"]
          }
        },
        items: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              name: { type: Type.STRING },
              chat_ids: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              embedding: {
                type: Type.ARRAY,
                items: { type: Type.NUMBER }
              },
              user_id: { type: Type.STRING },
              created_at: { type: Type.STRING },
              updated_at: { type: Type.STRING }
            },
            required: ["id", "name", "chat_ids", "embedding", "user_id", "created_at", "updated_at"]
          }
        }
      },
      required: ["topics", "nodes", "items"]
    };
    
    const responseText = await callGeminiAPI(prompt, responseSchema);
    if (responseText) {
      const parsed = JSON.parse(responseText) as ValueAnalysisResult;
      return parsed;
    } else {
      throw new Error("Empty response from API");
    }
  } catch (error) {
    console.error("Error analyzing window for values:", error);
    return {
      topics: [],
      nodes: [],
      items: []
    };
  }
} 