import { createClient } from '@/utils/supabase/client';

export interface ChatlogEntry {
  id: string;
  llm_message: string;
  human_message: string;
  timestamp: string;
  user_id: string;
  session_id: string;
}

export interface ChatBackupEntry {
  id: string;
  session_id: string;
  user_id: string;
  human_message: string;
  llm_message: string;
  original_timestamp: string;
  backup_timestamp: string;
  created_at: string;
}

export interface RecoveryStatus {
  sessionId: string;
  existsInChatlog: boolean;
  existsInBackup: boolean;
  chatlogCount: number;
  backupCount: number;
  needsRecovery: boolean;
  recoveryComplete?: boolean;
}

export interface AuditResult {
  sessionId: string;
  backupCount: number;
  chatlogCount: number;
  firstBackupTimestamp: string;
  lastBackupTimestamp: string;
  userIds: string[];
  needsRecovery: boolean;
}

export interface AuditSummary {
  totalBackupSessions: number;
  totalChatlogSessions: number;
  sessionsNeedingRecovery: number;
  sessionsComplete: number;
  missingFromChatlog: AuditResult[];
  allSessions: AuditResult[];
  backupRowsReturned: number;
  chatlogRowsReturned: number;
  possiblyTruncated: boolean;
}

/**
 * Check the status of a session in both chatlog and chat_backup tables
 */
