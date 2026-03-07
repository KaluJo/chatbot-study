'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { createClient } from '@/utils/supabase/client';
// import { interpolateGreens, interpolateReds } from 'd3-scale-chromatic'; // For color scales - Install if needed
import { 
  GraphData, ContextDefinition, GraphNode, GraphLink,
  Conversation, Topic, ValueNode as DbValueNode, DatabaseItem 
} from '../components/visualization/types';
import { normalizeMessageProperties } from '@/app/utils/chat-formatting';
import { isDemoMode } from '@/lib/demo';
import { useDemoData } from './DemoDataContext';

interface VisualizationContextType {
  graphData: GraphData | null;
  loading: boolean;
  error: string | null;
  refreshData: () => Promise<void>;
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  conversations: Map<string, Conversation>;
  loadingConversations: boolean;
}

interface VisualizationProviderProps {
  children: ReactNode;
  userId: string;
  initialContexts?: ContextDefinition[];
}

const VisualizationContext = createContext<VisualizationContextType | undefined>(undefined);

export const useVisualization = () => {
  const context = useContext(VisualizationContext);
  if (context === undefined) {
    throw new Error('useVisualization must be used within a VisualizationProvider');
  }
  return context;
};

// Helper to generate colors for topic nodes based on score
const getTopicColor = (score: number | undefined): string => {
  const s = score || 0;
  // Placeholder colors - replace with d3.interpolateGreens/Reds if d3-scale-chromatic is installed
  if (s > 3) return '#2ca02c'; // Strong Green
  if (s > 0) return '#98df8a'; // Light Green
  if (s < -3) return '#d62728'; // Strong Red
  if (s < 0) return '#ff9896'; // Light Red
  return '#d1d1d1'; // Neutral color
};

// Helper to generate colors for item nodes based on occurrence count
const getItemColor = (occurrenceCount: number | undefined): string => {
  const count = occurrenceCount || 0;
  // Placeholder colors
  if (count > 5) return '#1f77b4'; // Darker blue for many occurrences
  if (count > 2) return '#aec7e8'; // Medium blue
  if (count > 0) return '#c3e4ea'; // Light blue
  return '#e0f0f3'; // Default/few occurrences
};

function transformDataForVisualization(
  rawContexts: ContextDefinition[],
  rawTopics: Topic[], 
  rawValueNodes: DbValueNode[], 
  rawDatabaseItems: DatabaseItem[]
): GraphData {
  const finalGraphNodes: GraphNode[] = [];
  const finalGraphLinks: GraphLink[] = [];

  // 1. Transform and map contexts
  const contextMap = new Map<string, ContextDefinition>();
  rawContexts.forEach(contextDef => {
    contextMap.set(contextDef.id, contextDef);
  });

  // Create context graph nodes
  rawContexts.forEach(contextDef => {
    finalGraphNodes.push({
      id: `context-${contextDef.id}`,
      uuid: contextDef.id,
      dbId: contextDef.id,
      type: 'context',
      label: contextDef.name,
      contextId: contextDef.id,
      contextName: contextDef.name,
      radius: 40,
      color: '#e9e9e9'
    });
  });

  // 2. Map topics
  const topicMap = new Map<string, Topic>();
  rawTopics.forEach(t => topicMap.set(t.id, t));

  // 3. Map items
  const itemMap = new Map<string, DatabaseItem>();
  rawDatabaseItems.forEach(i => itemMap.set(i.id, i));

  // 4. Calculate global item occurrences
  const globalItemOccurrences = new Map<string, number>();
  rawValueNodes.forEach(vNode => {
    (vNode.item_ids || []).forEach((itemId: string) => {
      globalItemOccurrences.set(itemId, (globalItemOccurrences.get(itemId) || 0) + 1);
    });
  });

  // 5. Process ValueNodes to create Topic Nodes, Item Nodes, and Links
  rawValueNodes.forEach(vNode => {
    const topicEntity = topicMap.get(vNode.topic_id);
    const contextEntity = contextMap.get(vNode.context_id);

    if (!topicEntity || !contextEntity) {
      console.warn('Skipping value_node due to missing topic or context:', vNode, {topicId: vNode.topic_id, contextId: vNode.context_id, availableContextIds: Array.from(contextMap.keys()) });
      return;
    }

    const topicGraphNodeId = `valuenode-${vNode.id}`;
    const topicGraphNode: GraphNode = {
      id: topicGraphNodeId,
      uuid: topicEntity.id,
      dbId: vNode.id,
      type: 'topic',
      label: topicEntity.label,
      contextId: contextEntity.id,
      contextName: contextEntity.name,
      topicId: topicEntity.id,
      score: vNode.score,
      reasoning: vNode.reasoning,
      conversationUUIDs: vNode.chat_ids || [],
      radius: 10 + Math.abs(vNode.score || 0) * 1.5,
      color: getTopicColor(vNode.score),
    };
    finalGraphNodes.push(topicGraphNode);

    finalGraphLinks.push({
      source: `context-${contextEntity.id}`,
      target: topicGraphNodeId,
      value: 1,
      type: 'context-topic'
    });

    (vNode.item_ids || []).forEach((itemId: string, index: number) => {
      const itemEntity = itemMap.get(itemId);
      if (!itemEntity) {
        console.warn(`Item with id ${itemId} not found for value_node ${vNode.id}`);
        return;
      }

      const itemGraphNodeId = `item-${itemEntity.id}-for-${topicGraphNodeId}`;
      const occurrenceCount = globalItemOccurrences.get(itemEntity.id) || 0;
      const itemCountForThisTopic = (vNode.item_ids || []).length;
      
      const itemGraphNode: GraphNode = {
        id: itemGraphNodeId,
        uuid: itemEntity.id,
        dbId: itemEntity.id,
        type: 'valueItem',
        label: itemEntity.name,
        contextId: contextEntity.id,
        contextName: contextEntity.name,
        topicId: topicGraphNodeId,
        canonicalItemUUID: itemEntity.id,
        conversationUUIDs: itemEntity.chat_ids || [],
        occurrenceCount: occurrenceCount,
        radius: 6 + Math.min(occurrenceCount * 1.5, 12),
        color: getItemColor(occurrenceCount),
        initialAngle: (2 * Math.PI * index) / Math.max(itemCountForThisTopic, 1),
        initialRadius: 35 + (itemCountForThisTopic * 2.5) 
      };
      finalGraphNodes.push(itemGraphNode);

      finalGraphLinks.push({
        source: topicGraphNodeId,
        target: itemGraphNodeId,
        value: 0.8,
        type: 'topic-item'
      });
    });
  });

  console.log(`Transformed data: ${rawContexts.length} contexts, ${finalGraphNodes.length} total graph nodes, ${finalGraphLinks.length} links`);
  
  return {
    contexts: rawContexts,
    nodes: finalGraphNodes,
    links: finalGraphLinks
  };
}

