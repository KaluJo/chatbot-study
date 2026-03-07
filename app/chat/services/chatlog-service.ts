import { createClient } from '@/utils/supabase/client';
import { ChatPair } from '../../synthesis/services/gemini-potential-client';
import { analyzeConversationWindow } from '../../synthesis/services/gemini-potential-client';
import { PostgrestError } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

export interface ChatlogEntry {
  id: string;
  llm_message: string;
  human_message: string;
  timestamp: string;
  user_id?: string | null;
  session_id?: string | null;
  potential_topics?: string[];
  potential_contexts?: string[];
  potential_items?: string[];
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
  synthesized?: boolean | null;
  created_at?: string;
  updated_at?: string;
}

const TIME_WINDOW_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes in milliseconds
const WINDOW_SIZE = 4; // Number of chats in a window
const WINDOW_SHIFT = 3; // How many chats to shift by

/**
 * Initialize the chatlog database with entries from the dummy data
 */
export async function initializeChatlogDatabase(entries: any[]): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createClient();
    
    // First check if data already exists to avoid duplicates
    const { count, error: countError } = await supabase
      .from('chatlog')
      .select('*', { count: 'exact', head: true });
    
    if (countError) throw countError;
    
    // If data already exists, don't initialize again
    if (count && count > 0) {
      console.log(`Chatlog database already contains ${count} entries, skipping initialization`);
      return { success: true };
    }
    
    // Convert entries to the right format and insert them
    const chatlogEntries = entries.map(entry => ({
      id: entry.uuid || uuidv4(),
      llm_message: entry.llm_message,
      human_message: entry.human_message,
      timestamp: entry.timestamp,
      user_id: entry.user_id,
      session_id: entry.session_id
    }));
    
    // Insert all entries
    const { error } = await supabase
      .from('chatlog')
      .insert(chatlogEntries);
    
    if (error) throw error;
    
    console.log(`Successfully initialized chatlog database with ${entries.length} entries`);
    
    // Generate chat windows from the entries
    await generateChatWindows();
    
    return { success: true };
    
  } catch (error) {
    console.error("Error initializing chatlog database:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error occurred" 
    };
  }
}

/**
 * Get all entries from the chatlog database
 */
