'use client';

import React, { useState, useEffect, useCallback, useMemo, useReducer } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import {
  getChatlogEntriesForUser,
  saveWindowPotentials,
  ChatWindow,
  ChatlogEntry,
  cleanupIncorrectWindows
} from '@/app/chat/services/chatlog-service';
import { analyzeConversationWindow, WindowAnalysisResponse } from '@/app/synthesis/services/gemini-potential-client';
import { 
  processWindowForValueGraph, 
  updateWindowSynthesisStatus,
  normalizeExistingTopicLabels,
} from '@/app/synthesis/services';
import { createClient } from '@/utils/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { User, RefreshCw, Loader2, Settings2, Brain, Layers, MessageCircle, Play, Zap, Wrench } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { Badge } from "@/components/ui/badge";
import { normalizeMessageProperties } from '@/app/utils/chat-formatting';

// Import new components
import SynthesisProgressViewer, { SynthesisProgressData } from '@/components/synthesis/SynthesisProgressViewer';
import { LogEntry } from '@/components/synthesis/LogViewer';
import { logReducer, createLogger } from '@/components/synthesis/LoggingUtils';

interface UserDetails { id: string; name: string; email?: string; }

// Extended ChatWindow interface for client-side use with temporary properties
interface ClientChatWindow extends ChatWindow {
  clientId?: string; // Used for tracking on client side before saving to DB
}

const TIME_WINDOW_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const WINDOW_SIZE = 4; // Number of ChatlogEntry pairs in a window
const WINDOW_SHIFT = 3;

function createClientSideWindows(logEntries: ChatlogEntry[], userId: string, sessionId: string): ClientChatWindow[] {
    if (!logEntries || logEntries.length === 0) return [];
    
    // Ensure logEntries are sorted by timestamp
    const sortedLogEntries = [...logEntries].sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    
    console.log(`Creating client-side windows from ${sortedLogEntries.length} entries for session ${sessionId.substring(0,8)}...`);
    
    // Group entries by time proximity
    const timeGroups: ChatlogEntry[][] = [];
    let currentGroup: ChatlogEntry[] = sortedLogEntries.length > 0 ? [sortedLogEntries[0]] : [];
    
    for (let i = 1; i < sortedLogEntries.length; i++) {
      const currentEntry = sortedLogEntries[i];
      const prevEntry = sortedLogEntries[i - 1];
      if (new Date(currentEntry.timestamp).getTime() - new Date(prevEntry.timestamp).getTime() <= TIME_WINDOW_THRESHOLD_MS) {
        currentGroup.push(currentEntry);
      } else {
        if (currentGroup.length > 0) timeGroups.push(currentGroup);
        currentGroup = [currentEntry];
      }
    }
    if (currentGroup.length > 0) timeGroups.push(currentGroup);
    
    console.log(`Identified ${timeGroups.length} time groups for client windows`);
    
    const windows: ClientChatWindow[] = [];
    
    // Process each time group to create windows
    timeGroups.forEach((group, groupIndex) => {
      if (group.length === 0) return;
      
      // For small groups, create a single window
      if (group.length <= WINDOW_SIZE) {
        windows.push(createWindowFromGroup(group, userId, sessionId));
        return;
      }
      
      // For larger groups, use sliding window with fixed shift
      const numWindows = Math.ceil((group.length - WINDOW_SIZE) / WINDOW_SHIFT) + 1;
      console.log(`Time group ${groupIndex + 1} has ${group.length} entries, creating ~${numWindows} windows`);
      
      for (let i = 0; i <= group.length - WINDOW_SIZE; i += WINDOW_SHIFT) {
        const segment = group.slice(i, i + WINDOW_SIZE);
        windows.push(createWindowFromGroup(segment, userId, sessionId));
        
        // If we can't create a full window with the next shift, break
        if (i + WINDOW_SHIFT >= group.length - WINDOW_SIZE) {
          break;
        }
      }
      
      // Handle the last segment if there are remaining entries
      const lastWindowStart = Math.floor((group.length - WINDOW_SIZE) / WINDOW_SHIFT) * WINDOW_SHIFT;
      const lastWindowEnd = lastWindowStart + WINDOW_SIZE;
      
      if (lastWindowEnd < group.length) {
        const tailStart = Math.max(0, group.length - WINDOW_SIZE);
        // Only add tail window if it doesn't overlap completely with the last window
        if (tailStart > lastWindowStart) {
          const tailSegment = group.slice(tailStart);
          windows.push(createWindowFromGroup(tailSegment, userId, sessionId));
        }
      }
    });
    
    console.log(`Generated ${windows.length} client-side windows`);
    
    // Sort windows by start timestamp
    return windows.sort((a,b) => new Date(a.start_timestamp).getTime() - new Date(b.start_timestamp).getTime());
    
    // Helper function to create a window from a group of entries
    function createWindowFromGroup(entries: ChatlogEntry[], userId: string, sessionId: string): ClientChatWindow {
      const chatIds = entries.map(e => e.id).sort();
      const clientId = `client-${userId}-sess${sessionId}-${uuidv4()}`;
      
      return {
        id: uuidv4(),
        clientId: clientId,
        chat_ids: chatIds,
        chat_data: entries.map(e => ({ llm_message: e.llm_message, human_message: e.human_message, timestamp: e.timestamp })),
        start_timestamp: entries[0].timestamp,
        end_timestamp: entries[entries.length - 1].timestamp,
        potential_topics: [], 
        potential_contexts: [], 
        potential_items: [],
        user_id: userId,
        session_id: sessionId
      };
    }
}

