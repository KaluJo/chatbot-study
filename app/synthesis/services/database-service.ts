import { createClient } from '@/utils/supabase/client';

/**
 * Update the synthesis status of a chat window
 * @param windowId The ID of the chat window to update
 * @param status The synthesis status (true = synthesized, false = not synthesized)
 * @returns Success status and data or error message
 */
export async function updateWindowSynthesisStatus(
  windowId: string,
  status: boolean
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const supabase = createClient();
    
    const { data, error } = await supabase
      .from('chat_windows')
      .update({
        synthesized: status,
        updated_at: new Date().toISOString()
      })
      .eq('id', windowId)
      .select()
      .single();
    
    if (error) {
      console.error(`Error updating window synthesis status: ${error.message}`);
      return { success: false, error: error.message };
    }
    
    return { success: true, data };
  } catch (error) {
    console.error('Error in updateWindowSynthesisStatus:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}

/**
 * Batch update the synthesis status of multiple chat windows
 * @param windowIds Array of chat window IDs to update
 * @param status The synthesis status to set for all windows
 * @returns Success status and count of updated windows or error message
 */
export async function batchUpdateWindowSynthesisStatus(
  windowIds: string[],
  status: boolean
): Promise<{ success: boolean; updatedCount: number; error?: string }> {
  try {
    const supabase = createClient();
    
    // Update all windows with the given IDs
    const { data, error } = await supabase
      .from('chat_windows')
      .update({
        synthesized: status,
        updated_at: new Date().toISOString()
      })
      .in('id', windowIds);
    
    if (error) {
      console.error(`Error batch updating window synthesis status: ${error.message}`);
      return { success: false, updatedCount: 0, error: error.message };
    }
    
    return { 
      success: true, 
      updatedCount: windowIds.length
    };
  } catch (error) {
    console.error('Error in batchUpdateWindowSynthesisStatus:', error);
    return {
      success: false,
      updatedCount: 0,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}

/**
 * Get all chat windows that need synthesis for a user
 * @param userId The user ID to check windows for
 * @returns Array of chat window IDs that need synthesis
 */
export async function getWindowsForSynthesis(
  userId: string
): Promise<{ success: boolean; data?: string[]; error?: string }> {
  try {
    const supabase = createClient();
    
    // Get windows where synthesized is null or false
    const { data, error } = await supabase
      .from('chat_windows')
      .select('id')
      .eq('user_id', userId)
      .or('synthesized.is.null,synthesized.eq.false')
      .order('start_timestamp', { ascending: true });
    
    if (error) {
      console.error(`Error fetching windows for synthesis: ${error.message}`);
      return { success: false, error: error.message };
    }
    
    const windowIds = data.map(window => window.id);
    return { success: true, data: windowIds };
  } catch (error) {
    console.error('Error in getWindowsForSynthesis:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}

/**
 * Get all chat windows for a user by session ID that have potential topics and contexts
 * @param userId The user ID
 * @param sessionId The session ID
 * @returns Array of chat window IDs that are ready for synthesis
 */
export async function getWindowsReadyForSynthesis(
  userId: string,
  sessionId: string
): Promise<{ success: boolean; data?: string[]; error?: string }> {
  try {
    const supabase = createClient();
    
    // Get windows for this session with potential_topics and potential_contexts
    const { data, error } = await supabase
      .from('chat_windows')
      .select('id, potential_topics, potential_contexts')
      .eq('user_id', userId)
      .eq('session_id', sessionId)
      .order('start_timestamp', { ascending: true });
    
    if (error) {
      console.error(`Error fetching windows ready for synthesis: ${error.message}`);
      return { success: false, error: error.message };
    }
    
    // Filter windows that have both potential_topics and potential_contexts
    const readyWindowIds = data
      .filter(window => 
        window.potential_topics && 
        window.potential_topics.length > 0 && 
        window.potential_contexts && 
        window.potential_contexts.length > 0
      )
      .map(window => window.id);
    
    return { success: true, data: readyWindowIds };
  } catch (error) {
    console.error('Error in getWindowsReadyForSynthesis:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}

/**
 * Clean up topic labels in the database by normalizing them
 * This helps fix issues with slashed topics like "coffee/drinks" and similar problems
 * @param userId The user ID to clean up topics for
 * @returns Success status and counts of topics affected
 */
export async function normalizeExistingTopicLabels(
  userId: string
): Promise<{ success: boolean; updatedCount: number; error?: string }> {
  try {
    const supabase = createClient();
    let updatedCount = 0;
    
    // Get all topics for the user
    const { data: topics, error: fetchError } = await supabase
      .from('topics')
      .select('id, label, related_labels')
      .eq('user_id', userId);
      
    if (fetchError) {
      console.error(`Error fetching topics for normalization: ${fetchError.message}`);
      return { success: false, updatedCount: 0, error: fetchError.message };
    }
    
    if (!topics || topics.length === 0) {
      return { success: true, updatedCount: 0 };
    }
    
    console.log(`Found ${topics.length} topics to check for normalization`);
    
    // Process each topic
    for (const topic of topics) {
      const originalLabel = topic.label;
      const normalizedLabel = normalizeTopicLabel(originalLabel);
      
      // Check if the label needs normalization
      if (normalizedLabel !== originalLabel) {
        console.log(`Normalizing topic label: "${originalLabel}" → "${normalizedLabel}"`);
        
        // Update the topic with the normalized label
        const { error: updateError } = await supabase
          .from('topics')
          .update({
            label: normalizedLabel,
            updated_at: new Date().toISOString()
          })
          .eq('id', topic.id);
          
        if (updateError) {
          console.error(`Error updating topic ${topic.id}: ${updateError.message}`);
          continue;
        }
        
        updatedCount++;
      }
      
      // Check related labels for normalization
      if (topic.related_labels && Array.isArray(topic.related_labels) && topic.related_labels.length > 0) {
        const originalRelatedLabels = [...topic.related_labels];
        const normalizedRelatedLabels = originalRelatedLabels.map(label => normalizeTopicLabel(label));
        
        // Check if any related labels changed
        const labelsChanged = originalRelatedLabels.some((label, index) => label !== normalizedRelatedLabels[index]);
        
        if (labelsChanged) {
          console.log(`Normalizing related labels for topic ${topic.id}`);
          
          // Update the topic with normalized related labels
          const { error: updateError } = await supabase
            .from('topics')
            .update({
              related_labels: normalizedRelatedLabels,
              updated_at: new Date().toISOString()
            })
            .eq('id', topic.id);
            
          if (updateError) {
            console.error(`Error updating related labels for topic ${topic.id}: ${updateError.message}`);
            continue;
          }
          
          updatedCount++;
        }
      }
    }
    
    return { success: true, updatedCount };
  } catch (error) {
    console.error('Error in normalizeExistingTopicLabels:', error);
    return {
      success: false,
      updatedCount: 0,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}

/**
 * Normalize a topic label by removing slashes, fixing format, etc.
 */
function normalizeTopicLabel(label: string): string {
  if (!label) return '';
  
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

/**
 * Merge two topics together, combining their related labels and updating any value nodes
 * @param sourceTopicId The topic to merge from (will be deleted after updating references)
 * @param targetTopicId The topic to merge into (will be kept)
 * @param userId The user ID for validation
 * @returns Success status and merged topic data
 */
export async function mergeTopics(
  sourceTopicId: string,
  targetTopicId: string,
  userId: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const supabase = createClient();
    
    // Verify both topics belong to the same user
    const { data: topics, error: topicsError } = await supabase
      .from('topics')
      .select('id, label, related_labels, reasoning, user_id')
      .in('id', [sourceTopicId, targetTopicId])
      .eq('user_id', userId);
    
    if (topicsError) {
      console.error(`Error fetching topics: ${topicsError.message}`);
      return { success: false, error: topicsError.message };
    }
    
    if (!topics || topics.length !== 2) {
      return { success: false, error: `Could not find both topics for user ${userId}` };
    }
    
    // Identify source and target topics
    const sourceTopic = topics.find(t => t.id === sourceTopicId);
    const targetTopic = topics.find(t => t.id === targetTopicId);
    
    if (!sourceTopic || !targetTopic) {
      return { success: false, error: `Could not identify source and target topics correctly` };
    }

    console.log(`Merging topic "${sourceTopic.label}" into "${targetTopic.label}"`);
    
    try {
      // 1. Merge related labels - add source's main label and related labels to target's related labels
      const sourceLabels = [sourceTopic.label, ...(sourceTopic.related_labels || [])];
      let targetRelatedLabels = [...(targetTopic.related_labels || [])];
      
      // Add source labels, but avoid adding the target's main label as a related label
      for (const label of sourceLabels) {
        if (label !== targetTopic.label && !targetRelatedLabels.includes(label)) {
          targetRelatedLabels.push(label);
        }
      }
      
      // Merge reasoning if both exist
      let mergedReasoning = targetTopic.reasoning || '';
      if (sourceTopic.reasoning) {
        if (mergedReasoning) {
          mergedReasoning += `\n\nMerged with topic "${sourceTopic.label}":\n${sourceTopic.reasoning}`;
        } else {
          mergedReasoning = sourceTopic.reasoning;
        }
      }
      
      // 2. Update target topic with merged related labels
      const { error: updateError } = await supabase
        .from('topics')
        .update({
          related_labels: targetRelatedLabels,
          reasoning: mergedReasoning,
          updated_at: new Date().toISOString()
        })
        .eq('id', targetTopicId);
      
      if (updateError) {
        console.error(`Error updating target topic: ${updateError.message}`);
        return { success: false, error: updateError.message };
      }
      
      // 3. Update all value nodes that reference source topic to reference target topic
      const { data: updatedNodes, error: nodeUpdateError } = await supabase
        .from('value_nodes')
        .update({
          topic_id: targetTopicId,
          updated_at: new Date().toISOString()
        })
        .eq('topic_id', sourceTopicId)
        .eq('user_id', userId)
        .select('id');
      
      if (nodeUpdateError) {
        console.error(`Error updating value nodes: ${nodeUpdateError.message}`);
        return { success: false, error: nodeUpdateError.message };
      }
      
      // 4. Find and merge any duplicate value nodes (same context)
      const duplicateNodesResult = await findAndMergeDuplicateNodes(targetTopicId, userId);
      if (!duplicateNodesResult.success) {
        console.warn(`Warning during duplicate node merge: ${duplicateNodesResult.error}`);
      }
      
      // 5. Delete the source topic after all references are updated
      const { error: deleteError } = await supabase
        .from('topics')
        .delete()
        .eq('id', sourceTopicId);
      
      if (deleteError) {
        console.error(`Error deleting source topic: ${deleteError.message}`);
        return { success: false, error: deleteError.message };
      }
      
      // Get the updated target topic
      const { data: updatedTopic, error: fetchError } = await supabase
        .from('topics')
        .select('*')
        .eq('id', targetTopicId)
        .single();
      
      if (fetchError) {
        console.error(`Error fetching updated topic: ${fetchError.message}`);
        return { success: true, error: 'Topic merged but could not fetch updated data' };
      }
      
      return {
        success: true,
        data: {
          topic: updatedTopic,
          updatedNodeCount: updatedNodes?.length || 0
        }
      };
    } catch (error) {
      console.error('Error during merge operation:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'An error occurred during the merge operation'
      };
    }
  } catch (error) {
    console.error('Error in mergeTopics:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}

/**
 * Helper function to find and merge duplicate value nodes for a topic
 * @param topicId The topic ID to check for duplicates
 * @param userId The user ID for validation
 */
async function findAndMergeDuplicateNodes(
  topicId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createClient();

    // Find all value nodes for this topic
    const { data: valueNodes, error: fetchError } = await supabase
      .from('value_nodes')
      .select('id, context_id, score, reasoning, chat_ids, item_ids, updated_at')
      .eq('topic_id', topicId)
      .eq('user_id', userId);

    if (fetchError) {
      return { success: false, error: fetchError.message };
    }

    if (!valueNodes || valueNodes.length <= 1) {
      return { success: true }; // No duplicates possible
    }

    // Group nodes by context_id to find duplicates
    const nodesByContext = valueNodes.reduce((acc, node) => {
      const contextId = node.context_id;
      if (!acc[contextId]) {
        acc[contextId] = [];
      }
      acc[contextId].push(node);
      return acc;
    }, {} as Record<string, any[]>);

    // Process each context group with multiple nodes
    for (const [contextId, nodes] of Object.entries(nodesByContext)) {
      if (nodes.length < 2) continue; // No duplicates for this context

      console.log(`Found ${nodes.length} duplicate nodes for topic ${topicId} in context ${contextId}`);

      // Sort by updated_at (newest first)
      nodes.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

      // Keep the most recently updated node
      const keepNode = nodes[0];
      const mergeNodes = nodes.slice(1);
      const mergeNodeIds = mergeNodes.map(n => n.id);

      // Merge chat_ids and item_ids from all duplicates
      let allChatIds = [...(keepNode.chat_ids || [])];
      let allItemIds = [...(keepNode.item_ids || [])];
      let combinedReasoning = keepNode.reasoning || '';

      for (const node of mergeNodes) {
        // Add chat_ids and item_ids
        if (node.chat_ids) {
          allChatIds = [...allChatIds, ...node.chat_ids];
        }
        if (node.item_ids) {
          allItemIds = [...allItemIds, ...node.item_ids];
        }

        // Append reasoning
        if (node.reasoning) {
          combinedReasoning += `\n\nMerged from duplicate node:\n${node.reasoning}`;
        }
      }

      // Remove duplicates
      allChatIds = Array.from(new Set(allChatIds));
      allItemIds = Array.from(new Set(allItemIds));

      // Update the node to keep with combined data
      const { error: updateError } = await supabase
        .from('value_nodes')
        .update({
          chat_ids: allChatIds,
          item_ids: allItemIds,
          reasoning: combinedReasoning,
          updated_at: new Date().toISOString()
        })
        .eq('id', keepNode.id);

      if (updateError) {
        console.warn(`Error updating merged node ${keepNode.id}: ${updateError.message}`);
        continue;
      }

      // Delete the other duplicate nodes
      const { error: deleteError } = await supabase
        .from('value_nodes')
        .delete()
        .in('id', mergeNodeIds);

      if (deleteError) {
        console.warn(`Error deleting duplicate nodes: ${deleteError.message}`);
      }
    }

    return { success: true };
  } catch (error) {
    console.error('Error finding and merging duplicate nodes:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
} 