export async function checkSessionStatus(
  sessionId: string
): Promise<{ success: boolean; data?: RecoveryStatus; error?: string }> {
  try {
    const supabase = createClient();
    
    // Check chatlog table
    const { data: chatlogData, error: chatlogError } = await supabase
      .from('chatlog')
      .select('id, user_id, session_id')
      .eq('session_id', sessionId);
    
    if (chatlogError) {
      console.error('Error checking chatlog:', chatlogError);
      return { success: false, error: `Error checking chatlog: ${chatlogError.message}` };
    }
    
    // Check chat_backup table
    const { data: backupData, error: backupError } = await supabase
      .from('chat_backup')
      .select('id, user_id, session_id')
      .eq('session_id', sessionId);
    
    if (backupError) {
      console.error('Error checking chat_backup:', backupError);
      return { success: false, error: `Error checking chat_backup: ${backupError.message}` };
    }
    
    const existsInChatlog = chatlogData && chatlogData.length > 0;
    const existsInBackup = backupData && backupData.length > 0;
    const chatlogCount = chatlogData?.length || 0;
    const backupCount = backupData?.length || 0;
    
    // Session needs recovery if it exists in backup but not in chatlog
    const needsRecovery = existsInBackup && !existsInChatlog;
    
    const status: RecoveryStatus = {
      sessionId,
      existsInChatlog,
      existsInBackup,
      chatlogCount,
      backupCount,
      needsRecovery
    };
    
    return { success: true, data: status };
    
  } catch (error) {
    console.error('Error in checkSessionStatus:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}

/**
 * Get the detailed data for a session from backup table
 */
export async function getSessionBackupData(
  sessionId: string
): Promise<{ success: boolean; data?: ChatBackupEntry[]; error?: string }> {
  try {
    const supabase = createClient();
    
    const { data, error } = await supabase
      .from('chat_backup')
      .select('*')
      .eq('session_id', sessionId)
      .order('original_timestamp', { ascending: true });
    
    if (error) {
      console.error('Error getting backup data:', error);
      return { success: false, error: `Error getting backup data: ${error.message}` };
    }
    
    return { success: true, data: data || [] };
    
  } catch (error) {
    console.error('Error in getSessionBackupData:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}

/**
 * Recover a session by copying data from chat_backup to chatlog
 */
export async function recoverSession(
  sessionId: string,
  userId?: string
): Promise<{ success: boolean; data?: { recoveredCount: number }; error?: string }> {
  try {
    const supabase = createClient();
    
    // First verify this session needs recovery
    const statusResult = await checkSessionStatus(sessionId);
    if (!statusResult.success || !statusResult.data) {
      return { success: false, error: statusResult.error || 'Could not check session status' };
    }
    
    const status = statusResult.data;
    if (!status.needsRecovery) {
      return { 
        success: false, 
        error: status.existsInChatlog 
          ? 'Session already exists in chatlog - no recovery needed'
          : 'Session not found in backup table - cannot recover'
      };
    }
    
    // Get backup data
    const backupResult = await getSessionBackupData(sessionId);
    if (!backupResult.success || !backupResult.data) {
      return { success: false, error: backupResult.error || 'Could not get backup data' };
    }
    
    const backupEntries = backupResult.data;
    if (backupEntries.length === 0) {
      return { success: false, error: 'No backup entries found for this session' };
    }
    
    // Skip user ID verification - allow recovery of any session
    
    // Convert backup entries to chatlog format
    const chatlogEntries = backupEntries.map(entry => ({
      llm_message: entry.llm_message,
      human_message: entry.human_message,
      timestamp: entry.original_timestamp,
      user_id: entry.user_id,
      session_id: entry.session_id
    }));
    
    // Insert into chatlog table
    const { data: insertedData, error: insertError } = await supabase
      .from('chatlog')
      .insert(chatlogEntries)
      .select('id');
    
    if (insertError) {
      console.error('Error inserting into chatlog:', insertError);
      return { success: false, error: `Error recovering session: ${insertError.message}` };
    }
    
    const recoveredCount = insertedData?.length || 0;
    
    console.log(`Successfully recovered session ${sessionId}: ${recoveredCount} messages transferred to chatlog`);
    
    return { 
      success: true, 
      data: { recoveredCount }
    };
    
  } catch (error) {
    console.error('Error in recoverSession:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}

/**
 * Get the detailed data for a session from chatlog table
 */
export async function getSessionChatlogData(
  sessionId: string
): Promise<{ success: boolean; data?: ChatlogEntry[]; error?: string }> {
  try {
    const supabase = createClient();
    
    const { data, error } = await supabase
      .from('chatlog')
      .select('*')
      .eq('session_id', sessionId)
      .order('timestamp', { ascending: true });
    
    if (error) {
      console.error('Error getting chatlog data:', error);
      return { success: false, error: `Error getting chatlog data: ${error.message}` };
    }
    
    return { success: true, data: data || [] };
    
  } catch (error) {
    console.error('Error in getSessionChatlogData:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}

/**
 * Perform a comprehensive audit of all sessions in backup vs chatlog
 * This is read-only and does not modify any data
 * REWRITTEN: Completely new approach that avoids IN clause issues
 */
export async function auditAllSessions(): Promise<{ success: boolean; data?: AuditSummary; error?: string }> {
  try {
    const supabase = createClient();
    
    console.log('🔍 Starting comprehensive session audit (rewritten approach)...');
    
    // Step 1: Get ALL unique session_ids from backup table (most recent first)
    console.log('Step 1: Getting all unique session IDs from backup table (ordered by timestamp DESC)...');
    const { data: backupSessionIds, error: backupError } = await supabase
      .from('chat_backup')
      .select('session_id, original_timestamp')
      .order('original_timestamp', { ascending: false })
      .limit(50000);
    
    if (backupError) {
      console.error('Error getting backup session IDs:', backupError);
      return { success: false, error: `Error getting backup sessions: ${backupError.message}` };
    }
    
    if (!backupSessionIds || backupSessionIds.length === 0) {
      return { 
        success: true, 
        data: {
          totalBackupSessions: 0,
          totalChatlogSessions: 0,
          sessionsNeedingRecovery: 0,
          sessionsComplete: 0,
          missingFromChatlog: [],
          allSessions: [],
          backupRowsReturned: 0,
          chatlogRowsReturned: 0,
          possiblyTruncated: false
        }
      };
    }
    
    // Get unique session IDs from backup
    const uniqueBackupSessionIds = [...new Set(backupSessionIds.map(entry => entry.session_id))];
    console.log(`Found ${uniqueBackupSessionIds.length} unique sessions in backup table`);
    console.log('Sample backup session IDs:', uniqueBackupSessionIds.slice(0, 3));
    
    // Log date range if we have timestamp data
    if (backupSessionIds.length > 0 && backupSessionIds[0].original_timestamp) {
      console.log('Backup date range:', {
        newest: backupSessionIds[0].original_timestamp,
        oldest: backupSessionIds[backupSessionIds.length - 1]?.original_timestamp
      });
    }
    
    // Step 2: Get ALL unique session_ids from chatlog table (most recent first)
    console.log('Step 2: Getting all unique session IDs from chatlog table (ordered by timestamp DESC)...');
    const { data: chatlogSessionIds, error: chatlogError } = await supabase
      .from('chatlog')
      .select('session_id, timestamp')
      .not('session_id', 'is', null)
      .order('timestamp', { ascending: false })
      .limit(50000);
    
    if (chatlogError) {
      console.error('Error getting chatlog session IDs:', chatlogError);
      return { success: false, error: `Error getting chatlog sessions: ${chatlogError.message}` };
    }
    
    // Get unique session IDs from chatlog
    const uniqueChatlogSessionIds = [...new Set((chatlogSessionIds || []).map(entry => entry.session_id))];
    console.log(`Found ${uniqueChatlogSessionIds.length} unique sessions in chatlog table`);
    console.log('Sample chatlog session IDs:', uniqueChatlogSessionIds.slice(0, 3));
    
    // Log chatlog date range
    if (chatlogSessionIds && chatlogSessionIds.length > 0) {
      console.log('Chatlog date range:', {
        newest: chatlogSessionIds[0]?.timestamp,
        oldest: chatlogSessionIds[chatlogSessionIds.length - 1]?.timestamp
      });
    }
    
    // Step 3: Find missing sessions using JavaScript Set operations
    console.log('Step 3: Comparing session IDs to find missing ones...');
    const chatlogSessionSet = new Set(uniqueChatlogSessionIds);
    const missingSessionIds = uniqueBackupSessionIds.filter(sessionId => !chatlogSessionSet.has(sessionId));
    
    console.log(`Found ${missingSessionIds.length} sessions missing from chatlog`);
    console.log('Sample missing session IDs:', missingSessionIds.slice(0, 3));
    
    // Check for the specific test session
    const testSessionId = 'bd2416af-dd73-4631-9a4e-647ad7bedc0a';
    const testInBackup = uniqueBackupSessionIds.includes(testSessionId);
    const testInChatlog = uniqueChatlogSessionIds.includes(testSessionId);
    const testIsMissing = missingSessionIds.includes(testSessionId);
    
    console.log(`🔍 Test session ${testSessionId}:`);
    console.log(`  - In backup: ${testInBackup}`);
    console.log(`  - In chatlog: ${testInChatlog}`);
    console.log(`  - Missing (needs recovery): ${testIsMissing}`);
    
    // Step 4: Get detailed info for ALL backup sessions (for the full list, most recent first)
    console.log('Step 4: Getting detailed info for backup sessions (ordered by timestamp DESC)...');
    const { data: backupDetails, error: backupDetailsError } = await supabase
      .from('chat_backup')
      .select('session_id, user_id, original_timestamp')
      .order('original_timestamp', { ascending: false })
      .limit(50000);
    
    if (backupDetailsError) {
      console.error('Error getting backup details:', backupDetailsError);
      return { success: false, error: `Error getting backup details: ${backupDetailsError.message}` };
    }
    
    // Group backup details by session
    const backupBySession = (backupDetails || []).reduce((acc, entry) => {
      const sessionId = entry.session_id;
      if (!acc[sessionId]) {
        acc[sessionId] = {
          count: 0,
          userIds: new Set<string>(),
          timestamps: []
        };
      }
      acc[sessionId].count++;
      acc[sessionId].userIds.add(entry.user_id);
      acc[sessionId].timestamps.push(entry.original_timestamp);
      return acc;
    }, {} as Record<string, { count: number; userIds: Set<string>; timestamps: string[] }>);
    
    // Step 5: Get chatlog counts for sessions (but process in smaller batches to avoid IN clause limits)
    console.log('Step 5: Getting chatlog counts for backup sessions...');
    const chatlogCounts: Record<string, number> = {};
    
    // Process in batches of 100 to avoid IN clause limits
    const batchSize = 100;
    for (let i = 0; i < uniqueBackupSessionIds.length; i += batchSize) {
      const batch = uniqueBackupSessionIds.slice(i, i + batchSize);
      
      const { data: batchCounts, error: batchError } = await supabase
        .from('chatlog')
        .select('session_id')
        .in('session_id', batch);
      
      if (batchError) {
        console.warn(`Error getting batch ${i}-${i + batchSize}:`, batchError);
        continue;
      }
      
      // Count entries for this batch
      (batchCounts || []).forEach(entry => {
        const sessionId = entry.session_id;
        chatlogCounts[sessionId] = (chatlogCounts[sessionId] || 0) + 1;
      });
    }
    
    console.log(`Processed chatlog counts for ${Object.keys(chatlogCounts).length} sessions`);
    
    // Step 6: Build audit results
    console.log('Step 6: Building audit results...');
    const auditResults: AuditResult[] = uniqueBackupSessionIds.map(sessionId => {
      const backupInfo = backupBySession[sessionId];
      const chatlogCount = chatlogCounts[sessionId] || 0;
      const needsRecovery = chatlogCount === 0;
      
      if (!backupInfo) {
        console.warn(`Missing backup info for session ${sessionId}`);
        return null;
      }
      
      // Sort timestamps to get first and last
      const sortedTimestamps = backupInfo.timestamps.sort();
      
      return {
        sessionId,
        backupCount: backupInfo.count,
        chatlogCount,
        firstBackupTimestamp: sortedTimestamps[0],
        lastBackupTimestamp: sortedTimestamps[sortedTimestamps.length - 1],
        userIds: Array.from(backupInfo.userIds),
        needsRecovery
      };
    }).filter(Boolean) as AuditResult[];
    
    // Filter sessions that need recovery
    const missingFromChatlog = auditResults.filter(result => result.needsRecovery);
    
    const backupRowsReturned = backupSessionIds?.length || 0;
    const chatlogRowsReturned = chatlogSessionIds?.length || 0;
    const possiblyTruncated = backupRowsReturned >= 50000 || chatlogRowsReturned >= 50000;
    
    const summary: AuditSummary = {
      totalBackupSessions: uniqueBackupSessionIds.length,
      totalChatlogSessions: uniqueChatlogSessionIds.length,
      sessionsNeedingRecovery: missingFromChatlog.length,
      sessionsComplete: auditResults.length - missingFromChatlog.length,
      missingFromChatlog,
      allSessions: auditResults,
      backupRowsReturned,
      chatlogRowsReturned,
      possiblyTruncated
    };
    
    console.log('✅ Audit complete:', {
      totalBackupSessions: summary.totalBackupSessions,
      totalChatlogSessions: summary.totalChatlogSessions,
      sessionsNeedingRecovery: summary.sessionsNeedingRecovery,
      sessionsComplete: summary.sessionsComplete
    });
    
    // Log a few examples of missing sessions for verification
    if (missingFromChatlog.length > 0) {
      console.log('Examples of missing sessions:', missingFromChatlog.slice(0, 3).map(s => s.sessionId));
    }
    
    return { success: true, data: summary };
    
  } catch (error) {
    console.error('Error in auditAllSessions:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}

/**
 * Simple function to just list all unique session IDs from backup table
 * For debugging purposes - now with timestamp ordering and more info
 */
export async function listAllBackupSessionIds(): Promise<{ success: boolean; data?: Array<{sessionId: string, latestTimestamp: string, count: number}>; error?: string }> {
  try {
    const supabase = createClient();
    
    console.log('🔍 Getting all session IDs from backup table (ordered by timestamp DESC)...');
    
    // Get all backup sessions with timestamp info, ordered by most recent first
    const { data: backupSessions, error: backupError } = await supabase
      .from('chat_backup')
      .select('session_id, original_timestamp')
      .order('original_timestamp', { ascending: false })
      .limit(50000);
    
    if (backupError) {
      console.error('Error getting backup session IDs:', backupError);
      return { success: false, error: `Error getting backup sessions: ${backupError.message}` };
    }
    
    if (!backupSessions || backupSessions.length === 0) {
      console.log('No backup sessions found');
      return { success: true, data: [] };
    }
    
    console.log(`Found ${backupSessions.length} total backup entries`);
    console.log('Date range:', {
      newest: backupSessions[0]?.original_timestamp,
      oldest: backupSessions[backupSessions.length - 1]?.original_timestamp
    });
    
    // Group by session ID and get latest timestamp + count for each
    const sessionMap = new Map<string, {latestTimestamp: string, count: number}>();
    
    backupSessions.forEach(entry => {
      const sessionId = entry.session_id;
      const timestamp = entry.original_timestamp;
      
      if (!sessionMap.has(sessionId)) {
        sessionMap.set(sessionId, {
          latestTimestamp: timestamp,
          count: 1
        });
      } else {
        const existing = sessionMap.get(sessionId)!;
        existing.count++;
        // Since we're ordered by timestamp DESC, first occurrence is the latest
        // So we don't need to update latestTimestamp
      }
    });
    
    // Convert to array format
    const sessionData = Array.from(sessionMap.entries()).map(([sessionId, info]) => ({
      sessionId,
      latestTimestamp: info.latestTimestamp,
      count: info.count
    }));
    
    // Sort by latest timestamp descending (most recent sessions first)
    sessionData.sort((a, b) => new Date(b.latestTimestamp).getTime() - new Date(a.latestTimestamp).getTime());
    
    console.log(`Found ${sessionData.length} unique session IDs`);
    console.log('Most recent session IDs (first 10):', sessionData.slice(0, 10).map(s => s.sessionId));
    
    // Check if our specific session is in there
    const testSessionId = 'bd2416af-dd73-4631-9a4e-647ad7bedc0a';
    const testSession = sessionData.find(s => s.sessionId === testSessionId);
    if (testSession) {
      console.log(`✅ Found test session ${testSessionId}:`, testSession);
    } else {
      console.log(`❌ Test session ${testSessionId} NOT found in results`);
    }
    
    return { success: true, data: sessionData };
    
  } catch (error) {
    console.error('Error in listAllBackupSessionIds:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}

/**
 * Debug a specific session ID to see what the audit finds vs individual check
 * This is a debugging tool to help identify discrepancies
 */
export async function debugSessionInAudit(
  sessionId: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const supabase = createClient();
    
    console.log(`🔍 DEBUGGING SESSION: ${sessionId}`);
    
    // Step 1: Check what the individual check finds
    console.log('Step 1: Individual session check...');
    const individualCheck = await checkSessionStatus(sessionId);
    console.log('Individual check result:', individualCheck);
    
    // Step 2: Check raw backup data for this session
    console.log('Step 2: Raw backup data for this session...');
    const { data: backupRaw, error: backupError } = await supabase
      .from('chat_backup')
      .select('*')
      .eq('session_id', sessionId);
    
    if (backupError) {
      console.error('Error getting backup data:', backupError);
    } else {
      console.log(`Found ${backupRaw?.length || 0} backup entries for this session`);
      console.log('Backup entries:', backupRaw);
    }
    
    // Step 3: Check chatlog data for this session
    console.log('Step 3: Raw chatlog data for this session...');
    const { data: chatlogRaw, error: chatlogError } = await supabase
      .from('chatlog')
      .select('*')
      .eq('session_id', sessionId);
    
    if (chatlogError) {
      console.error('Error getting chatlog data:', chatlogError);
    } else {
      console.log(`Found ${chatlogRaw?.length || 0} chatlog entries for this session`);
      console.log('Chatlog entries:', chatlogRaw);
    }
    
    // Step 4: Run a mini-audit just for this session
    console.log('Step 4: Mini-audit for this session...');
    const { data: allBackupSessions, error: allBackupError } = await supabase
      .from('chat_backup')
      .select('session_id, user_id, original_timestamp')
      .order('session_id, original_timestamp')
      .limit(50000); // Set high limit to get all rows
    
    if (allBackupError) {
      console.error('Error getting all backup sessions:', allBackupError);
    } else {
      const sessionInBackup = allBackupSessions?.filter(s => s.session_id === sessionId) || [];
      console.log(`Session appears ${sessionInBackup.length} times in full backup scan`);
      
      const uniqueSessionIds = [...new Set(allBackupSessions?.map(s => s.session_id) || [])];
      const sessionFoundInUnique = uniqueSessionIds.includes(sessionId);
      console.log(`Session found in unique session IDs list: ${sessionFoundInUnique}`);
      console.log(`Total unique sessions in backup: ${uniqueSessionIds.length}`);
    }
    
    return {
      success: true,
      data: {
        sessionId,
        individualCheck: individualCheck.data,
        backupEntries: backupRaw?.length || 0,
        chatlogEntries: chatlogRaw?.length || 0,
        foundInBackup: (backupRaw?.length || 0) > 0,
        foundInChatlog: (chatlogRaw?.length || 0) > 0
      }
    };
    
  } catch (error) {
    console.error('Error in debugSessionInAudit:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
} 