export async function getChatlogEntries(
  userId?: string // Optional: to filter by user
): Promise<{ success: boolean; data?: ChatlogEntry[]; error?: string }> {
  try {
    const supabase = createClient();
    let query = supabase.from('chatlog').select('*').order('timestamp', { ascending: true });
    if (userId) {
      query = query.eq('user_id', userId);
    }
    const { data, error } = await query;
    if (error) throw error;
    return { success: true, data: data as ChatlogEntry[] || [] };
  } catch (error) {
    console.error("Error fetching chatlog entries:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Get all chat windows from the database
 */
export async function getChatWindows(): Promise<{ success: boolean; data?: ChatWindow[]; error?: string }> {
  try {
    const supabase = createClient();
    
    const { data, error } = await supabase
      .from('chat_windows')
      .select('*')
      .order('start_timestamp', { ascending: true });
    
    if (error) throw error;
    
    return { 
      success: true, 
      data: data || []
    };
    
  } catch (error) {
    console.error("Error fetching chat windows:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error occurred" 
    };
  }
}

/**
 * Generate chat windows from the chatlog entries
 * @param forceRegenerate If true, deletes all existing windows and regenerates them
 */
export async function generateChatWindows(forceRegenerate: boolean = false): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createClient();
    
    // If force regenerate, delete all existing windows first
    if (forceRegenerate) {
      const { error: deleteError } = await supabase
        .from('chat_windows')
        .delete()
        .gte('id', '0'); // Delete all windows
      
      if (deleteError) throw deleteError;
      console.log('Deleted all existing chat windows for regeneration');
    }
    
    // Check if the windows table already has entries
    const { count, error: countError } = await supabase
      .from('chat_windows')
      .select('*', { count: 'exact', head: true });
    
    if (countError) throw countError;
    
    // If windows exist and we're not forcing regeneration, perform an audit instead
    if (count && count > 0 && !forceRegenerate) {
      console.log(`Chat windows already exist (${count} windows), performing audit`);
      return auditChatWindows();
    }
    
    // First, fetch all chatlog entries
    const { data: entries, error: entriesError } = await supabase
      .from('chatlog')
      .select('*')
      .order('timestamp', { ascending: true });
    
    if (entriesError) throw entriesError;
    if (!entries || entries.length === 0) {
      return { success: true }; // No entries to process
    }
    
    // Create time-bound groups of entries
    const timeGroups: ChatlogEntry[][] = [];
    let currentGroup: ChatlogEntry[] = [entries[0]];
    
    for (let i = 1; i < entries.length; i++) {
      const currentEntry = entries[i];
      const prevEntry = entries[i - 1];
      
      const currentTime = new Date(currentEntry.timestamp).getTime();
      const prevTime = new Date(prevEntry.timestamp).getTime();
      
      if (currentTime - prevTime <= TIME_WINDOW_THRESHOLD_MS) {
        // Within time threshold, add to current group
        currentGroup.push(currentEntry);
      } else {
        // Outside time threshold, start a new group
        timeGroups.push(currentGroup);
        currentGroup = [currentEntry];
      }
    }
    
    // Add the last group if it's not empty
    if (currentGroup.length > 0) {
      timeGroups.push(currentGroup);
    }
    
    // Create sliding windows within each time group
    const windows: ChatWindow[] = [];
    
    for (const group of timeGroups) {
      // If the group has fewer than WINDOW_SIZE entries, create a single window
      if (group.length <= WINDOW_SIZE) {
        windows.push(createWindowFromEntries(group));
        continue;
      }
      
      // Track which entries have been included in at least one window
      const includedEntries = new Set<string>();
      
      // Create sliding windows
      for (let i = 0; i <= group.length - WINDOW_SIZE; i += WINDOW_SHIFT) {
        const end = Math.min(i + WINDOW_SIZE, group.length);
        const windowEntries = group.slice(i, end);
        
        // Create a window for these entries
        windows.push(createWindowFromEntries(windowEntries));
        
        // Mark these entries as included
        windowEntries.forEach(entry => includedEntries.add(entry.id));
        
        // If we can't create a full window at the end, break
        if (end === group.length) break;
      }
      
      // Handle the case where there are entries left at the end that don't form a full window
      const remainingCount = group.length % WINDOW_SHIFT;
      if (remainingCount > 0 && remainingCount < WINDOW_SIZE) {
        const start = group.length - Math.min(WINDOW_SIZE, remainingCount);
        const windowEntries = group.slice(start);
        
        windows.push(createWindowFromEntries(windowEntries));
        
        // Mark these entries as included
        windowEntries.forEach(entry => includedEntries.add(entry.id));
      }
      
      // Check if any entries were not included in any window and create individual windows for them
      for (const entry of group) {
        if (!includedEntries.has(entry.id)) {
          windows.push(createWindowFromEntries([entry]));
        }
      }
    }
    
    // Insert windows into the database
    if (windows.length > 0) {
      const { error: insertError } = await supabase
        .from('chat_windows')
        .insert(windows);
      
      if (insertError) throw insertError;
      
      console.log(`Successfully created ${windows.length} chat windows`);
    }
    
    return { success: true };
    
  } catch (error) {
    console.error("Error generating chat windows:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error occurred" 
    };
  }
}

/**
 * Audit chat windows to ensure all chatlog entries are included in at least one window
 */
export async function auditChatWindows(): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createClient();
    
    // Get all chatlog entries
    const { data: allEntries, error: entriesError } = await supabase
      .from('chatlog')
      .select('id, llm_message, human_message, timestamp')
      .order('timestamp', { ascending: true });
    
    if (entriesError) throw entriesError;
    if (!allEntries || allEntries.length === 0) {
      return { success: true }; // No entries to process
    }
    
    // Get all existing windows
    const { data: allWindows, error: windowsError } = await supabase
      .from('chat_windows')
      .select('chat_ids');
    
    if (windowsError) throw windowsError;
    
    // Create a set of all UUIDs included in windows
    const includedIds = new Set<string>();
    if (allWindows) {
      for (const window of allWindows) {
        const ids = window.chat_ids as string[];
        ids.forEach(id => includedIds.add(id));
      }
    }
    
    // Find entries not included in any window
    const missingEntries = allEntries.filter(entry => !includedIds.has(entry.id));
    
    if (missingEntries.length === 0) {
      console.log("All chatlog entries are accounted for in windows.");
      return { success: true };
    }
    
    console.log(`Found ${missingEntries.length} entries not included in any window. Creating windows for them.`);
    
    // Create individual windows for each missing entry
    const newWindows = missingEntries.map(entry => createWindowFromEntries([entry]));
    
    // Insert the new windows
    if (newWindows.length > 0) {
      const { error: insertError } = await supabase
        .from('chat_windows')
        .insert(newWindows);
      
      if (insertError) throw insertError;
      
      console.log(`Successfully created ${newWindows.length} windows for previously missing entries.`);
    }
    
    return { success: true };
    
  } catch (error) {
    console.error("Error auditing chat windows:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error occurred" 
    };
  }
}

/**
 * Create a chat window from a list of entries
 */
