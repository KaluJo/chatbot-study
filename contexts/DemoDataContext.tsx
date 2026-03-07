'use client';

import React, { createContext, useContext } from 'react';
import demoData from '@/data/demo-user.json';

export interface DemoProfile {
  id: string;
  name: string;
  email: string | null;
  access_code: string;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

export interface DemoChatlogEntry {
  id: string;
  llm_message: string;
  human_message: string;
  timestamp: string;
  user_id: string;
  session_id: string;
  created_at: string;
  updated_at: string;
}

export interface DemoValueNode {
  id: string;
  score: number;
  reasoning: string;
  chat_ids: string[];
  item_ids: string[];
  topic_label: string;
  context_label: string;
}

export interface DemoTopic {
  id: string;
  label: string;
  related_labels: string[];
  reasoning: string;
  created_at: string;
  updated_at: string;
}

export interface DemoContext {
  id: string;
  name: string;
  description: string;
  created_at: string;
}

export interface DemoItem {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  chat_ids: string[];
}

export interface DemoPvqResponse {
  user_id: string;
  gender: string;
  submitted_at: string;
  user_generated_q1: string;
  user_generated_q2: string;
  user_generated_q3: string;
  [key: string]: string | number;
}

export interface DemoLlmIndividualResponse {
  user_id: string;
  model_name: string;
  raw_responses: Record<string, string>;
  prompt_metadata: Record<string, unknown>;
  [key: string]: unknown;
}

export interface DemoLlmBatchResponse {
  user_id: string;
  [key: string]: unknown;
}

export interface DemoStage1Experiment {
  id: string;
  user_id: string;
  final_choice: string | null;
  round_1_winner: string | null;
  round_2_winner: string | null;
  round_3_winner: string | null;
  [key: string]: unknown;
}

export interface DemoStage2Round {
  id: string;
  user_id: string;
  round_number: number;
  scenario_name: string;
  scenario_prompt: string;
  scenario_type: string;
  user_embodiment_response: string;
  user_embodiment_reasoning: string;
  anti_user_response: string;
  anti_user_reasoning: string;
  schwartz_values_response: string;
  schwartz_values_reasoning: string;
  random_schwartz_response: string;
  random_schwartz_reasoning: string;
  user_embodiment_rating: number | null;
  anti_user_rating: number | null;
  schwartz_values_rating: number | null;
  random_schwartz_rating: number | null;
  [key: string]: unknown;
}

export interface DemoStrategy {
  id: string;
  user_id: string;
  strategy_data: {
    insights: Array<{ pattern: string; approach: string }>;
    shared_memories: Array<{
      what_happened: string;
      when_it_happened: string;
      how_to_reference: string;
      memory_type: string;
    }>;
    user_profile: string;
    conversation_goals: string[];
  };
  time_of_day: string;
  created_at: string;
}

export interface DemoChatFeedback {
  id: number | string;
  created_at: string;
  user_id: string;
  session_id: string;
  rating: number | null;
  feedback_text: string | null;
}

interface DemoDataContextType {
  profile: DemoProfile;
  chatlog: DemoChatlogEntry[];
  valueNodes: DemoValueNode[];
  topics: DemoTopic[];
  contexts: DemoContext[];
  items: DemoItem[];
  pvqResponses: DemoPvqResponse[];
  llmIndividualResponses: DemoLlmIndividualResponse[];
  llmBatchResponses: DemoLlmBatchResponse[];
  stage1Experiment: DemoStage1Experiment[];
  stage2Experiment: DemoStage2Round[];
  conversationStrategies: DemoStrategy[];
  chatFeedback: DemoChatFeedback[];
  getSessionMessages: (sessionId: string) => DemoChatlogEntry[];
}

const DemoDataContext = createContext<DemoDataContextType | undefined>(undefined);

export const useDemoData = (): DemoDataContextType | null => {
  return useContext(DemoDataContext) ?? null;
};

export const DemoDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const data = demoData as unknown as {
    profile: DemoProfile[];
    chatlog: DemoChatlogEntry[];
    chatWindows: unknown[];
    valueNodes: DemoValueNode[];
    topics: DemoTopic[];
    contexts: DemoContext[];
    items: DemoItem[];
    pvqResponses: DemoPvqResponse[];
    llmIndividualResponses: DemoLlmIndividualResponse[];
    llmBatchResponses: DemoLlmBatchResponse[];
    stage1Experiment: DemoStage1Experiment[];
    stage2Experiment: DemoStage2Round[];
    conversationStrategies: DemoStrategy[];
    chatFeedback: DemoChatFeedback[];
  };

  const getSessionMessages = (sessionId: string) =>
    data.chatlog.filter((m) => m.session_id === sessionId);

  const value: DemoDataContextType = {
    profile: data.profile[0],
    chatlog: data.chatlog,
    valueNodes: data.valueNodes,
    topics: data.topics,
    contexts: data.contexts,
    items: data.items,
    pvqResponses: data.pvqResponses,
    llmIndividualResponses: data.llmIndividualResponses,
    llmBatchResponses: data.llmBatchResponses,
    stage1Experiment: data.stage1Experiment,
    stage2Experiment: data.stage2Experiment,
    conversationStrategies: data.conversationStrategies,
    chatFeedback: data.chatFeedback,
    getSessionMessages,
  };

  return <DemoDataContext.Provider value={value}>{children}</DemoDataContext.Provider>;
};
