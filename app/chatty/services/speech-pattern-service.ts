import { createClient } from '@/utils/supabase/client';

export interface ChatMessage {
  id: string;
  human_message: string;
  llm_message: string;
  timestamp: string;
  user_id: string;
  session_id: string;
}

export interface SpeechPatternSample {
  userMessages: ChatMessage[];
  otherUsersMessages: ChatMessage[];
}

/**
 * Get random chatlog samples for speech pattern comparison with temporal distribution
 * @param currentUserId - The current user's ID to exclude from "other users" samples
 * @param userSampleCount - Number of messages to get from current user (default: 10)
 * @param otherUsersSampleCount - Number of messages to get from other users (default: 20)
 */
export async function getSpeechPatternSamples(
  currentUserId: string,
  userSampleCount: number = 10,
  otherUsersSampleCount: number = 20
): Promise<{ success: boolean; data?: SpeechPatternSample; error?: string }> {
  try {
    const supabase = createClient();
    
    console.log(`Getting speech pattern samples: ${userSampleCount} from current user, ${otherUsersSampleCount} from others`);
    
    // Cutoff date for temporal distribution analysis
    // This can be configured via environment variable for different studies
    // Default: 30 days ago from current date
    const defaultCutoff = new Date();
    defaultCutoff.setDate(defaultCutoff.getDate() - 30);
    const cutoffDate = process.env.NEXT_PUBLIC_SPEECH_PATTERN_CUTOFF_DATE || defaultCutoff.toISOString();
    
    // Split user samples: half from before cutoff, half from recent
    const userOlderCount = Math.floor(userSampleCount / 2);
    const userRecentCount = userSampleCount - userOlderCount;
    
    // Get older messages from current user (before July 22, 2025)
    const { data: userOlderMessages, error: userOlderError } = await supabase
      .from('chatlog')
      .select('*')
      .eq('user_id', currentUserId)
      .not('human_message', 'is', null)
      .not('llm_message', 'is', null)
      .lt('timestamp', cutoffDate)
      .order('timestamp', { ascending: false })
      .limit(50);
    
    if (userOlderError) {
      console.error('Error getting older user messages:', userOlderError);
      return { success: false, error: `Error getting older user messages: ${userOlderError.message}` };
    }
    
    // Get recent messages from current user (after July 22, 2025)
    const { data: userRecentMessages, error: userRecentError } = await supabase
      .from('chatlog')
      .select('*')
      .eq('user_id', currentUserId)
      .not('human_message', 'is', null)
      .not('llm_message', 'is', null)
      .gte('timestamp', cutoffDate)
      .order('timestamp', { ascending: false })
      .limit(50);
    
    if (userRecentError) {
      console.error('Error getting recent user messages:', userRecentError);
      return { success: false, error: `Error getting recent user messages: ${userRecentError.message}` };
    }
    
    // Split other user samples: half from before cutoff, half from recent
    const otherOlderCount = Math.floor(otherUsersSampleCount / 2);
    const otherRecentCount = otherUsersSampleCount - otherOlderCount;
    
    // Get older messages from other users (before July 22, 2025)
    const { data: otherOlderMessages, error: otherOlderError } = await supabase
      .from('chatlog')
      .select('*')
      .neq('user_id', currentUserId)
      .not('human_message', 'is', null)
      .not('llm_message', 'is', null)
      .not('user_id', 'is', null)
      .lt('timestamp', cutoffDate)
      .order('timestamp', { ascending: false })
      .limit(100);
    
    if (otherOlderError) {
      console.error('Error getting older other user messages:', otherOlderError);
      return { success: false, error: `Error getting older other user messages: ${otherOlderError.message}` };
    }
    
    // Get recent messages from other users (after July 22, 2025)
    const { data: otherRecentMessages, error: otherRecentError } = await supabase
      .from('chatlog')
      .select('*')
      .neq('user_id', currentUserId)
      .not('human_message', 'is', null)
      .not('llm_message', 'is', null)
      .not('user_id', 'is', null)
      .gte('timestamp', cutoffDate)
      .order('timestamp', { ascending: false })
      .limit(100);
    
    if (otherRecentError) {
      console.error('Error getting recent other user messages:', otherRecentError);
      return { success: false, error: `Error getting recent other user messages: ${otherRecentError.message}` };
    }
    
    // Sample from each time period
    const sampledUserOlder = shuffleArray(userOlderMessages || []).slice(0, userOlderCount);
    const sampledUserRecent = shuffleArray(userRecentMessages || []).slice(0, userRecentCount);
    const sampledOtherOlder = shuffleArray(otherOlderMessages || []).slice(0, otherOlderCount);
    const sampledOtherRecent = shuffleArray(otherRecentMessages || []).slice(0, otherRecentCount);
    
    // Combine and shuffle the final samples
    const sampledUserMessages = shuffleArray([...sampledUserOlder, ...sampledUserRecent]);
    const sampledOtherMessages = shuffleArray([...sampledOtherOlder, ...sampledOtherRecent]);
    
    console.log(`Sampled ${sampledUserMessages.length} user messages (${sampledUserOlder.length} older, ${sampledUserRecent.length} recent) and ${sampledOtherMessages.length} other user messages (${sampledOtherOlder.length} older, ${sampledOtherRecent.length} recent)`);
    
    return {
      success: true,
      data: {
        userMessages: sampledUserMessages,
        otherUsersMessages: sampledOtherMessages
      }
    };
    
  } catch (error) {
    console.error('Error in getSpeechPatternSamples:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}

/**
 * Simple array shuffle utility (Fisher-Yates shuffle)
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
} 