function createWindowFromEntries(entries: ChatlogEntry[]): ChatWindow {
  // Sort entries by timestamp
  const sortedEntries = [...entries].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  
  const chatData = sortedEntries.map(entry => ({
    llm_message: entry.llm_message,
    human_message: entry.human_message,
    timestamp: entry.timestamp
  }));
  
  // Get session_id from the first entry, if available
  const session_id = sortedEntries.length > 0 ? sortedEntries[0].session_id : undefined;
  
  return {
    id: uuidv4(),
    chat_ids: sortedEntries.map(entry => entry.id),
    chat_data: chatData,
    start_timestamp: sortedEntries[0].timestamp,
    end_timestamp: sortedEntries[sortedEntries.length - 1].timestamp,
    potential_topics: [],
    potential_contexts: [],
    potential_items: [],
    user_id: entries[0].user_id,
    session_id: session_id
  };
}

/**
 * Update a chat window with generated potential topics, contexts, and items
 */
export async function updateChatWindowWithPotentials(
  windowId: string
): Promise<{ success: boolean; data?: ChatWindow; error?: string }> {
  try {
    const supabase = createClient();
    
    // First get the window
    const { data: window, error: windowError } = await supabase
      .from('chat_windows')
      .select('*')
      .eq('id', windowId)
      .single();
    
    if (windowError) throw windowError;
    if (!window) throw new Error(`Window with ID ${windowId} not found`);
    
    // Use the comprehensive analysis function for all chat pairs in the window
    const analysisResult = await analyzeConversationWindow(
      window.chat_data, 
      ["Work", "Leisure", "Culture", "Education", "People", "Lifestyle"], // Default contexts
      window.user_id || undefined // Pass userId from the window
    );
    
    if (!analysisResult.success) {
      throw new Error(`Failed to analyze window: ${analysisResult.error}`);
    }
    
    // Update the window with generated potentials
    const { data: updatedWindow, error: updateError } = await supabase
      .from('chat_windows')
      .update({
        potential_topics: analysisResult.data?.topics || [],
        potential_contexts: analysisResult.data?.contexts || [],
        potential_items: analysisResult.data?.items || []
      })
      .eq('id', windowId)
      .select()
      .single();
    
    if (updateError) throw updateError;
    
    return { 
      success: true, 
      data: updatedWindow 
    };
    
  } catch (error) {
    console.error("Error updating chat window with potentials:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error occurred" 
    };
  }
}

// START: Additions for saving chat sessions from ChatInterface.tsx

// Interface for the data structure to be inserted into the chatlog table
export interface ChatlogInsertData {
  llm_message: string;
  human_message: string;
  timestamp: string;
  user_id: string;
  session_id: string;
}

/**
 * Saves a batch of chat log entries to the Supabase chatlog table.
 * @param chatEntries Array of ChatlogInsertData objects.
 * @returns An object indicating success or failure, with an optional error.
 */
export async function saveChatSession(
  chatEntries: ChatlogInsertData[]
): Promise<{ success: boolean; error?: PostgrestError | null }> {
  if (!chatEntries || chatEntries.length === 0) {
    console.log('saveChatSession called with no entries to save.');
    return { success: true }; // Nothing to save
  }

  const supabase = createClient();

  const dataToInsert = chatEntries.map(entry => ({
    llm_message: entry.llm_message,
    human_message: entry.human_message,
    timestamp: entry.timestamp,
    user_id: entry.user_id,
    session_id: entry.session_id,
  }));

  console.log('Attempting to save chat entries:', dataToInsert);

  try {
    const { error } = await supabase
      .from('chatlog')
      .insert(dataToInsert);

    if (error) {
      console.error('Error saving chat session to Supabase:', error);
      return { success: false, error };
    }

    console.log('Chat session saved successfully to Supabase.');
    return { success: true };
  } catch (e) {
    console.error('Unexpected error in saveChatSession:', e);
    return {
      success: false,
      error: {
        message: e instanceof Error ? e.message : 'An unknown error occurred during the save process.',
        details: 'This was not a direct Supabase Postgrest error.',
        hint: 'Check console for more details.',
        code: 'UNEXPECTED_CLIENT_ERROR'
      } as PostgrestError // Type assertion to satisfy the return type
    };
  }
}

/**
 * Counts the number of distinct chat sessions for a given user.
 * @param userId The ID of the user.
 * @returns An object indicating success, the count of sessions, or an error.
 */
