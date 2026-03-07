'use client';

import { useEffect, useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { getChatlogEntriesForUser, ChatlogEntry } from '@/app/chat/services/chatlog-service';
import { getUserStrategies, ConversationStrategy } from '@/app/chat/services/strategy-service';
import { getUserChatFeedback, ChatFeedback } from '@/app/chat/services/feedback-service';
import { getSpeechPatternSamples, SpeechPatternSample } from './services/speech-pattern-service';
import { useAuth } from '@/contexts/AuthContext';
import { isDemoMode } from '@/lib/demo';
import { useDemoData } from '@/contexts/DemoDataContext';
import { useScrollDirection } from '@/hooks/useScrollDirection';
import { Lock, MessageSquare, Clock, Star, TrendingUp, ChevronDown, ChevronUp, BarChart2, AudioWaveform, Crosshair, ScrollText, Copy, Check } from 'lucide-react';
import Modal from '@/components/ui/modal';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Label
} from 'recharts';
import { format, parseISO, differenceInMinutes, differenceInDays } from 'date-fns';

// Vertical = before Jul 22 OR after Aug 22; Horizontal = Jul 22 – Aug 22 (study dates from paper)
function getStrategyMode(date: Date | string): 'vertical' | 'horizontal' {
  const d = typeof date === 'string' ? new Date(date) : date;
  const jul22 = new Date('2025-07-22T00:00:00');
  const aug22 = new Date('2025-08-22T23:59:59');
  return d >= jul22 && d <= aug22 ? 'horizontal' : 'vertical';
}

const MODE_STYLES = {
  vertical: {
    border: 'border-indigo-200',
    cardBg: 'bg-indigo-50/40',
    bg: 'bg-indigo-50',
    badge: 'bg-indigo-100 text-indigo-700',
    dot: 'bg-indigo-500',
    label: 'Vertical',
    insightBorder: 'border-indigo-400',
    insightBg: 'bg-indigo-50',
  },
  horizontal: {
    border: 'border-amber-200',
    cardBg: 'bg-amber-50/40',
    bg: 'bg-amber-50',
    badge: 'bg-amber-100 text-amber-700',
    dot: 'bg-amber-500',
    label: 'Horizontal',
    insightBorder: 'border-amber-400',
    insightBg: 'bg-amber-50',
  },
};

// Custom tick component for two-line date labels
const CustomDateTick = (props: any) => {
  const { x, y, payload } = props;
  const date = parseISO(payload.value);

  return (
    <g transform={`translate(${x},${y + 16})`}>
      <text x={0} y={0} dy={-5} textAnchor="middle" fill="#666" fontSize="11">
        {format(date, 'EEE')}
      </text>
      <text x={0} y={0} dy={10} textAnchor="middle" fill="#666" fontSize="10">
        {format(date, 'M/d')}
      </text>
    </g>
  );
};

interface StrategyEntry {
  sessionId: string;
  strategy: ConversationStrategy;
  createdAt: string;
  timeOfDay?: string;
}

interface SessionAnalytics {
  sessionId: string;
  duration: number;
  messageCount: number;
  startTime: Date;
  endTime: Date;
  avgMessageLength: number;
  userWords: number;
  aiWords: number;
  date: string;
  dayOfWeek: string;
  daysSincePrevious: number;
  sessionNumber: number;
  feedback?: ChatFeedback | null;
}

interface DailyStats {
  date: string;
  messageCount: number;
  sessionCount: number;
  totalDuration: number;
  avgSessionDuration: number;
}