const AdminUserSynthesisPage: React.FC = () => {
  const params = useParams();
  const router = useRouter();
  const { user: adminUser, isLoading: adminAuthLoading } = useAuth();
  
  const targetUserId = Array.isArray(params.userId) ? params.userId[0] : params.userId;
  const [targetUserDetails, setTargetUserDetails] = useState<UserDetails | null>(null);

  const [allChatlogEntries, setAllChatlogEntries] = useState<ChatlogEntry[]>([]);
  const [isLoadingEntries, setIsLoadingEntries] = useState(false);
  
  const [selectedSessionId, setSelectedSessionId] = useState<string | "">("");
  const [dynamicallyGeneratedWindows, setDynamicallyGeneratedWindows] = useState<ClientChatWindow[]>([]);
  const [selectedDynamicWindow, setSelectedDynamicWindow] = useState<ClientChatWindow | null>(null);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [synthesisResults, setSynthesisResults] = useState<any | null>(null);

  // Add progress tracking states
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [progressData, setProgressData] = useState<SynthesisProgressData>({
    stage: 'idle'
  });
  
  // Convert logs state to use useReducer
  const [logs, dispatchLog] = useReducer(logReducer, []);
  
  // Create a stable logger function
  const logger = useCallback(createLogger(dispatchLog), []);

  // Add new state variables for batch processing
  const [isBatchAnalyzing, setIsBatchAnalyzing] = useState(false);
  const [isBatchSynthesizing, setIsBatchSynthesizing] = useState(false);
  const [isNormalizingTopics, setIsNormalizingTopics] = useState(false);
  const [isSuperBatchProcessing, setIsSuperBatchProcessing] = useState(false);

  useEffect(() => {
    if (targetUserId) {
      setIsLoadingEntries(true);
      const fetchUserDetails = async () => {
        const supabase = createClient();
        const { data, error: userError } = await supabase
          .from('value_graph_users').select('id, name, email').eq('id', targetUserId).single();
        if (userError) { setError("Could not load user details."); setIsLoadingEntries(false); } 
        else if (data) { setTargetUserDetails(data); }
      };
      fetchUserDetails();
    }
  }, [targetUserId]);

  const loadChatlogEntries = useCallback(async () => {
    if (!targetUserId) return;
    setIsLoadingEntries(true); setError(null);
    try {
      const entriesResult = await getChatlogEntriesForUser(targetUserId);
      if (entriesResult.success && entriesResult.data) {
        setAllChatlogEntries(entriesResult.data);
        const sIds = Array.from(new Set(entriesResult.data.map(e => e.session_id).filter(id => id != null) as string[]));
        if (sIds.length > 0) {
            sIds.sort((a,b) => {
                const firstEntryA = entriesResult.data?.find(e => e.session_id === a);
                const firstEntryB = entriesResult.data?.find(e => e.session_id === b);
                if (firstEntryA && firstEntryB) {
                    return new Date(firstEntryB.timestamp).getTime() - new Date(firstEntryA.timestamp).getTime();
                }
                return 0;
            });
            setSelectedSessionId(sIds[0]);
        } else {
            setSelectedSessionId("");
        }
      } else { setError(entriesResult.error || "Failed to load chatlog entries."); }
    } catch (e) { setError(e instanceof Error ? e.message : "Error loading chatlog entries."); }
    finally { setIsLoadingEntries(false); }
  }, [targetUserId]);

  useEffect(() => {
    if (targetUserId && adminUser?.isAdmin) { loadChatlogEntries(); }
  }, [targetUserId, adminUser, loadChatlogEntries]);

  useEffect(() => {
    if (!adminAuthLoading && (!adminUser || !adminUser.isAdmin)) {
      router.replace('/login?callbackUrl=' + encodeURIComponent(window.location.pathname));
    }
  }, [adminUser, adminAuthLoading, router]);

  const uniqueSessionIds = useMemo(() => {
    if (!allChatlogEntries) return [];
    const ids = new Set(allChatlogEntries.map(e => e.session_id).filter(id => id != null) as string[]);
    return Array.from(ids).sort((a,b) => {
        const firstEntryA = allChatlogEntries.find(e => e.session_id === a);
        const firstEntryB = allChatlogEntries.find(e => e.session_id === b);
        if(firstEntryA && firstEntryB) {
            return new Date(firstEntryB.timestamp).getTime() - new Date(firstEntryA.timestamp).getTime();
        }
        return 0;
    });
  }, [allChatlogEntries]);

  useEffect(() => {
    if (selectedSessionId && allChatlogEntries.length > 0 && targetUserId) {
      const entriesForSession = allChatlogEntries.filter(e => e.session_id === selectedSessionId);
      const entryIds = entriesForSession.map(e => e.id);
      
      // Fetch existing windows from the database 
      const fetchAndMergeWindows = async () => {
        setIsLoadingEntries(true);
        try {
          const supabase = createClient();
          const { data: allUserWindows, error } = await supabase
            .from('chat_windows')
            .select('*')
            .eq('user_id', targetUserId);
            
          if (error) {
            console.error("Error fetching existing windows:", error);
            // Generate all client-side windows as fallback
            const clientSideWindows = createClientSideWindows(entriesForSession, targetUserId, selectedSessionId);
            setDynamicallyGeneratedWindows(clientSideWindows);
          } else if (allUserWindows && allUserWindows.length > 0) {
            // Filter windows that contain chat_ids from the selected session
            const relevantDbWindows = allUserWindows.filter(window => {
              // Check if any of this window's chat_ids are in the current session's entry IDs
              const windowChatIds = window.chat_ids || [];
              return windowChatIds.some((id: string) => entryIds.includes(id));
            });
            
            // Format database windows
            const formattedDbWindows = relevantDbWindows.map(window => ({
              ...window,
              chat_ids: window.chat_ids || [],
              clientId: `db-${window.id}` // Add clientId for tracking
            })) as ClientChatWindow[];
            
            console.log(`Found ${formattedDbWindows.length} existing windows in database for this session`);
            
            // Filter out incorrect windows using our filter function
            const filteredDbWindows = filterIncorrectWindows(formattedDbWindows, entriesForSession);
            console.log(`Filtered out ${formattedDbWindows.length - filteredDbWindows.length} incorrect windows`);
            
            // Find entries not covered by database windows
            const coveredEntryIds = new Set<string>();
            filteredDbWindows.forEach(window => {
              window.chat_ids.forEach(id => coveredEntryIds.add(id));
            });
            
            const uncoveredEntries = entriesForSession.filter(entry => !coveredEntryIds.has(entry.id));
            console.log(`Found ${uncoveredEntries.length} entries not covered by database windows`);
            
            let supplementalClientWindows: ClientChatWindow[] = [];
            if (uncoveredEntries.length > 0) {
              // Generate client-side windows ONLY for uncovered entries
              supplementalClientWindows = createClientSideWindows(uncoveredEntries, targetUserId, selectedSessionId);
              console.log(`Generated ${supplementalClientWindows.length} supplemental client-side windows`);
            }
            
            // Combine database windows with supplemental client windows
            const combinedWindows = [...filteredDbWindows, ...supplementalClientWindows];
            
            // Sort the combined windows by start timestamp
            const sortedWindows = combinedWindows.sort(
              (a, b) => new Date(a.start_timestamp).getTime() - new Date(b.start_timestamp).getTime()
            );
            
            setDynamicallyGeneratedWindows(sortedWindows);
          } else {
            // No existing windows at all, generate all client-side
            console.log("No existing windows found in database, generating client-side windows");
            const clientSideWindows = createClientSideWindows(entriesForSession, targetUserId, selectedSessionId);
            setDynamicallyGeneratedWindows(clientSideWindows);
          }
        } catch (e) {
          console.error("Error in fetchAndMergeWindows:", e);
          // Generate all client-side windows as fallback
          const clientSideWindows = createClientSideWindows(entriesForSession, targetUserId, selectedSessionId);
          setDynamicallyGeneratedWindows(clientSideWindows);
        } finally {
          setIsLoadingEntries(false);
        }
      };
      
      fetchAndMergeWindows();
      setSelectedDynamicWindow(null);
    } else {
      setDynamicallyGeneratedWindows([]);
      setSelectedDynamicWindow(null);
    }
  }, [selectedSessionId, allChatlogEntries, targetUserId]);

  // Function to filter out incorrectly generated windows
  const filterIncorrectWindows = (windows: ClientChatWindow[], entries: ChatlogEntry[]): ClientChatWindow[] => {
    if (!windows || windows.length === 0) return [];
    
    // Sort entries by timestamp to establish the correct timeline
    const sortedEntries = [...entries].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    
    // Create a map of entry IDs to their position in the timeline
    const entryPositionMap = new Map<string, number>();
    sortedEntries.forEach((entry, index) => {
      entryPositionMap.set(entry.id, index);
    });
    
    // Count the expected number of windows
    const entryCount = entries.length;
    const expectedWindowsCount = Math.ceil((entryCount - WINDOW_SIZE) / WINDOW_SHIFT) + 1;
    console.log(`With ${entryCount} entries, expecting about ${expectedWindowsCount} windows`);
    
    // Check if we have far too many windows
    if (windows.length > expectedWindowsCount * 1.5) {
      console.log(`Found ${windows.length} windows which is significantly more than expected (${expectedWindowsCount})`);
      return []; // Return empty array to trigger using client-side windows
    }
    
    return windows.filter(window => {
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
        return false;
      }
      
      // Check if window entries are contiguous in the timeline
      const windowEntryIds = window.chat_ids;
      if (windowEntryIds.length <= 1) return true; // Single-entry windows are valid at the end
      
      // Get positions of all entries in this window
      const positions = windowEntryIds
        .map(id => entryPositionMap.get(id))
        .filter(pos => pos !== undefined) as number[];
      
      if (positions.length !== windowEntryIds.length) {
        return false; // Some entries not found in our timeline
      }
      
      // Check if entries are contiguous and in the correct order
      positions.sort((a, b) => a - b);
      for (let i = 1; i < positions.length; i++) {
        if (positions[i] !== positions[i-1] + 1) {
          // Non-contiguous entries - check if they're part of different time groups
          const prevEntry = sortedEntries[positions[i-1]];
          const currEntry = sortedEntries[positions[i]];
          
          if (new Date(currEntry.timestamp).getTime() - new Date(prevEntry.timestamp).getTime() <= TIME_WINDOW_THRESHOLD_MS) {
            // Entries are within the same time group but not contiguous - this is incorrect
            return false;
          }
        }
      }
      
      return true;
    });
  };

  const handleSessionSelect = (sessionId: string) => {
    setSelectedSessionId(sessionId);
  };

  const handleWindowSelect = (window: ClientChatWindow) => {
    setSelectedDynamicWindow(window);
    setError(null); setSynthesisResults(null);
  };

  const handleAnalyzeSelectedWindow = async () => {
    if (!selectedDynamicWindow) return;
    setIsProcessing(true); setError(null);
    try {
      const analysisData = await analyzeConversationWindow(
        selectedDynamicWindow.chat_data, 
        ["Work", "Leisure", "Culture", "Education", "People", "Lifestyle"], // Default contexts
        targetUserId as string // Pass userId
      );
      if (analysisData.success && analysisData.data) {
        const potentialsToSave: WindowAnalysisResponse = analysisData.data;
        
        // Save potentials using the window id
        let saveResult = await saveWindowPotentials(
          selectedDynamicWindow.id, 
          {
            topics: potentialsToSave.topics || [],
            contexts: potentialsToSave.contexts || [],
            items: potentialsToSave.items || []
          }
        );

        // If the window doesn't exist yet, we need to create it first
        if (!saveResult.success && saveResult.error?.code === 'NOT_FOUND') {
          console.log("Window not found in database, creating it first...");
          
          // Insert the window into the database
          const supabase = createClient();
          const { data: insertedWindow, error: insertError } = await supabase
            .from('chat_windows')
            .insert({
              id: selectedDynamicWindow.id,
              chat_ids: selectedDynamicWindow.chat_ids,
              chat_data: selectedDynamicWindow.chat_data,
              start_timestamp: selectedDynamicWindow.start_timestamp,
              end_timestamp: selectedDynamicWindow.end_timestamp,
              potential_topics: potentialsToSave.topics || [],
              potential_contexts: potentialsToSave.contexts || [],
              potential_items: potentialsToSave.items || [],
              user_id: targetUserId,
              session_id: selectedSessionId
            })
            .select()
            .single();
            
          if (insertError) {
            setError(`Failed to create window in database: ${insertError.message}`);
            return;
          }
          
          // Update with inserted window
          saveResult = { 
            success: true, 
            data: insertedWindow as ClientChatWindow
          };
        } else if (!saveResult.success) {
          setError(saveResult.error?.message || 'Failed to save analysis results to database.');
          return;
        }

        if (saveResult.success && saveResult.data) {
          // Update the selected window with new potentials from DB
          const updatedWindow: ClientChatWindow = {
            ...saveResult.data,
            clientId: selectedDynamicWindow.clientId || `db-${saveResult.data.id}`
          };
          
          setSelectedDynamicWindow(updatedWindow);
          
          // Update the window in the dynamic windows list while preserving other windows
          setDynamicallyGeneratedWindows(prevWindows => {
            // Check if this window is already in our list
            const existingIndex = prevWindows.findIndex(w => w.id === updatedWindow.id);
            
            if (existingIndex >= 0) {
              // Update the existing window
              const newWindows = [...prevWindows];
              newWindows[existingIndex] = updatedWindow;
              return newWindows;
            } else {
              // This is a new window, add it to our list
              return [...prevWindows, updatedWindow];
            }
          });
        }
      } else {
        setError(analysisData.error || 'Failed to analyze window content.');
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Error analyzing window content.'); }
    setIsProcessing(false);
  };

  const handleSynthesizeSelectedWindow = async () => {
    if (!selectedDynamicWindow) return;
    if (!selectedDynamicWindow.potential_topics || selectedDynamicWindow.potential_topics.length === 0) {
      setError("Analyze window first to generate potentials."); return;
    }
    
    setIsProcessing(true);
    setError(null);
    setSynthesisResults(null);
    
    // Reset logs
    dispatchLog({ type: 'CLEAR_LOGS' });
    
    // Initialize progress data and show modal
    setProgressData({
      stage: 'processing',
      topics: {
        narrowed: [],
        created: [],
        updated: [],
        discarded: []
      },
      reasoning: [],
      nodes: {
        created: [],
        updated: []
      },
      items: {
        created: [],
        updated: [],
        extracted: []
      }
    });
    setShowProgressModal(true);
    
    // Log the start of processing
    logger(`Starting value graph synthesis for window ${selectedDynamicWindow.id.substring(0, 8)}...`);
    
    try {
      // Create a logging callback for the graph service to use
      const logCallback = (message: string, type: 'info' | 'error' | 'warning' = 'info') => {
        // Use our logger function
        logger(message, type === 'info' ? 'info' : type === 'error' ? 'error' : 'warning');
      };
      
      // Use the window id to process in value graph, passing userId and the logger
      const result = await processWindowForValueGraph(
        selectedDynamicWindow.id, 
        targetUserId as string,
        logCallback
      );
      
      // Handle the case where there's no high-confidence reasoning
      if (!result.success && result.error && 
          (result.error.includes("No high-confidence reasoning could be generated") ||
           result.error.includes("Cannot generate value graph: No high-confidence reasoning"))) {
        
        logger(`No high-confidence reasoning could be generated for this window. This is normal for some conversations.`, 'info');
        
        // Still mark the window as synthesized
        const updateResult = await updateWindowSynthesisStatus(selectedDynamicWindow.id, true);
        if (!updateResult.success) {
          logger(`Warning: Failed to update window synthesis status: ${updateResult.error}`, 'warning');
        } else {
          // Update UI to show window as synthesized
          setSelectedDynamicWindow({
            ...selectedDynamicWindow,
            synthesized: true
          });
          
          // Update the windows list
          setDynamicallyGeneratedWindows(prevWindows => {
            const updatedWindows = [...prevWindows];
            const index = updatedWindows.findIndex(w => w.id === selectedDynamicWindow.id);
            if (index !== -1) {
              updatedWindows[index] = {
                ...updatedWindows[index],
                synthesized: true
              };
            }
            return updatedWindows;
          });
        }
        
        setProgressData({
          stage: 'complete',
          topics: {
            narrowed: [],
            created: [],
            updated: [],
            discarded: []
          },
          reasoning: [],
          nodes: {
            created: [],
            updated: []
          },
          items: {
            created: [],
            updated: [],
            extracted: []
          },
          error: 'No high-confidence reasoning could be generated. Window marked as processed.'
        });
        
        setIsProcessing(false);
        return;
      }
      
      if (result.success && result.data) {
        setSynthesisResults(result.data);
        logger(`Synthesis completed successfully!`, 'success');
        
        // Mark window as synthesized in the database
        const updateResult = await updateWindowSynthesisStatus(selectedDynamicWindow.id, true);
        if (!updateResult.success) {
          logger(`Warning: Failed to update window synthesis status: ${updateResult.error}`, 'warning');
        } else {
          // Update UI to show window as synthesized
          setSelectedDynamicWindow({
            ...selectedDynamicWindow,
            synthesized: true
          });
          
          // Update the windows list
          setDynamicallyGeneratedWindows(prevWindows => {
            const updatedWindows = [...prevWindows];
            const index = updatedWindows.findIndex(w => w.id === selectedDynamicWindow.id);
            if (index !== -1) {
              updatedWindows[index] = {
                ...updatedWindows[index],
                synthesized: true
              };
            }
            return updatedWindows;
          });
        }
        
        // Update progress data with results
        setProgressData({
          stage: 'complete',
          topics: {
            narrowed: result.data.topics_created.map(t => t.label).concat(
              result.data.topics_updated.map(t => t.label)
            ),
            created: result.data.topics_created,
            updated: result.data.topics_updated,
            discarded: result.data.discarded_topics
          },
          reasoning: result.data.reasoning_results,
          nodes: {
            created: result.data.nodes_created,
            updated: result.data.nodes_updated
          },
          items: {
            created: result.data.items_created,
            updated: result.data.items_updated,
            extracted: result.data.extracted_items
          }
        });
      } else {
        const errorMsg = result.error || "Synthesis failed.";
        setError(errorMsg);
        logger(`Error: ${errorMsg}`, 'error');
        setProgressData({
          ...progressData,
          stage: 'error',
          error: errorMsg
        });
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Error synthesizing graph.';
      setError(errorMsg);
      logger(`Exception: ${errorMsg}`, 'error');
      setProgressData({
        ...progressData,
        stage: 'error',
        error: errorMsg
      });
    } finally {
      setIsProcessing(false);
    }
  };
  
  const formatDate = (timestamp: string) => new Date(timestamp).toLocaleString();
  const renderBadgeCount = (items: any[] | undefined) => 
    items && items.length > 0 ? 
    <span className="ml-1 px-1.5 py-0.5 text-xs font-semibold bg-blue-100 text-blue-700 rounded-full">{items.length}</span> : null;

  const handleCleanupIncorrectWindows = async () => {
    if (!targetUserId || !selectedSessionId) return;
    
    setIsCleaningUp(true);
    setError(null);
    
    try {
      // First delete incorrect windows from the database
      const result = await cleanupIncorrectWindows(targetUserId);
      
      // Reload using our hybrid approach that prioritizes DB windows
      // and supplements with client-side windows where needed
      const entriesForSession = allChatlogEntries.filter(e => e.session_id === selectedSessionId);
      const entryIds = entriesForSession.map(e => e.id);
      
      const supabase = createClient();
      const { data: allUserWindows, error } = await supabase
        .from('chat_windows')
        .select('*')
        .eq('user_id', targetUserId);
      
      if (error) {
        throw new Error(`Error fetching windows after cleanup: ${error.message}`);
      }
      
      // Get windows relevant to this session
      const relevantDbWindows = allUserWindows.filter(window => {
        const windowChatIds = window.chat_ids || [];
        return windowChatIds.some((id: string) => entryIds.includes(id));
      });
      
      // Format database windows
      const formattedDbWindows = relevantDbWindows.map(window => ({
        ...window,
        chat_ids: window.chat_ids || [],
        clientId: `db-${window.id}`
      })) as ClientChatWindow[];
      
      // Find entries not covered by database windows
      const coveredEntryIds = new Set<string>();
      formattedDbWindows.forEach(window => {
        window.chat_ids.forEach(id => coveredEntryIds.add(id));
      });
      
      const uncoveredEntries = entriesForSession.filter(entry => !coveredEntryIds.has(entry.id));
      let supplementalClientWindows: ClientChatWindow[] = [];
      
      if (uncoveredEntries.length > 0) {
        // Generate client-side windows ONLY for uncovered entries
        supplementalClientWindows = createClientSideWindows(uncoveredEntries, targetUserId, selectedSessionId);
      }
      
      // Combine database windows with supplemental client windows
      const combinedWindows = [...formattedDbWindows, ...supplementalClientWindows].sort(
        (a, b) => new Date(a.start_timestamp).getTime() - new Date(b.start_timestamp).getTime()
      );
      
      setDynamicallyGeneratedWindows(combinedWindows);
      setSelectedDynamicWindow(null);
      
      logger(`Cleaned up ${result.removedCount} incorrect windows. Using ${formattedDbWindows.length} DB windows and ${supplementalClientWindows.length} supplemental client windows`, 'success');
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : "Error cleaning up incorrect windows";
      setError(errorMsg);
      logger(errorMsg, 'error');
    } finally {
      setIsCleaningUp(false);
    }
  };

  // New batch analysis function
  const handleBatchAnalyzeSession = async () => {
    if (!selectedSessionId || !targetUserId || !dynamicallyGeneratedWindows.length) return;
    
    setIsBatchAnalyzing(true);
    setError(null);
    
    // Reset logs
    dispatchLog({ type: 'CLEAR_LOGS' });
    
    // Initialize batch progress data
    setProgressData({
      stage: 'processing',
      batchProgress: {
        current: 0,
        total: dynamicallyGeneratedWindows.length,
        completedWindows: [],
        failedWindows: [],
        isBatchOperation: true,
        operationType: 'analysis'
      }
    });
    setShowProgressModal(true);
    
    logger(`Starting batch analysis for ${dynamicallyGeneratedWindows.length} windows in session ${selectedSessionId.substring(0, 8)}...`);
    
    // Process windows sequentially (better for API rate limits)
    let completedCount = 0;
    let failedCount = 0;
    const completedWindows: string[] = [];
    const failedWindows: {id: string; error: string}[] = [];
    
    for (let i = 0; i < dynamicallyGeneratedWindows.length; i++) {
      const window = dynamicallyGeneratedWindows[i];
      
      // Update progress
      setProgressData(prevData => ({
        ...prevData,
        batchProgress: {
          ...prevData.batchProgress!,
          current: i + 1
        }
      }));
      
      // Create a window-specific logger
      const windowLogger = (message: string, type: 'info' | 'error' | 'warning' = 'info') => {
        logger(message, type, `Window ${i+1}/${dynamicallyGeneratedWindows.length}`);
      };
      
      windowLogger(`Processing window ${window.id.substring(0, 8)}`);
      
      try {
        // Skip if this window already has potentials
        if (
          window.potential_topics && 
          window.potential_topics.length > 0 && 
          window.potential_contexts && 
          window.potential_contexts.length > 0
        ) {
          windowLogger(`Window ${window.id.substring(0, 8)} already has potentials, skipping`);
          completedWindows.push(window.id);
          completedCount++;
          continue;
        }
        
        // Analyze the window
        windowLogger(`Analyzing window ${window.id.substring(0, 8)}`);
        const analysisData = await analyzeConversationWindow(
          window.chat_data, 
          ["Work", "Leisure", "Culture", "Education", "People", "Lifestyle"], // Default contexts
          targetUserId as string // Pass userId
        );
        
        if (analysisData.success && analysisData.data) {
          const potentialsToSave: WindowAnalysisResponse = analysisData.data;
          
          // Save potentials to the window
          let saveResult;
          
          // If the window doesn't exist in DB yet, insert it first
          if (window.clientId?.startsWith('client-')) {
            windowLogger(`Window doesn't exist in database yet, creating it first...`);
            const supabase = createClient();
            const { data: insertedWindow, error: insertError } = await supabase
              .from('chat_windows')
              .insert({
                id: window.id,
                chat_ids: window.chat_ids,
                chat_data: window.chat_data,
                start_timestamp: window.start_timestamp,
                end_timestamp: window.end_timestamp,
                potential_topics: potentialsToSave.topics || [],
                potential_contexts: potentialsToSave.contexts || [],
                potential_items: potentialsToSave.items || [],
                user_id: targetUserId,
                session_id: selectedSessionId
              })
              .select()
              .single();
              
            if (insertError) {
              throw new Error(`Failed to create window in database: ${insertError.message}`);
            }
            
            saveResult = { success: true, data: insertedWindow };
          } else {
            // Save potentials to existing window
            saveResult = await saveWindowPotentials(
              window.id,
              {
                topics: potentialsToSave.topics || [],
                contexts: potentialsToSave.contexts || [],
                items: potentialsToSave.items || []
              }
            );
          }
          
          if (saveResult.success) {
            windowLogger(`Successfully analyzed window ${window.id.substring(0, 8)}`);
            completedWindows.push(window.id);
            completedCount++;
            
            // Update the window in the dynamicallyGeneratedWindows list
            setDynamicallyGeneratedWindows(prevWindows => {
              const updatedWindows = [...prevWindows];
              const index = updatedWindows.findIndex(w => w.id === window.id);
              if (index !== -1) {
                updatedWindows[index] = {
                  ...updatedWindows[index],
                  potential_topics: potentialsToSave.topics || [],
                  potential_contexts: potentialsToSave.contexts || [],
                  potential_items: potentialsToSave.items || []
                };
              }
              return updatedWindows;
            });
          } else {
            const errorMsg = saveResult.error?.message || 'Failed to save analysis results';
            windowLogger(`Error: ${errorMsg}`, 'error');
            failedWindows.push({ id: window.id, error: errorMsg });
            failedCount++;
          }
        } else {
          const errorMsg = analysisData.error || 'Failed to analyze window content';
          windowLogger(`Error: ${errorMsg}`, 'error');
          failedWindows.push({ id: window.id, error: errorMsg });
          failedCount++;
        }
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : 'Error analyzing window content';
        windowLogger(`Exception: ${errorMsg}`, 'error');
        failedWindows.push({ id: window.id, error: errorMsg });
        failedCount++;
      }
      
      // Small delay to prevent API rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Update final progress data
    setProgressData({
      stage: 'complete',
      batchProgress: {
        current: dynamicallyGeneratedWindows.length,
        total: dynamicallyGeneratedWindows.length,
        completedWindows,
        failedWindows,
        isBatchOperation: true,
        operationType: 'analysis'
      }
    });
    
    logger(`Batch analysis complete: ${completedCount} windows processed successfully, ${failedCount} failed`, 
      failedCount > 0 ? 'warning' : 'info');
    
    setIsBatchAnalyzing(false);
  };

  // New batch synthesis function
  const handleBatchSynthesizeSession = async () => {
    if (!selectedSessionId || !targetUserId || !dynamicallyGeneratedWindows.length) return;
    
    // Check if all windows have potentials first
    const windowsWithoutPotentials = dynamicallyGeneratedWindows.filter(window => 
      !window.potential_topics || window.potential_topics.length === 0 || 
      !window.potential_contexts || window.potential_contexts.length === 0
    );
    
    if (windowsWithoutPotentials.length > 0) {
      setError(`Cannot batch synthesize: ${windowsWithoutPotentials.length} windows need to be analyzed first.`);
      return;
    }
    
    setIsBatchSynthesizing(true);
    setError(null);
    
    // Reset logs
    dispatchLog({ type: 'CLEAR_LOGS' });
    
    // Initialize batch progress data
    setProgressData({
      stage: 'processing',
      batchProgress: {
        current: 0,
        total: dynamicallyGeneratedWindows.length,
        completedWindows: [],
        failedWindows: [],
        isBatchOperation: true,
        operationType: 'synthesis'
      }
    });
    setShowProgressModal(true);
    
    logger(`Starting batch synthesis for ${dynamicallyGeneratedWindows.length} windows in session ${selectedSessionId.substring(0, 8)}...`);
    
    // Process windows sequentially
    let completedCount = 0;
    let failedCount = 0;
    const completedWindows: string[] = [];
    const failedWindows: {id: string; error: string}[] = [];
    
    for (let i = 0; i < dynamicallyGeneratedWindows.length; i++) {
      const window = dynamicallyGeneratedWindows[i];
      
      // Skip if this window is already synthesized, unless we're forcing it
      if (window.synthesized === true) {
        logger(`Window ${window.id.substring(0, 8)} already synthesized, skipping`);
        completedWindows.push(window.id);
        completedCount++;
        
        // Update progress
        setProgressData(prevData => ({
          ...prevData,
          batchProgress: {
            ...prevData.batchProgress!,
            current: i + 1,
            completedWindows
          }
        }));
        
        continue;
      }
      
      // Update progress
      setProgressData(prevData => ({
        ...prevData,
        batchProgress: {
          ...prevData.batchProgress!,
          current: i + 1
        }
      }));
      
      // Create a window-specific logger
      const windowLogger = (message: string, type: 'info' | 'error' | 'warning' = 'info') => {
        logger(message, type, `Window ${i+1}/${dynamicallyGeneratedWindows.length}`);
      };
      
      windowLogger(`Processing window ${window.id.substring(0, 8)}`);
      
      try {
        // Process for value graph
        windowLogger(`Synthesizing window ${window.id.substring(0, 8)}`);
        
        // Create a logging callback for the graph service to use
        const graphLogger = (message: string, type: 'info' | 'error' | 'warning' = 'info') => {
          // Forward to our windowed logger
          windowLogger(message, type);
        };
        
        const result = await processWindowForValueGraph(
          window.id, 
          targetUserId as string,
          graphLogger
        );
        
        // Handle the case where there's no high-confidence reasoning
        if (!result.success && result.error && 
            (result.error.includes("No high-confidence reasoning could be generated") ||
             result.error.includes("Cannot generate value graph: No high-confidence reasoning"))) {
          
          windowLogger(`No high-confidence reasoning could be generated for this window. This is normal for some conversations.`, 'info');
          
          // Still mark the window as synthesized
          const updateResult = await updateWindowSynthesisStatus(window.id, true);
          if (!updateResult.success) {
            windowLogger(`Warning: Failed to update window synthesis status: ${updateResult.error}`, 'warning');
          } else {
            // Update local state with synthesized flag
            setDynamicallyGeneratedWindows(prevWindows => {
              const updatedWindows = [...prevWindows];
              const index = updatedWindows.findIndex(w => w.id === window.id);
              if (index !== -1) {
                updatedWindows[index] = {
                  ...updatedWindows[index],
                  synthesized: true
                };
              }
              return updatedWindows;
            });
          }
          
          // Count this as a completed window, not a failed one
          completedWindows.push(window.id);
          completedCount++;
          continue;
        }
        
        if (result.success && result.data) {
          windowLogger(`Successfully synthesized window ${window.id.substring(0, 8)}`, 'info');
          
          // Mark window as synthesized in the database
          const updateResult = await updateWindowSynthesisStatus(window.id, true);
          if (!updateResult.success) {
            windowLogger(`Warning: Failed to update window synthesis status: ${updateResult.error}`, 'warning');
          }
          
          // Update local state with synthesized flag
          setDynamicallyGeneratedWindows(prevWindows => {
            const updatedWindows = [...prevWindows];
            const index = updatedWindows.findIndex(w => w.id === window.id);
            if (index !== -1) {
              updatedWindows[index] = {
                ...updatedWindows[index],
                synthesized: true
              };
            }
            return updatedWindows;
          });
          
          completedWindows.push(window.id);
          completedCount++;
        } else {
          const errorMsg = result.error || 'Synthesis failed';
          windowLogger(`Error: ${errorMsg}`, 'error');
          failedWindows.push({ id: window.id, error: errorMsg });
          failedCount++;
        }
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : 'Error during synthesis';
        windowLogger(`Exception: ${errorMsg}`, 'error');
        failedWindows.push({ id: window.id, error: errorMsg });
        failedCount++;
      }
      
      // Small delay between windows
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Update final progress data
    setProgressData({
      stage: 'complete',
      batchProgress: {
        current: dynamicallyGeneratedWindows.length,
        total: dynamicallyGeneratedWindows.length,
        completedWindows,
        failedWindows,
        isBatchOperation: true,
        operationType: 'synthesis'
      }
    });
    
    logger(`Batch synthesis complete: ${completedCount} windows processed successfully, ${failedCount} failed`, 
      failedCount > 0 ? 'warning' : 'info');
    
    setIsBatchSynthesizing(false);
  };

  // Add new function to normalize topics:
  const handleNormalizeTopics = async () => {
    if (!targetUserId) return;
    
    setIsNormalizingTopics(true);
    setError(null);
    
    // Reset logs
    dispatchLog({ type: 'CLEAR_LOGS' });
    
    // Initialize progress data
    setProgressData({
      stage: 'processing',
      batchProgress: {
        current: 0,
        total: 1,
        completedWindows: [],
        failedWindows: [],
        isBatchOperation: true,
        operationType: 'analysis'
      }
    });
    setShowProgressModal(true);
    
    logger(`Starting topic normalization for user ${targetUserId}`);
    
    try {
      const result = await normalizeExistingTopicLabels(targetUserId);
      
      if (result.success) {
        logger(`Successfully normalized ${result.updatedCount} topics/related labels`, 'info');
        
        // If any topics were updated, reload chat entries to refresh the data
        if (result.updatedCount > 0) {
          logger(`Reloading chat entries to refresh data...`, 'info');
          await loadChatlogEntries();
        }
        
        setProgressData({
          stage: 'complete',
          batchProgress: {
            current: 1,
            total: 1,
            completedWindows: ['topic-normalization'],
            failedWindows: [],
            isBatchOperation: true,
            operationType: 'analysis'
          }
        });
      } else {
        logger(`Error normalizing topics: ${result.error}`, 'error');
        
        setProgressData({
          stage: 'error',
          error: result.error,
          batchProgress: {
            current: 0,
            total: 1,
            completedWindows: [],
            failedWindows: [{ id: 'topic-normalization', error: result.error || 'Unknown error' }],
            isBatchOperation: true,
            operationType: 'analysis'
          }
        });
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Error normalizing topics';
      logger(`Exception: ${errorMsg}`, 'error');
      
      setProgressData({
        stage: 'error',
        error: errorMsg,
        batchProgress: {
          current: 0,
          total: 1,
          completedWindows: [],
          failedWindows: [{ id: 'topic-normalization', error: errorMsg }],
          isBatchOperation: true,
          operationType: 'analysis'
        }
      });
    } finally {
      setIsNormalizingTopics(false);
    }
  };

  // Add function to unflag a window as synthesized
  const handleUnflagSynthesized = async () => {
    if (!selectedDynamicWindow) return;
    
    setIsProcessing(true);
    setError(null);
    
    try {
      const result = await updateWindowSynthesisStatus(selectedDynamicWindow.id, false);
      
      if (result.success) {
        logger(`Successfully unflagged window ${selectedDynamicWindow.id.substring(0, 8)} as not synthesized`, 'success');
        
        // Update the selected window with synthesized = false
        setSelectedDynamicWindow({
          ...selectedDynamicWindow,
          synthesized: false
        });
        
        // Update the window in the dynamicallyGeneratedWindows list
        setDynamicallyGeneratedWindows(prevWindows => {
          const updatedWindows = [...prevWindows];
          const index = updatedWindows.findIndex(w => w.id === selectedDynamicWindow.id);
          if (index !== -1) {
            updatedWindows[index] = {
              ...updatedWindows[index],
              synthesized: false
            };
          }
          return updatedWindows;
        });
      } else {
        setError(result.error || 'Failed to unflag window as not synthesized');
        logger(`Error unflagging window: ${result.error}`, 'error');
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Error unflagging window';
      setError(errorMsg);
      logger(`Exception: ${errorMsg}`, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  // Super batch function: analyze and synthesize ALL sessions
  const handleSuperBatchAnalyzeAndSynthesize = async () => {
    if (!targetUserId || !allChatlogEntries.length) return;
    
    setIsSuperBatchProcessing(true);
    setError(null);
    
    // Reset logs
    dispatchLog({ type: 'CLEAR_LOGS' });
    
    // Get all unique session IDs
    const allSessionIds = Array.from(new Set(allChatlogEntries.map(e => e.session_id).filter(id => id != null) as string[]));
    
    logger(`🚀 Starting SUPER BATCH processing for ${allSessionIds.length} sessions for user ${targetUserId}`);
    
    // Initialize super batch progress data
    setProgressData({
      stage: 'processing',
      superBatchProgress: {
        currentSession: 0,
        totalSessions: allSessionIds.length,
        currentSessionId: '',
        currentOperation: 'starting',
        completedSessions: [],
        failedSessions: [],
        sessionProgress: {
          analyzing: 0,
          synthesizing: 0,
          totalWindows: 0
        }
      }
    });
    setShowProgressModal(true);
    
    let completedSessions: string[] = [];
    let failedSessions: {id: string; error: string}[] = [];
    
    // Process each session sequentially
    for (let sessionIndex = 0; sessionIndex < allSessionIds.length; sessionIndex++) {
      const sessionId = allSessionIds[sessionIndex];
      
      logger(`📂 Processing session ${sessionIndex + 1}/${allSessionIds.length}: ${sessionId.substring(0, 8)}...`);
      
      // Update progress to show current session
      setProgressData(prevData => ({
        ...prevData,
        superBatchProgress: {
          ...prevData.superBatchProgress!,
          currentSession: sessionIndex + 1,
          currentSessionId: sessionId,
          currentOperation: 'loading_windows'
        }
      }));
      
      try {
        // Generate windows for this session (similar to session selection logic)
        const entriesForSession = allChatlogEntries.filter(e => e.session_id === sessionId);
        const entryIds = entriesForSession.map(e => e.id);
        
        logger(`📄 Session ${sessionId.substring(0, 8)} has ${entriesForSession.length} chat entries`);
        
        // Get existing windows from database for this session
        const supabase = createClient();
        const { data: existingWindows, error: windowsError } = await supabase
          .from('chat_windows')
          .select('*')
          .eq('user_id', targetUserId)
          .eq('session_id', sessionId);
        
        if (windowsError) {
          throw new Error(`Failed to fetch windows for session: ${windowsError.message}`);
        }
        
        // Process windows similar to session selection logic
        let sessionWindows: ClientChatWindow[] = [];
        
        if (existingWindows && existingWindows.length > 0) {
          // Filter windows that contain chat_ids from this session
          const relevantDbWindows = existingWindows.filter(window => {
            const windowChatIds = window.chat_ids || [];
            return windowChatIds.some((id: string) => entryIds.includes(id));
          });
          
          const formattedDbWindows = relevantDbWindows.map(window => ({
            ...window,
            chat_ids: window.chat_ids || [],
            clientId: `db-${window.id}`
          })) as ClientChatWindow[];
          
          // Filter out incorrect windows
          const filteredDbWindows = filterIncorrectWindows(formattedDbWindows, entriesForSession);
          
          // Find uncovered entries and generate supplemental windows
          const coveredEntryIds = new Set<string>();
          filteredDbWindows.forEach(window => {
            window.chat_ids.forEach(id => coveredEntryIds.add(id));
          });
          
          const uncoveredEntries = entriesForSession.filter(entry => !coveredEntryIds.has(entry.id));
          let supplementalClientWindows: ClientChatWindow[] = [];
          
          if (uncoveredEntries.length > 0) {
            supplementalClientWindows = createClientSideWindows(uncoveredEntries, targetUserId, sessionId);
          }
          
          sessionWindows = [...filteredDbWindows, ...supplementalClientWindows].sort(
            (a, b) => new Date(a.start_timestamp).getTime() - new Date(b.start_timestamp).getTime()
          );
        } else {
          // No existing windows, generate all client-side
          sessionWindows = createClientSideWindows(entriesForSession, targetUserId, sessionId);
        }
        
        logger(`🪟 Session ${sessionId.substring(0, 8)} has ${sessionWindows.length} windows to process`);
        
        if (sessionWindows.length === 0) {
          logger(`⚠️ Session ${sessionId.substring(0, 8)} has no windows, skipping`);
          continue;
        }
        
        // STEP 1: Determine which windows need analysis
        logger(`🔍 Step 1: Checking which windows need analysis in session ${sessionId.substring(0, 8)}`);
        
        const windowsNeedingAnalysis = sessionWindows.filter(window => 
          !window.potential_topics || window.potential_topics.length === 0 ||
          !window.potential_contexts || window.potential_contexts.length === 0
        );
        
        logger(`📊 ${windowsNeedingAnalysis.length} windows need analysis, ${sessionWindows.length - windowsNeedingAnalysis.length} already analyzed`);
        
        // Update progress with analysis phase info
        setProgressData(prevData => ({
          ...prevData,
          superBatchProgress: {
            ...prevData.superBatchProgress!,
            currentOperation: windowsNeedingAnalysis.length > 0 ? 'analyzing' : 'synthesizing',
            sessionProgress: {
              analyzing: 0,
              synthesizing: 0,
              totalWindows: windowsNeedingAnalysis.length
            }
          }
        }));
        
        // Start batch analysis if needed
        if (windowsNeedingAnalysis.length > 0) {
          logger(`🔍 Beginning analysis of ${windowsNeedingAnalysis.length} windows...`);
        }
        
        // Analyze windows that need it
        let analyzedCount = 0;
        for (let i = 0; i < windowsNeedingAnalysis.length; i++) {
          const window = windowsNeedingAnalysis[i];
          
          setProgressData(prevData => ({
            ...prevData,
            superBatchProgress: {
              ...prevData.superBatchProgress!,
              sessionProgress: {
                ...prevData.superBatchProgress!.sessionProgress,
                analyzing: i + 1
              }
            }
          }));
          
          logger(`🔍 Analyzing window ${i + 1}/${windowsNeedingAnalysis.length}: ${window.id.substring(0, 8)}`);
          
          try {
            const analysisData = await analyzeConversationWindow(
              window.chat_data,
              ["Work", "Leisure", "Culture", "Education", "People", "Lifestyle"],
              targetUserId
            );
            
            if (analysisData.success && analysisData.data) {
              // Save or create window with potentials
              if (window.clientId?.startsWith('client-')) {
                // Create new window in database
                const { data: insertedWindow, error: insertError } = await supabase
                  .from('chat_windows')
                  .insert({
                    id: window.id,
                    chat_ids: window.chat_ids,
                    chat_data: window.chat_data,
                    start_timestamp: window.start_timestamp,
                    end_timestamp: window.end_timestamp,
                    potential_topics: analysisData.data.topics || [],
                    potential_contexts: analysisData.data.contexts || [],
                    potential_items: analysisData.data.items || [],
                    user_id: targetUserId,
                    session_id: sessionId
                  })
                  .select()
                  .single();
                
                if (insertError) {
                  throw new Error(`Failed to create window: ${insertError.message}`);
                }
              } else {
                // Update existing window
                const saveResult = await saveWindowPotentials(window.id, {
                  topics: analysisData.data.topics || [],
                  contexts: analysisData.data.contexts || [],
                  items: analysisData.data.items || []
                });
                
                if (!saveResult.success) {
                  throw new Error(`Failed to save potentials: ${saveResult.error?.message}`);
                }
              }
              
              analyzedCount++;
              logger(`✅ Successfully analyzed window ${window.id.substring(0, 8)}`);
            } else {
              logger(`❌ Failed to analyze window ${window.id.substring(0, 8)}: ${analysisData.error}`, 'error');
            }
          } catch (e) {
            logger(`❌ Error analyzing window ${window.id.substring(0, 8)}: ${e instanceof Error ? e.message : String(e)}`, 'error');
          }
          
          // Small delay to prevent API rate limiting
          await new Promise(resolve => setTimeout(resolve, 300));
        }
        
        // STEP 2: Determine which windows need synthesis  
        logger(`⚙️ Step 2: Checking which windows need synthesis in session ${sessionId.substring(0, 8)}`);
        
        // Get updated windows (now with potentials)
        const { data: updatedWindows, error: fetchError } = await supabase
          .from('chat_windows')
          .select('*')
          .eq('user_id', targetUserId)
          .eq('session_id', sessionId);
        
        if (fetchError) {
          throw new Error(`Failed to fetch updated windows: ${fetchError.message}`);
        }
        
        const windowsNeedingSynthesis = (updatedWindows || []).filter(window => 
          window.synthesized !== true &&
          window.potential_topics && window.potential_topics.length > 0 &&
          window.potential_contexts && window.potential_contexts.length > 0
        );
        
        logger(`⚙️ ${windowsNeedingSynthesis.length} windows need synthesis, ${(updatedWindows || []).length - windowsNeedingSynthesis.length} already synthesized`);
        
        // Update progress for synthesis phase
        setProgressData(prevData => ({
          ...prevData,
          superBatchProgress: {
            ...prevData.superBatchProgress!,
            currentOperation: windowsNeedingSynthesis.length > 0 ? 'synthesizing' : 'completed',
            sessionProgress: {
              analyzing: analyzedCount,
              synthesizing: 0, // Reset synthesis counter
              totalWindows: windowsNeedingSynthesis.length
            }
          }
        }));
        
        // Start synthesis if needed
        if (windowsNeedingSynthesis.length > 0) {
          logger(`⚙️ Beginning synthesis of ${windowsNeedingSynthesis.length} windows...`);
          
          // Debug logging for first few windows
          windowsNeedingSynthesis.slice(0, 5).forEach((window, idx) => {
            logger(`🪟 Window ${idx + 1} to synthesize: ${window.id.substring(0, 8)} (synthesized: ${window.synthesized})`);
          });
          if (windowsNeedingSynthesis.length > 5) {
            logger(`... and ${windowsNeedingSynthesis.length - 5} more windows`);
          }
        }
        
        // Synthesize windows that need it (NO ARBITRARY LIMIT!)
        let synthesizedCount = 0;
        
        for (let i = 0; i < windowsNeedingSynthesis.length; i++) {
          const window = windowsNeedingSynthesis[i];
          
          if (!window) {
            logger(`❌ ERROR: Window ${i + 1} is undefined, breaking loop`, 'error');
            break;
          }
          
          setProgressData(prevData => ({
            ...prevData,
            superBatchProgress: {
              ...prevData.superBatchProgress!,
              sessionProgress: {
                ...prevData.superBatchProgress!.sessionProgress,
                synthesizing: i + 1
              }
            }
          }));
          
          logger(`⚙️ Synthesizing window ${i + 1}/${windowsNeedingSynthesis.length}: ${window.id.substring(0, 8)}`);
          
          try {
            const result = await processWindowForValueGraph(
              window.id,
              targetUserId,
              (message: string, type?: 'info' | 'error' | 'warning') => {
                logger(message, type, `Session ${sessionIndex + 1}/${allSessionIds.length} - Window ${i + 1}/${windowsNeedingSynthesis.length}`);
              }
            );
            
            if (result.success) {
              // Mark as synthesized
              const updateResult = await updateWindowSynthesisStatus(window.id, true);
              if (updateResult.success) {
                synthesizedCount++;
                logger(`✅ Successfully synthesized window ${window.id.substring(0, 8)}`);
              } else {
                logger(`⚠️ Synthesis succeeded but failed to mark as synthesized: ${updateResult.error}`, 'warning');
              }
            } else if (result.error && result.error.includes("No high-confidence reasoning")) {
              // Mark as synthesized even if no reasoning found
              const updateResult = await updateWindowSynthesisStatus(window.id, true);
              if (updateResult.success) {
                synthesizedCount++;
                logger(`✅ Window ${window.id.substring(0, 8)} marked as processed (no high-confidence reasoning)`);
              }
            } else {
              logger(`❌ Failed to synthesize window ${window.id.substring(0, 8)}: ${result.error}`, 'error');
            }
          } catch (e) {
            logger(`❌ Error synthesizing window ${window.id.substring(0, 8)}: ${e instanceof Error ? e.message : String(e)}`, 'error');
          }
          
          // Small delay between windows
          await new Promise(resolve => setTimeout(resolve, 300));
        }
        
        completedSessions.push(sessionId);
        logger(`✅ Completed session ${sessionId.substring(0, 8)}: analyzed ${analyzedCount} windows, synthesized ${synthesizedCount} windows`);
        
        // Update progress to show session completed
        setProgressData(prevData => ({
          ...prevData,
          superBatchProgress: {
            ...prevData.superBatchProgress!,
            currentOperation: 'completed',
            completedSessions: [...completedSessions],
            failedSessions: [...failedSessions]
          }
        }));
        
        // Brief pause to show completion status
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (sessionError) {
        const errorMsg = sessionError instanceof Error ? sessionError.message : String(sessionError);
        logger(`❌ Failed to process session ${sessionId.substring(0, 8)}: ${errorMsg}`, 'error');
        failedSessions.push({ id: sessionId, error: errorMsg });
      }
      
      // Check if there are more sessions to process
      if (sessionIndex + 1 < allSessionIds.length) {
        logger(`🔄 Moving to next session (${sessionIndex + 2}/${allSessionIds.length})...`);
        
        // Update progress to show we're starting the next session
        setProgressData(prevData => ({
          ...prevData,
          superBatchProgress: {
            ...prevData.superBatchProgress!,
            currentOperation: 'starting',
            completedSessions: [...completedSessions],
            failedSessions: [...failedSessions]
          }
        }));
        
        // Small delay between sessions
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    // Update final progress
    setProgressData({
      stage: 'complete',
      superBatchProgress: {
        currentSession: allSessionIds.length,
        totalSessions: allSessionIds.length,
        currentSessionId: '',
        currentOperation: 'completed',
        completedSessions,
        failedSessions,
        sessionProgress: {
          analyzing: 0,
          synthesizing: 0,
          totalWindows: 0
        }
      }
    });
    
    logger(`🎉 SUPER BATCH COMPLETE: ${completedSessions.length} sessions processed successfully, ${failedSessions.length} failed`, 
      failedSessions.length > 0 ? 'warning' : 'info');
    
    setIsSuperBatchProcessing(false);
  };

  if (adminAuthLoading || !adminUser?.isAdmin || !targetUserDetails || isLoadingEntries) { 
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4"/>
        <p className="text-muted-foreground">Loading user synthesis data...</p>
      </div>
    );
  }
  
  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-6 w-6 text-gray-700"/> 
            Topic-Context Graph: {targetUserDetails?.name || targetUserId}
          </CardTitle>
          <CardDescription className="flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between">
            <span>Extract topics from chat history and map them to life contexts (Work, People, Lifestyle, etc.) to build the TCG.</span>
            <Button
              onClick={handleNormalizeTopics}
              disabled={isNormalizingTopics || !targetUserDetails}
              variant="outline"
              size="sm"
              className="flex gap-2 items-center whitespace-nowrap"
            >
              {isNormalizingTopics ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wrench className="h-4 w-4" />
              )}
              Normalize Topics
            </Button>
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Use the extracted SynthesisProgressViewer component */}
      <SynthesisProgressViewer 
        progressData={progressData}
        logs={logs}
        showProgressModal={showProgressModal}
        setShowProgressModal={setShowProgressModal}
        onClearLogs={() => dispatchLog({ type: 'CLEAR_LOGS' })}
      />

      <Card>
        <CardHeader>
            <CardTitle className="flex items-center gap-2"><Layers className="h-5 w-5 text-primary"/>Select Chat Session</CardTitle>
        </CardHeader>
        <CardContent>
            {isLoadingEntries && <p className="text-muted-foreground">Loading sessions...</p>}
            {!isLoadingEntries && uniqueSessionIds.length === 0 && <p className="text-muted-foreground">No chat sessions found for this user.</p>}
            {uniqueSessionIds.length > 0 && (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col md:flex-row items-start gap-4">
                    <select 
                        value={selectedSessionId}
                        onChange={(e) => handleSessionSelect(e.target.value)}
                        className="w-full md:w-[400px] h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <option value="" disabled>-- Select a Session --</option>
                        {uniqueSessionIds.map(sid => {
                            const firstEntryOfSession = allChatlogEntries.find(e => e.session_id === sid);
                            const displayDate = firstEntryOfSession ? formatDate(firstEntryOfSession.timestamp) : 'N/A';
                            const entryCount = allChatlogEntries.filter(e => e.session_id === sid).length;
                            return (
                                <option key={sid} value={sid}>
                                    Session: {sid.substring(0,8)}... ({entryCount} msgs, from {displayDate})
                                </option>
                            );
                        })}
                    </select>
                    
                    <div className="flex gap-2">
                      <Button 
                        onClick={handleCleanupIncorrectWindows} 
                        variant="outline" 
                        size="sm"
                        disabled={isCleaningUp || !selectedSessionId}
                        className="flex gap-2 items-center"
                      >
                        {isCleaningUp ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                        Clean Up & Merge Windows
                      </Button>
                    </div>
                  </div>
                  
                  {/* Super Batch button - for all sessions */}
                  {uniqueSessionIds.length > 0 && (
                    <div className="flex flex-col gap-2 border-t pt-4">
                      <Button
                        onClick={handleSuperBatchAnalyzeAndSynthesize}
                        disabled={isSuperBatchProcessing || isBatchAnalyzing || isBatchSynthesizing}
                        variant="default"
                        className="flex gap-2 items-center bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold"
                      >
                        {isSuperBatchProcessing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Zap className="h-4 w-4" />
                        )}
                        🚀 Batch Analyze & Synthesize ALL Sessions
                      </Button>
                      <p className="text-xs text-muted-foreground text-center">
                        Processes all {uniqueSessionIds.length} sessions automatically, skipping already-processed windows
                      </p>
                    </div>
                  )}
                  
                  {/* Batch operation buttons */}
                  {selectedSessionId && dynamicallyGeneratedWindows.length > 0 && (
                    <div className="flex flex-col sm:flex-row gap-2 border-t pt-4 mt-4">
                      <Button
                        onClick={handleBatchAnalyzeSession}
                        disabled={isBatchAnalyzing || isBatchSynthesizing || isSuperBatchProcessing}
                        variant="secondary"
                        className="flex gap-2 items-center"
                      >
                        {isBatchAnalyzing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                        Batch Analyze Current Session
                      </Button>
                      
                      <Button
                        onClick={handleBatchSynthesizeSession}
                        disabled={isBatchAnalyzing || isBatchSynthesizing || isSuperBatchProcessing || dynamicallyGeneratedWindows.some(w => 
                          !w.potential_topics || w.potential_topics.length === 0 || 
                          !w.potential_contexts || w.potential_contexts.length === 0
                        )}
                        variant="default"
                        className="flex gap-2 items-center bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700"
                      >
                        {isBatchSynthesizing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Zap className="h-4 w-4" />
                        )}
                        Batch Synthesize Current Session
                      </Button>
                    </div>
                  )}
                </div>
            )}
        </CardContent>
      </Card>

      {selectedSessionId && (
        <div className="flex flex-col md:flex-row gap-6">
          <div className="md:w-1/3 lg:w-1/4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                    <MessageCircle className="h-5 w-5 text-primary"/>
                    Windows in Session <span className="font-mono text-sm text-muted-foreground">{selectedSessionId.substring(0,8)}...</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="max-h-[60vh] overflow-y-auto space-y-2 pr-1">
                {dynamicallyGeneratedWindows.length === 0 && <p className="text-muted-foreground p-4 text-center">No windows generated for this session.</p>}
                {dynamicallyGeneratedWindows.map((window, index) => (
                  <Button
                    key={window.clientId || window.id}
                    variant={selectedDynamicWindow?.id === window.id ? 'secondary' : 'ghost'}
                    className="w-full justify-start h-auto py-2 px-3 text-left block"
                    onClick={() => handleWindowSelect(window)}
                  >
                    <span className="font-medium text-sm truncate block">
                      Window {index + 1} ({window.chat_data.length} Q/A pairs)
                      {window.synthesized && (
                        <Badge className="ml-2 bg-green-100 text-green-800 hover:bg-green-200" variant="outline">
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                            <path d="M20 6L9 17l-5-5" />
                          </svg>
                          Synthesized
                        </Badge>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground block truncate">{formatDate(window.start_timestamp)}</span>
                     <div className="text-xs mt-1 flex items-center gap-1 text-muted-foreground flex-wrap">
                        T:{renderBadgeCount(window.potential_topics)} 
                        C:{renderBadgeCount(window.potential_contexts)} 
                        I:{renderBadgeCount(window.potential_items)}
                    </div>
                  </Button>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="md:w-2/3 lg:w-3/4">
            {selectedDynamicWindow ? (
              <Card>
                <CardHeader>
                  <CardTitle>Selected Window Details (Window ID: {selectedDynamicWindow.id.substring(0,8)}...)</CardTitle>
                  <CardDescription>Range: {formatDate(selectedDynamicWindow.start_timestamp)} - {formatDate(selectedDynamicWindow.end_timestamp)}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="max-h-[40vh] overflow-y-auto space-y-3 p-3 border rounded-md bg-muted/30">
                    {selectedDynamicWindow.chat_data.map((chat, idx) => (
                      <div key={idx} className="text-sm">
                        <p><strong className="text-primary">AI:</strong> {chat.llm_message}</p>
                        <p><strong className="text-green-600">Human:</strong> {chat.human_message}</p>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-2 text-xs">
                      <div><h4 className="font-semibold mb-1">Topics:</h4> <div className="flex flex-wrap gap-1">{selectedDynamicWindow.potential_topics?.map(t => <span key={t} className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">{t}</span>) || <span className="text-muted-foreground italic">N/A</span>}</div></div>
                      <div><h4 className="font-semibold mb-1">Contexts:</h4> <div className="flex flex-wrap gap-1">{selectedDynamicWindow.potential_contexts?.map(c => <span key={c} className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">{c}</span>) || <span className="text-muted-foreground italic">N/A</span>}</div></div>
                      <div><h4 className="font-semibold mb-1">Items:</h4> <div className="flex flex-wrap gap-1">{selectedDynamicWindow.potential_items?.map(i => <span key={i} className="bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full">{i}</span>) || <span className="text-muted-foreground italic">N/A</span>}</div></div>
                  </div>
                  <div className="flex gap-2 pt-4 border-t">
                  <Button onClick={handleAnalyzeSelectedWindow} disabled={isProcessing} className="flex-1">
                      {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Settings2 className="mr-2 h-4 w-4"/>} Analyze Content
                  </Button>
                  <Button 
                    onClick={handleSynthesizeSelectedWindow} 
                    disabled={isProcessing || !selectedDynamicWindow.potential_topics?.length}
                    variant="default"
                    className="flex-1 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700"
                  >
                      {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Brain className="mr-2 h-4 w-4"/>} Synthesize Graph
                  </Button>
                  {selectedDynamicWindow.synthesized && (
                    <Button 
                      onClick={handleUnflagSynthesized} 
                      disabled={isProcessing}
                      variant="outline"
                      className="flex-none"
                      title="Mark this window as not synthesized"
                    >
                      {isProcessing ? <Loader2 className="h-4 w-4 animate-spin"/> : <RefreshCw className="h-4 w-4"/>} Unflag
                    </Button>
                  )}
                  </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="flex items-center justify-center h-64">
              <CardContent><p className="text-muted-foreground">Select a session, then a window from the list to view details.</p></CardContent>
            </Card>
          )}
          </div>
        </div>
      )}
      {error && <p className="text-red-500 mt-4 text-center">Error: {error}</p>}
    </div>
  );
};

export default AdminUserSynthesisPage; 