export async function countUserChatSessions(
  userId: string
): Promise<{ success: boolean; count: number; error?: PostgrestError | null }> {
  if (!userId) {
    console.error('User ID is required to count chat sessions.');
    return { success: false, count: 0, error: { message: 'User ID required', details: '', hint:'', code:'' } as PostgrestError };
  }

  const supabase = createClient();

  try {
    // We want to count distinct session_id values for the given user_id.
    // Supabase doesn't directly support COUNT(DISTINCT session_id) in a simple select.
    // A common way is to fetch all session_ids for the user and count them client-side after making them unique.
    // Or, use a PostgREST function if you have one defined for this.
    
    // Simpler client-side distinct count:
    const { data, error } = await supabase
      .from('chatlog')
      .select('session_id')
      .eq('user_id', userId);

    if (error) {
      console.error('Error fetching chat sessions for count:', error);
      return { success: false, count: 0, error };
    }

    if (!data) {
      return { success: true, count: 0 };
    }

    // Get distinct session_ids
    const distinctSessionIds = new Set(data.map(entry => entry.session_id));
    const count = distinctSessionIds.size;
    
    return { success: true, count };

  } catch (e) {
    console.error('Unexpected error in countUserChatSessions:', e);
    return {
      success: false,
      count: 0,
      error: {
        message: e instanceof Error ? e.message : 'An unknown error occurred while counting sessions.',
        details: 'This was not a direct Supabase Postgrest error.',
        hint: 'Check console for more details.',
        code: 'UNEXPECTED_CLIENT_ERROR'
      } as PostgrestError
    };
  }
}

/**
 * Fetches the timestamp of the most recent chatlog entry for a given user.
 * @param userId The ID of the user.
 * @returns An object indicating success, the latest timestamp (ISO string), or an error.
 */
export async function getLatestUserSessionTimestamp(
  userId: string
): Promise<{ success: boolean; latestTimestamp?: string; error?: PostgrestError | null }> {
  if (!userId) {
    return { success: false, error: { message: 'User ID required', details: '', hint: '', code: '' } as PostgrestError };
  }

  const supabase = createClient();
  try {
    // Query for rows where either llm_message or human_message is not null
    // to ensure we're only getting valid chat entries
    const { data, error } = await supabase
      .from('chatlog')
      .select('timestamp, llm_message, human_message') 
      .eq('user_id', userId)
      .not('llm_message', 'is', null)  // Ensure we have a valid AI message
      .not('human_message', 'is', null) // Ensure we have a valid human message
      .order('timestamp', { ascending: false }) // Get the latest one first
      .limit(1) // We only need the very latest one
      .single(); // Expect a single row or null

    if (error && error.code !== 'PGRST116') { // PGRST116 means no rows found, which is not an error for us here
      console.error('Error fetching latest session timestamp:', error);
      return { success: false, error };
    }

    if (data && data.timestamp) {
      return { success: true, latestTimestamp: data.timestamp };
    } else {
      // No sessions found for this user
      return { success: true, latestTimestamp: undefined }; 
    }
  } catch (e) {
    console.error('Unexpected error in getLatestUserSessionTimestamp:', e);
    return {
      success: false,
      error: { 
        message: e instanceof Error ? e.message : 'An unknown error occurred.', 
        details: '', hint: '', code: '' 
      } as PostgrestError
    };
  }
}

// END: Additions for saving chat sessions 

// --- USER-SPECIFIC SYNTHESIS FUNCTIONS --- //

/**
 * Fetches all chatlog entries for a specific user.
 */
