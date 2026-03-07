export interface ChatPair {
  llm_message: string;
  human_message: string;
  timestamp: string;
}

export interface ClientChatWindow {
  id: string;
  clientId?: string;
  chat_ids: string[];
  chat_data: ChatPair[];
  start_timestamp: string;
  end_timestamp: string;
  potential_topics: string[];
  potential_contexts: string[];
  potential_items: string[];
  user_id?: string;
} 