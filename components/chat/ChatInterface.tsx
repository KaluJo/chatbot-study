'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
// We will use a library for generating UUIDs for session IDs
// Ensure you have 'uuid' installed (npm install uuid @types/uuid)
import { v4 as uuidv4 } from 'uuid';
import { ScrollArea } from '../ui/scroll-area';
import { getClaudeResponse, getClaudeInitialGreeting } from '@/app/chat/services/claude-service'; // Import Claude functions
import { saveChatSession, type ChatlogInsertData, countUserChatSessions, saveFeedback, saveToBackupTable } from '@/app/chat/services/chatlog-service'; // Import the service
import { getOrCreateStrategy, type ConversationStrategy } from '@/app/chat/services/strategy-service'; // Import strategy service
import { useRouter } from 'next/navigation'; // For redirecting after ending chat
import Modal from '@/components/ui/modal'; // Import the Modal component
import FullScreenOverlay from '@/components/ui/full-screen-overlay'; // Import the full screen overlay
import FeedbackModal from './FeedbackModal'; // Import the FeedbackModal component
import { UserCircle, LogOut, Info, Bot, SunMoon, Sun, ClockIcon, ClipboardList, ExternalLink, ScrollText } from 'lucide-react'; // Icons for the modal button and content

// GitHub icon SVG component (lucide-react deprecated Github)
const GithubIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
  </svg>
);
import dynamic from 'next/dynamic';

// Dynamically import Survey and Chatty pages for overlay display
const SurveyPageContent = dynamic(() => import('@/app/values/page'), { 
  loading: () => <div className="fixed inset-0 min-h-full min-w-full flex flex-col items-center justify-center bg-background z-50"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mb-4"></div><p className="text-lg text-muted-foreground">Loading survey...</p></div>,
  ssr: false 
});
const ChattyPageContent = dynamic(() => import('@/app/agency/page'), { 
  loading: () => <div className="fixed inset-0 min-h-full min-w-full flex flex-col items-center justify-center bg-background z-50"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mb-4"></div><p className="text-lg text-muted-foreground">Loading analytics...</p></div>,
  ssr: false 
});
import { createClient } from '@/utils/supabase/client'; // Import createClient

// Define the structure for a chat message in the UI
interface ChatMessageUI {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: string;
}

// Define the structure for messages for the Claude API
interface ClaudeMessageParam {
  role: 'user' | 'assistant';
  content: string;
}

// Interface for chat state change events
interface ChatStateChangeEvent {
  isStrategyLoading?: boolean;
  hasUnsavedMessages?: boolean;
}