export async function getChatlogEntriesForUser(
  userId: string
): Promise<{ success: boolean; data?: ChatlogEntry[]; error?: string }> {
  if (!userId) {
    return { success: false, error: "User ID is required." };
  }
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('chatlog')
      .select('*')
      .eq('user_id', userId) // Filter by user_id
      .order('timestamp', { ascending: true });
    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (error) {
    console.error(`Error fetching chatlog entries for user ${userId}:`, error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Helper function to create a window from entries, now including session_id.
 * This can be a new function or an update to the existing one if it can handle optional userId.
 */
function createWindowFromEntriesForUser(entries: ChatlogEntry[], userId: string): ChatWindow {
  const sortedEntries = [...entries].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  const chatData = sortedEntries.map(entry => ({
    llm_message: entry.llm_message,
    human_message: entry.human_message,
    timestamp: entry.timestamp
  }));
  
  // Get session_id from entries (assuming all entries in this window belong to the same session)
  const session_id = sortedEntries.length > 0 ? sortedEntries[0].session_id : undefined;

  return {
    id: uuidv4(), 
    chat_ids: sortedEntries.map(entry => entry.id),
    chat_data: chatData,
    start_timestamp: sortedEntries[0].timestamp,
    end_timestamp: sortedEntries[sortedEntries.length - 1].timestamp,
    potential_topics: [],
    potential_contexts: [],
    potential_items: [],
    user_id: userId,
    session_id: session_id
  };
}

/**
 * Generates chat windows specifically for a given user.
 * Assumes `chat_windows` table has a `user_id` column.
 */
export async function generateChatWindowsForUser(
  userId: string,
  forceRegenerate: boolean = false
): Promise<{ success: boolean; error?: string }> {
  if (!userId) {
    return { success: false, error: "User ID is required for generating user-specific chat windows." };
  }
  try {
    const supabase = createClient();
    const TIME_WINDOW_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
    const WINDOW_SIZE = 4;
    const WINDOW_SHIFT = 3;

    if (forceRegenerate) {
      const { error: deleteError } = await supabase
        .from('chat_windows')
        .delete()
        .eq('user_id', userId); // Delete only windows for this user
      if (deleteError) throw deleteError;
      console.log(`Deleted existing chat windows for user ${userId}`);
    } else {
      // Optional: Check if windows for this user already exist and skip if not forcing regeneration
      const { count, error: countError } = await supabase
        .from('chat_windows')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);
      if (countError) throw countError;
      if (count && count > 0) {
        console.log(`Chat windows for user ${userId} already exist (${count}). Skipping generation.`)
        return { success: true };
      }
    }

    const { data: entries, error: entriesError } = await getChatlogEntriesForUser(userId);
    if (entriesError || !entries || entries.length === 0) {
      console.log(`No chatlog entries found for user ${userId} to generate windows.`);
      return { success: true }; 
    }

    // Sort entries by timestamp
    const sortedEntries = [...entries].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Group entries by time proximity
    const timeGroups: ChatlogEntry[][] = [];
    let currentGroup: ChatlogEntry[] = sortedEntries.length > 0 ? [sortedEntries[0]] : [];
    
    for (let i = 1; i < sortedEntries.length; i++) {
      const currentEntry = sortedEntries[i];
      const prevEntry = sortedEntries[i - 1];
      const currentTime = new Date(currentEntry.timestamp).getTime();
      const prevTime = new Date(prevEntry.timestamp).getTime();
      if (currentTime - prevTime <= TIME_WINDOW_THRESHOLD_MS) {
        currentGroup.push(currentEntry);
      } else {
        if (currentGroup.length > 0) timeGroups.push(currentGroup);
        currentGroup = [currentEntry];
      }
    }
    if (currentGroup.length > 0) timeGroups.push(currentGroup);

    // Keep track of which entries have been added to windows
    const processedEntryIds = new Set<string>();
    const windowsToInsert: ChatWindow[] = [];
    
    for (const group of timeGroups) {
      if (group.length === 0) continue;
      
      // For small groups, just create a single window
      if (group.length <= WINDOW_SIZE) {
        // Only process if there are entries not yet included in windows
        if (group.some(entry => !processedEntryIds.has(entry.id))) {
          const window = createWindowFromEntriesForUser(group, userId);
          windowsToInsert.push(window);
          group.forEach(entry => processedEntryIds.add(entry.id));
        }
        continue;
      }
      
      // For larger groups, use sliding window approach
      let lastProcessedIndex = -1;
      
      for (let i = 0; i <= group.length - WINDOW_SIZE; i += WINDOW_SHIFT) {
        const end = Math.min(i + WINDOW_SIZE, group.length);
        const windowEntries = group.slice(i, end);
        
        // Only create window if it contains entries not yet processed
        if (windowEntries.some(entry => !processedEntryIds.has(entry.id))) {
          const window = createWindowFromEntriesForUser(windowEntries, userId);
          windowsToInsert.push(window);
          windowEntries.forEach(entry => processedEntryIds.add(entry.id));
        }
        
        lastProcessedIndex = end - 1;
        if (end === group.length) break;
      }
      
      // Handle remaining entries at the end of the group
      if (lastProcessedIndex < group.length - 1) {
        const remainingEntries = group.slice(lastProcessedIndex + 1);
        if (remainingEntries.some(entry => !processedEntryIds.has(entry.id))) {
          // Create a window with the last WINDOW_SIZE entries (or fewer if not enough)
          const tailWindow = group.slice(Math.max(0, group.length - WINDOW_SIZE));
          
          // Check if this exact window already exists
          const tailEntryIds = tailWindow.map(entry => entry.id).sort().join(',');
          const hasDuplicate = windowsToInsert.some(window => 
            window.chat_ids.sort().join(',') === tailEntryIds
          );
          
          if (!hasDuplicate) {
            const window = createWindowFromEntriesForUser(tailWindow, userId);
            windowsToInsert.push(window);
            tailWindow.forEach(entry => processedEntryIds.add(entry.id));
          }
        }
      }
    }
    
    // Check for any entries that weren't included in windows
    const missedEntries = sortedEntries.filter(entry => !processedEntryIds.has(entry.id));
    if (missedEntries.length > 0) {
      console.log(`Creating individual windows for ${missedEntries.length} entries not covered by sliding windows`);
      
      // Create individual windows for missed entries
      for (const entry of missedEntries) {
        const window = createWindowFromEntriesForUser([entry], userId);
        windowsToInsert.push(window);
      }
    }
    
    if (windowsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('chat_windows')
        .insert(windowsToInsert);
      if (insertError) throw insertError;
      console.log(`Successfully created ${windowsToInsert.length} chat windows for user ${userId}`);
    }
    
    return { success: true };
  } catch (error) {
    console.error(`Error generating chat windows for user ${userId}:`, error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Fetches all chat windows for a specific user.
 * Assumes `chat_windows` table has a `user_id` column.
 */
export async function getChatWindowsForUser(
  userId: string
): Promise<{ success: boolean; data?: ChatWindow[]; error?: string }> {
  if (!userId) {
    return { success: false, error: "User ID is required." };
  }
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('chat_windows')
      .select('*')
      .eq('user_id', userId)
      .order('start_timestamp', { ascending: true });
    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (error) {
    console.error(`Error fetching chat windows for user ${userId}:`, error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Saves/Updates provided potential topics, contexts, and items for a specific chat window.
 * Uses upsert to create the window if it doesn't exist, or update it if it does.
 * Assumes `id` is the primary key or has a unique constraint for conflict resolution.
 */
export async function saveWindowPotentials(
  windowId: string, // The DB ID of the chat_window record
  potentials: { topics: string[]; contexts: string[]; items: string[]; }
): Promise<{ success: boolean; data?: ChatWindow; error?: PostgrestError | null }> {
  if (!windowId) {
    return { success: false, error: { message: 'Window ID is required to save potentials'} as PostgrestError };
  }
  const supabase = createClient();
  try {
    // First check if the window exists
    const { data: existingWindow, error: checkError } = await supabase
      .from('chat_windows')
      .select('*')
      .eq('id', windowId)
      .maybeSingle(); // Use maybeSingle() instead of single() to avoid error when no rows found
    
    if (checkError) throw checkError;
    
    if (!existingWindow) {
      console.warn(`Window ${windowId} not found in database. Cannot update potentials.`);
      return { 
        success: false, 
        error: { 
          message: `Window ${windowId} not found. Cannot update potentials.`,
          code: 'NOT_FOUND'
        } as PostgrestError 
      };
    }
    
    // Update the window with the new potentials
    const { data: updatedWindow, error: updateError } = await supabase
      .from('chat_windows')
      .update({
        potential_topics: potentials.topics || [],
        potential_contexts: potentials.contexts || [],
        potential_items: potentials.items || []
      })
      .eq('id', windowId)
      .select()
      .maybeSingle(); // Use maybeSingle() to avoid errors
    
    if (updateError) throw updateError;
    
    if (!updatedWindow) {
      return { 
        success: false, 
        error: { 
          message: `Failed to retrieve updated window after saving potentials.`,
          code: 'UPDATE_FAILED'
        } as PostgrestError 
      };
    }
    
    return { success: true, data: updatedWindow as ChatWindow };
  } catch (e) {
    console.error(`Unexpected error in saveWindowPotentials for ${windowId}:`, e);
    return { success: false, error: e as PostgrestError };
  }
}

/**
 * Fetches a single chat window by its UUID, including its potentials.
 */
export async function getWindowById(
    windowId: string // This is the database ID (UUID)
): Promise<{ success: boolean; data?: ChatWindow; error?: PostgrestError | null}> {
    if (!windowId) return { success: false, error: { message: 'Window ID required'} as PostgrestError };
    const supabase = createClient();
    try {
        const { data, error } = await supabase
            .from('chat_windows')
            .select('*')
            .eq('id', windowId)
            .single();
        if (error && error.code !== 'PGRST116') throw error;
        return { success: true, data: data as ChatWindow || undefined }; 
    } catch (e) {
        console.error(`Error fetching window by ID ${windowId}:`, e);
        return { success: false, error: e as PostgrestError };
    }
}

/**
 * Clean up incorrectly generated windows for a user that don't follow proper size and shift pattern
 */
export async function cleanupIncorrectWindows(
  userId: string
): Promise<{ success: boolean; removedCount: number; error?: string }> {
  if (!userId) {
    return { success: false, removedCount: 0, error: "User ID is required." };
  }
  try {
    const supabase = createClient();
    
    // Get all chatlog entries for this user
    const { data: entries, error: entriesError } = await getChatlogEntriesForUser(userId);
    if (entriesError || !entries || entries.length === 0) {
      return { success: true, removedCount: 0 }; // No entries to process
    }
    
    // Get all windows for this user
    const { data: windows, error: windowsError } = await supabase
      .from('chat_windows')
      .select('*')
      .eq('user_id', userId);
    
    if (windowsError) throw windowsError;
    if (!windows || windows.length === 0) {
      return { success: true, removedCount: 0 }; // No windows to process
    }
    
    // Group entries by session ID
    const entriesBySession = new Map<string, ChatlogEntry[]>();
    for (const entry of entries) {
      if (entry.session_id) {
        if (!entriesBySession.has(entry.session_id)) {
          entriesBySession.set(entry.session_id, []);
        }
        entriesBySession.get(entry.session_id)!.push(entry);
      }
    }
    
    // Identify windows to remove
    const windowsToRemove: string[] = [];
    
    for (const window of windows) {
      // Skip windows without chat_ids
      if (!window.chat_ids || window.chat_ids.length === 0) {
        continue;
      }
      
      // Determine which session this window belongs to
      let sessionId: string | undefined;
      
      // Convert Map.entries() to array to avoid iterator type issues
      const sessionEntriesPairs = Array.from(entriesBySession.entries());
      for (const [sid, sessionEntriesForSid] of sessionEntriesPairs) {
        const sessionEntryIds = sessionEntriesForSid.map((e: ChatlogEntry) => e.id);
        if (window.chat_ids.some((id: string) => sessionEntryIds.includes(id))) {
          sessionId = sid;
          break;
        }
      }
      
      if (!sessionId) continue; // Can't find which session this window belongs to
      
      const sessionEntriesForWindow = entriesBySession.get(sessionId)!;
      
      // Sort entries by timestamp to establish timeline
      const sortedEntries = [...sessionEntriesForWindow].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      
      // Create a map of entry IDs to their position in the timeline
      const entryPositionMap = new Map<string, number>();
      sortedEntries.forEach((entry, index) => {
        entryPositionMap.set(entry.id, index);
      });
      
      // Check if window is invalid due to size - but be lenient with end-of-group windows
      const TIME_WINDOW_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
      
      // Windows of any size are valid at the end of a conversation or time group
      // Only check window size if it's NOT at the end of the timeline
      const lastEntryId = window.chat_ids[window.chat_ids.length - 1];
      const position = entryPositionMap.get(lastEntryId);
      
      // Check if this window could be an end-group window
      const isEndOfTimelineWindow = position === undefined || position >= sortedEntries.length - 1;
      const isEndOfTimeGroupWindow = !isEndOfTimelineWindow && position !== undefined && (() => {
        const lastEntry = sortedEntries[position];
        // If this is already the last entry, it's an end window
        if (position + 1 >= sortedEntries.length) return true;
        
        const nextEntry = sortedEntries[position + 1];
        // If time gap is greater than threshold, this is end of a time group
        return new Date(nextEntry.timestamp).getTime() - new Date(lastEntry.timestamp).getTime() > TIME_WINDOW_THRESHOLD_MS;
      })();
      
      // If it's not at the end of a time group or timeline AND it's too small, mark as invalid
      if (!isEndOfTimelineWindow && !isEndOfTimeGroupWindow && window.chat_ids.length < 2) {
        windowsToRemove.push(window.id);
        continue;
      }
      
      // Check if window entries are contiguous in the timeline
      const windowEntryIds = window.chat_ids;
      if (windowEntryIds.length > 1) {
        // Get positions of all entries in this window
        const positions = windowEntryIds
          .map((id: string) => entryPositionMap.get(id))
          .filter((pos: number | undefined) => pos !== undefined) as number[];
        
        if (positions.length !== windowEntryIds.length) {
          // Some entries not found in our timeline
          windowsToRemove.push(window.id);
          continue;
        }
        
        // Check if entries are contiguous and in the correct order
        positions.sort((a, b) => a - b);
        let isInvalid = false;
        
        for (let i = 1; i < positions.length; i++) {
          if (positions[i] !== positions[i-1] + 1) {
            // Non-contiguous entries - check if they're part of different time groups
            const prevEntry = sortedEntries[positions[i-1]];
            const currEntry = sortedEntries[positions[i]];
            
            if (new Date(currEntry.timestamp).getTime() - new Date(prevEntry.timestamp).getTime() <= TIME_WINDOW_THRESHOLD_MS) {
              // Entries are within the same time group but not contiguous
              isInvalid = true;
              break;
            }
          }
        }
        
        if (isInvalid) {
          windowsToRemove.push(window.id);
        }
      }
    }
    
    // Delete the identified invalid windows
    if (windowsToRemove.length > 0) {
      const { error: deleteError } = await supabase
        .from('chat_windows')
        .delete()
        .in('id', windowsToRemove);
      
      if (deleteError) throw deleteError;
      
      console.log(`Successfully removed ${windowsToRemove.length} incorrect windows for user ${userId}`);
    }
    
    return { success: true, removedCount: windowsToRemove.length };
  } catch (error) {
    console.error(`Error cleaning up incorrect windows for user ${userId}:`, error);
    return { 
      success: false, 
      removedCount: 0,
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
} 

export interface FeedbackInsertData {
  user_id: string;
  session_id: string;
  rating: number | null;
  feedback_text: string;
}

/**
 * Save user feedback for a chat session.
 */
export async function saveFeedback(feedbackData: FeedbackInsertData): Promise<{ success: boolean; error?: Error | null }> {
  const supabase = createClient();

  const { error } = await supabase
    .from('chat_feedback')
    .insert([feedbackData]);

  if (error) {
    console.error('Error saving feedback:', error);
    return { success: false, error };
  }

  console.log(`Feedback saved for session ${feedbackData.session_id}`);
  return { success: true };
}

/**
 * Save an individual message immediately as it's sent (CRITICAL BACKUP FUNCTION)
 * This ensures we NEVER lose a single Claude response, even if End Chat fails
 * INCLUDES RETRY LOGIC FOR MAXIMUM RELIABILITY
 */
export async function saveIndividualMessage(
  messageData: ChatlogInsertData,
  retryCount: number = 3
): Promise<{ success: boolean; error?: PostgrestError | null }> {
  if (!messageData) {
    console.error('saveIndividualMessage called with no data');
    return { success: false, error: { message: 'No message data provided', details: '', hint: '', code: '' } as PostgrestError };
  }

  const supabase = createClient();

  console.log('🚨 CRITICAL BACKUP: Saving individual message immediately (attempt 1):', {
    session_id: messageData.session_id,
    user_id: messageData.user_id,
    timestamp: messageData.timestamp,
    has_llm_message: !!messageData.llm_message,
    has_human_message: !!messageData.human_message,
    retries_left: retryCount
  });

  for (let attempt = 1; attempt <= retryCount; attempt++) {
    try {
      const { error } = await supabase
        .from('chatlog')
        .insert([messageData]);

      if (error) {
        console.error(`🚨 CRITICAL: Failed to save individual message (attempt ${attempt}/${retryCount}):`, error);
        
        if (attempt === retryCount) {
          // Last attempt failed, return error
          return { success: false, error };
        }
        
        // Wait before retrying (exponential backoff)
        const waitTime = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
        console.log(`⏳ Retrying in ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }

      console.log(`✅ SUCCESS: Individual message saved to database (attempt ${attempt})`);
      return { success: true };
      
    } catch (e) {
      console.error(`🚨 CRITICAL: Unexpected error in saveIndividualMessage (attempt ${attempt}/${retryCount}):`, e);
      
      if (attempt === retryCount) {
        // Last attempt failed
        return {
          success: false,
          error: {
            message: e instanceof Error ? e.message : 'Unknown error in individual message save',
            details: 'This was not a direct Supabase error',
            hint: 'Check console for more details',
            code: 'UNEXPECTED_CLIENT_ERROR'
          } as PostgrestError
        };
      }
      
      // Wait before retrying
      const waitTime = Math.pow(2, attempt - 1) * 1000;
      console.log(`⏳ Retrying due to unexpected error in ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  // This should never be reached
  return { success: false, error: { message: 'Max retries exceeded', details: '', hint: '', code: '' } as PostgrestError };
}

/**
 * Save individual message to backup table (RLS OFF for maximum reliability)
 * This is the ULTIMATE failsafe
 */
export async function saveToBackupTable(
  llmMessage: string,
  humanMessage: string,
  userId: string,
  sessionId: string,
  timestamp: string
): Promise<{ success: boolean; error?: Error | null }> {
  const supabase = createClient();

  console.log('🔥 ULTIMATE BACKUP: Saving to backup table:', {
    session_id: sessionId,
    user_id: userId,
    human_message_length: humanMessage?.length || 0,
    llm_message_length: llmMessage?.length || 0,
    original_timestamp: timestamp
  });

  try {
    const backupData = {
      session_id: sessionId,
      user_id: userId,
      human_message: humanMessage,
      llm_message: llmMessage,
      original_timestamp: timestamp,
    };

    const { error } = await supabase
      .from('chat_backup')
      .insert([backupData]);

    if (error) {
      console.error('🚨 BACKUP TABLE SAVE FAILED:', error);
      return { success: false, error: new Error(error.message) };
    }

    console.log('✅ ULTIMATE BACKUP SUCCESS: Message saved to backup table');
    return { success: true };

  } catch (error) {
    console.error('🚨 CRITICAL: Backup table operation failed:', error);
    return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
  }
}

/**
 * Save to debug log for troubleshooting
 */
export async function saveToDebugLog(
  level: 'ERROR' | 'WARNING' | 'INFO',
  message: string,
  sessionId?: string,
  userId?: string,
  context?: any
): Promise<void> {
  try {
    const supabase = createClient();
    
    const { error } = await supabase
      .from('chat_debug_log')
      .insert([{
        log_level: level,
        session_id: sessionId || null,
        user_id: userId || null,
        message,
        context: context || null
      }]);

    if (error) {
      console.error('Failed to save to debug log:', error);
    }
  } catch (err) {
    console.error('Critical error saving to debug log:', err);
  }
} 