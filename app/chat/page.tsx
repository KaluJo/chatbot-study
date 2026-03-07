'use client';

import ChatInterface from '@/components/chat/ChatInterface';
import DemoChatView from '@/components/chat/DemoChatView';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getLatestUserSessionTimestamp } from '@/app/chat/services/chatlog-service';
import { ClockIcon, MessageCircle, ClipboardList, BarChart3, LogOut } from 'lucide-react';
import { isDemoMode } from '@/lib/demo';

// Check if Supabase is configured
function isSupabaseConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL && 
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

// Calculate the time remaining until the cooldown expires
function formatTimeRemaining(expiresAt: Date): string {
  const now = new Date();
  const diffMs = expiresAt.getTime() - now.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffSecs = Math.floor((diffMs % 60000) / 1000);
  return `${diffMins}:${diffSecs < 10 ? '0' + diffSecs : diffSecs}`;
}

// Custom type for the chat page state that we'll pass to ChatInterface
interface ChatPageState {
  isStrategyLoading: boolean;
  hasUnsavedMessages: boolean;
}

// This page will render the main chat interface component.
export default function ChatPage() {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();
  const [canChat, setCanChat] = useState<boolean>(false);
  const [isCheckingCooldown, setIsCheckingCooldown] = useState<boolean>(true);
  const [cooldownExpiresAt, setCooldownExpiresAt] = useState<Date | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<string>('');

  // Redirect to setup if Supabase isn't configured (skip in demo mode)
  useEffect(() => {
    if (!isDemoMode && !isSupabaseConfigured()) {
      router.push('/setup');
    }
  }, [router]);
  
  // Reference to track loading and message states
  const chatStateRef = useRef<ChatPageState>({
    isStrategyLoading: false,
    hasUnsavedMessages: false
  });

  // Handle beforeunload event to warn when leaving the page
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // If strategy is loading or there are unsaved messages
      if (chatStateRef.current.isStrategyLoading || chatStateRef.current.hasUnsavedMessages) {
        // Standard way to show a confirmation dialog
        const message = chatStateRef.current.isStrategyLoading 
          ? "Day is still loading. Leaving now will interrupt the process."
          : "You have unsaved chat messages. Leaving now will lose your conversation.";
        e.preventDefault();
        e.returnValue = message; // Required for Chrome
        return message; // For older browsers
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Update chat state when child component signals changes
  const updateChatState = (updates: Partial<ChatPageState>) => {
    chatStateRef.current = { ...chatStateRef.current, ...updates };
  };

  // Check if user can chat (not in cooldown period)
  useEffect(() => {
    async function checkCooldown() {
      if (!user) return;
      
      setIsCheckingCooldown(true);
      
      try {
        const result = await getLatestUserSessionTimestamp(user.id);
        
        if (result.success && result.latestTimestamp) {
          const lastSessionTime = new Date(result.latestTimestamp);
          const oneHourLater = new Date(lastSessionTime.getTime() + 60 * 60 * 1000);
          const now = new Date();
          
          if (now < oneHourLater) {
            // User is in cooldown period
            setCanChat(false);
            setCooldownExpiresAt(oneHourLater);
          } else {
            // User can chat (cooldown expired)
            setCanChat(true);
            setCooldownExpiresAt(null);
          }
        } else {
          // No previous sessions or error - allow chat
          setCanChat(true);
        }
      } catch (error) {
        console.error("Error checking cooldown:", error);
        // On error, allow chat to avoid blocking users
        setCanChat(true);
      }
      
      setIsCheckingCooldown(false);
    }
    
    if (user && !isLoading && isSupabaseConfigured()) {
      checkCooldown();
    }
  }, [user, isLoading]);

  // Update the countdown timer every second
  useEffect(() => {
    if (!cooldownExpiresAt) return;
    
    // Initial update
    setTimeRemaining(formatTimeRemaining(cooldownExpiresAt));
    
    // Set up timer
    const timer = setInterval(() => {
      const now = new Date();
      if (now >= cooldownExpiresAt) {
        // Cooldown expired
        setCanChat(true);
        setCooldownExpiresAt(null);
        clearInterval(timer);
      } else {
        setTimeRemaining(formatTimeRemaining(cooldownExpiresAt));
      }
    }, 1000);
    
    return () => clearInterval(timer);
  }, [cooldownExpiresAt]);

  useEffect(() => {
    // If loading is finished and there's no user, redirect to login or home.
    // Or, if the user is an admin, perhaps redirect them to the dashboard.
    if (!isLoading && !user) {
      router.replace('/login'); // Or your preferred redirect path for non-logged-in users
    } else if (!isLoading && user && user.isAdmin) {
      router.replace('/admin/dashboard'); // Corrected admin redirect
    }
  }, [user, isLoading, router]);

  // In demo mode skip all checks and show read-only session immediately once user is set
  if (isDemoMode && user) {
    return <DemoChatView />;
  }

  // Display loading state or a placeholder if user data is still being fetched
  // or if the user is an admin and is being redirected.
  if (isLoading || !user || (user && user.isAdmin)) { // Check user.isAdmin here too for the loading state
    return (
      <div className="fixed inset-0 min-h-full min-w-full flex flex-col items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mb-4"></div>
        <p className="text-muted-foreground">Loading chat...</p>
      </div>
    );
  }
  
  // Show cooldown message if user cannot chat yet
  if (isCheckingCooldown) {
    return (
      <div className="fixed inset-0 min-h-full min-w-full flex flex-col items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mb-4"></div>
        <p className="text-muted-foreground">Checking session availability...</p>
      </div>
    );
  }
  
  if (!canChat && cooldownExpiresAt) {
    return (
      <div className="flex flex-col min-h-screen w-screen bg-background">
        {/* Top Nav Bar for Cooldown Screen - matches NavHeader structure */}
        <header className="bg-white border-b border-gray-200 px-3 sm:px-4 py-2 flex-shrink-0">
          <div className="max-w-7xl mx-auto relative flex items-center justify-between">
            {/* Logo/Brand - always visible */}
            <button 
              onClick={() => router.push('/values')}
              className="text-base sm:text-lg font-semibold text-gray-900 hover:text-gray-700 transition-colors flex-shrink-0"
            >
              Talk to Day
            </button>

            {/* Navigation Links - absolutely centered */}
            <nav className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1">
              <button
                onClick={() => router.push('/chat')}
                className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium bg-gray-900 text-white"
              >
                <MessageCircle size={14} className="sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">Chat</span>
              </button>
              <button
                onClick={() => router.push('/values')}
                className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
              >
                <ClipboardList size={14} className="sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">Survey</span>
              </button>
              <button
                onClick={() => router.push('/agency')}
                className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
              >
                <BarChart3 size={14} className="sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">Analytics</span>
              </button>
            </nav>

            {/* Logout button only */}
            <button
              onClick={() => logout()}
              className="inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-md text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors flex-shrink-0"
              title="Logout"
            >
              <LogOut size={14} />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>

        {/* Main Content */}
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="max-w-md w-full space-y-6">
            {/* Cooldown Timer */}
            <div className="bg-card p-4 sm:p-6 rounded-lg text-center space-y-3 sm:space-y-4">
              <ClockIcon className="h-8 w-8 sm:h-10 sm:w-10 mx-auto text-muted-foreground" />
              <div>
                <p className="text-muted-foreground text-xs sm:text-sm">Next chat available in</p>
                <div className="text-2xl sm:text-3xl font-bold text-primary mt-1">
                  {timeRemaining}
                </div>
              </div>
            </div>

            {/* Suggested Activities */}
            <div className="space-y-3">
              <p className="text-xs sm:text-sm text-muted-foreground text-center">While you wait...</p>
              
              {/* Survey Card */}
              <button
                onClick={() => router.push('/values')}
                className="w-full bg-card hover:bg-accent p-3 sm:p-4 rounded-lg border border-border text-left transition-colors group"
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm sm:text-base font-medium group-hover:text-primary transition-colors">Take the Values Survey</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                      Discover your personal values profile
                    </p>
                  </div>
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>

              {/* Dashboard Card */}
              <button
                onClick={() => router.push('/agency')}
                className="w-full bg-card hover:bg-accent p-3 sm:p-4 rounded-lg border border-border text-left transition-colors group"
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm sm:text-base font-medium group-hover:text-primary transition-colors">View Analytics</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                      Review your chat history and insights
                    </p>
                  </div>
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            </div>

            {/* Home link */}
            <div className="text-center">
              <button 
                onClick={() => router.push('/')} 
                className="text-xs sm:text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Return home
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  // If the user is authenticated, not an admin, and not in cooldown, render the chat interface.
  return <ChatInterface onChatStateChange={updateChatState} />;
}

// It might be better to wrap ChatPage with AuthProvider if it's not already globally provided
// in a way that covers this route. However, if your main layout already has AuthProvider,
// and this chat layout is nested, it might inherit context.
// For a completely separate layout like this, explicitly providing context might be safer.
// Consider this: 
// const ChatPageWithAuth = () => <AuthProvider><ChatPage /></AuthProvider>;
// export default ChatPageWithAuth;
// For now, assuming useAuth() works as expected due to a higher-level provider. 