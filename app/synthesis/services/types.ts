/**
 * Types for the Value Graph system
 */

// DB Entity Types

export interface Topic {
  id: string;
  label: string;
  related_labels: string[];
  embedding?: number[] | null;
  reasoning?: string | null;
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

export interface ValueNode {
  id: string;
  topic_id: string;
  context_id: string;
  score: number; // Integer between -7 and 7
  reasoning?: string | null;
  chat_ids: string[];
  item_ids?: string[];
  user_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Item {
  id: string;
  name: string;
  chat_ids: string[];
  embedding?: number[] | null;
  user_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ChatWindow {
  id: string;
  chat_ids: string[];
  chat_data: ChatPair[];
  start_timestamp: string;
  end_timestamp: string;
  potential_topics: string[];
  potential_contexts: string[];
  potential_items: string[];
  user_id?: string | null;
  session_id?: string | null;
  synthesized?: boolean | null; // Indicates whether this window has been synthesized
  created_at?: string;
  updated_at?: string;
}

export interface ChatPair {
  llm_message: string;
  human_message: string;
  timestamp: string;
}

// Processing and Analysis Types

export interface TopicCandidate {
  label: string;
  confidence: number;
  reasoning: string;
}

export enum TopicAction {
  CREATE_NEW = 'CREATE_NEW',
  MERGE_WITH_EXISTING = 'MERGE_WITH_EXISTING',
  DISCARD = 'DISCARD'
}

export interface TopicProcessingResult {
  label: string;
  action: TopicAction;
  existingTopicId?: string;
  shouldReplaceMainLabel?: boolean;
  reasoning: string;
  confidence: number;
}

export interface TopicSimilarityResult {
  id: string;
  label: string;
  similarity: number;
  related_labels: string[];
}

export interface ReasoningResult {
  topic: string;
  topic_id: string; 
  context: string;
  context_id: string;
  sentiment: string; // The adjective describing feeling
  sentiment_score: number; // Integer between -7 and 7
  evidence: {
    llm_snippets: string[];
    human_snippets: string[];
  };
  reasoning: string;
  confidence: number; // Between 0 and 1
}

export interface ItemProcessingResult {
  name: string;
  confidence: number;
  reasoning: string;
  item_id?: string;
}

export interface GraphProcessingResult {
  topics_created: Topic[];
  topics_updated: Topic[];
  nodes_created: ValueNode[];
  nodes_updated: ValueNode[];
  items_created: Item[];
  items_updated: Item[];
  reasoning_results: ReasoningResult[];
  discarded_topics: string[];
  extracted_items: ItemProcessingResult[];
} 