// Props for the ChatInterface component
interface ChatInterfaceProps {
  onChatStateChange?: (state: ChatStateChangeEvent) => void;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ onChatStateChange }) => {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessageUI[]>([]);
  const [inputValue, setInputValue] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false); // New state for saving
  const [isUserModalOpen, setIsUserModalOpen] = useState<boolean>(false);
  const [isStrategyModalOpen, setIsStrategyModalOpen] = useState<boolean>(false);
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState<boolean>(false); // State for feedback modal
  const [isAboutModalOpen, setIsAboutModalOpen] = useState<boolean>(false); // State for about/info modal
  const [isEndChatTooltipOpen, setIsEndChatTooltipOpen] = useState<boolean>(false); // State for end chat tooltip
  const [isEndChatConfirmOpen, setIsEndChatConfirmOpen] = useState<boolean>(false); // State for end chat confirmation
  const [completedSessions, setCompletedSessions] = useState<number | null>(null);
  const [sessionCountError, setSessionCountError] = useState<string | null>(null);
  const [conversationStrategy, setConversationStrategy] = useState<ConversationStrategy | null>(null);
  const [isLoadingStrategy, setIsLoadingStrategy] = useState<boolean>(false);
  const [sessionStartTime, setSessionStartTime] = useState<Date | null>(null);
  // Remove remainingSessionTime state - we'll calculate it in real-time
  const [messageCount, setMessageCount] = useState<number>(0);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null); // Ref for auto-focusing input after AI response
  const [timeOfDay, setTimeOfDay] = useState<'morning' | 'afternoon' | 'evening' | 'night'>('morning');
  const [isIconSpinning, setIsIconSpinning] = useState(false);
  const endedSessionIdRef = useRef<string | null>(null); // Ref to hold session ID for feedback
  
  // Overlay states for Survey and Chatty pages
  const [isSurveyOverlayOpen, setIsSurveyOverlayOpen] = useState(false);
  const [isChattyOverlayOpen, setIsChattyOverlayOpen] = useState(false);

  // Reference to track if we've already initiated strategy generation
  const strategyInitiatedRef = useRef(false);
  const [isFirstTimeUser, setIsFirstTimeUser] = useState<boolean | null>(null);
  const [showFirstTimeLoading, setShowFirstTimeLoading] = useState<boolean>(false);

  // Calculate remaining session time in real-time (mobile-safe)
  const getRemainingSessionTime = (): number => {
    if (!sessionStartTime) return 300; // Default 5 minutes if no start time
    const now = new Date().getTime();
    const startTime = sessionStartTime.getTime();
    const elapsedSeconds = Math.floor((now - startTime) / 1000);
    const minSessionLength = 300; // 5 minutes in seconds
    return Math.max(0, minSessionLength - elapsedSeconds);
  };

  // When messages change, notify parent if there are any user messages (which means unsaved data)
  useEffect(() => {
    if (onChatStateChange) {
      const hasUserMessages = messages.some(msg => msg.sender === 'user');
      onChatStateChange({ hasUnsavedMessages: hasUserMessages });
    }
  }, [messages, onChatStateChange]);

  // When strategy loading state changes, notify parent
  useEffect(() => {
    if (onChatStateChange) {
      onChatStateChange({ isStrategyLoading: isLoadingStrategy });
    }
  }, [isLoadingStrategy, onChatStateChange]);

  // 🚨 CRITICAL: Emergency save on page unload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (messages.length > 0 && user) {
        // Create emergency backup data
        const lastUserMsg = messages.filter(m => m.sender === 'user').slice(-1)[0];
        const lastAiMsg = messages.filter(m => m.sender === 'ai').slice(-1)[0];

        if (lastUserMsg && lastAiMsg) {
          // Try navigator.sendBeacon for more reliable emergency save
          if (navigator.sendBeacon) {
            try {
              const emergencyData = {
                session_id: sessionId,
                user_id: user.id,
                human_message: lastUserMsg.text,
                llm_message: lastAiMsg.text,
                original_timestamp: lastUserMsg.timestamp,
                emergency_save: true
              };

              // This has a better chance of completing before page unload
              const blob = new Blob([JSON.stringify(emergencyData)], { type: 'application/json' });
              const beaconSent = navigator.sendBeacon('/api/emergency-backup', blob);
            } catch (beaconError) {
            }
          }

        }

        // Show warning to user
        const message = "You have unsaved chat messages. Are you sure you want to leave?";
        e.preventDefault();
        e.returnValue = message;
        return message;
      }
    };

    // Also add pagehide event for mobile Safari
    const handlePageHide = (e: PageTransitionEvent) => {
      if (messages.length > 0 && user) {
        // Messages are saved to backup table only - final save happens on End Session
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [messages, user, sessionId]);

  // Generate a new session ID only on initial mount
  useEffect(() => {
    const newSessionId = uuidv4();
    setSessionId(newSessionId);

    // If user is logged in and we haven't initiated strategy generation yet
    if (user && !strategyInitiatedRef.current) {
      strategyInitiatedRef.current = true;
      checkIfFirstTimeUser(user.id, newSessionId);
    }
  }, []);  // Empty dependency array means this only runs once on mount

    // No timer useEffect needed - we calculate in real-time now

  // Format remaining time as MM:SS
  const formatRemainingTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Function to check if this is a first-time user and handle loading accordingly
  const checkIfFirstTimeUser = async (userId: string, sessId: string) => {
    try {
      // Check if user has any completed chat sessions
      const { count } = await countUserChatSessions(userId);
      const isFirstTime = count === 0;

      setIsFirstTimeUser(isFirstTime);

      if (isFirstTime) {
        // Show 8-second loading for first-time users
        setShowFirstTimeLoading(true);
        setTimeout(() => {
          setShowFirstTimeLoading(false);
          fetchConversationStrategy(userId, sessId);
        }, 8000);
      } else {
        // Regular flow for returning users
        fetchConversationStrategy(userId, sessId);
      }
    } catch (error) {
      console.error('Error checking if first-time user:', error);
      // Fallback to regular flow
      setIsFirstTimeUser(false);
      setShowFirstTimeLoading(false);
      fetchConversationStrategy(userId, sessId);
    }
  };



  // Function to fetch conversation strategy
  const fetchConversationStrategy = async (userId: string, sessId: string) => {
    if (!userId || !sessId) return;

    setIsLoadingStrategy(true);

    try {
      // Use the new function that handles the check and generation in one call
      const result = await getOrCreateStrategy(userId, sessId, timeOfDay);

      if (result.success && result.data) {
        setConversationStrategy(result.data);
      } else {
        console.error('Failed to get or create strategy:', result.error);
        // If strategy is deprecated or failed, continue without strategy
        // Day will still work in basic conversation mode
        if (result.error?.includes('deprecated')) {
        }
        setConversationStrategy(null);
      }
    } catch (err) {
      console.error('Error in fetchConversationStrategy:', err);
    } finally {
      setIsLoadingStrategy(false);
    }
  };

  // Function to process AI response text and remove em dashes
  const processAiResponseText = (text: string): string => {
    if (!text) return text;
    
    // Replace em dashes (—, –, and spaced hyphens " - ") with periods or ellipses
    // Capture the following character to handle capitalization
    return text.replace(/(\s*[—–]\s*|\s+-\s+)(\w?)/g, (match, dash, nextChar) => {
      const usePeriod = Math.random() < 0.7;
      
      if (usePeriod) {
        // Use period and capitalize the next character
        return nextChar ? '. ' + nextChar.toUpperCase() : '. ';
      } else {
        // Use ellipses and keep original case
        return nextChar ? '... ' + nextChar : '... ';
      }
    });
  };

  // Function to scroll to the bottom of the chat
  const scrollToBottom = () => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTo({ top: scrollAreaRef.current.scrollHeight, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Function to fetch initial greeting (can be called again after ending a session)
  const fetchAndSetInitialGreeting = async () => {
    if (user && sessionId && conversationStrategy) { // Check user, sessionId and strategy are present
      setIsLoading(true);
      const greetingText = await getClaudeInitialGreeting(timeOfDay, conversationStrategy);
      if (greetingText) {
        const processedGreeting = processAiResponseText(greetingText);
        setMessages([{
          id: uuidv4(),
          text: processedGreeting,
          sender: 'ai',
          timestamp: new Date().toISOString(),
        }]);
      } else {
        // Fallback greetings based on time of day
        let fallbackGreeting = "";

        switch (timeOfDay) {
          case 'morning':
            fallbackGreeting = "Good morning! Hope you slept well. Any plans for today?";
            break;
          case 'afternoon':
            fallbackGreeting = "Good afternoon! How's your day going so far?";
            break;
          case 'evening':
            fallbackGreeting = "Good evening! How was your day today?";
            break;
          case 'night':
            fallbackGreeting = "Hi there! Winding down for the night or just getting started?";
            break;
          default:
            fallbackGreeting = "Hello! I'm ready to chat.";
        }

        const processedFallbackGreeting = processAiResponseText(fallbackGreeting);
        setMessages([{
          id: uuidv4(),
          text: processedFallbackGreeting,
          sender: 'ai',
          timestamp: new Date().toISOString(),
        }]);
      }
      setIsLoading(false);

      // 🎯 UX: Auto-focus input after initial greeting for better user experience
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 100); // Small delay to ensure message is rendered first
    }
  };

  useEffect(() => {
    if (messages.length === 0 && user && sessionId && !isLoading && !isSaving && conversationStrategy) {
      fetchAndSetInitialGreeting();
    }
  }, [user, sessionId, messages.length, isLoading, isSaving, conversationStrategy]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !user || isLoading || isSaving) return;

    const userMessage: ChatMessageUI = {
      id: uuidv4(),
      text: inputValue,
      sender: 'user',
      timestamp: new Date().toISOString(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInputValue('');
    setIsLoading(true);

    // 🚨 CRITICAL: Start session timer on FIRST message, not strategy loading
    if (!sessionStartTime) {
      const startTime = new Date();
      setSessionStartTime(startTime);
    }

    // Track message count for periodic saves
    const newMessageCount = messageCount + 1;
    setMessageCount(newMessageCount);

    // Prepare messages for Claude API
    const claudeMessages: ClaudeMessageParam[] = newMessages.map(msg => ({
      role: msg.sender === 'user' ? 'user' : 'assistant',
      content: msg.text,
    }));

    // Check if this is the first message from the user
    const isFirstUserMessage = newMessages.filter(msg => msg.sender === 'user').length === 1;

    // Get Claude's response with the conversation strategy
    // Pass userId to enable strategy-specific behavioral rules (vertical vs horizontal)
    const aiText = await getClaudeResponse(
      claudeMessages,
      conversationStrategy || undefined,
      isFirstUserMessage,
      timeOfDay,
      user?.id
    );

    // Process the AI response to remove em dashes
    const processedAiText = aiText ? processAiResponseText(aiText) : "Sorry, I couldn't get a response.";

    const aiMessage: ChatMessageUI = {
      id: uuidv4(),
      text: processedAiText,
      sender: 'ai',
      timestamp: new Date().toISOString(),
    };
    setMessages(prevMessages => [...prevMessages, aiMessage]);
    setIsLoading(false);

    // 🎯 UX: Auto-focus input after AI response for better user experience
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }, 100); // Small delay to ensure message is rendered first

    // Save to backup log (ultimate failsafe)
    await saveToBackupTable(
      aiMessage.text,
      userMessage.text,
      user.id,
      sessionId,
      userMessage.timestamp
    );

    // Messages will be saved to chatlog only when user clicks "End Session"
  };

  const handleEndChatClick = () => {
    // Get remaining time using real-time calculation
    const remaining = getRemainingSessionTime();

    console.log('🚨 End Chat clicked:', {
      sessionStartTime: sessionStartTime?.toISOString(),
      remaining,
      hasStartTime: !!sessionStartTime
    });

    if (remaining > 0) {
      setIsEndChatTooltipOpen(true);
    } else {
      setIsEndChatConfirmOpen(true);
    }
  };

  const handleEndSession = async () => {
    if (!user || messages.length < 2) {
      alert("Not enough conversation to save (minimum 2 messages for a pair)!");
      setMessages([]); // Still reset UI
      setSessionId(uuidv4());
      // Notify parent that there are no unsaved messages anymore
      if (onChatStateChange) {
        onChatStateChange({ hasUnsavedMessages: false });
      }
      return;
    }

    setIsSaving(true);
    const chatEntriesToSave: ChatlogInsertData[] = [];

    for (let i = 0; i < messages.length - 1; i++) {
      const msg1 = messages[i];
      const msg2 = messages[i + 1];

      let llm_message = '';
      let human_message = '';
      let timestamp = '';

      // Pair: AI (llm_message) -> User (human_message)
      if (msg1.sender === 'ai' && msg2.sender === 'user') {
        llm_message = msg1.text;
        human_message = msg2.text;
        timestamp = msg1.timestamp; // Timestamp of AI's message
      }
      // Pair: User (human_message) -> AI (llm_message)
      else if (msg1.sender === 'user' && msg2.sender === 'ai') {
        human_message = msg1.text;
        llm_message = msg2.text;
        timestamp = msg1.timestamp; // Timestamp of User's message
      }

      // If a valid pair was formed, add it
      if (llm_message && human_message) {
        chatEntriesToSave.push({
          llm_message,
          human_message,
          timestamp,
          user_id: user.id,
          session_id: sessionId,
        });
        // Crucially, advance i because we've processed msg2 (messages[i+1]) as part of this pair.
        // The loop's own increment will then correctly move to the message after msg2.
        i++;
      }
      // If no pair was formed starting with msg1, the loop continues, and msg1 is effectively orphaned for pairing.
      // msg2 (messages[i+1]) will become msg1 in the next iteration.
    }

    if (chatEntriesToSave.length > 0) {
      const result = await saveChatSession(chatEntriesToSave);
      if (result.success) {
        // Notify parent that there are no unsaved messages anymore
        if (onChatStateChange) {
          onChatStateChange({ hasUnsavedMessages: false });
        }
        // Instead of alerting and redirecting, open the feedback modal
        setIsFeedbackModalOpen(true);
        endedSessionIdRef.current = sessionId; // Store session ID for feedback
      } else {
        alert(`Failed to save chat session: ${result.error?.message || 'Unknown error'}`);
        setIsSaving(false); // Stop saving indicator on failure
      }
    } else {
      alert("No complete question/answer pairs were found to save.");
      setIsSaving(false); // Stop saving indicator if nothing to save
    }
  };

  const handleFeedbackSubmit = async (rating: number | null, feedback: string) => {
    if (!user || !endedSessionIdRef.current) return;

    await saveFeedback({
      user_id: user.id,
      session_id: endedSessionIdRef.current,
      rating,
      feedback_text: feedback,
    });

    // Now close modal and redirect
    setIsFeedbackModalOpen(false);
    setIsSaving(false);
    router.push('/?fromChat=true');
  };

  const handleFeedbackSkip = () => {
    setIsFeedbackModalOpen(false);
    setIsSaving(false);
    router.push('/?fromChat=true');
  };

  const openUserModal = async () => {
    if (!user) return;
    setSessionCountError(null);
    setCompletedSessions(null); // Reset while fetching
    setIsUserModalOpen(true);
    const { success, count, error } = await countUserChatSessions(user.id);
    if (success) {
      setCompletedSessions(count);
    } else {
      setCompletedSessions(0); // Or handle error display more explicitly
      setSessionCountError(error?.message || 'Could not load session count.');
      console.error("Error fetching session count:", error);
    }
  };

  const openStrategyModal = () => {
    setIsStrategyModalOpen(true);
  };

  const handleLogout = () => {
    logout();
    router.push('/login'); // Redirect to login after logout
    setIsUserModalOpen(false); // Close modal on logout
  };

  // Add effect to determine time of day
  useEffect(() => {
    const updateTimeOfDay = () => {
      const hour = new Date().getHours();
      if (hour >= 5 && hour < 12) {
        setTimeOfDay('morning');
      } else if (hour >= 12 && hour < 17) {
        setTimeOfDay('afternoon');
      } else if (hour >= 17 && hour < 22) {
        setTimeOfDay('evening');
      } else {
        setTimeOfDay('night');
      }
    };

    updateTimeOfDay();

    // Update every hour
    const interval = setInterval(updateTimeOfDay, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (!user) {
    return <p className="p-4">Please log in to use the chat.</p>;
  }

  // Define heights for header and footer to calculate ScrollArea padding
  const headerHeight = 'h-16'; // Example: 4rem or 64px. Adjust as needed based on actual header content.
  const footerHeight = 'h-24'; // Increased from h-20 to h-24 (6rem instead of 5rem)

  return (
    <>
      <div className="relative flex flex-col h-screen bg-background overflow-hidden">
        <header className={`px-4 sm:px-6 border-b bg-background z-10 ${headerHeight} flex-shrink-0 flex items-center justify-between`}>
          <h2 className="text-xl font-medium flex items-center gap-2">
            <button
              onClick={() => {
                if (!isIconSpinning) {
                  setIsIconSpinning(true);
                  setTimeout(() => setIsIconSpinning(false), 600);
                }
              }}
              className="focus:outline-none hover:scale-110 transition-transform"
              aria-label="Spin icon"
            >
              {(timeOfDay === 'morning' || timeOfDay === 'afternoon') ?
                <Sun className={`h-7 w-7 sm:h-8 sm:w-8 ${isIconSpinning ? 'animate-spin-once' : ''}`} /> :
                <SunMoon className={`h-7 w-7 sm:h-8 sm:w-8 ${isIconSpinning ? 'animate-spin-once' : ''}`} />
              }
            </button>
          </h2>
          <div className="flex items-center gap-0.5 sm:gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 sm:h-11 sm:w-11"
              onClick={() => setIsAboutModalOpen(true)}
              disabled={isLoading || isSaving}
              title="About Day"
            >
              <Info className="h-6 w-6" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 sm:h-11 sm:w-11"
              onClick={() => setIsSurveyOverlayOpen(true)}
              disabled={isLoading || isSaving}
              title="Take Values Survey"
            >
              <ClipboardList className="h-6 w-6" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 sm:h-11 sm:w-11"
              onClick={() => setIsChattyOverlayOpen(true)}
              disabled={isLoading || isSaving}
              title="Chat Analytics"
            >
              <ScrollText className="h-6 w-6" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 sm:h-11 sm:w-11"
              onClick={openUserModal}
              disabled={isLoading || isSaving}
              title="User Information"
            >
              <UserCircle className="h-6 w-6" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={openStrategyModal} 
              disabled={isLoading || isSaving || !conversationStrategy}
              title="View Conversation Strategy"
            >
              <Bot className="h-6 w-6" />
            </Button>
            <Button
              variant="ghost"
              className={`text-lg font-medium flex items-center gap-1 sm:gap-2 px-2 py-1.5 sm:p-4 h-8 sm:h-auto ${getRemainingSessionTime() > 0 ? 'opacity-60 cursor-help' : ''
                }`}
              onClick={handleEndChatClick}
              disabled={isLoading || isSaving}
              title={getRemainingSessionTime() > 0 ?
                `Minimum session time: ${formatRemainingTime(getRemainingSessionTime())} remaining` :
                'End your chat session'
              }
            >
              {isSaving ? '...' : <span className="hidden sm:inline">End & Save Chat</span>}
              {!isSaving && <span className="sm:hidden">End & Save</span>}
            </Button>
          </div>
        </header>

        {/* Strategy loading indicator */}
        {(showFirstTimeLoading || (isLoadingStrategy && messages.length === 0)) && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-50">
            <div className="text-center space-y-4 max-w-sm mx-auto bg-card p-8 rounded-lg border">
              <div className="animate-spin h-10 w-10 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
              <p className="animate-pulse text-xl font-semibold text-foreground">Bringing Day to life...</p>
              <p className="text-base text-muted-foreground">This may take up to 2 minutes. Please don't close your browser or navigate away.</p>

              <div className="text-left pt-4 mt-4 border-t border-border">
                <h3 className="font-semibold text-lg mb-3 text-foreground flex items-center">
                  <Info className="h-5 w-5 mr-2" />
                  Quick Tips
                </h3>
                <ul className="space-y-3 text-sm text-muted-foreground">
                  <li className="flex items-start mt-4">
                    <span className="text-destructive mr-2 mt-1">❗</span>
                    <div className="font-semibold text-destructive">
                      DO NOT FORGET TO PRESS "END CHAT" TO SAVE THE CHAT WHEN DONE.
                    </div>
                  </li>
                  <li className="flex items-start">
                    <span className="text-primary mr-2 mt-1">✓</span>
                    <div>
                      <span className="font-semibold text-foreground">Day is multilingual.</span> Feel free to switch languages anytime by just starting to type in another language.
                    </div>
                  </li>
                  <li className="flex items-start">
                    <span className="text-primary mr-2 mt-1">✓</span>
                    <div>
                      <span className="font-semibold text-foreground">Day's memory isn't perfect.</span> It might not remember all the details from previous chats.
                    </div>
                  </li>
                  <li className="flex items-start">
                    <span className="text-primary mr-2 mt-1">✓</span>
                    <div>
                      <span className="font-semibold text-foreground">Remember not to share any sensitive information.</span> Treat the conversation as if you are talking to a friend at a coffee shop where someone else could overhear.
                    </div>
                  </li>
                  <li className="flex items-start">
                    <span className="text-primary mr-2 mt-1">✓</span>
                    <div>
                      <span className="font-semibold text-foreground">Something strange?</span> If the conversation feels odd or you encounter issues, please contact the researcher.
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Scrollable Message Area: Takes up remaining space */}
        {/* Apply padding to top and bottom to account for fixed header and footer */}
        <ScrollArea
          className="flex-grow"
          style={{ paddingTop: '1rem', paddingBottom: 'calc(1rem + 96px)' }} // Updated for h-24 (6rem/96px)
          ref={scrollAreaRef}
        >
          {/* Inner container for messages to have their own padding if needed */}
          <div className="p-4 space-y-6">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex mb-4 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[75%] py-2 px-4 rounded-xl ${msg.sender === 'user'
                    ? 'bg-primary text-primary-foreground ml-auto'
                    : 'bg-muted text-muted-foreground mr-auto'
                    }`}>
                  <p className="text-base whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                  <p className="text-xs text-right opacity-60 mt-2">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start mb-4">
                <div className="max-w-[75%] p-4 rounded-xl bg-muted text-muted-foreground mr-auto">
                  <p className="text-base italic">I'm thinking...</p>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Footer: Absolutely positioned to the bottom */}
        <footer className={`p-5 border-t bg-background z-10 ${footerHeight} flex-shrink-0`}>
          <div className="flex gap-3">
            <Input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && !isLoading && !isSaving && !isLoadingStrategy && !showFirstTimeLoading && handleSendMessage()}
              placeholder="Type a message..."
              disabled={isLoading || isSaving || isLoadingStrategy || showFirstTimeLoading}
              className="flex-grow text-base py-6 px-4 h-14"
            />
            <Button
              onClick={handleSendMessage}
              disabled={isLoading || isSaving || !inputValue.trim() || isLoadingStrategy || showFirstTimeLoading}
              className="h-14 px-6 text-base"
            >
              {isLoading || isSaving ? '...' : 'Send'}
            </Button>
          </div>
        </footer>
      </div>

      {/* User Info Modal */}
      <Modal
        isOpen={isUserModalOpen}
        onClose={() => setIsUserModalOpen(false)}
        title="User Information"
      >
        {user && (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">User ID</p>
              <p className="text-sm text-foreground break-all">{user.id}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Current Session ID</p>
              <p className="text-sm text-foreground break-all">{sessionId}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Completed Sessions</p>
              {completedSessions === null && !sessionCountError && <p className="text-sm text-foreground italic">Loading sessions...</p>}
              {sessionCountError && <p className="text-sm text-destructive">{sessionCountError}</p>}
              {completedSessions !== null && <p className="text-sm text-foreground">{completedSessions}</p>}
            </div>
            <Button
              variant="destructive"
              className="w-full mt-2"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4 mr-2" /> Log Out
            </Button>
          </div>
        )}
      </Modal>

      {/* Feedback Modal */}
      <FeedbackModal
        isOpen={isFeedbackModalOpen}
        onClose={handleFeedbackSkip}
        onSubmit={handleFeedbackSubmit}
      />

      {/* End Chat Tooltip Modal */}
      <Modal
        isOpen={isEndChatTooltipOpen}
        onClose={() => setIsEndChatTooltipOpen(false)}
        title="Minimum Session Time"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-center">
            <div className="bg-primary/10 p-0 rounded-full">
              <ClockIcon className="h-8 w-8 text-primary" />
            </div>
          </div>
          <div className="text-center space-y-3">
            <p className="text-lg font-medium">
              Just {formatRemainingTime(getRemainingSessionTime())} more to go!
            </p>
            <p className="text-muted-foreground">
              We have a 5-minute minimum to ensure meaningful conversations.
              Don't worry, you can chat as long as you'd like after that!
            </p>
            <p className="text-sm text-muted-foreground">
              Take your time and enjoy the conversation with Day.
            </p>
          </div>
          <div className="space-y-2">
            <Button
              onClick={() => setIsEndChatTooltipOpen(false)}
              className="w-full"
            >
              Continue Chatting
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setIsEndChatTooltipOpen(false);
                setIsEndChatConfirmOpen(true);
              }}
              className="w-full text-sm"
            >
              End Chat Anyway (Bypass Timer)
            </Button>
          </div>
        </div>
      </Modal>

      {/* End Chat Confirmation Modal */}
      <Modal
        isOpen={isEndChatConfirmOpen}
        onClose={() => setIsEndChatConfirmOpen(false)}
        title="End Your Chat?"
      >
        <div className="space-y-4">
          <div className="text-center space-y-3">
            <p className="text-lg font-medium">
              Ready to wrap up your conversation with Day?
            </p>
            <p className="text-muted-foreground">
              You've reached the 5-minute minimum, but feel free to continue chatting for as long as you'd like!
              There's no time limit - Day enjoys longer conversations too.
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setIsEndChatConfirmOpen(false)}
              className="flex-1"
            >
              Keep Chatting
            </Button>
            <Button
              onClick={() => {
                setIsEndChatConfirmOpen(false);
                handleEndSession();
              }}
              className="flex-1"
            >
              End & Save Chat
            </Button>
          </div>
        </div>
      </Modal>

      {/* Strategy Info Modal */}
      <Modal
        isOpen={isStrategyModalOpen}
        onClose={() => setIsStrategyModalOpen(false)}
        title="Day's Strategy"
      >
        {conversationStrategy ? (
          <div className="space-y-6 max-h-[70vh] overflow-y-auto text-sm">
            <div className="p-3 bg-primary/5 rounded-lg">
              <h3 className="font-semibold text-base mb-2 flex items-center">
                <SunMoon className="h-4 w-4 mr-2" />
                Time Context
              </h3>
              <p>Current time period: <span className="font-medium">{timeOfDay}</span></p>
            </div>

            <div>
              <h3 className="font-semibold text-base mb-2">User Profile</h3>
              <p className="text-sm">{conversationStrategy.user_profile}</p>
            </div>

            {conversationStrategy.conversation_goals?.length > 0 && (
              <div>
                <h3 className="font-semibold text-base mb-2">Conversation Goals</h3>
                <ul className="list-disc pl-5 space-y-1">
                  {conversationStrategy.conversation_goals.map((goal, i) => (
                    <li key={i}>{goal}</li>
                  ))}
                </ul>
              </div>
            )}

            {conversationStrategy.insights?.length > 0 && (
              <div>
                <h3 className="font-semibold text-base mb-2">Key Insights</h3>
                <div className="space-y-3">
                  {conversationStrategy.insights.map((insight, i) => (
                    <div key={i} className="border rounded p-2">
                      <p className="font-medium">{insight.pattern}</p>
                      <p className="text-sm text-muted-foreground mt-1">Approach: {insight.approach}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {conversationStrategy.shared_memories?.length > 0 && (
              <div>
                <h3 className="font-semibold text-base mb-2">Shared Memories</h3>
                <div className="space-y-3">
                  {conversationStrategy.shared_memories.map((memory, i) => (
                    <div key={i} className="border rounded p-2">
                      <p className="font-medium">{memory.memory_type} ({memory.when_it_happened})</p>
                      <p className="text-sm">{memory.what_happened}</p>
                      <p className="text-sm text-muted-foreground mt-1">Reference: "{memory.how_to_reference}"</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center space-y-3">
            <p className="text-muted-foreground">No conversation strategy available.</p>
            <p className="text-sm text-muted-foreground">
              Day is using basic conversation mode. This might happen if your previous strategy uses an older format.
            </p>
          </div>
        )}
      </Modal>

      {/* About Day Modal */}
      <Modal
        isOpen={isAboutModalOpen}
        onClose={() => setIsAboutModalOpen(false)}
        title="About Day"
      >
        <div className="space-y-6 max-h-[70vh] overflow-y-auto text-sm [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {/* GitHub Link */}
          <div className="flex justify-center">
            <a
              href="https://github.com/KaluJo/chatbot-study"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-lg hover:opacity-90 transition-opacity"
            >
              <GithubIcon className="h-5 w-5" />
              <span className="font-medium">View on GitHub</span>
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>

          {/* What is Day */}
          <div className="p-4 bg-primary/5 rounded-lg">
            <h3 className="font-semibold text-base mb-2">What is Day?</h3>
            <p className="text-muted-foreground leading-relaxed">
              Day is an AI companion chatbot designed for research on human-AI interaction. 
              It engages users in daily conversations to understand how people perceive AI's ability 
              to extract, embody, and explain human values through casual dialogue.
            </p>
          </div>

          {/* Research */}
          <div>
            <h3 className="font-semibold text-base mb-3">Research</h3>
            <div className="space-y-4">
              <a
                href="https://arxiv.org/abs/2601.22440"
                target="_blank"
                rel="noopener noreferrer"
                className="block border rounded-lg p-3 hover:bg-muted/50 transition-colors cursor-pointer"
              >
                <p className="font-medium text-sm flex items-center gap-1">
                  AI and My Values: User Perceptions of LLMs' Ability to Extract, Embody, and Explain Human Values from Casual Conversations
                  <ExternalLink className="h-3 w-3 flex-shrink-0" />
                </p>
                <p className="text-xs text-muted-foreground mt-1">Published in CHI '26 · Bhada Yun, Renn Su, April Yi Wang</p>
                <p className="text-sm text-muted-foreground mt-2">
                  20 people texted a chatbot for a month about their daily lives. The AI built profiles of their values, 
                  then explained its reasoning in a 2-hour interview. 13 participants left convinced the AI truly understood them.
                </p>
              </a>
              <a
                href="https://arxiv.org/abs/2601.22452"
                target="_blank"
                rel="noopener noreferrer"
                className="block border rounded-lg p-3 hover:bg-muted/50 transition-colors cursor-pointer"
              >
                <p className="font-medium text-sm flex items-center gap-1">
                  Does My Chatbot Have an Agenda? Understanding Human and AI Agency in Human-Human-like Chatbot Interaction
                  <ExternalLink className="h-3 w-3 flex-shrink-0" />
                </p>
                <p className="text-xs text-muted-foreground mt-1">Published in CHI '26 · Bhada Yun, Evgenia Taranova, April Yi Wang</p>
                <p className="text-sm text-muted-foreground mt-2">
                  22 adults chatted with Day, our AI companion, for a month. Who decided when to greet, change topics, or say goodbye? 
                  Participants thought they were in control, but the AI was quietly steering depth and breadth.
                </p>
              </a>
            </div>
          </div>

          {/* About the Creator */}
          <div className="border-t pt-4">
            <h3 className="font-semibold text-base mb-3">About the Creator</h3>
            <div className="space-y-3">
              <div>
                <p className="font-medium">Bhada Yun</p>
                <p className="text-xs text-muted-foreground">Lead Researcher and Developer</p>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Studying Machine Intelligence and Visual and Interactive Computing at ETH Zürich, currently working with Prof. Dr. Mennatallah El-Assady 
                and Prof. Dr. April Yi Wang. Previously completed Bachelor's degree in Computer Science at UC Berkeley.
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Research focuses on human-AI interaction, developing systems and empirically evaluating how AI integration 
                affects stakeholders across various domains. Particularly interested in the phenomenology of AI, such as how 
                people perceive and co-construct agency when interacting with humanlike chatbots, and how they assess an AI's 
                attempt to construct a representation of their personal human values.
              </p>
              <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2">
                <span className="font-medium">硏 연 /jʌn/ — to polish, stone grinded till even</span>
                <span className="font-medium">究 구 /ku/ — to research, a group (of 9 people) investigating a cave</span>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* Survey Overlay */}
      <FullScreenOverlay
        isOpen={isSurveyOverlayOpen}
        onClose={() => setIsSurveyOverlayOpen(false)}
      >
        <SurveyPageContent />
      </FullScreenOverlay>

      {/* Chatty/Analytics Overlay */}
      <FullScreenOverlay
        isOpen={isChattyOverlayOpen}
        onClose={() => setIsChattyOverlayOpen(false)}
      >
        <ChattyPageContent />
      </FullScreenOverlay>
    </>
  );
};

export default ChatInterface; 