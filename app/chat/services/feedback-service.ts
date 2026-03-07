import { createClient } from '@/utils/supabase/client';

export interface ChatFeedback {
  id: number;
  created_at: string;
  user_id: string | null;
  session_id: string;
  rating: number | null;
  feedback_text: string | null;
}

/**
 * Fetch all chat feedback for a specific user
 */
export async function getUserChatFeedback(userId: string): Promise<{ success: boolean; data?: ChatFeedback[]; error?: string }> {
  try {
    const supabase = createClient();
    
    const { data, error } = await supabase
      .from('chat_feedback')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching chat feedback:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data || [] };
  } catch (err) {
    console.error('Error in getUserChatFeedback:', err);
    return { success: false, error: 'Failed to fetch chat feedback' };
  }
}

/**
 * Save or update chat feedback for a session
 */
export async function saveChatFeedback(
  userId: string,
  sessionId: string,
  rating?: number,
  feedbackText?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createClient();

    // Check if feedback already exists for this session
    const { data: existing } = await supabase
      .from('chat_feedback')
      .select('id')
      .eq('user_id', userId)
      .eq('session_id', sessionId)
      .single();

    const feedbackData = {
      user_id: userId,
      session_id: sessionId,
      rating: rating || null,
      feedback_text: feedbackText || null
    };

    let result;
    if (existing) {
      // Update existing feedback
      result = await supabase
        .from('chat_feedback')
        .update(feedbackData)
        .eq('id', existing.id);
    } else {
      // Insert new feedback
      result = await supabase
        .from('chat_feedback')
        .insert([feedbackData]);
    }

    if (result.error) {
      console.error('Error saving chat feedback:', result.error);
      return { success: false, error: result.error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Error in saveChatFeedback:', err);
    return { success: false, error: 'Failed to save chat feedback' };
  }
} 