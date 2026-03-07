'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Conversation } from '../components/visualization/types';
import { normalizeMessageProperties } from '@/app/utils/chat-formatting';

interface ChatlogContextType {
  allUserChatlogs: Conversation[];
  userChatlogsLoading: boolean;
  userChatlogsError: string | null;
  refreshChatlogs: () => Promise<void>;
}

interface ChatlogProviderProps {
  children: ReactNode;
  userId: string;
}

const ChatlogContext = createContext<ChatlogContextType | undefined>(undefined);

export const useChatlog = () => {
  const context = useContext(ChatlogContext);
  if (context === undefined) {
    throw new Error('useChatlog must be used within a ChatlogProvider');
  }
  return context;
};

export const ChatlogProvider: React.FC<ChatlogProviderProps> = ({ children, userId }) => {
  const [allUserChatlogs, setAllUserChatlogs] = useState<Conversation[]>([]);
  const [userChatlogsLoading, setUserChatlogsLoading] = useState<boolean>(true);
  const [userChatlogsError, setUserChatlogsError] = useState<string | null>(null);

  const fetchUserChatlogs = async () => {
    if (!userId) return;
    
    setUserChatlogsLoading(true);
    setUserChatlogsError(null);
    
    try {
      const supabase = createClient();
      
      // Fetch all chatlogs for this user
      const { data, error } = await supabase
        .from('chatlog')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false });
      
      if (error) {
        throw new Error(`Error fetching user chatlogs: ${error.message}`);
      }
      
      // Transform to Conversation objects using the updated property names
      const transformedChatlogs: Conversation[] = data.map((log: any) => ({
        uuid: log.id, // Using id as uuid since that's what the table uses
        llm_message: log.llm_message || 'No message available',
        human_message: log.human_message || 'No message available',
        timestamp: log.timestamp || log.created_at,
        sessionId: log.session_id
      }));
      
      console.log(`Fetched ${transformedChatlogs.length} chatlogs for user ${userId}`);
      setAllUserChatlogs(transformedChatlogs);
    } catch (err) {
      console.error('Failed to fetch user chatlogs:', err);
      setUserChatlogsError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setUserChatlogsLoading(false);
    }
  };

  // Initially fetch user chatlogs
  useEffect(() => {
    fetchUserChatlogs();
  }, [userId]); // Re-fetch when userId changes

  const value = {
    allUserChatlogs,
    userChatlogsLoading,
    userChatlogsError,
    refreshChatlogs: fetchUserChatlogs
  };

  return (
    <ChatlogContext.Provider value={value}>
      {children}
    </ChatlogContext.Provider>
  );
}; 