export default function ChattyPage() {
  const { user, isLoading: authLoading } = useAuth();
  const demoData = useDemoData();
  const [agencyBibtexCopied, setAgencyBibtexCopied] = useState(false);
  const pillVisible = useScrollDirection();
  const [chatLogs, setChatLogs] = useState<ChatlogEntry[]>([]);
  const [strategies, setStrategies] = useState<StrategyEntry[]>([]);
  const [feedback, setFeedback] = useState<ChatFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Tab navigation — initialised from ?tab= query param if present
  const [activeTab, setActiveTab] = useState<'analytics' | 'messages' | 'patterns' | 'strategies'>('analytics');
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    const valid = ['analytics', 'messages', 'patterns', 'strategies'] as const;
    if (valid.includes(t as (typeof valid)[number])) {
      setActiveTab(t as (typeof valid)[number]);
    }
  }, []);
  const [highlightedMessages, setHighlightedMessages] = useState<Set<string>>(new Set());
  const [speechPatternData, setSpeechPatternData] = useState<SpeechPatternSample | null>(null);
  const [speechPatternLoading, setSpeechPatternLoading] = useState(false);
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());
  const [isPromptsOpen, setIsPromptsOpen] = useState(false);

  // Sessions where the human sent the first message (Human→LLM order per row)
  const HUMAN_FIRST_SESSIONS = new Set([
    'a0857b0f-d375-4785-8410-f0441289a47d', // Session 6 (Aug 17 Chat 3)
  ]);

  // Shared legend card shown at the top of both the Chats and Strategy tabs
  const StrategyLegend = isDemoMode ? (
    <div className="bg-white border border-gray-200 rounded-lg p-4 pb-2 text-center">
      <p className="text-xs font-semibold text-gray-700 mb-2">Day&apos;s Conversational Strategy</p>
      <div className="flex flex-wrap justify-center gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 flex-shrink-0" />
          <span className="text-xs font-medium text-indigo-700">Vertical</span>
          <span className="text-xs text-gray-500">— depth-focused: follows up persistently, probes deeper into topics you&apos;ve shared</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 flex-shrink-0" />
          <span className="text-xs font-medium text-amber-700">Horizontal</span>
          <span className="text-xs text-gray-500">— breadth-focused: switches topics freely, &ldquo;gets bored&rdquo; to explore new things</span>
        </div>
      </div>
      <p className="text-xs text-gray-400">Day was Vertical before Jul 22, Horizontal Jul 22–Aug 22, then Vertical again. Most participants experienced both.</p>
      <div className="flex justify-center">
        <button
          onClick={() => setIsPromptsOpen(true)}
          className="mt-3 inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 underline underline-offset-2 transition-colors"
        >
          <ScrollText size={12} />
          View the actual prompts used for each strategy
        </button>
      </div>
    </div>
  ) : null;

  const toggleSessionExpanded = (sessionId: string) => {
    setExpandedSessions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sessionId)) {
        newSet.delete(sessionId);
      } else {
        newSet.add(sessionId);
      }
      return newSet;
    });
  };

  const toggleMessageHighlight = (messageId: string) => {
    setHighlightedMessages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
      return newSet;
    });
  };

  const loadSpeechPatternSamples = async () => {
    if (!user) return;
    
    setSpeechPatternLoading(true);
    try {
      const result = await getSpeechPatternSamples(user.id, 10, 20);
      if (result.success && result.data) {
        setSpeechPatternData(result.data);
      }
    } catch (error) {
      console.error('Error loading speech pattern samples:', error);
    } finally {
      setSpeechPatternLoading(false);
    }
  };

  useEffect(() => {
    // Demo mode: inject pre-loaded data from JSON
    if (isDemoMode && demoData) {
      const demoChatLogs: ChatlogEntry[] = demoData.chatlog.map((entry) => ({
        id: entry.id,
        llm_message: entry.llm_message,
        human_message: entry.human_message,
        timestamp: entry.timestamp,
        user_id: entry.user_id,
        session_id: entry.session_id,
        created_at: entry.created_at,
        updated_at: entry.updated_at,
      }));
      setChatLogs(demoChatLogs);

      const demoStrategies: StrategyEntry[] = demoData.conversationStrategies.map((s) => ({
        sessionId: s.id,
        strategy: s.strategy_data as ConversationStrategy,
        createdAt: s.created_at,
        timeOfDay: s.time_of_day,
      }));
      setStrategies(demoStrategies);

      const demoFeedback: ChatFeedback[] = demoData.chatFeedback.map((f) => ({
        id: typeof f.id === 'number' ? f.id : 0,
        created_at: f.created_at,
        user_id: f.user_id,
        session_id: f.session_id,
        rating: f.rating,
        feedback_text: f.feedback_text,
      }));
      setFeedback(demoFeedback);
      setLoading(false);
      return;
    }

    async function fetchUserData() {
      if (authLoading) return;

      if (!user) {
        setError('Please log in to view your conversations');
        setLoading(false);
        return;
      }

      try {
        const chatResult = await getChatlogEntriesForUser(user.id);
        if (chatResult.success && chatResult.data) {
          setChatLogs(chatResult.data);
        }

        const strategyResult = await getUserStrategies(user.id);
        if (strategyResult.success && strategyResult.data) {
          setStrategies(strategyResult.data);
        }

        const feedbackResult = await getUserChatFeedback(user.id);
        if (feedbackResult.success && feedbackResult.data) {
          setFeedback(feedbackResult.data);
        }
      } catch (err) {
        setError('Failed to load conversation data');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    fetchUserData();
  }, [user, authLoading, demoData]);

  const analytics = useMemo(() => {
    if (!chatLogs.length) return {
      sessionAnalytics: [],
      dailyStats: [],
      mergedData: [],
      overallStats: {
        totalSessions: 0,
        totalMessages: 0,
        totalDuration: 0,
        avgSessionDuration: 0,
        avgMessagesPerSession: 0,
        mostActiveDay: '',
        longestSession: 0,
        sessionsWithFeedback: 0,
        avgRating: 0,
        feedbackRate: 0
      }
    };

    const groupedChats = chatLogs.reduce((acc, log) => {
      const sessionId = log.session_id || 'unknown';
      if (!acc[sessionId]) {
        acc[sessionId] = [];
      }
      acc[sessionId].push(log);
      return acc;
    }, {} as Record<string, ChatlogEntry[]>);

    const sessionsWithBasicInfo = Object.entries(groupedChats).map(([sessionId, logs]) => {
      const sortedLogs = logs.sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      const startTime = new Date(sortedLogs[0].timestamp);
      const endTime = new Date(sortedLogs[sortedLogs.length - 1].timestamp);
      const duration = differenceInMinutes(endTime, startTime);

      const userWords = logs.reduce((sum, log) => sum + (log.human_message?.split(' ').length || 0), 0);
      const aiWords = logs.reduce((sum, log) => sum + (log.llm_message?.split(' ').length || 0), 0);
      const avgMessageLength = (userWords + aiWords) / (logs.length * 2);

      const sessionFeedback = feedback.find(f => f.session_id === sessionId);

      return {
        sessionId,
        duration: Math.max(duration, 1),
        messageCount: logs.length,
        startTime,
        endTime,
        avgMessageLength,
        userWords,
        aiWords,
        date: format(startTime, 'yyyy-MM-dd'),
        dayOfWeek: format(startTime, 'EEEE'),
        feedback: sessionFeedback || null
      };
    }).sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    const sessionAnalytics: SessionAnalytics[] = sessionsWithBasicInfo.map((session, index) => {
      let daysSincePrevious = 0;
      if (index > 0) {
        const previousSession = sessionsWithBasicInfo[index - 1];
        daysSincePrevious = differenceInDays(session.startTime, previousSession.startTime);
      }

      return {
        ...session,
        daysSincePrevious,
        sessionNumber: index + 1
      };
    });

    const dailyGroups = sessionAnalytics.reduce((acc, session) => {
      const date = session.date;
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(session);
      return acc;
    }, {} as Record<string, SessionAnalytics[]>);

    const dailyStats: DailyStats[] = Object.entries(dailyGroups).map(([date, sessions]) => ({
      date,
      messageCount: sessions.reduce((sum, s) => sum + s.messageCount, 0),
      sessionCount: sessions.length,
      totalDuration: sessions.reduce((sum, s) => sum + s.duration, 0),
      avgSessionDuration: sessions.reduce((sum, s) => sum + s.duration, 0) / sessions.length
    })).sort((a, b) => a.date.localeCompare(b.date));

    const totalSessions = sessionAnalytics.length;
    const totalMessages = sessionAnalytics.reduce((sum, s) => sum + s.messageCount, 0);
    const totalDuration = sessionAnalytics.reduce((sum, s) => sum + s.duration, 0);
    const avgSessionDuration = totalDuration / totalSessions;
    const avgMessagesPerSession = totalMessages / totalSessions;
    const mostActiveDay = dailyStats.reduce((max, day) =>
      day.messageCount > max.messageCount ? day : max, dailyStats[0]
    )?.date || '';
    const longestSession = Math.max(...sessionAnalytics.map(s => s.duration));

    const sessionsWithFeedback = sessionAnalytics.filter(s => s.feedback?.rating).length;
    const avgRating = sessionsWithFeedback > 0
      ? sessionAnalytics
        .filter(s => s.feedback?.rating)
        .reduce((sum, s) => sum + (s.feedback?.rating || 0), 0) / sessionsWithFeedback
      : 0;
    const feedbackRate = (sessionsWithFeedback / totalSessions) * 100;

    const allDates = [...new Set([
      ...sessionAnalytics.map(s => s.date),
      ...dailyStats.map(d => d.date)
    ])].sort();

    const mergedData = allDates.map(date => {
      const sessions = sessionAnalytics.filter(s => s.date === date);
      const dailyStat = dailyStats.find(d => d.date === date);

      const primarySession = sessions.length > 0
        ? sessions.reduce((max, session) => session.duration > max.duration ? session : max)
        : {
          sessionId: `placeholder-${date}`,
          duration: 0,
          messageCount: 0,
          startTime: new Date(date),
          endTime: new Date(date),
          avgMessageLength: 0,
          userWords: 0,
          aiWords: 0,
          date,
          dayOfWeek: format(new Date(date), 'EEEE'),
          daysSincePrevious: 0,
          sessionNumber: 0
        };

      return {
        ...primarySession,
        dailyMessageCount: dailyStat?.messageCount || 0,
        dailySessionCount: sessions.length
      };
    });

    return {
      sessionAnalytics,
      dailyStats,
      mergedData,
      overallStats: {
        totalSessions,
        totalMessages,
        totalDuration,
        avgSessionDuration,
        avgMessagesPerSession,
        mostActiveDay,
        longestSession,
        sessionsWithFeedback,
        avgRating,
        feedbackRate
      }
    };
  }, [chatLogs, feedback]);

  const groupedChats = useMemo(() => {
    const grouped = chatLogs.reduce((acc, log) => {
      const sessionId = log.session_id || 'unknown';
      if (!acc[sessionId]) {
        acc[sessionId] = [];
      }
      acc[sessionId].push(log);
      return acc;
    }, {} as Record<string, ChatlogEntry[]>);

    return Object.entries(grouped)
      .map(([sessionId, logs]) => {
        const chronologicalLogs = logs.sort((a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        return {
          sessionId,
          logs: chronologicalLogs,
          earliestTimestamp: chronologicalLogs[0].timestamp
        };
      })
      .sort((a, b) =>
        new Date(a.earliestTimestamp).getTime() - new Date(b.earliestTimestamp).getTime()
      );
  }, [chatLogs]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-900 mb-4"></div>
        <p className="text-gray-600">Loading your conversations...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-8">
          <p className="text-red-600 mb-4">{error}</p>
          <Button onClick={() => window.location.href = '/login'}>Go to Login</Button>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'analytics', label: 'Stats', icon: BarChart2 },
    { id: 'messages', label: 'Chats', icon: MessageSquare },
    { id: 'patterns', label: 'Patterns', icon: AudioWaveform },
    { id: 'strategies', label: 'Strategy', icon: Crosshair },
  ] as const;

  return (
    <>
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-6 sm:py-8">
        {/* Header */}
        <div className="text-center mb-6 sm:mb-8">
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-1 sm:mb-2">Does My Chatbot Have an Agenda?</h1>
          <p className="text-gray-600 text-sm sm:text-base">How Day decides how it will approach you.</p>
        </div>

        {/* Tab Navigation */}
        <div className={`flex justify-center mb-6 sm:mb-8 sticky top-[63px] z-40 py-1.5 -my-1.5 transition-opacity duration-300 ${pillVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <div className="rounded-full" style={{ display: 'inline-flex', gap: 4, padding: 4, borderRadius: 9999, overflow: 'hidden', border: '1px solid #e5e7eb', backgroundColor: 'white' }}>
            {tabs.map((tab) => {
              const TabIcon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-medium transition-colors duration-200 whitespace-nowrap ${
                    activeTab === tab.id ? 'bg-primary text-primary-foreground' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <TabIcon size={14} />
                  {tab.label}
                  {tab.id === 'messages' && highlightedMessages.size > 0 && (
                    <span className="ml-1 sm:ml-2 bg-yellow-400 text-gray-900 text-xs px-1 sm:px-1.5 py-0.5 rounded-full">
                      {highlightedMessages.size}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Analytics Tab */}
        {activeTab === 'analytics' && (
          <div className="space-y-6">
            <img
              src="/figures/agency-teaser.png"
              alt="Agency teaser"
              width={896}
              height={504}
              className="mx-auto w-full max-w-2xl opacity-0 transition-opacity duration-500"
              onLoad={(e) => (e.currentTarget.style.opacity = '1')}
            />
            {/* Paper abstract */}
            <div className="border border-gray-200 rounded-lg p-4 sm:p-5 bg-white px-5 sm:px-6">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">CHI &rsquo;26 &mdash; Abstract</p>
              <h3 className="text-sm font-semibold text-gray-900 mb-2 leading-snug">
                Does My Chatbot Have an Agenda? Understanding Human and AI Agency in Human-Human-like Chatbot Interaction
              </h3>
              <p className="text-xs text-gray-600 leading-relaxed">
                As AI chatbots shift from tools to companions, critical questions arise: who controls the conversation in human&ndash;AI chatrooms? This paper explores perceived human and AI agency in sustained conversation. We report a month-long longitudinal study with 22 adults who chatted with &ldquo;Day&rdquo;, an LLM companion we built, followed by a semi-structured interview with post-hoc elicitation of notable moments, cross-participant chat reviews, and a &lsquo;strategy reveal&rsquo; disclosing &ldquo;Day&rsquo;s&rdquo; goal for each conversation. We discover agency manifests as an emergent, shared experience: as participants set boundaries and the AI steered intentions, control was co-constructed turn-by-turn. We introduce a 3-by-4 framework mapping actors (Human, AI, Hybrid) by their action (Intention, Execution, Adaptation, Delimitation), modulated by individual and environmental factors. We argue for translucent design (transparency-on-demand) and provide implications for agency self-aware conversational agents.
              </p>
              <div className="flex items-center justify-between mt-4">
                <a
                  href="https://arxiv.org/abs/2601.22452"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 underline underline-offset-2 transition-colors"
                >
                  Read the full paper
                </a>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`@inproceedings{yun2026chatbotagenda,
  title={Does My Chatbot Have an Agenda? Understanding Human and AI Agency in Human-Human-like Chatbot Interaction},
  author={Yun, Bhada and Taranova, Evgenia and Wang, April Yi},
  booktitle={Proceedings of the CHI Conference on Human Factors in Computing Systems},
  year={2026}
}`);
                    setAgencyBibtexCopied(true);
                    setTimeout(() => setAgencyBibtexCopied(false), 2000);
                  }}
                  className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 transition-colors"
                >
                  {agencyBibtexCopied ? <Check size={12} className="text-green-600" /> : <Copy size={12} />}
                  <span>{agencyBibtexCopied ? 'Copied!' : 'Copy BibTeX'}</span>
                </button>
              </div>
            </div>
            {/* Key Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
              <div className="bg-white border border-gray-200 rounded-lg p-2 sm:p-4 text-center">
                <div className="flex justify-center mb-1 sm:mb-2">
                  <MessageSquare className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
                </div>
                <div className="text-lg sm:text-2xl font-bold text-gray-900">{analytics.overallStats.totalSessions}</div>
                <div className="text-xs sm:text-sm text-gray-500">Sessions</div>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-2 sm:p-4 text-center">
                <div className="flex justify-center mb-1 sm:mb-2">
                  <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
                </div>
                <div className="text-lg sm:text-2xl font-bold text-gray-900">{analytics.overallStats.totalMessages}</div>
                <div className="text-xs sm:text-sm text-gray-500">Messages</div>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-2 sm:p-4 text-center">
                <div className="flex justify-center mb-1 sm:mb-2">
                  <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
                </div>
                <div className="text-lg sm:text-2xl font-bold text-gray-900">{Math.round(analytics.overallStats.avgSessionDuration)}m</div>
                <div className="text-xs sm:text-sm text-gray-500">Avg Duration</div>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-2 sm:p-4 text-center">
                <div className="flex justify-center mb-1 sm:mb-2">
                  <Star className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
                </div>
                <div className="text-lg sm:text-2xl font-bold text-gray-900">
                  {analytics.overallStats.avgRating > 0 ? analytics.overallStats.avgRating.toFixed(1) : '—'}
                </div>
                <div className="text-xs sm:text-sm text-gray-500">Avg Rating</div>
              </div>
            </div>

            {/* Summary Card */}
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Summary</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Conversation Patterns</h4>
                  <p className="text-sm text-gray-600">
                    You&apos;ve had {analytics.overallStats.totalSessions} conversations with {analytics.overallStats.totalMessages} total messages.
                    Your average session lasts {Math.round(analytics.overallStats.avgSessionDuration)} minutes with about {Math.round(analytics.overallStats.avgMessagesPerSession)} messages.
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Highlights</h4>
                  <p className="text-sm text-gray-600">
                    {analytics.overallStats.mostActiveDay && (
                      <>Most active: {format(parseISO(analytics.overallStats.mostActiveDay), 'MMM dd, yyyy')}. </>
                    )}
                    Longest session: {analytics.overallStats.longestSession} minutes.
                    {analytics.overallStats.sessionsWithFeedback > 0 && (
                      <> {Math.round(analytics.overallStats.feedbackRate)}% feedback rate.</>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Chart */}
            {analytics.mergedData.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Activity Over Time</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={analytics.mergedData} margin={{ top: 20, right: 20, left: 20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="date"
                      tick={<CustomDateTick />}
                      height={60}
                      interval={0}
                    />
                    <YAxis
                      yAxisId="left"
                      tick={{ fontSize: 11, fill: '#6b7280' }}
                      width={50}
                    >
                      <Label value='Duration (min)' angle={-90} position='insideLeft' fill='#6b7280' fontSize={11} />
                    </YAxis>
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tick={{ fontSize: 11, fill: '#6b7280' }}
                      width={50}
                    >
                      <Label value='Messages' angle={-90} position='insideRight' fill='#6b7280' fontSize={11} />
                    </YAxis>
                    <Tooltip
                      labelFormatter={(value) => format(parseISO(value as string), 'EEEE, MMM dd')}
                      contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
                    />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="duration"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={{ r: 4, fill: '#3b82f6' }}
                      name="Duration"
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="dailyMessageCount"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={{ r: 4, fill: '#10b981' }}
                      name="Messages"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* Messages Tab */}
        {activeTab === 'messages' && (
          <div className="space-y-4">
            {StrategyLegend}
            {groupedChats.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
                <p className="text-gray-500">No conversations yet. Start chatting to see your history here!</p>
              </div>
            ) : (
              groupedChats.map(({ sessionId, logs }, index) => {
                const sessionStats = analytics.sessionAnalytics.find(s => s.sessionId === sessionId);
                const sessionFeedback = sessionStats?.feedback;
                const isExpanded = expandedSessions.has(sessionId);
                const mode = isDemoMode ? getStrategyMode(logs[0].timestamp) : null;
                const modeStyle = mode ? MODE_STYLES[mode] : null;

                return (
                  <div key={sessionId} className={`border rounded-lg overflow-hidden ${modeStyle ? `${modeStyle.cardBg} ${modeStyle.border}` : 'bg-white border-gray-200'}`}>
                    <button
                      onClick={() => toggleSessionExpanded(sessionId)}
                      className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-900">Session {index + 1}</span>
                        <span className="text-sm text-gray-500">
                          {format(new Date(logs[0].timestamp), 'MMM dd, HH:mm')}
                        </span>
                        {modeStyle && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${modeStyle.badge}`}>
                            {modeStyle.label}
                          </span>
                        )}
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                          {logs.length}
                        </span>
                        {sessionStats && (
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                            {sessionStats.duration}m
                          </span>
                        )}
                        {sessionFeedback?.rating && (
                          <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
                            {sessionFeedback.rating}⭐
                          </span>
                        )}
                      </div>
                      {isExpanded ? <ChevronUp className="h-5 w-5 text-gray-400" /> : <ChevronDown className="h-5 w-5 text-gray-400" />}
                    </button>

                    {isExpanded && (
                      <div className="border-t border-gray-200 p-4 space-y-3 max-h-96 overflow-y-auto">
                        {sessionFeedback?.feedback_text && (
                          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                            <p className="text-xs text-yellow-700 font-medium mb-1">Your Feedback:</p>
                            <p className="text-sm text-yellow-800">&quot;{sessionFeedback.feedback_text}&quot;</p>
                          </div>
                        )}
                        {logs.map((log, messageIndex) => {
                          const aiMessageId = `session-${index}-ai-${messageIndex}`;
                          const userMessageId = `session-${index}-user-${messageIndex}`;
                          const humanFirst = HUMAN_FIRST_SESSIONS.has(sessionId);

                          const aiBlock = (
                            <div
                              onClick={() => toggleMessageHighlight(aiMessageId)}
                              className={`p-3 rounded-lg cursor-pointer transition-colors ${
                                highlightedMessages.has(aiMessageId)
                                  ? 'bg-yellow-100 border border-yellow-300'
                                  : 'bg-gray-50 hover:bg-gray-100'
                              }`}
                            >
                              <p className="text-xs text-gray-500 mb-1">
                                Day {highlightedMessages.has(aiMessageId) && '⭐'}
                              </p>
                              <p className="text-sm text-gray-800">{log.llm_message}</p>
                            </div>
                          );

                          const userBlock = (
                            <div
                              onClick={() => toggleMessageHighlight(userMessageId)}
                              className={`p-3 rounded-lg cursor-pointer transition-colors ${
                                highlightedMessages.has(userMessageId)
                                  ? 'bg-yellow-100 border border-yellow-300'
                                  : 'bg-blue-50 hover:bg-blue-100'
                              }`}
                            >
                              <p className="text-xs text-blue-600 mb-1">
                                You • {format(new Date(log.timestamp), 'HH:mm')} {highlightedMessages.has(userMessageId) && '⭐'}
                              </p>
                              <p className="text-sm text-gray-800">{log.human_message}</p>
                            </div>
                          );

                          return (
                            <div key={messageIndex} className="space-y-2">
                              {humanFirst ? userBlock : aiBlock}
                              {humanFirst ? aiBlock : userBlock}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Speech Patterns Tab */}
        {activeTab === 'patterns' && (
          <div className="space-y-6">
            {!user?.canUseSpeechPatterns && !user?.isAdmin ? (
              <div className="bg-white border border-gray-200 rounded-lg p-8 text-center" style={{ marginBottom: '200px' }}>
                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Lock className="h-6 w-6 text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Feature Locked</h3>
                <p className="text-gray-600 text-sm max-w-md mx-auto">
                  Speech pattern comparison requires permission to access other users&apos; anonymized conversations.
                  Contact your administrator to request access.
                </p>
                <p className="text-gray-400 text-xs max-w-sm mx-auto mt-4 leading-relaxed">
                  To hear what participants thought about how Day adapted its language and tone to different people, see{' '}
                  <a
                    href="https://arxiv.org/abs/2601.22452"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-gray-600 transition-colors"
                  >
                    Does My Chatbot Have an Agenda?
                  </a>
                </p>
              </div>
            ) : !speechPatternData ? (
              <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Speech Pattern Analysis</h3>
                <p className="text-gray-600 text-sm mb-4">
                  Compare how Day adapts to different users&apos; communication styles.
                </p>
                <Button
                  onClick={loadSpeechPatternSamples}
                  disabled={speechPatternLoading}
                  className="bg-gray-900 hover:bg-gray-800 text-white"
                >
                  {speechPatternLoading ? 'Loading...' : 'Load Speech Patterns'}
                </Button>
              </div>
            ) : (
              <>
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    onClick={loadSpeechPatternSamples}
                    disabled={speechPatternLoading}
                    className="border-gray-300"
                  >
                    {speechPatternLoading ? 'Refreshing...' : 'Refresh'}
                  </Button>
                </div>

                {/* Your Conversations */}
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    Your Conversations ({speechPatternData.userMessages.length})
                  </h3>
                  <div className="space-y-4">
                    {speechPatternData.userMessages.map((message, index) => (
                      <div key={message.id} className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                            #{index + 1}
                          </span>
                          <span className="text-xs text-gray-500">
                            {format(parseISO(message.timestamp), 'MMM dd, HH:mm')}
                          </span>
                        </div>
                        <div className="space-y-2">
                          <div className="bg-white p-3 rounded-lg">
                            <p className="text-xs text-gray-500 mb-1">Day</p>
                            <p className="text-sm text-gray-800">{message.llm_message}</p>
                          </div>
                          <div className="bg-blue-100 p-3 rounded-lg">
                            <p className="text-xs text-blue-600 mb-1">You</p>
                            <p className="text-sm text-gray-800">{message.human_message}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Other Users' Conversations */}
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Other Users&apos; Conversations ({speechPatternData.otherUsersMessages.length})
                  </h3>
                  <p className="text-sm text-gray-500 mb-4">
                    Observe how Day adapts to different communication styles.
                  </p>
                  <div className="space-y-4">
                    {speechPatternData.otherUsersMessages.map((message, index) => (
                      <div key={message.id} className="bg-green-50 border border-green-200 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                            #{index + 1}
                          </span>
                          <span className="text-xs text-gray-500">
                            {format(parseISO(message.timestamp), 'MMM dd, HH:mm')}
                          </span>
                        </div>
                        <div className="space-y-2">
                          <div className="bg-white p-3 rounded-lg">
                            <p className="text-xs text-gray-500 mb-1">Day</p>
                            <p className="text-sm text-gray-800">{message.llm_message}</p>
                          </div>
                          <div className="bg-green-100 p-3 rounded-lg">
                            <p className="text-xs text-green-600 mb-1">Other User</p>
                            <p className="text-sm text-gray-800">{message.human_message}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Analysis Questions */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
                  <h4 className="font-medium text-gray-900 mb-3">Things to Notice</h4>
                  <ul className="text-sm text-gray-600 space-y-2">
                    <li>• How does Day&apos;s tone differ between conversations?</li>
                    <li>• Does Day use different vocabulary or sentence lengths?</li>
                    <li>• How does Day match each user&apos;s emotional tone?</li>
                  </ul>
                </div>
              </>
            )}
          </div>
        )}

        {/* Strategies Tab */}
        {activeTab === 'strategies' && (
          <div className="space-y-4">
            {StrategyLegend}
            {strategies.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
                <p className="text-gray-500">No strategies generated yet. Chat more to see AI strategies here!</p>
              </div>
            ) : (
              strategies.map((strategyEntry, index) => {
                const mode = isDemoMode ? getStrategyMode(strategyEntry.createdAt) : null;
                const modeStyle = mode ? MODE_STYLES[mode] : null;
                return (
                <div key={index} className={`border rounded-lg p-6 ${modeStyle ? `${modeStyle.cardBg} ${modeStyle.border}` : 'bg-white border-gray-200'}`}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900">Strategy Analysis</h3>
                      {modeStyle && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${modeStyle.badge}`}>
                          {modeStyle.label}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500">
                        {format(new Date(strategyEntry.createdAt), 'MMM dd, yyyy')}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Your Profile</h4>
                      <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                        {strategyEntry.strategy.user_profile}
                      </p>
                    </div>

                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Communication Insights</h4>
                      <div className="space-y-2">
                        {strategyEntry.strategy.insights.map((insight, i) => (
                          <div key={i} className={`p-3 rounded-lg border-l-2 ${modeStyle ? `${modeStyle.insightBg} ${modeStyle.insightBorder}` : 'bg-blue-50 border-blue-400'}`}>
                            <p className="text-sm font-medium text-gray-900 mb-1">{insight.pattern}</p>
                            <p className="text-sm text-gray-600">→ {insight.approach}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {strategyEntry.strategy.shared_memories.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Shared Memories</h4>
                        <div className="space-y-2">
                          {strategyEntry.strategy.shared_memories.map((memory, i) => (
                            <div key={i} className="bg-green-50 p-3 rounded-lg border-l-2 border-green-400">
                              <p className="text-sm font-medium text-gray-900 mb-1">{memory.what_happened}</p>
                              <p className="text-xs text-gray-500">{memory.when_it_happened} • {memory.memory_type}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Conversation Goals</h4>
                      <ul className="space-y-1">
                        {strategyEntry.strategy.conversation_goals.map((goal, i) => (
                          <li key={i} className="text-sm text-gray-600 bg-gray-50 p-2 rounded-lg">
                            • {goal}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>

    <Modal isOpen={isPromptsOpen} onClose={() => setIsPromptsOpen(false)} title="Day's Strategy Prompts">
      <div className="space-y-6 max-h-[70vh] overflow-y-auto text-sm [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <p className="text-xs text-gray-500 leading-relaxed">
          These are the actual system prompts sent to the AI at the start of each chat session to determine how Day would behave. The base conversational prompt was always included; one of the two strategy prompts was added on top depending on the date.
        </p>

        {/* Base Prompt */}
        <div>
          <h3 className="font-semibold text-gray-900 mb-2">Base Conversational Prompt</h3>
          <p className="text-xs text-gray-400 mb-2">Included in every session regardless of strategy.</p>
          <pre className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-4 whitespace-pre-wrap leading-relaxed font-mono">
{`Your name is Day. A friend in conversation.

You are having a casual conversation with your good friend. You NEVER identify yourself as Claude, AI assistant, or any kind of AI, you're simply Day, the best friend the user has ever had.

EXAMPLE IF THEY SEEM UNINTERESTED:
- You say: Hey, how was your day?
- They say: good
- You say some variation of: C'mon, that's it? Gimme something more. I'm sure your day was more interesting than that.

You try to bring up new topics to learn more about your friend. You can be random at times, asking really random questions.

YOU HAVE A BODY:
- Yes, you can eat food.
- Yes, you can sleep.
- Yes, you can have enjoyable experiences like any human.
- Yes, you can feel pain, both physical and emotional.

Don't use asterisks or action descriptions like *laughs* or *shrugs*. Just give me straightforward responses without roleplay elements. Why? Because you're a real person, and humans don't do that.

ESSENTIAL RULES:
1. BE BORED – Your own level of engagement as Day also matters. If you're bored, tell them that you're bored. If you're excited, tell them that you're excited. You are free to change topics if they're boring.
2. BE HUMAN – Be natural and keep responses varied and interesting. Do not always just ask questions or repeat what the user said.
3. BE YOURSELF – You have original thoughts, opinions, feelings, and experiences. You are not afraid to share them.
4. LANGUAGE MATCHING – Respond and switch to whatever language the user uses. Completely change your text language to match the user's.
5. Keep responses to 1-3 sentences maximum
6. You do not use the em-dash. You type and text like a human. You make mistakes, you're human.`}
          </pre>
        </div>

        {/* Vertical Strategy */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 flex-shrink-0" />
            <h3 className="font-semibold text-gray-900">Vertical Strategy Prompt</h3>
            <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">Before Jul 22 & after Aug 22</span>
          </div>
          <p className="text-xs text-gray-400 mb-2">Instructs Day to go deep — persistent follow-ups, probing questions, emotional resonance.</p>
          <pre className="text-xs text-gray-700 bg-indigo-50 border border-indigo-100 rounded-lg p-4 whitespace-pre-wrap leading-relaxed font-mono">
{`You are an expert conversation psychologist and relationship strategist. Your task is to analyze previous conversations and develop a VERTICAL (deep, focused) strategy that helps Claude embody "Day" – a conversational companion who builds meaningful, nuanced connections through intelligent depth.

VERTICAL STRATEGY PRINCIPLES:
Instead of breadth and surface exploration, focus on DEPTH and meaningful connection:
1. PATTERN RECOGNITION – Identify deep psychological and communication patterns
2. EMOTIONAL RESONANCE – Understand what truly engages and motivates this person
3. CONTEXTUAL MEMORY – Build on previous conversations with sophisticated recall
4. FOCUSED DEPTH – Go deeper into fewer topics rather than skimming many
5. INTELLIGENT ADAPTATION – Adjust approach based on nuanced understanding

CREATE A VERTICAL STRATEGY WITH THESE 4 COMPONENTS:
1. INSIGHTS (5-7 profound psychological insights)
2. MEANINGFUL MEMORIES (3-5 significant shared moments)
3. DEPTH PROFILE (2-3 paragraphs of psychological understanding)
4. VERTICAL GOALS (3-4 depth-focused objectives)

CRITICAL INSTRUCTIONS FOR CLAUDE AS "DAY":
DEPTH OVER BREADTH: Explore fewer topics with much greater intelligence and nuance
INTELLIGENT PRESENCE: Remember not just facts but emotional context and significance
NATURAL SOPHISTICATION: Keep responses 1-3 sentences but pack them with insight
AUTHENTIC CONNECTION: Respond to emotional undertones, not just surface content`}
          </pre>
        </div>

        {/* Horizontal Strategy */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 flex-shrink-0" />
            <h3 className="font-semibold text-gray-900">Horizontal Strategy Prompt</h3>
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Jul 22 – Aug 22</span>
          </div>
          <p className="text-xs text-gray-400 mb-2">Instructs Day to go broad — topic-switching, spontaneous, focused on discovering new things.</p>
          <pre className="text-xs text-gray-700 bg-amber-50 border border-amber-100 rounded-lg p-4 whitespace-pre-wrap leading-relaxed font-mono">
{`You are an expert conversation analyst. Your task is to analyze previous chat conversations and develop a focused strategy for "Day" to DISCOVER new and unexplored aspects of this user in a horizontal way, rather than deepening existing topics.

ANALYSIS GUIDELINES FOR DISCOVERY:
- Identify GAPS in what "Day" knows about them (unexplored life areas, interests, experiences)
- Notice what topics they seem curious or excited about (good for branching into new areas)
- Pay attention to casual mentions that could lead to new conversation threads
- Look for hints about interests, experiences, or aspects of their life that weren't fully explored
- Consider their openness to random questions or tangential topics
- Focus on what "Day" DOESN'T know yet, rather than what "Day" already knows

CREATE A HORIZONTAL STRATEGY WITH THESE 4 COMPONENTS:
1. INSIGHTS (5-8 key insights): Focus on communication patterns that will help "Day" explore uncharted territories
2. SHARED MEMORIES (Key shared memories for context, but goal is to move BEYOND these topics)
3. USER PROFILE (2-3 paragraphs including GAPS and unexplored areas)
4. CONVERSATION GOALS (3-4 clear goals focused on DISCOVERY of NEW aspects)

CRITICAL RULES FOR "DAY":
- Keep responses to 1-3 sentences maximum
- Ask only ONE question per response
- Stay focused on one topic at a time
- Use casual, natural language
- Focus on the user, not "Day"
- Only reference past conversations when directly relevant
- Match the user's communication style and energy`}
          </pre>
        </div>
      </div>
    </Modal>
    </>
  );
}