export const VisualizationProvider: React.FC<VisualizationProviderProps> = ({ children, userId, initialContexts }) => {
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Map<string, Conversation>>(new Map());
  const [loadingConversations, setLoadingConversations] = useState<boolean>(false);
  const demoData = useDemoData();

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    // Demo mode: build graph from pre-loaded JSON, no Supabase calls needed
    if (isDemoMode && demoData) {
      try {
        const contextDataToTransform: ContextDefinition[] = demoData.contexts.map(c => ({
          id: c.id,
          name: c.name,
          description: c.description ?? '',
        }));
        const topicData: Topic[] = demoData.topics.map(t => ({
          id: t.id,
          label: t.label,
          related_labels: t.related_labels,
          reasoning: t.reasoning,
          user_id: userId,
        }));
        const valueNodeData: DbValueNode[] = demoData.valueNodes.map(vn => ({
          id: vn.id,
          topic_id: (vn as unknown as Record<string, string>).topic_id,
          context_id: (vn as unknown as Record<string, string>).context_id,
          score: vn.score,
          reasoning: vn.reasoning,
          chat_ids: vn.chat_ids,
          item_ids: (vn as unknown as Record<string, string[]>).item_ids ?? [],
          user_id: userId,
        }));
        const itemData: DatabaseItem[] = demoData.items.map(item => ({
          id: item.id,
          name: item.name,
          chat_ids: item.chat_ids ?? [],
          user_id: userId,
        }));
        const transformedData = transformDataForVisualization(
          contextDataToTransform, topicData, valueNodeData, itemData
        );
        setGraphData(transformedData);
        // Build conversations map from demo chatlog
        const convMap = new Map<string, Conversation>();
        demoData.chatlog.forEach(entry => {
          convMap.set(entry.id, {
            uuid: entry.id,
            llm_message: entry.llm_message,
            human_message: entry.human_message,
            timestamp: entry.timestamp,
            sessionId: entry.session_id,
          });
        });
        setConversations(convMap);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load demo graph data');
      } finally {
        setLoading(false);
        setLoadingConversations(false);
      }
      return;
    }
    
    try {
      const supabase = createClient();
      let contextDataToTransform: ContextDefinition[];

      if (initialContexts) {
        console.log("Using provided initialContexts:", initialContexts);
        contextDataToTransform = initialContexts;
      } else {
        console.log("Fetching all contexts from database...");
        const { data: dbContextData, error: contextError } = await supabase
        .from('contexts')
          .select('id, name, description'); // Ensure all fields for ContextDefinition are fetched
      if (contextError) throw new Error(`Error fetching contexts: ${contextError.message}`);
        
        // Deduplicate contexts by name (keep first occurrence of each name)
        const seenNames = new Set<string>();
        const deduplicatedContexts = (dbContextData || []).filter(c => {
          if (seenNames.has(c.name)) {
            console.warn(`Duplicate context found: "${c.name}" (id: ${c.id}) - skipping`);
            return false;
          }
          seenNames.add(c.name);
          return true;
        });
        
        contextDataToTransform = deduplicatedContexts.map(c => ({ id: c.id, name: c.name, description: c.description || '' }));
        console.log(`Deduplicated ${dbContextData?.length || 0} contexts to ${contextDataToTransform.length} unique contexts`);
      }
      
      const { data: topicData, error: topicError } = await supabase
        .from('topics')
        .select('id, label, user_id') 
        .eq('user_id', userId);
      if (topicError) throw new Error(`Error fetching topics: ${topicError.message}`);
      
      const { data: valueNodeData, error: valueNodeError } = await supabase
        .from('value_nodes')
        .select('id, topic_id, context_id, score, reasoning, chat_ids, item_ids') 
        .eq('user_id', userId);
      if (valueNodeError) throw new Error(`Error fetching value nodes: ${valueNodeError.message}`);
      
      const { data: itemData, error: itemError } = await supabase
        .from('items')
        .select('id, name, chat_ids, user_id') 
        .eq('user_id', userId);
      if (itemError) throw new Error(`Error fetching items: ${itemError.message}`);
      
      const transformedData = transformDataForVisualization(
        contextDataToTransform, 
        topicData as Topic[] || [], 
        valueNodeData as DbValueNode[] || [], 
        itemData as DatabaseItem[] || []
      );
      
      setGraphData(transformedData);
      fetchConversations(transformedData);

    } catch (err) {
      console.error('Error fetching graph data:', err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  const fetchConversations = async (data: GraphData | null) => { 
    if (!data || !data.nodes) { 
        setLoadingConversations(false);
        return;
    }
    setLoadingConversations(true);
    try {
      const allChatUUIDs = new Set<string>();
      
      data.nodes.forEach(node => {
        if (node.conversationUUIDs) {
          node.conversationUUIDs.forEach(uuid => allChatUUIDs.add(uuid));
        }
      });
      
      const uuidArray = Array.from(allChatUUIDs);
      
      if (uuidArray.length === 0) {
        console.log('No specific chat UUIDs found in graph nodes, fetching most recent chatlogs for user');
        const supabase = createClient();
        const { data: recentChatlogData, error: recentError } = await supabase
          .from('chatlog')
          .select('id, llm_message, human_message, timestamp, session_id, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(20); 
        
        if (recentError) {
          console.error('Error fetching recent conversations:', recentError);
          setLoadingConversations(false);
          return;
        }
        
        const newMap = new Map<string, Conversation>();
        recentChatlogData?.forEach((conv: any) => {
          const normalizedConv = normalizeMessageProperties(conv);
          newMap.set(conv.id, {
            uuid: conv.id,
            llm_message: normalizedConv.llm_message,
            human_message: normalizedConv.human_message,
            timestamp: conv.timestamp || conv.created_at,
            sessionId: conv.session_id
          });
        });
        setConversations(newMap);
        setLoadingConversations(false);
        return;
      }
      
      const supabase = createClient();
      const { data: chatlogData, error } = await supabase
        .from('chatlog')
        .select('id, llm_message, human_message, timestamp, session_id, created_at')
        .in('id', uuidArray) 
        .eq('user_id', userId); 
      
      if (error) {
        console.error('Error fetching conversations from chatlog:', error);
        setLoadingConversations(false);
        return;
      }
      
      const newMap = new Map<string, Conversation>();
      chatlogData?.forEach((conv: any) => {
        const normalizedConv = normalizeMessageProperties(conv);
        newMap.set(conv.id, {
          uuid: conv.id,
          llm_message: normalizedConv.llm_message,
          human_message: normalizedConv.human_message,
          timestamp: conv.timestamp || conv.created_at,
          sessionId: conv.session_id
        });
      });
      setConversations(newMap);

    } catch (err) {
      console.error('Failed to fetch conversations:', err);
    } finally {
      setLoadingConversations(false);
    }
  };

  const debugDatabaseConnection = async () => { /* ... existing code ... */ };
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      // debugDatabaseConnection();
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [userId, initialContexts]);

  const value = {
    graphData,
    loading,
    error,
    refreshData: fetchData,
    selectedNodeId,
    setSelectedNodeId,
    conversations,
    loadingConversations
  };

  return (
    <VisualizationContext.Provider value={value}>
      {children}
    </VisualizationContext.Provider>
  );
}; 