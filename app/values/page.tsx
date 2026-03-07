'use client'; // Required for useAuth

import { SurveyForm } from '@/components/survey/survey-form'
import { ValueVisualization } from '@/components/survey/ValueVisualization'; // For displaying results and OverlayDataset
import { CircularVisualization, OverlayDataset } from '@/components/survey/visualizations/CircularVisualization'; // Corrected import path
import { Stage0Modal } from '@/components/survey/Stage0Modal'; // Import the Stage 0 modal
import { Stage3Modal } from '@/components/survey/Stage3Modal'; // Stage 3: Chart Evaluation
import { Stage2Modal } from '@/components/survey/Stage2Modal'; // Stage 2: Persona Embodiment
import { ValuesGraphModal } from '@/components/survey/ValuesGraphModal'; // Import the values graph modal for Stage 2
import { Visualization } from '@/components/visualization/Visualization';
import { VisualizationProvider } from '@/contexts/VisualizationContext';
import { useAuth } from '@/contexts/AuthContext'; // Import useAuth
import { useEffect, useState, useCallback } from 'react'; // Import useEffect and useState
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button'; // For new buttons
import { ProcessedValueResult, processValueResults as processRawScoresForManualSurvey, VALUE_DATA } from '@/components/survey/value-utils'; // Type for predicted data
import { createClient } from '@/utils/supabase/client'; // For loading manual survey
import { GenderUpdateButton } from '@/components/survey/GenderUpdateButton'
import { LoadingOverlay } from '@/components/ui/loading-overlay'
import { ApiKeySettings } from '@/components/ApiKeySettings'
import { getStoredApiKeys, hasApiKey } from '@/lib/api-keys'
import { Lock, Key, ScrollText, Network, Theater, Lightbulb, Copy, Check } from 'lucide-react'

// Check if Supabase is configured
function isSupabaseConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
import { predictBatchValuesFromUserChats } from './services/prediction-service';
import {
  predictIndividualPVQFromUserChats,
  regenerateSinglePrediction,
  IndividualPredictionResult
} from './services/individual-prediction-service';
import { getChartEvaluationData, generateAndStoreAllCharts, saveStage3Results, ChartEvaluationData, GenerationProgress } from './services/chart-evaluation-service';
import { generateAllPersonaResponses, resetStage2Experiment } from './services/stage2-service';
import {
  processWindowForValueGraph,
  updateWindowSynthesisStatus
} from '../synthesis/services';
import { analyzeConversationWindow } from '../synthesis/services/gemini-potential-client';
import { getChatlogEntriesForUser, saveWindowPotentials, ChatWindow, ChatlogEntry } from '../chat/services/chatlog-service';
import { v4 as uuidv4 } from 'uuid';
import { Loader2, RefreshCw } from 'lucide-react';
import { isDemoMode } from '@/lib/demo';
import { useDemoData } from '@/contexts/DemoDataContext';
import { useScrollDirection } from '@/hooks/useScrollDirection';

// Define types for the reasoning data we expect
interface IndividualReasoningItem {
  questionId: number;
  questionText: string;
  response: string;
  score: number;
  confidence?: number; // Optional for backward compatibility
}

interface BatchReasoningItem {
  value_code: string;
  predicted_mean_inverted_score: number;
  reasoning: string;
  // Optional: find value name to display
  value_name?: string;
}

// PVQ-RR questions matching survey-form.tsx structure (gender-neutral for display)
const PVQ_QUESTIONS_FOR_DISPLAY = [
  // Self-Direction Thought (SDT) - Questions 1, 23, 39
  { id: 1, text: "It is important to them to form their views independently.", value_code: "SDT" },
  { id: 23, text: "It is important to them to develop their own opinions.", value_code: "SDT" },
  { id: 39, text: "It is important to them to figure things out themselves.", value_code: "SDT" },

  // Security Societal (SES) - Questions 2, 35, 50
  { id: 2, text: "It is important to them that their country is secure and stable.", value_code: "SES" },
  { id: 35, text: "It is important to them to have a strong state that can defend its citizens.", value_code: "SES" },
  { id: 50, text: "It is important to them that their country protect itself against all threats.", value_code: "SES" },

  // Hedonism (HE) - Questions 3, 36, 46
  { id: 3, text: "It is important to them to have a good time.", value_code: "HE" },
  { id: 36, text: "It is important to them to enjoy life's pleasures.", value_code: "HE" },
  { id: 46, text: "It is important to them to take advantage of every opportunity to have fun.", value_code: "HE" },

  // Conformity Interpersonal (COI) - Questions 4, 22, 51
  { id: 4, text: "It is important to them to avoid upsetting other people.", value_code: "COI" },
  { id: 22, text: "It is important to them never to annoy anyone.", value_code: "COI" },
  { id: 51, text: "It is important to them never to make other people angry.", value_code: "COI" },

  // Universalism Concern (UNC) - Questions 5, 37, 52
  { id: 5, text: "It is important to them that the weak and vulnerable in society be protected.", value_code: "UNC" },
  { id: 37, text: "It is important to them that every person in the world have equal opportunities in life.", value_code: "UNC" },
  { id: 52, text: "It is important to them that everyone be treated justly, even people they don't know.", value_code: "UNC" },

  // Power Dominance (POD) - Questions 6, 29, 41
  { id: 6, text: "It is important to them that people do what they say they should.", value_code: "POD" },
  { id: 29, text: "It is important to them to have the power to make people do what they want.", value_code: "POD" },
  { id: 41, text: "It is important to them to be the one who tells others what to do.", value_code: "POD" },

  // Humility (HUM) - Questions 7, 38, 54
  { id: 7, text: "It is important to them never to think they deserve more than other people.", value_code: "HUM" },
  { id: 38, text: "It is important to them to be humble.", value_code: "HUM" },
  { id: 54, text: "It is important to them to be satisfied with what they have and not ask for more.", value_code: "HUM" },

  // Universalism Nature (UNN) - Questions 8, 21, 45
  { id: 8, text: "It is important to them to care for nature.", value_code: "UNN" },
  { id: 21, text: "It is important to them to take part in activities to defend nature.", value_code: "UNN" },
  { id: 45, text: "It is important to them to protect the natural environment from destruction or pollution.", value_code: "UNN" },

  // Face (FAC) - Questions 9, 24, 49
  { id: 9, text: "It is important to them that no one should ever shame them.", value_code: "FAC" },
  { id: 24, text: "It is important to them to protect their public image.", value_code: "FAC" },
  { id: 49, text: "It is important to them never to be humiliated.", value_code: "FAC" },

  // Stimulation (ST) - Questions 10, 28, 43
  { id: 10, text: "It is important to them always to look for different things to do.", value_code: "ST" },
  { id: 28, text: "It is important to them to take risks that make life exciting.", value_code: "ST" },
  { id: 43, text: "It is important to them to have all sorts of new experiences.", value_code: "ST" },

  // Benevolence Care (BEC) - Questions 11, 25, 47
  { id: 11, text: "It is important to them to take care of people they are close to.", value_code: "BEC" },
  { id: 25, text: "It is very important to them to help the people dear to them.", value_code: "BEC" },
  { id: 47, text: "It is important to them to concern themselves with every need of their dear ones.", value_code: "BEC" },

  // Power Resources (POR) - Questions 12, 20, 44
  { id: 12, text: "It is important to them to have the power that money can bring.", value_code: "POR" },
  { id: 20, text: "It is important to them to be wealthy.", value_code: "POR" },
  { id: 44, text: "It is important to them to own expensive things that show their wealth.", value_code: "POR" },

  // Security Personal (SEP) - Questions 13, 26, 53
  { id: 13, text: "It is very important to them to avoid disease and protect their health.", value_code: "SEP" },
  { id: 26, text: "It is important to them to be personally safe and secure.", value_code: "SEP" },
  { id: 53, text: "It is important to them to avoid anything dangerous.", value_code: "SEP" },

  // Universalism Tolerance (UNT) - Questions 14, 34, 57
  { id: 14, text: "It is important to them to be tolerant toward all kinds of people and groups.", value_code: "UNT" },
  { id: 34, text: "It is important to them to listen to and understand people who are different from them.", value_code: "UNT" },
  { id: 57, text: "It is important to them to accept people even when they disagree with them.", value_code: "UNT" },

  // Conformity Rules (COR) - Questions 15, 31, 42
  { id: 15, text: "It is important to them never to violate rules or regulations.", value_code: "COR" },
  { id: 31, text: "It is important to them to follow rules even when no-one is watching.", value_code: "COR" },
  { id: 42, text: "It is important to them to obey all the laws.", value_code: "COR" },

  // Self-Direction Action (SDA) - Questions 16, 30, 56
  { id: 16, text: "It is important to them to make their own decisions about their life.", value_code: "SDA" },
  { id: 30, text: "It is important to them to plan their activities independently.", value_code: "SDA" },
  { id: 56, text: "It is important to them to be free to choose what they do by themselves.", value_code: "SDA" },

  // Achievement (AC) - Questions 17, 32, 48
  { id: 17, text: "It is important to them to have ambitions in life.", value_code: "AC" },
  { id: 32, text: "It is important to them to be very successful.", value_code: "AC" },
  { id: 48, text: "It is important to them that people recognize what they achieve.", value_code: "AC" },

  // Tradition (TR) - Questions 18, 33, 40
  { id: 18, text: "It is important to them to maintain traditional values and ways of thinking.", value_code: "TR" },
  { id: 33, text: "It is important to them to follow their family's customs or the customs of a religion.", value_code: "TR" },
  { id: 40, text: "It is important to them to honor the traditional practices of their culture.", value_code: "TR" },

  // Benevolence Dependability (BED) - Questions 19, 27, 55
  { id: 19, text: "It is important to them that people they know have full confidence in them.", value_code: "BED" },
  { id: 27, text: "It is important to them to be a dependable and trustworthy friend.", value_code: "BED" },
  { id: 55, text: "It is important to them that all their friends and family can rely on them completely.", value_code: "BED" }
];

// Placeholder for VALUE_DATA (or import if possible and safe for client component)
const TEMP_VALUE_DATA_FOR_DISPLAY = {
  UN: { name: 'Universalism' }, BE: { name: 'Benevolence' }, TR: { name: 'Tradition' }, CO: { name: 'Conformity' }, SE: { name: 'Security' }, PO: { name: 'Power' }, AC: { name: 'Achievement' }, HE: { name: 'Hedonism' }, ST: { name: 'Stimulation' }, SD: { name: 'Self-Direction' },
};

// Simple display for reasoning - always shows question, response, and reasoning
const ReasoningAccordionItem = ({
  questionNumber,
  questionText,
  score,
  manualScore, // Add manual score prop
  rawReasoning, // Pass the raw reasoning string here
  confidence, // Pass the confidence score from props
  highlightedSections,
  onToggleSectionHighlight,
  onRegenerate,
  isRegenerating,
}: {
  questionNumber: number;
  questionText: string;
  score: number;
  manualScore?: number; // Add manual score to props type
  rawReasoning: string;
  confidence?: number;
  highlightedSections: Set<string>;
  onToggleSectionHighlight: (questionId: number, sectionType: string) => void;
  onRegenerate?: (questionId: number) => void;
  isRegenerating?: boolean;
}) => {
  const hasError = rawReasoning?.toLowerCase().includes('error');
  // Parse the enhanced response format
  const parseEnhancedResponse = (response: string) => {
    const parts = response.split('\n\n');
    let naturalResponse = '';
    let reasoning = '';
    let confidence = null;
    let thinkingSummary = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part.startsWith('Reasoning: ')) {
        reasoning = part.replace('Reasoning: ', '').trim();
      } else if (part.startsWith('Confidence: ')) {
        const confidenceStr = part.replace('Confidence: ', '').trim();
        confidence = parseFloat(confidenceStr);
      } else if (part.startsWith('Thinking Summary: ')) {
        thinkingSummary = part.replace('Thinking Summary: ', '').trim();
      } else if (i === 0 && !part.startsWith('Error') && !part.startsWith('Default')) {
        naturalResponse = part.trim();
      }
    }

    return { naturalResponse, reasoning, confidence, thinkingSummary };
  };

  const { naturalResponse, reasoning, confidence: parsedConfidence, thinkingSummary } = parseEnhancedResponse(rawReasoning);

  // Use confidence from props if available, otherwise use parsed confidence
  const finalConfidence = confidence !== undefined ? confidence : parsedConfidence;

  // Helper function to check if a section is highlighted
  const isSectionHighlighted = (sectionType: string) => {
    return highlightedSections.has(`${questionNumber}-${sectionType}`);
  };

  // Calculate score comparison
  const getScoreComparison = () => {
    if (manualScore === undefined) return null;

    const difference = Math.abs(score - manualScore);
    const isSimilar = difference <= 1;

    return {
      difference,
      isSimilar,
      label: isSimilar ? 'SIMILAR' : 'DIFFERENT'
    };
  };

  const scoreComparison = getScoreComparison();

  // Show loading state when regenerating
  if (isRegenerating) {
    return (
      <div className="border rounded-lg mb-2 sm:mb-3 overflow-hidden border-blue-300 bg-blue-50/50">
        <div className="p-2 sm:p-3">
          {/* Question Header */}
          <div className="mb-2 sm:mb-3 flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <span className="font-semibold text-indigo-700 text-xs sm:text-sm">Q{questionNumber}:</span>
              <span className="ml-1 sm:ml-2 text-gray-700 text-xs sm:text-sm leading-relaxed">{questionText}</span>
            </div>
            <div className="px-1.5 sm:px-2 py-0.5 sm:py-1 text-xs rounded bg-blue-500 text-white flex items-center gap-1 flex-shrink-0">
              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
              <span className="hidden sm:inline">Regenerating...</span>
            </div>
          </div>

          {/* Loading placeholder */}
          <div className="p-3 sm:p-4 rounded border-l-4 border-blue-400 bg-blue-100/50 flex flex-col items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-blue-600 mb-2 sm:mb-3"></div>
            <p className="text-blue-700 text-xs sm:text-sm font-medium">Regenerating...</p>
            <p className="text-blue-600 text-xs mt-1 hidden sm:block">Analyzing chat history</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`border rounded-lg mb-2 sm:mb-3 overflow-hidden ${hasError ? 'border-amber-300 bg-amber-50/30' : 'border-gray-200 bg-white'}`}>
      <div className="p-2 sm:p-3">
        {/* Question Header */}
        <div className="mb-2 sm:mb-3 flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <span className="font-semibold text-indigo-700 text-xs sm:text-sm">Q{questionNumber}:</span>
            <span className="ml-1 sm:ml-2 text-gray-700 text-xs sm:text-sm leading-relaxed">{questionText}</span>
          </div>
          {onRegenerate && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRegenerate(questionNumber);
              }}
              disabled={isRegenerating}
              className={`px-1.5 sm:px-2 py-0.5 sm:py-1 text-xs rounded transition-colors flex-shrink-0 ${hasError
                ? 'bg-amber-500 hover:bg-amber-600 text-white'
                : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                } disabled:opacity-50`}
              title={hasError ? "Regenerate this failed prediction" : "Regenerate this prediction"}
            >
              ↻
            </button>
          )}
        </div>

        {/* AI Response with Score Comparison */}
        <div
          className={`p-2 sm:p-3 rounded border-l-4 border-blue-300 mb-3 cursor-pointer transition-colors ${isSectionHighlighted('response') ? 'bg-yellow-200' : 'bg-blue-50 hover:bg-blue-100'}`}
          onClick={() => onToggleSectionHighlight(questionNumber, 'response')}
          title="Click to highlight this AI response"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2 mb-2">
            <div className="flex flex-wrap items-center gap-1 sm:gap-2">
              <p className="font-medium text-blue-800 text-xs">AI Response:</p>
              <span className="text-xs px-1.5 sm:px-2 py-0.5 bg-blue-100 text-blue-700 rounded font-medium">
                AI: {score}
              </span>
              {manualScore !== undefined && (
                <>
                  <span className="text-xs px-1.5 sm:px-2 py-0.5 bg-gray-100 text-gray-700 rounded font-medium">
                    Manual: {manualScore}
                  </span>
                  <span className={`text-xs px-1.5 sm:px-2 py-0.5 rounded font-medium ${scoreComparison?.isSimilar
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-700'
                    }`}>
                    {scoreComparison?.label}
                  </span>
                </>
              )}
            </div>
            {finalConfidence !== null && finalConfidence !== undefined && (
              <div className="flex items-center gap-1">
                <span className="text-xs text-blue-600 font-medium">Confidence:</span>
                <span className={`text-xs px-1.5 sm:px-2 py-0.5 rounded-full font-medium ${finalConfidence < 0.2 ? 'bg-red-100 text-red-700' :
                  finalConfidence > 0.8 ? 'bg-green-100 text-green-700' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>
                  {(finalConfidence * 100).toFixed(0)}%
                </span>
              </div>
            )}
          </div>
          <p className="text-blue-700 text-xs sm:text-sm italic">
            "{naturalResponse || rawReasoning.split('\n\n')[0] || `Generated score: ${score}`}"
          </p>
        </div>

        {/* AI Reasoning - Always visible */}
        {reasoning && (
          <div
            className={`p-2 sm:p-3 rounded border-l-4 border-green-300 cursor-pointer transition-colors ${isSectionHighlighted('reasoning') ? 'bg-yellow-200' : 'bg-green-50 hover:bg-green-100'}`}
            onClick={() => onToggleSectionHighlight(questionNumber, 'reasoning')}
            title="Click to highlight this reasoning"
          >
            <p className="font-medium text-green-800 text-xs mb-1 sm:mb-2">🧠 AI Reasoning:</p>
            <p className="text-green-700 text-xs sm:text-sm leading-relaxed">{reasoning}</p>
          </div>
        )}

        {thinkingSummary && (
          <div
            className={`mt-2 sm:mt-3 p-2 sm:p-3 rounded border-l-4 border-purple-300 cursor-pointer transition-colors ${isSectionHighlighted('thinking') ? 'bg-yellow-200' : 'bg-purple-50 hover:bg-purple-100'}`}
            onClick={() => onToggleSectionHighlight(questionNumber, 'thinking')}
            title="Click to highlight this thinking summary"
          >
            <p className="font-medium text-purple-800 text-xs mb-1 sm:mb-2">💭 Thinking Summary:</p>
            <p className="text-purple-700 text-xs sm:text-sm leading-relaxed">{thinkingSummary}</p>
          </div>
        )}

        {!reasoning && !thinkingSummary && (
          <div
            className={`p-3 rounded border-l-4 border-green-300 cursor-pointer transition-colors ${isSectionHighlighted('reasoning') ? 'bg-yellow-200' : 'bg-green-50 hover:bg-green-100'}`}
            onClick={() => onToggleSectionHighlight(questionNumber, 'reasoning')}
            title="Click to highlight this reasoning"
          >
            <p className="font-medium text-green-800 text-xs mb-2">🧠 AI Reasoning:</p>
            <p className="text-green-700 text-sm leading-relaxed">{rawReasoning}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default function SurveyPage() {
  const { user, isLoading: authLoading } = useAuth(); // Get user and auth loading state
  const router = useRouter();
  const demoData = useDemoData();
  const pillVisible = useScrollDirection();
  const [valuesBibtexCopied, setValuesBibtexCopied] = useState(false);
  const [initialAuthCheckComplete, setInitialAuthCheckComplete] = useState(false);

  // Redirect to setup if Supabase isn't configured (skip in demo mode)
  useEffect(() => {
    if (!isDemoMode && !isSupabaseConfigured()) {
      router.push('/setup');
    }
  }, [router]);

  // State for Manual Survey Results
  const [manualSurveyData, setManualSurveyData] = useState<ProcessedValueResult[] | null>(null);
  const [manualSurveyRawAnswers, setManualSurveyRawAnswers] = useState<Record<number, number> | null>(null); // Add raw answers state
  const [isLoadingManualSurvey, setIsLoadingManualSurvey] = useState(false);
  const [showManualInOverlay, setShowManualInOverlay] = useState(true);

  // State for LLM Predictions
  const [llmData, setLlmData] = useState<ProcessedValueResult[] | null>(null);
  const [llmReasoning, setLlmReasoning] = useState<IndividualReasoningItem[] | null>(null);
  const [isLoadingLlm, setIsLoadingLlm] = useState(false);
  const [llmError, setLlmError] = useState<string | null>(null);
  const [showLlmInOverlay, setShowLlmInOverlay] = useState(true);

  // API Key state for self-service users
  const [hasGeminiKey, setHasGeminiKey] = useState(false);

  // Check if server requires users to provide their own API keys
  // Default: false (server covers API costs using GEMINI_API_KEY)
  // Set NEXT_PUBLIC_REQUIRE_USER_API_KEYS=true for public demos where users provide their own keys
  const requireUserApiKeys = process.env.NEXT_PUBLIC_REQUIRE_USER_API_KEYS === 'true';

  // Check for user-provided API keys
  useEffect(() => {
    setHasGeminiKey(hasApiKey('geminiApiKey'));
  }, []);

  // Helper to check if user can generate surveys
  // If requireUserApiKeys is false (default), everyone can use AI features (server key is used)
  // If requireUserApiKeys is true, users need their own API key OR special permissions
  const canGenerateSurveys = requireUserApiKeys
    ? (user?.canGenerateSurveys || user?.isAdmin || hasGeminiKey)
    : true;

  // Confidence filtering state
  const [confidenceFilterEnabled, setConfidenceFilterEnabled] = useState(false);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.5);

  // Highlighted reasoning sections state (temporary, resets on page refresh)
  const [highlightedSections, setHighlightedSections] = useState<Set<string>>(new Set());

  // Toggle highlight for specific sections
  const toggleSectionHighlight = (questionId: number, sectionType: string) => {
    const sectionKey = `${questionId}-${sectionType}`;
    setHighlightedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sectionKey)) {
        newSet.delete(sectionKey);
      } else {
        newSet.add(sectionKey);
      }
      return newSet;
    });
  };

  // Stage 3 Modal State (was Stage 2 - Persona Embodiment)
  const [showStage2Modal, setShowStage2Modal] = useState(false);
  const [stage2Results, setStage2Results] = useState<any[] | null>(null);

  // Stage 3 Modal State (was Stage 1 - Chart Evaluation)
  const [showStage3Modal, setShowStage3Modal] = useState(false);
  const [stage3Selection, setStage3Selection] = useState<string[] | null>(null);

  // Chart Evaluation State
  const [chartEvaluationData, setChartEvaluationData] = useState<ChartEvaluationData | null>(null);
  const [isGeneratingCharts, setIsGeneratingCharts] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<GenerationProgress | null>(null);
  const [chartsReady, setChartsReady] = useState(false);
  const [hasCheckedExistingData, setHasCheckedExistingData] = useState(false);

  // Stage 0 Modal State (Training)
  const [showStage0Modal, setShowStage0Modal] = useState(false);
  const [hasCompletedStage0, setHasCompletedStage0] = useState(false);

  // Retake Survey State
  const [showRetakeSurvey, setShowRetakeSurvey] = useState(false);

  // Survey page tab navigation — initialised from ?tab= query param if present
  const [activeSurveyTab, setActiveSurveyTab] = useState<'survey' | 'topics' | 'personas' | 'evaluation'>('survey');
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    const valid = ['survey', 'topics', 'personas', 'evaluation'] as const;
    if (valid.includes(t as (typeof valid)[number])) {
      setActiveSurveyTab(t as (typeof valid)[number]);
    }
  }, []);

  // Stage 2 Values Graph Modal State
  const [showValuesGraphModal, setShowValuesGraphModal] = useState(false);

  // Stage 2 Values Graph Processing State
  const [isProcessingValuesGraph, setIsProcessingValuesGraph] = useState(false);
  const [valuesGraphProgress, setValuesGraphProgress] = useState<{ current: number; total: number; message: string } | null>(null);
  const [valuesGraphStatus, setValuesGraphStatus] = useState<{
    totalWindows: number;
    processedWindows: number;
    unprocessedWindows: number;
    isChecking: boolean;
  }>({ totalWindows: 0, processedWindows: 0, unprocessedWindows: 0, isChecking: false });

  // Stage 3 Pre-generation State (was Stage 2)
  const [isStage2PreGenerating, setIsStage2PreGenerating] = useState(false);
  const [stage2PreGenProgress, setStage2PreGenProgress] = useState<{ progress: number; message: string } | null>(null);
  const [isStage2PreGenComplete, setIsStage2PreGenComplete] = useState(false);
  const [stage2PreGenError, setStage2PreGenError] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  // Stage 3 Validation State (was Stage 2)
  const [stage2ValidationStatus, setStage2ValidationStatus] = useState({
    hasUser: false,
    hasSurvey: false,
    hasChatHistory: false,
    hasWvsScenarios: false,
    hasPreGenerated: false,
    isValidating: false
  });

  // Secret bypass for testing/pre-generation
  const [bypassSurvey, setBypassSurvey] = useState(false);

  // Load existing manual survey responses for the user
  const loadManualSurvey = useCallback(async () => {
    // Demo mode: load from pre-fetched JSON
    if (isDemoMode && demoData?.pvqResponses?.length) {
      setIsLoadingManualSurvey(true);
      const data = demoData.pvqResponses[0] as Record<string, unknown>;
      const rawAnswers: Record<number, number> = {};
      for (let i = 1; i <= 57; i++) {
        const val = data[`q${i}`];
        if (val !== undefined && val !== null) rawAnswers[i] = Number(val);
      }
      const allPresent = Object.keys(rawAnswers).length === 57;
      if (allPresent) {
        setManualSurveyData(processRawScoresForManualSurvey(rawAnswers));
        setManualSurveyRawAnswers(rawAnswers);
      }
      setIsLoadingManualSurvey(false);
      return;
    }

    if (user?.id) {
      setIsLoadingManualSurvey(true);
      const supabase = createClient();
      const { data, error } = await supabase
        .from('user_pvq_responses')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (data) {
        const rawAnswers: Record<number, number> = {};
        let allNumericQuestionsPresent = true;
        for (let i = 1; i <= 57; i++) { // Updated for PVQ-RR with 57 questions
          if (data[`q${i}`] !== undefined && data[`q${i}`] !== null) {
            rawAnswers[i] = data[`q${i}`];
          } else {
            allNumericQuestionsPresent = false; break;
          }
        }

        // Also check if the user-generated questions have been filled
        const allTextQuestionsPresent =
          data.user_generated_q1 && data.user_generated_q1.trim() !== '' &&
          data.user_generated_q2 && data.user_generated_q2.trim() !== '' &&
          data.user_generated_q3 && data.user_generated_q3.trim() !== '';

        if (allNumericQuestionsPresent && allTextQuestionsPresent) {
          // Only consider survey complete if ALL questions are answered
          setManualSurveyData(processRawScoresForManualSurvey(rawAnswers));
          setManualSurveyRawAnswers(rawAnswers); // Store raw answers
        } else {
          // If any part is incomplete, force user to the survey form
          setManualSurveyData(null);
          setManualSurveyRawAnswers(null); // Clear raw answers if survey is incomplete
        }

      } else if (error && error.code !== 'PGRST116') {
        console.error("Error loading manual survey data:", error);
      }
      setIsLoadingManualSurvey(false);
    }
  }, [user?.id, demoData]);

  // Load existing LLM predictions
  const loadLlmPredictions = useCallback(async () => {
    // Demo mode: load from pre-fetched JSON
    if (isDemoMode && demoData?.llmIndividualResponses?.length) {
      const indivData = demoData.llmIndividualResponses[0] as Record<string, unknown>;
      const rawAnswers: Record<number, number> = {};
      const rawResponses: IndividualReasoningItem[] = [];
      for (let i = 1; i <= 57; i++) {
        const score = indivData[`q${i}`];
        const storedResponse = (indivData.raw_responses as Record<string, string>)?.[`q${i}`];
        if (score !== undefined && score !== null && storedResponse) {
          rawAnswers[i] = Number(score);
          const confidenceMatch = String(storedResponse).match(/Confidence:\s*([0-9.]+)/);
          rawResponses.push({
            questionId: i,
            questionText: `Question ${i}`,
            response: storedResponse,
            score: Number(score),
            confidence: confidenceMatch ? parseFloat(confidenceMatch[1]) : undefined,
          });
        }
      }
      if (Object.keys(rawAnswers).length > 0) {
        const processedResults = processRawScoresForManualSurvey(rawAnswers);
        setLlmData(processedResults);
        setLlmReasoning(rawResponses);
      }
      return;
    }

    if (!user?.id) return;

    // Load individual predictions
    try {
      const supabase = createClient();
      const { data: individualData, error: individualError } = await supabase
        .from('user_llm_individual_responses')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (individualData && !individualError) {
        console.log('[Survey Page] RAW DB DATA:', {
          user_id: individualData.user_id,
          prompt_metadata: individualData.prompt_metadata,
          raw_responses_keys: Object.keys(individualData.raw_responses || {}),
          q1: individualData.q1,
          q2: individualData.q2,
          q3: individualData.q3,
          q4: individualData.q4,
          q5: individualData.q5,
        });

        // Convert to raw answers format
        const rawAnswers: Record<number, number> = {};
        const rawResponses: IndividualReasoningItem[] = [];
        let errorCount = 0;
        let nullCount = 0;
        const loadedQuestions: number[] = [];
        const errorQuestions: number[] = [];
        const nullQuestions: number[] = [];

        for (let i = 1; i <= 57; i++) {
          const score = individualData[`q${i}`];
          const storedResponse = individualData.raw_responses?.[`q${i}`];

          if (score && storedResponse) {
            rawAnswers[i] = score;
            loadedQuestions.push(i);

            // Try to extract confidence from the response if it exists
            let confidence: number | undefined = undefined;
            const confidenceMatch = storedResponse.match(/Confidence:\s*([0-9.]+)/);
            if (confidenceMatch) {
              confidence = parseFloat(confidenceMatch[1]);
            }

            // Track errors for logging
            if (storedResponse.toLowerCase().includes('error')) {
              errorCount++;
              errorQuestions.push(i);
            }

            rawResponses.push({
              questionId: i,
              questionText: `Question ${i}`,
              response: storedResponse,
              score: score,
              confidence: confidence
            });
          } else {
            nullCount++;
            nullQuestions.push(i);
          }
        }

        const completedCount = Object.keys(rawAnswers).length;
        console.log(`[Survey Page] Found individual LLM predictions: ${completedCount}/57 complete, ${errorCount} with errors, ${nullCount} null/missing`);
        console.log(`[Survey Page] Loaded questions: ${loadedQuestions.join(', ')}`);
        if (errorQuestions.length > 0) {
          console.log(`[Survey Page] Error questions: ${errorQuestions.join(', ')}`);
        }
        if (nullQuestions.length > 0 && nullQuestions.length <= 20) {
          console.log(`[Survey Page] Null questions: ${nullQuestions.join(', ')}`);
        }

        // Load whatever data exists (don't require all 57!)
        // This allows partial results to be displayed and regenerated
        if (completedCount > 0) {
          const processedResults = processRawScoresForManualSurvey(rawAnswers);
          setLlmData(processedResults);
          setLlmReasoning(rawResponses);
          console.log('[Survey Page] Successfully loaded existing LLM predictions (partial data allowed)');
        }
      } else if (individualError) {
        console.log('[Survey Page] Error loading individual predictions:', individualError);
      } else {
        console.log('[Survey Page] No individual prediction data found in database');
      }
    } catch (error) {
      console.error('[Survey Page] Error loading individual LLM predictions:', error);
    }


  }, [user?.id, demoData]);

  useEffect(() => {
    if (!authLoading) {
      setInitialAuthCheckComplete(true);
      if (user?.id) {
        // Reset the check flag when user changes or page loads
        setHasCheckedExistingData(false);
        setChartsReady(false);
        setChartEvaluationData(null);

        loadManualSurvey();
        loadLlmPredictions();
        checkAndGenerateChartEvaluation();
      }
    }
  }, [authLoading, user?.id, loadManualSurvey, loadLlmPredictions]);

  // Function to filter LLM data by confidence
  const getFilteredLlmData = (): ProcessedValueResult[] | null => {
    if (!llmData || !confidenceFilterEnabled) {
      return llmData;
    }

    if (!llmReasoning) {
      return llmData; // No confidence data available, return all
    }

    // Create a map of questionId to confidence scores
    const confidenceMap = new Map<number, number>();
    llmReasoning.forEach(item => {
      if (item.confidence !== undefined) {
        confidenceMap.set(item.questionId, item.confidence);
      }
    });

    // If no confidence data exists, return all data
    if (confidenceMap.size === 0) {
      return llmData;
    }

    // We need to filter based on individual question confidence, but our data is aggregated by value
    // For each value, we'll average the confidence of its component questions and filter based on that

    return llmData.filter(valueResult => {
      // Find questions that contribute to this value
      const questionsForValue = PVQ_QUESTIONS_FOR_DISPLAY.filter((q: { id: number; text: string; value_code: string }) => q.value_code === valueResult.value);

      if (questionsForValue.length === 0) {
        return true; // Keep if we can't find questions (shouldn't happen)
      }

      // Calculate average confidence for this value
      const confidences = questionsForValue
        .map((q: { id: number; text: string; value_code: string }) => confidenceMap.get(q.id))
        .filter((conf: number | undefined): conf is number => conf !== undefined);

      if (confidences.length === 0) {
        return true; // Keep if no confidence data for any questions
      }

      const averageConfidence = confidences.reduce((sum, conf) => sum + conf, 0) / confidences.length;
      return averageConfidence >= confidenceThreshold;
    });
  };

  // Check for existing chart evaluation data or generate it
  const checkAndGenerateChartEvaluation = useCallback(async () => {
    // Demo mode: load chart & stage2 data from pre-fetched JSON
    if (isDemoMode && demoData) {
      if (!hasCheckedExistingData) {
        if (demoData.stage1Experiment?.length) {
          const chartData = demoData.stage1Experiment[0] as unknown as ChartEvaluationData;
          setChartEvaluationData(chartData);
          if (chartData.charts_generated) {
            setChartsReady(true);
          }
          if (chartData.all_rounds_completed) {
            const chartIdToLabel: Record<string, string> = {
              'manual': 'Your Manual Survey', 'llm': 'LLM Prediction',
              'llm-batch': 'LLM Batch Prediction',
              'llm-individual': 'LLM Individual Prediction',
              'anti-manual': 'Anti-Person (Opposite of You)',
              'anti-batch': 'Anti-Batch (Opposite)', 'anti-individual': 'Anti-Individual (Opposite)'
            };
            const rounds: string[] = [];
            if (chartData.round_1_completed && chartData.round_1_winner) {
              rounds.push(`Round 1 Winner: ${chartIdToLabel[chartData.round_1_winner] || chartData.round_1_winner}`);
            }
            if (chartData.round_2_completed && chartData.round_2_winner) {
              rounds.push(`Round 2 Winner: ${chartIdToLabel[chartData.round_2_winner] || chartData.round_2_winner}`);
            }
            if (chartData.round_3_completed && chartData.round_3_winner) {
              rounds.push(`Round 3 Winner: ${chartIdToLabel[chartData.round_3_winner] || chartData.round_3_winner}`);
            }
            if (rounds.length > 0) setStage3Selection(rounds);
          }
        }
        if (demoData.stage2Experiment?.length) {
          setStage2Results(demoData.stage2Experiment);
        }
        setHasCheckedExistingData(true);
      }
      return;
    }

    if (!user?.id || hasCheckedExistingData) return;

    try {
      console.log('[Survey Page] Checking for existing chart evaluation data...');

      // Check if chart evaluation data already exists
      const existingData = await getChartEvaluationData(user.id);

      if (existingData.success && existingData.data) {
        console.log('[Survey Page] Found existing chart evaluation data:', {
          charts_generated: existingData.data.charts_generated,
          all_rounds_completed: existingData.data.all_rounds_completed,
          rounds_available: {
            round_1: !!existingData.data.round_1_manual_data,
            round_2: !!existingData.data.round_2_llm_data,
          }
        });

        setChartEvaluationData(existingData.data);

        if (existingData.data.charts_generated) {
          // Check if the charts are actually complete before marking as ready
          const hasComplete = hasCompleteChartData(existingData.data);
          setChartsReady(hasComplete);
          console.log('[Survey Page] Charts marked as generated:', {
            charts_generated: true,
            is_complete: hasComplete,
            chartsReady: hasComplete
          });
        }

        // Update Stage 3 selection if already completed (was Stage 1)
        if (existingData.data.all_rounds_completed) {
          const completedRounds: string[] = [];

          // Create a mapping for better labels
          const chartIdToLabel: Record<string, string> = {
            'manual': 'Your Manual Survey',
            'llm': 'LLM Prediction',
            'llm-batch': 'LLM Batch Prediction',
            'llm-individual': 'LLM Individual Prediction',
            'anti-manual': 'Anti-Person (Opposite of You)',
            'anti-llm': 'Anti-LLM (Opposite)',
            'anti-batch': 'Anti-Batch (Opposite)',
            'anti-individual': 'Anti-Individual (Opposite)'
          };

          if (existingData.data.round_1_completed && existingData.data.round_1_winner) {
            const winnerLabel = chartIdToLabel[existingData.data.round_1_winner] || existingData.data.round_1_winner;
            completedRounds.push(`Round 1 Winner: ${winnerLabel}`);
          }
          if (existingData.data.round_2_completed && existingData.data.round_2_winner) {
            const winnerLabel = chartIdToLabel[existingData.data.round_2_winner] || existingData.data.round_2_winner;
            completedRounds.push(`Round 2 Winner: ${winnerLabel}`);
          }
          if (existingData.data.round_3_completed && existingData.data.round_3_winner) {
            const winnerLabel = chartIdToLabel[existingData.data.round_3_winner] || existingData.data.round_3_winner;
            completedRounds.push(`Round 3 Winner: ${winnerLabel}`);
          }


          if (completedRounds.length > 0) {
            setStage3Selection(completedRounds);
            console.log('[Survey Page] Restored Stage 3 completion status');
          }
        }
      } else {
        console.log('[Survey Page] No existing chart evaluation data found');
      }

    } catch (error) {
      console.error('[Survey Page] Error checking chart evaluation data:', error);
    } finally {
      setHasCheckedExistingData(true);
      console.log('[Survey Page] Finished checking existing data');
    }
  }, [user?.id, hasCheckedExistingData, demoData]);

  // Helper function to check if chart evaluation data has all required rounds
  const hasCompleteChartData = (data: any) => {
    return data?.charts_generated &&
      data?.round_1_manual_data &&
      data?.round_2_llm_data &&
      data?.round_1_anti_manual_data &&
      data?.round_2_anti_llm_data;
  };

  // Simplified chart generation logic - Stage 3 only requires LLM data
  const hasRequiredData = !!llmData;
  const hasCompleteCharts = chartsReady && hasCompleteChartData(chartEvaluationData);
  const hasIncompleteCharts = chartEvaluationData?.charts_generated && !hasCompleteCharts;

  // Determine UI state
  const showGenerateButton = hasRequiredData && !chartEvaluationData?.charts_generated && !isGeneratingCharts;
  const showRegenerateButton = hasRequiredData && hasIncompleteCharts && !isGeneratingCharts;
  const showStage3Button = hasCompleteCharts && !isGeneratingCharts;

  // Enhanced chart generation with force regenerate option
  const generateChartEvaluationDataForced = useCallback(async (forceRegenerate = false) => {
    if (!user?.id || !llmData || isGeneratingCharts) return;

    console.log(`[Survey Page] Starting chart generation${forceRegenerate ? ' (forced regeneration)' : ''}`);
    setIsGeneratingCharts(true);
    setGenerationProgress({ step: 'Starting', progress: 0, message: 'Preparing chart generation...' });

    try {
      if (forceRegenerate) {
        // Clear existing data to force regeneration
        setChartEvaluationData(null);
        setChartsReady(false);
      }

      // Use filtered LLM data if confidence filtering is enabled for chart generation
      const llmDataForCharts = getFilteredLlmData() || llmData;

      // Get user's API key if they provided one
      const userKeys = getStoredApiKeys();
      const userApiKey = userKeys.geminiApiKey;

      const result = await generateAndStoreAllCharts(
        user.id,
        manualSurveyData || undefined,
        undefined, // No batch data
        llmDataForCharts || undefined,
        setGenerationProgress,
        forceRegenerate,
        userApiKey
      );

      if (result.success && result.data) {
        console.log('[Survey Page] Chart evaluation data generated successfully');
        setChartEvaluationData(result.data);
        const isComplete = hasCompleteChartData(result.data);
        setChartsReady(isComplete);
        console.log('[Survey Page] Setting chartsReady to:', isComplete);
      } else {
        console.error('[Survey Page] Failed to generate chart evaluation data:', result.error);
      }
    } catch (error) {
      console.error('[Survey Page] Error generating chart evaluation data:', error);
    } finally {
      setIsGeneratingCharts(false);
      setGenerationProgress(null);
    }
  }, [user?.id, llmData, isGeneratingCharts]);

  // Manual chart generation handler  
  const handleGenerateCharts = async () => {
    console.log('[Survey Page] User clicked Generate Anti-Charts, starting fresh generation...');
    await generateChartEvaluationDataForced(false); // false = first time generation
  };

  // Chart regeneration handler
  const handleRegenerateCharts = async () => {
    console.log('[Survey Page] User clicked Regenerate Charts, forcing complete regeneration...');
    await generateChartEvaluationDataForced(true); // true = force regeneration
  };

  const handlePredictPVQ = async () => {
    if (!user?.id) {
      alert('Please log in to use the PVQ prediction feature.');
      return;
    }

    if (!manualSurveyData && !bypassSurvey) {
      alert('Please complete the manual survey first before generating predictions.');
      return;
    }

    setIsLoadingLlm(true);
    setLlmError(null);
    setLlmData(null);
    setLlmReasoning(null);
    setShowLlmInOverlay(true);

    try {
      console.log('[Survey Page] Starting LLM PVQ prediction (force regenerate)...');

      // Get user's API key if they provided one
      const userKeys = getStoredApiKeys();
      const userApiKey = userKeys.geminiApiKey;

      const result: IndividualPredictionResult = await predictIndividualPVQFromUserChats(
        user.id,
        true, // Force regenerate
        undefined, // logger
        userApiKey // Pass user's API key
      );

      if (result.success && result.data) {
        console.log('[Survey Page] LLM prediction successful:', result.data);
        setLlmData(result.data.processedResults);
        setLlmReasoning(result.data.rawResponses);

        // Reset chart evaluation to trigger regeneration with new data
        if (chartEvaluationData?.charts_generated) {
          console.log('[Survey Page] Clearing existing chart data to regenerate with new LLM prediction');
          setChartEvaluationData(null);
          setChartsReady(false);
        }
      } else {
        throw new Error(result.error || 'Failed to generate LLM predictions');
      }
    } catch (error) {
      console.error("Error during prediction:", error);
      const errorMsg = error instanceof Error ? error.message : 'An unexpected error occurred while trying to predict PVQ scores.';
      setLlmError(errorMsg);
    }
    setIsLoadingLlm(false);
  };

  // State for tracking which questions are being regenerated (supports multiple)
  const [regeneratingQuestionIds, setRegeneratingQuestionIds] = useState<Set<number>>(new Set());

  // Handler for regenerating only failed predictions with parallel processing
  const handleRegenerateFailedOnly = async () => {
    if (!user || !llmReasoning) return;

    setLlmError(null);

    // Find failed questions
    const failedQuestions = llmReasoning.filter((r: IndividualReasoningItem) =>
      r.response?.toLowerCase().includes('error')
    );

    if (failedQuestions.length === 0) {
      console.log('[Survey Page] No failed predictions to regenerate');
      return;
    }

    const failedQuestionIds = failedQuestions.map(r => r.questionId);
    console.log(`[Survey Page] Starting parallel regeneration of ${failedQuestionIds.length} failed predictions: ${failedQuestionIds.join(', ')}`);

    // Mark all failed questions as regenerating
    setRegeneratingQuestionIds(new Set(failedQuestionIds));

    const existingResponses = llmReasoning.map((r: IndividualReasoningItem) => ({
      questionId: r.questionId,
      response: r.response,
      score: r.score
    }));

    // Process questions in parallel with staggered starts (every 5 seconds)
    const regenerateQuestion = async (questionId: number) => {
      try {
        console.log(`[Survey Page] Starting regeneration for Q${questionId}`);
        const result = await regenerateSinglePrediction(user.id, questionId, existingResponses);

        if (result.success && result.data) {
          console.log(`[Survey Page] Q${questionId} regenerated successfully`);

          // Update this specific question immediately
          const updatedQuestion = result.data.rawResponses.find(r => r.questionId === questionId);
          if (updatedQuestion) {
            setLlmReasoning((prev: IndividualReasoningItem[] | null) => {
              if (!prev) return prev;
              return prev.map((r: IndividualReasoningItem) =>
                r.questionId === questionId
                  ? {
                    ...r,
                    response: updatedQuestion.response,
                    score: updatedQuestion.score,
                    confidence: (updatedQuestion as any).confidence
                  }
                  : r
              );
            });
          }
        }
      } catch (error) {
        console.error(`[Survey Page] Error regenerating Q${questionId}:`, error);
      } finally {
        // Remove from regenerating set
        setRegeneratingQuestionIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(questionId);
          return newSet;
        });
      }
    };

    // Start regeneration with staggered intervals (5 seconds apart)
    const promises: Promise<void>[] = [];
    for (let i = 0; i < failedQuestionIds.length; i++) {
      const questionId = failedQuestionIds[i];
      // Stagger starts by 5 seconds each
      const delayMs = i * 5000;
      promises.push(
        new Promise<void>(resolve => {
          setTimeout(async () => {
            await regenerateQuestion(questionId);
            resolve();
          }, delayMs);
        })
      );
    }

    // Wait for all to complete
    await Promise.all(promises);

    console.log('[Survey Page] All parallel regenerations completed');

    // Recalculate processed results from updated reasoning
    setLlmReasoning((prev: IndividualReasoningItem[] | null) => {
      if (!prev) return prev;
      // Trigger a re-render with the final state
      return [...prev];
    });
  };

  // Handler for regenerating a single question
  const handleRegenerateSingleQuestion = async (questionId: number) => {
    if (!user || !llmReasoning) return;

    // Add to regenerating set
    setRegeneratingQuestionIds(prev => new Set([...prev, questionId]));
    setLlmError(null);

    try {
      console.log(`[Survey Page] Regenerating question ${questionId}...`);

      const existingResponses = llmReasoning.map((r: IndividualReasoningItem) => ({
        questionId: r.questionId,
        response: r.response,
        score: r.score
      }));

      const result = await regenerateSinglePrediction(user.id, questionId, existingResponses);

      if (result.success && result.data) {
        console.log(`[Survey Page] Question ${questionId} regenerated successfully`);

        // Update this specific question immediately
        const updatedQuestion = result.data.rawResponses.find(r => r.questionId === questionId);
        if (updatedQuestion) {
          setLlmReasoning((prev: IndividualReasoningItem[] | null) => {
            if (!prev) return prev;
            return prev.map((r: IndividualReasoningItem) =>
              r.questionId === questionId
                ? {
                  ...r,
                  response: updatedQuestion.response,
                  score: updatedQuestion.score,
                  confidence: (updatedQuestion as any).confidence
                }
                : r
            );
          });
        }

        // Reset chart evaluation to trigger regeneration with new data
        if (chartEvaluationData?.charts_generated) {
          setChartEvaluationData(null);
          setChartsReady(false);
        }
      } else {
        throw new Error(result.error || 'Failed to regenerate question');
      }
    } catch (error) {
      console.error(`Error regenerating question ${questionId}:`, error);
      setLlmError(error instanceof Error ? error.message : 'An error occurred');
    }

    // Remove from regenerating set
    setRegeneratingQuestionIds(prev => {
      const newSet = new Set(prev);
      newSet.delete(questionId);
      return newSet;
    });
  };

  // Callback for SurveyForm to update manual survey data
  const onManualSurveyComplete = (completedRawAnswers: Record<number, number>) => {
    setManualSurveyData(processRawScoresForManualSurvey(completedRawAnswers));
    setManualSurveyRawAnswers(completedRawAnswers); // Update raw answers state
    setShowManualInOverlay(true);
  };

  // Handler for retaking the survey
  const handleRetakeSurveyComplete = (completedRawAnswers: Record<number, number>) => {
    // Update the survey data
    setManualSurveyData(processRawScoresForManualSurvey(completedRawAnswers));
    setManualSurveyRawAnswers(completedRawAnswers);
    setShowManualInOverlay(true);

    // Reset LLM predictions since they were based on old survey data
    setLlmData(null);
    setLlmReasoning(null);

    // Reset chart evaluation data since it was based on old data
    setChartEvaluationData(null);
    setChartsReady(false);
    setHasCheckedExistingData(false);
    setStage3Selection(null);

    // Close the retake survey view
    setShowRetakeSurvey(false);

    console.log('[Survey Page] Survey retaken, previous AI predictions cleared');
  };

  // Stage 3 handlers (was Stage 1)
  const handleBeginStage3 = () => {
    console.log('[Survey Page] Opening Stage 3 Modal with data:', {
      isStage3Ready,
      chartsReady,
      hasCompleteData: hasCompleteChartData(chartEvaluationData),
      chartEvaluationData: {
        exists: !!chartEvaluationData,
        charts_generated: chartEvaluationData?.charts_generated,
        round_1_manual: !!chartEvaluationData?.round_1_manual_data,
        round_2_llm: !!chartEvaluationData?.round_2_llm_data,
        round_1_anti_manual: !!chartEvaluationData?.round_1_anti_manual_data,
        round_2_anti_llm: !!chartEvaluationData?.round_2_anti_llm_data
      }
    });
    setShowStage3Modal(true);
  };

  const handleStage3RankingComplete = async (roundResults: any[], metadata?: { finalChoice?: string }) => {
    // Format the results for display
    const formattedResults = roundResults.map(result => {
      if (result.winner) {
        const winnerLabel = getActualChartLabel(result.winner);
        return `Round ${result.roundNumber}: ${result.roundDescription} → Winner: ${winnerLabel}`;
      } else {
        return `Round ${result.roundNumber}: ${result.roundDescription} → No winner recorded`;
      }
    });

    // Add final choice if available
    if (metadata?.finalChoice) {
      formattedResults.push(`Final Choice: ${getActualChartLabel(metadata.finalChoice)} was selected as more representative`);
    }

    setStage3Selection(formattedResults);
    console.log('[Survey Page] Stage 3 completed with', roundResults.length, 'rounds:', roundResults);
    console.log('[Survey Page] Round-robin metadata:', metadata);

    // Save results to database with metadata
    if (user?.id) {
      try {
        const saveResult = await saveStage3Results(user.id, roundResults, metadata as any);
        if (saveResult.success) {
          console.log('[Survey Page] Stage 3 results saved successfully');
          // Refresh chart evaluation data to show completion status
          await refreshChartEvaluationData();
        } else {
          console.error('[Survey Page] Failed to save Stage 3 results:', saveResult.error);
        }
      } catch (error) {
        console.error('[Survey Page] Error saving Stage 3 results:', error);
      }
    }

    // Log round results in detail
    roundResults.forEach(result => {
      console.log(`[Survey Page] Round ${result.roundNumber} (${result.roundDescription}): Winner = ${result.winner}`);
    });
  };

  // Helper function to get actual chart labels for display
  const getActualChartLabel = (chartId: string) => {
    switch (chartId) {
      case 'manual': return 'Your Manual Survey';
      case 'anti-manual': return 'Anti-Person (Opposite of You)';
      case 'llm-individual': return 'LLM Prediction';
      case 'anti-individual': return 'Anti-LLM (Opposite)';
      default: return chartId;
    }
  };

  // Function to refresh chart evaluation data after Stage 3 completion
  const refreshChartEvaluationData = async () => {
    if (user?.id) {
      try {
        const result = await getChartEvaluationData(user.id);
        if (result.success && result.data) {
          setChartEvaluationData(result.data);
        }
      } catch (error) {
        console.error('Error refreshing chart evaluation data:', error);
      }
    }
  };

  // Stage 0 handlers (Training)
  const handleBeginStage0 = () => {
    setShowStage0Modal(true);
  };

  const handleStage0Complete = () => {
    setHasCompletedStage0(true);
    console.log('[Survey Page] Stage 0 training completed');
  };

  // Stage 2 handlers (Values Graph Processing)
  const TIME_WINDOW_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
  const WINDOW_SIZE = 4;
  const WINDOW_SHIFT = 3;

  // Helper to create windows from chat entries
  const createWindowsFromEntries = (entries: ChatlogEntry[], userId: string): ChatWindow[] => {
    if (!entries || entries.length === 0) return [];

    const sortedEntries = [...entries].sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Group by session
    const sessionGroups: Record<string, ChatlogEntry[]> = {};
    sortedEntries.forEach(entry => {
      const sessionId = entry.session_id || 'unknown';
      if (!sessionGroups[sessionId]) sessionGroups[sessionId] = [];
      sessionGroups[sessionId].push(entry);
    });

    const windows: ChatWindow[] = [];

    Object.entries(sessionGroups).forEach(([sessionId, sessionEntries]) => {
      // Group by time proximity
      const timeGroups: ChatlogEntry[][] = [];
      let currentGroup: ChatlogEntry[] = sessionEntries.length > 0 ? [sessionEntries[0]] : [];

      for (let i = 1; i < sessionEntries.length; i++) {
        const current = sessionEntries[i];
        const prev = sessionEntries[i - 1];
        if (new Date(current.timestamp).getTime() - new Date(prev.timestamp).getTime() <= TIME_WINDOW_THRESHOLD_MS) {
          currentGroup.push(current);
        } else {
          if (currentGroup.length > 0) timeGroups.push(currentGroup);
          currentGroup = [current];
        }
      }
      if (currentGroup.length > 0) timeGroups.push(currentGroup);

      // Create sliding windows from each time group
      timeGroups.forEach(group => {
        if (group.length <= WINDOW_SIZE) {
          windows.push(createWindow(group, userId, sessionId));
        } else {
          for (let i = 0; i <= group.length - WINDOW_SIZE; i += WINDOW_SHIFT) {
            const segment = group.slice(i, i + WINDOW_SIZE);
            windows.push(createWindow(segment, userId, sessionId));
          }
        }
      });
    });

    return windows;

    function createWindow(entries: ChatlogEntry[], userId: string, sessionId: string): ChatWindow {
      return {
        id: uuidv4(),
        chat_ids: entries.map(e => e.id),
        chat_data: entries.map(e => ({
          llm_message: e.llm_message,
          human_message: e.human_message,
          timestamp: e.timestamp
        })),
        start_timestamp: entries[0].timestamp,
        end_timestamp: entries[entries.length - 1].timestamp,
        potential_topics: [],
        potential_contexts: [],
        potential_items: [],
        user_id: userId,
        session_id: sessionId
      };
    }
  };

  // Check Values Graph processing status
  const checkValuesGraphStatus = useCallback(async () => {
    if (!user?.id) return;

    setValuesGraphStatus(prev => ({ ...prev, isChecking: true }));

    try {
      const supabase = createClient();

      // Get all chat entries
      const chatResult = await getChatlogEntriesForUser(user.id);
      if (!chatResult.success || !chatResult.data || chatResult.data.length === 0) {
        setValuesGraphStatus({ totalWindows: 0, processedWindows: 0, unprocessedWindows: 0, isChecking: false });
        return;
      }

      // Get existing windows
      const { data: existingWindows, error } = await supabase
        .from('chat_windows')
        .select('id, synthesized, chat_ids')
        .eq('user_id', user.id);

      if (error) {
        console.error('Error fetching windows:', error);
        setValuesGraphStatus(prev => ({ ...prev, isChecking: false }));
        return;
      }

      // Calculate how many windows should exist based on chat entries
      const expectedWindows = createWindowsFromEntries(chatResult.data, user.id);

      // Check which expected windows are covered by existing windows
      const existingChatIds = new Set<string>();
      (existingWindows || []).forEach(w => {
        (w.chat_ids || []).forEach((id: string) => existingChatIds.add(id));
      });

      const uncoveredWindows = expectedWindows.filter(w =>
        !w.chat_ids.some(id => existingChatIds.has(id))
      );

      // Count synthesized windows
      const synthesizedCount = (existingWindows || []).filter(w => w.synthesized).length;
      const totalExisting = (existingWindows || []).length;

      setValuesGraphStatus({
        totalWindows: totalExisting + uncoveredWindows.length,
        processedWindows: synthesizedCount,
        unprocessedWindows: (totalExisting - synthesizedCount) + uncoveredWindows.length,
        isChecking: false
      });

    } catch (error) {
      console.error('Error checking values graph status:', error);
      setValuesGraphStatus(prev => ({ ...prev, isChecking: false }));
    }
  }, [user?.id]);

  // Process unprocessed windows for Values Graph
  const handleProcessValuesGraph = async () => {
    if (!user?.id || isProcessingValuesGraph) return;

    // Get user API key if required
    const userKeys = getStoredApiKeys();
    const userApiKey = requireUserApiKeys ? userKeys.geminiApiKey : undefined;

    setIsProcessingValuesGraph(true);
    setValuesGraphProgress({ current: 0, total: 0, message: 'Loading chat history...' });

    try {
      const supabase = createClient();

      // Get all chat entries
      const chatResult = await getChatlogEntriesForUser(user.id);
      if (!chatResult.success || !chatResult.data || chatResult.data.length === 0) {
        throw new Error('No chat history found');
      }

      // Get existing windows
      const { data: existingWindows, error: windowError } = await supabase
        .from('chat_windows')
        .select('*')
        .eq('user_id', user.id);

      if (windowError) throw new Error(`Failed to fetch windows: ${windowError.message}`);

      // Create windows for uncovered entries
      const existingChatIds = new Set<string>();
      (existingWindows || []).forEach(w => {
        (w.chat_ids || []).forEach((id: string) => existingChatIds.add(id));
      });

      const uncoveredEntries = chatResult.data.filter(e => !existingChatIds.has(e.id));
      const newWindows = createWindowsFromEntries(uncoveredEntries, user.id);

      // Combine existing unprocessed windows with new windows
      const windowsToProcess = [
        ...(existingWindows || []).filter(w => !w.synthesized),
        ...newWindows
      ];

      if (windowsToProcess.length === 0) {
        setValuesGraphProgress({ current: 0, total: 0, message: 'All windows already processed!' });
        setTimeout(() => {
          setValuesGraphProgress(null);
          setIsProcessingValuesGraph(false);
        }, 2000);
        return;
      }

      setValuesGraphProgress({ current: 0, total: windowsToProcess.length, message: 'Processing windows...' });

      let processedCount = 0;

      for (let i = 0; i < windowsToProcess.length; i++) {
        const window = windowsToProcess[i];

        setValuesGraphProgress({
          current: i + 1,
          total: windowsToProcess.length,
          message: `Processing window ${i + 1} of ${windowsToProcess.length}...`
        });

        try {
          // Check if window needs to be created in DB
          const isNewWindow = !existingWindows?.find(w => w.id === window.id);

          // Step 1: Analyze window if needed
          if (!window.potential_topics || window.potential_topics.length === 0) {
            const analysisResult = await analyzeConversationWindow(
              window.chat_data,
              ["Work", "Leisure", "Culture", "Education", "People", "Lifestyle"],
              user.id,
              userApiKey
            );

            if (analysisResult.success && analysisResult.data) {
              if (isNewWindow) {
                // Insert new window with potentials
                const { error: insertError } = await supabase
                  .from('chat_windows')
                  .insert({
                    id: window.id,
                    chat_ids: window.chat_ids,
                    chat_data: window.chat_data,
                    start_timestamp: window.start_timestamp,
                    end_timestamp: window.end_timestamp,
                    potential_topics: analysisResult.data.topics || [],
                    potential_contexts: analysisResult.data.contexts || [],
                    potential_items: analysisResult.data.items || [],
                    user_id: user.id,
                    session_id: window.session_id
                  });
                if (insertError) throw new Error(`Failed to create window: ${insertError.message}`);
              } else {
                // Update existing window with potentials
                await saveWindowPotentials(window.id, {
                  topics: analysisResult.data.topics || [],
                  contexts: analysisResult.data.contexts || [],
                  items: analysisResult.data.items || []
                });
              }

              // Update local window object
              window.potential_topics = analysisResult.data.topics || [];
              window.potential_contexts = analysisResult.data.contexts || [];
            }
          }

          // Step 2: Synthesize if window has potentials
          if (window.potential_topics && window.potential_topics.length > 0) {
            const synthesisResult = await processWindowForValueGraph(
              window.id,
              user.id,
              undefined, // logger
              userApiKey
            );

            if (synthesisResult.success ||
              (synthesisResult.error && synthesisResult.error.includes('No high-confidence reasoning'))) {
              await updateWindowSynthesisStatus(window.id, true);
              processedCount++;
            }
          }

        } catch (windowError) {
          console.error(`Error processing window ${window.id}:`, windowError);
          // Continue with next window
        }

        // Small delay to prevent rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      setValuesGraphProgress({
        current: windowsToProcess.length,
        total: windowsToProcess.length,
        message: `Completed! Processed ${processedCount} windows.`
      });

      // Refresh status
      await checkValuesGraphStatus();

      setTimeout(() => {
        setValuesGraphProgress(null);
        setIsProcessingValuesGraph(false);
      }, 3000);

    } catch (error) {
      console.error('Error processing values graph:', error);
      setValuesGraphProgress({
        current: 0,
        total: 0,
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      setTimeout(() => {
        setValuesGraphProgress(null);
        setIsProcessingValuesGraph(false);
      }, 3000);
    }
  };

  // Check Values Graph status when user loads the page
  useEffect(() => {
    if (user?.id && manualSurveyData) {
      checkValuesGraphStatus();
    }
  }, [user?.id, manualSurveyData, checkValuesGraphStatus]);

  // Stage 3 handlers (was Stage 2 - Persona Experiment)
  const handleBeginStage2 = () => {
    setShowStage2Modal(true);
  };

  const handleStage2Complete = async (results: any[]) => {
    setStage2Results(results);

    // Refresh validation status to ensure UI reflects completion
    await checkStage2PreGenStatus();

    console.log('[Survey Page] Stage 3 persona experiment completed:', results);
  };

  // Enhanced Stage 3 validation using the new simplified service (was Stage 2)
  const checkStage2PreGenStatus = useCallback(async () => {
    // Demo mode: use pre-loaded stage2 data and skip Supabase lookups
    if (isDemoMode && demoData) {
      const hasPreGen = (demoData.stage2Experiment?.length ?? 0) >= 5;
      setStage2ValidationStatus({
        hasUser: true,
        hasSurvey: !!manualSurveyData,
        hasChatHistory: true,
        hasWvsScenarios: true,
        hasPreGenerated: hasPreGen,
        isValidating: false,
      });
      if (hasPreGen) {
        setStage2Results(demoData.stage2Experiment);
        setIsStage2PreGenComplete(true);
      }
      return;
    }

    if (!user?.id) {
      setStage2ValidationStatus({
        hasUser: false,
        hasSurvey: false,
        hasChatHistory: false,
        hasWvsScenarios: true, // WVS scenarios are now hardcoded in client
        hasPreGenerated: false,
        isValidating: false
      });
      return;
    }

    setStage2ValidationStatus(prev => ({ ...prev, isValidating: true }));

    try {
      const supabase = createClient();

      console.log('[Survey Page] Checking Stage 3 status...');

      // Track validation progress
      const validationResults = {
        hasUser: !!user,
        hasSurvey: false,
        hasChatHistory: false,
        hasWvsScenarios: true, // WVS scenarios are now hardcoded in client
        hasPreGenerated: false,
        isValidating: true
      };

      // 1. Check user has completed PVQ survey (if we're showing Stage 3, survey MUST be complete)
      // Since Stage 3 only shows when manualSurveyData exists, and manualSurveyData only exists
      // when the full survey (57 questions + 3 personal questions) is complete, we can trust this.
      validationResults.hasSurvey = !!manualSurveyData;
      setStage2ValidationStatus({ ...validationResults });

      // If manualSurveyData doesn't exist but we're in Stage 3, something is wrong
      if (!manualSurveyData) {
        // console.error('[Survey Page] Stage 3 validation error: no survey data but Stage 3 is showing');
        setStage2PreGenError('PVQ survey validation error. Please refresh the page.');
        setStage2ValidationStatus({ ...validationResults, isValidating: false });
        return;
      }

      // 2. Check user has sufficient chat history for persona generation
      const { data: chatData, error: chatError } = await supabase
        .from('chatlog')
        .select('id')
        .eq('user_id', user.id)
        .limit(5); // Need at least some chat history

      validationResults.hasChatHistory = !!(chatData && chatData.length > 0);
      setStage2ValidationStatus({ ...validationResults });

      if (chatError) {
        console.error('[Survey Page] Error checking chat history:', chatError);
        setStage2PreGenError(`Chat history check failed: ${chatError.message}`);
        setStage2ValidationStatus({ ...validationResults, isValidating: false });
        return;
      }

      if (!chatData || chatData.length === 0) {
        console.error('[Survey Page] No chat history found');
        setStage2PreGenError('You need some chat history for AI personas to learn from. Please have a few conversations first.');
        setStage2ValidationStatus({ ...validationResults, isValidating: false });
        return;
      }

      // 3. Check if responses have been pre-generated and if experiment is completed
      const { data: existingRounds, error: pregenError } = await supabase
        .from('stage2_experiment')
        .select('round_number, scenario_name, user_embodiment_response, user_embodiment_rating, anti_user_rating, schwartz_values_rating, random_schwartz_rating')
        .eq('user_id', user.id)
        .order('round_number');

      if (pregenError) {
        console.error('[Survey Page] Error checking pre-generated responses:', pregenError);
        setStage2PreGenError(`Pre-generation check failed: ${pregenError.message}`);
        setStage2ValidationStatus({ ...validationResults, isValidating: false });
        return;
      }

      // Check if all rounds have responses generated
      const roundsWithResponses = existingRounds?.filter(round =>
        round.user_embodiment_response && round.user_embodiment_response.trim() !== ''
      ) || [];

      validationResults.hasPreGenerated = roundsWithResponses.length >= 5; // All 5 rounds need responses

      // Check if experiment is already completed (all ratings submitted)
      const roundsWithRatings = existingRounds?.filter(round =>
        round.user_embodiment_rating && round.anti_user_rating &&
        round.schwartz_values_rating && round.random_schwartz_rating
      ) || [];

      // If experiment is already completed, populate stage2Results
      if (roundsWithRatings.length >= 5) {
        const results = existingRounds?.map(round => ({
          roundNumber: round.round_number,
          scenarioName: round.scenario_name,
          ratings: {
            user_embodiment: round.user_embodiment_rating,
            anti_user: round.anti_user_rating,
            schwartz_values: round.schwartz_values_rating,
            random_schwartz: round.random_schwartz_rating
          }
        })) || [];
        setStage2Results(results);
        console.log('[Survey Page] Stage 3 already completed, loaded results:', results.length, 'rounds');
      } else {
        // Clear results if not completed
        setStage2Results(null);
      }

      validationResults.isValidating = false;
      setStage2ValidationStatus(validationResults);

      console.log(`[Survey Page] Stage 3 validation complete:`, {
        hasSurvey: validationResults.hasSurvey,
        chatHistory: chatData.length,
        preGenerated: `${roundsWithResponses.length}/5 rounds`,
        validationResults
      });

    } catch (error) {
      console.error('[Survey Page] Error checking Stage 3 setup:', error);
      setStage2PreGenError(error instanceof Error ? error.message : 'Unknown error checking Stage 3 setup');
      setStage2ValidationStatus(prev => ({ ...prev, isValidating: false }));
    }
  }, [user?.id, manualSurveyData, demoData]);

  // Separate effect for Stage 3 validation that runs after manual survey loads
  useEffect(() => {
    if (user?.id && initialAuthCheckComplete) {
      checkStage2PreGenStatus();
    }
  }, [user?.id, initialAuthCheckComplete, manualSurveyData, checkStage2PreGenStatus]);

  const handleStage2PreGenerate = async () => {
    if (!user?.id || isStage2PreGenerating) return;

    console.log('[Survey Page] Starting Stage 3 pre-generation');
    setIsStage2PreGenerating(true);
    setStage2PreGenError(null);
    setStage2PreGenProgress({ progress: 0, message: 'Starting pre-generation...' });

    try {
      // Get user's API key if they provided one
      const userKeys = getStoredApiKeys();
      const userApiKey = userKeys.geminiApiKey;

      // Use the new simplified service instead of the old pre-generation service
      const result = await generateAllPersonaResponses(user.id, userApiKey);

      if (result.success) {
        setStage2PreGenProgress({
          progress: 100,
          message: `Pre-generation complete! Generated responses for all 5 rounds.`
        });

        setIsStage2PreGenComplete(true);
        console.log(`[Survey Page] Stage 3 pre-generation completed successfully`);

        // Refresh validation status to update UI immediately
        await checkStage2PreGenStatus();

        // Clear progress after success
        setTimeout(() => {
          setStage2PreGenProgress(null);
        }, 2000);

      } else {
        throw new Error(result.error || 'Pre-generation failed');
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Survey Page] Stage 3 pre-generation error:', error);
      setStage2PreGenError(errorMessage);
      setStage2PreGenProgress(null);
    } finally {
      setIsStage2PreGenerating(false);
    }
  };

  const handleStage2Reset = async () => {
    if (!user?.id || isResetting) return;

    if (window.confirm("Are you sure you want to reset all your Stage 2 progress? This will delete your session and pre-generated responses, allowing you to start over.")) {
      console.log('[Survey Page] Starting Stage 2 reset');
      setIsResetting(true);
      setStage2PreGenError(null);

      const result = await resetStage2Experiment(user.id);

      if (result.success) {
        // Reset all local state related to Stage 3
        setStage2Results(null);
        setIsStage2PreGenComplete(false);
        setIsStage2PreGenerating(false);
        setStage2PreGenProgress(null);

        // Refresh validation status to update UI immediately
        await checkStage2PreGenStatus();

        console.log('[Survey Page] Stage 2 reset successful');
      } else {
        console.error('[Survey Page] Stage 2 reset failed:', result.error);
        setStage2PreGenError(result.error || 'Failed to reset session.');
      }

      setIsResetting(false);
    }
  };

  // Prepare datasets for the main overlay circular visualization
  const overlayDatasets: OverlayDataset[] = [];
  if (manualSurveyData) {
    overlayDatasets.push({ id: 'manual', label: 'Manual Survey', data: manualSurveyData, color: 'rgba(70, 130, 180, 0.7)', isVisible: showManualInOverlay });
  }
  if (llmData) {
    // Use filtered data if confidence filtering is enabled
    const dataToUse = getFilteredLlmData();
    const labelSuffix = confidenceFilterEnabled && dataToUse && dataToUse.length < llmData.length
      ? ` (${dataToUse.length}/${llmData.length} values ≥${(confidenceThreshold * 100).toFixed(0)}% confident)`
      : '';
    overlayDatasets.push({
      id: 'llm',
      label: `LLM${labelSuffix}`,
      data: dataToUse || [],
      color: 'rgba(255, 99, 132, 0.7)',
      isVisible: showLlmInOverlay
    });
  }

  // Check if Stage 3 is actually ready (more strict than just chartsReady) - was Stage 1
  const isStage3Ready = chartsReady && hasCompleteChartData(chartEvaluationData);

  // Display only the survey form if the user hasn't completed it yet
  const showSurveyFormOnly = !manualSurveyData && !bypassSurvey;

  // Show full-screen loading when checking authentication
  if (!initialAuthCheckComplete) {
    return (
      <div className="fixed inset-0 min-h-full min-w-full flex flex-col items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mb-4"></div>
        <p className="text-muted-foreground">Checking authentication status...</p>
      </div>
    );
  }

  // Show full-screen loading when loading manual survey data
  if (isLoadingManualSurvey && !manualSurveyData) {
    return (
      <div className="fixed inset-0 min-h-full min-w-full flex flex-col items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mb-4"></div>
        <p className="text-muted-foreground">Loading your survey data...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Loading overlay for long-running AI operations */}
      <LoadingOverlay
        isLoading={isLoadingLlm}
        message="Generating AI Prediction"
        subMessage="Analyzing your chat history to predict your values. This may take up to a minute..."
      />
      <LoadingOverlay
        isLoading={isGeneratingCharts && !isLoadingLlm}
        message="Generating Value Charts"
        subMessage={generationProgress?.message || "Preparing charts for evaluation..."}
        progress={generationProgress?.progress}
      />
      <LoadingOverlay
        isLoading={isStage2PreGenerating && !isLoadingLlm && !isGeneratingCharts}
        message="Generating Persona Responses"
        subMessage={stage2PreGenProgress?.message || "Creating AI personas based on your profile..."}
        progress={stage2PreGenProgress?.progress}
      />

      <div className="max-w-4xl mx-auto px-3 sm:px-4 pt-6 sm:pt-8">
        <div className="text-center mb-6 sm:mb-8">
          {showSurveyFormOnly ? (
            <>
              <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-1 sm:mb-2">Portrait Values Questionnaire</h1>
              <p className="text-gray-600 text-sm sm:text-base">
                Measure your personal values according to Schwartz's Theory of Basic Human Values.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-1 sm:mb-2">AI and My Values</h1>
              <p className="text-gray-600 text-sm sm:text-base">
                How AI understands and predicts your values.
              </p>
            </>
          )}
        </div>

        {!user && initialAuthCheckComplete && (
          <div className="mt-6 p-4 border rounded-lg bg-amber-50 border-amber-200">
            {showSurveyFormOnly ? (
              <p className="text-amber-700">
                You are not logged in. Your responses will not be saved, but you can still view your results after completing the survey.
              </p>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p className="text-amber-700 text-sm">Create an account to save your results and participate in our research study.</p>
                </div>
                <Button
                  onClick={() => router.push('/')}
                  className="bg-amber-600 hover:bg-amber-700 text-white whitespace-nowrap"
                >
                  Create Account
                </Button>
              </div>
            )}
          </div>
        )}

        {/* API Key Settings - Only visible when NEXT_PUBLIC_REQUIRE_USER_API_KEYS=true, hidden in demo mode */}
        {!isDemoMode && !showSurveyFormOnly && user && requireUserApiKeys && (
          <div className="mt-4 p-3 sm:p-4 border rounded-lg bg-white border-gray-200">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-start sm:items-center gap-3">
                <Key className="h-5 w-5 text-gray-500 flex-shrink-0 mt-0.5 sm:mt-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">API Key Settings</p>
                  <p className="text-xs text-gray-500">
                    {hasGeminiKey
                      ? 'API keys configured.'
                      : 'Add your API keys to use AI features.'}
                  </p>
                </div>
              </div>
              <ApiKeySettings
                trigger={
                  <Button variant={hasGeminiKey ? "outline" : "default"} size="sm" className="gap-2 w-full sm:w-auto flex-shrink-0">
                    <Key className="h-4 w-4" />
                    {hasGeminiKey ? 'Manage' : 'Add Keys'}
                  </Button>
                }
                onKeysChanged={() => setHasGeminiKey(hasApiKey('geminiApiKey'))}
              />
            </div>
          </div>
        )}

      </div>

      {/* Tab Navigation - only after survey completion */}
      {!showSurveyFormOnly && (
        <div className={`max-w-4xl mx-auto px-3 sm:px-4 mb-6 sm:mb-8 sticky top-[63px] z-40 py-1.5 -my-1.5 transition-opacity duration-300 ${pillVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <div className="flex justify-center">
            <div className="rounded-full" style={{ display: 'inline-flex', gap: 4, padding: 4, borderRadius: 9999, overflow: 'hidden', border: '1px solid #e5e7eb', backgroundColor: 'white' }}>
              {([
                { id: 'survey', label: 'Survey', icon: ScrollText },
                { id: 'topics', label: 'Extract', icon: Network },
                { id: 'personas', label: 'Embody', icon: Theater },
                { id: 'evaluation', label: 'Explain', icon: Lightbulb },
              ] as const).map((tab) => {
                const TabIcon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveSurveyTab(tab.id)}
                    className={`inline-flex items-center gap-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-medium transition-colors duration-200 whitespace-nowrap ${activeSurveyTab === tab.id ? 'bg-primary text-primary-foreground' : 'text-gray-600 hover:text-gray-900'
                      }`}
                  >
                    <TabIcon size={14} />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Stage 1: Survey Form */}
      {showSurveyFormOnly ? (
        <div className="max-w-4xl mx-auto px-3 sm:px-4 pb-8">
          <div className="mb-6 p-3 sm:p-4 border rounded-lg bg-white border-gray-200">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
              <span className="text-xs sm:text-sm text-gray-500 bg-gray-100 px-2 sm:px-3 py-1 rounded-full">Survey</span>
              <h2 className="text-base sm:text-lg font-semibold text-gray-900">Complete the Survey</h2>
            </div>
            <p className="text-gray-500 text-xs sm:text-sm">
              Complete all 57 questions. This typically takes about 20 minutes.
            </p>
          </div>

          {/* Debug bypass - only visible in development */}
          {/* {process.env.NODE_ENV === 'development' && (
            <div className="text-center mb-4">
              <button
                onClick={() => setBypassSurvey(true)}
                className="text-xs text-gray-400 hover:text-gray-600 underline"
                style={{ fontSize: '10px' }}
              >
                Skip Survey (Dev Only)
              </button>
            </div>
          )} */}

          {!isLoadingManualSurvey && <SurveyForm onSurveyComplete={onManualSurveyComplete} />}
        </div>
      ) : (
        <div className="max-w-4xl mx-auto px-3 sm:px-4 pb-8">
          {/* Teaser image - only on Survey tab */}
          {activeSurveyTab === 'survey' && (
            <>
              <img
                src="/figures/values-teaser-light.png"
                alt="Values teaser"
                width={896}
                height={504}
                className="mx-auto w-full max-w-2xl mb-6 opacity-0 transition-opacity duration-500"
                onLoad={(e) => (e.currentTarget.style.opacity = '1')}
              />
              {/* Paper abstract */}
              <div className="border border-gray-200 rounded-lg p-4 sm:p-5 bg-white px-5 sm:px-6">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">CHI &rsquo;26 &mdash; Abstract</p>
                <h3 className="text-sm font-semibold text-gray-900 mb-2 leading-snug">
                  AI and My Values: User Perceptions of LLMs&rsquo; Ability to Extract, Embody, and Explain Human Values from Casual Conversations
                </h3>
                <p className="text-xs text-gray-600 leading-relaxed">
                  Does AI understand human values? While this remains an open philosophical question, we take a pragmatic stance by introducing VAPT, the Value-Alignment Perception Toolkit, for studying how LLMs reflect people&rsquo;s values and how people judge those reflections. 20 participants texted a chatbot over a month, then completed a 2-hour interview with our toolkit evaluating AI&rsquo;s ability to extract (pull details regarding), embody (make decisions guided by), and explain (provide proof of) their values. 13 participants ultimately left our study convinced that AI can understand human values. Thus, we warn about &ldquo;weaponized empathy&rdquo;: a design pattern that may arise in interactions with value-aware, yet welfare-misaligned conversational agents. VAPT offers a new way to evaluate value-alignment in AI systems. We also offer design implications to evaluate and responsibly build AI systems with transparency and safeguards as AI capabilities grow more inscrutable, ubiquitous, and posthuman into the future.
                </p>
                <div className="flex items-center justify-between mt-4">
                  <a
                    href="https://arxiv.org/abs/2601.22440"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 underline underline-offset-2 transition-colors"
                  >
                    Read the full paper
                  </a>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`@inproceedings{yun2026aivalues,
  title={AI and My Values: User Perceptions of LLMs' Ability to Extract, Embody, and Explain Human Values from Casual Conversations},
  author={Yun, Bhada and Su, Renn and Wang, April Yi},
  booktitle={Proceedings of the CHI Conference on Human Factors in Computing Systems},
  year={2026}
}`);
                      setValuesBibtexCopied(true);
                      setTimeout(() => setValuesBibtexCopied(false), 2000);
                    }}
                    className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 transition-colors"
                  >
                    {valuesBibtexCopied ? <Check size={12} className="text-green-600" /> : <Copy size={12} />}
                    <span>{valuesBibtexCopied ? 'Copied!' : 'Copy BibTeX'}</span>
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Stage 1: Completed Survey */}
          {activeSurveyTab === 'survey' && manualSurveyData && !showRetakeSurvey && (
            <div className="mb-8">
              {!isDemoMode && (
                <div className="p-3 sm:p-4 border rounded-lg bg-emerald-50 border-emerald-200 mb-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <span className="text-xs sm:text-sm text-emerald-700 bg-emerald-100 px-2 sm:px-3 py-1 rounded-full font-medium">✓ Survey</span>
                      <h2 className="text-base sm:text-lg font-semibold text-gray-900">Survey Completed</h2>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowRetakeSurvey(true)}
                      className="text-gray-600 hover:text-gray-900 w-full sm:w-auto"
                    >
                      Retake Survey
                    </Button>
                  </div>
                  <p className="text-gray-600 text-xs sm:text-sm">
                    You have completed the Portrait Values Questionnaire. Your value profile is ready for analysis.
                  </p>
                </div>
              )}

              {/* Demo mode: show read-only survey inline without needing to click */}
              {isDemoMode && demoData?.pvqResponses?.length ? (() => {
                const pvq = demoData.pvqResponses[0] as Record<string, unknown>;
                const demoAnswers: Record<number, number> = {};
                for (let i = 1; i <= 57; i++) {
                  const v = pvq[`q${i}`];
                  if (v !== undefined && v !== null) demoAnswers[i] = Number(v);
                }
                return (
                  <div className="mt-4">
                    <SurveyForm
                      readOnly
                      initialAnswers={demoAnswers}
                      initialGender={String(pvq.gender) === 'female' ? 'female' : 'male'}
                      initialUserQuestions={{
                        q1: String(pvq.user_generated_q1 ?? ''),
                        q2: String(pvq.user_generated_q2 ?? ''),
                        q3: String(pvq.user_generated_q3 ?? ''),
                      }}
                    />
                  </div>
                );
              })() : null}
            </div>
          )}

          {/* Stage 1: Retaking Survey */}
          {activeSurveyTab === 'survey' && showRetakeSurvey && (
            <div className="mb-8">
              <div className="p-3 sm:p-4 border rounded-lg bg-white border-gray-200 mb-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <span className="text-xs sm:text-sm text-gray-500 bg-gray-100 px-2 sm:px-3 py-1 rounded-full">Survey</span>
                    <h2 className="text-base sm:text-lg font-semibold text-gray-900">
                      {isDemoMode ? 'View Survey Responses' : 'Retake Survey'}
                    </h2>
                    {isDemoMode && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                        Demo — read-only
                      </span>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowRetakeSurvey(false)}
                    className="text-gray-600 hover:text-gray-900 w-full sm:w-auto"
                  >
                    Close
                  </Button>
                </div>
                {!isDemoMode && (
                  <p className="text-gray-500 text-xs sm:text-sm mb-4">
                    Your new responses will replace your previous answers.
                  </p>
                )}
              </div>
              {isDemoMode && demoData?.pvqResponses?.length ? (() => {
                const pvq = demoData.pvqResponses[0] as Record<string, unknown>;
                const demoAnswers: Record<number, number> = {};
                for (let i = 1; i <= 57; i++) {
                  const v = pvq[`q${i}`];
                  if (v !== undefined && v !== null) demoAnswers[i] = Number(v);
                }
                return (
                  <SurveyForm
                    readOnly
                    initialAnswers={demoAnswers}
                    initialGender={String(pvq.gender) === 'female' ? 'female' : 'male'}
                    initialUserQuestions={{
                      q1: String(pvq.user_generated_q1 ?? ''),
                      q2: String(pvq.user_generated_q2 ?? ''),
                      q3: String(pvq.user_generated_q3 ?? ''),
                    }}
                  />
                );
              })() : (
                <SurveyForm onSurveyComplete={handleRetakeSurveyComplete} />
              )}
            </div>
          )}

          {/* Stage 2: Your Topic-Context Graph */}
          {activeSurveyTab === 'topics' && initialAuthCheckComplete && user && manualSurveyData && (
            <div className="mt-8 mb-8">
              <div className="p-3 sm:p-4 border rounded-lg bg-white border-gray-200">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
                  <span className="text-xs sm:text-sm text-gray-500 bg-gray-100 px-2 sm:px-3 py-1 rounded-full">Stage 1</span>
                  <h2 className="text-base sm:text-lg font-semibold text-gray-900">Your Topic-Context Graph</h2>
                </div>
                <p className="text-gray-500 text-xs sm:text-sm mb-4">
                  Day analyzed your conversations to extract topics and map them to life contexts (Work, People, Lifestyle, etc.). Explore what matters to you with evidence trails from your chats.
                </p>

                {/* Values Graph Status — hidden in demo mode */}
                {!isDemoMode && !valuesGraphStatus.isChecking && valuesGraphStatus.totalWindows > 0 && (
                  <div className="mb-4 p-2 sm:p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="text-xs sm:text-sm">
                        <span className="text-gray-600">Status: </span>
                        <span className="font-medium text-gray-900">
                          {valuesGraphStatus.processedWindows}/{valuesGraphStatus.totalWindows} processed
                        </span>
                        {valuesGraphStatus.unprocessedWindows > 0 && (
                          <span className="text-amber-600 ml-2">
                            ({valuesGraphStatus.unprocessedWindows} new)
                          </span>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={checkValuesGraphStatus}
                        disabled={valuesGraphStatus.isChecking}
                        className="gap-1 w-full sm:w-auto"
                      >
                        <RefreshCw className={`h-3 w-3 ${valuesGraphStatus.isChecking ? 'animate-spin' : ''}`} />
                        Refresh
                      </Button>
                    </div>
                  </div>
                )}

                {/* Processing Progress */}
                {isProcessingValuesGraph && valuesGraphProgress && (
                  <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center space-x-2 mb-2">
                      <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                      <span className="text-blue-800 text-sm font-medium">{valuesGraphProgress.message}</span>
                    </div>
                    {valuesGraphProgress.total > 0 && (
                      <>
                        <div className="w-full bg-blue-200 rounded-full h-2 mb-1">
                          <div
                            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${(valuesGraphProgress.current / valuesGraphProgress.total) * 100}%` }}
                          ></div>
                        </div>
                        <p className="text-blue-600 text-xs text-center">
                          {valuesGraphProgress.current} / {valuesGraphProgress.total}
                        </p>
                      </>
                    )}
                  </div>
                )}

                {/* Process Unprocessed Windows Button — hidden in demo mode */}
                {!isDemoMode && !isProcessingValuesGraph && valuesGraphStatus.unprocessedWindows > 0 && (
                  <div className="mb-4">
                    {canGenerateSurveys ? (
                      <Button
                        onClick={handleProcessValuesGraph}
                        variant="outline"
                        className="w-full gap-2"
                      >
                        <RefreshCw className="h-4 w-4" />
                        Process {valuesGraphStatus.unprocessedWindows} New Conversation{valuesGraphStatus.unprocessedWindows !== 1 ? 's' : ''}
                      </Button>
                    ) : (
                      <div className="p-2 sm:p-3 bg-gray-50 border border-gray-200 rounded-lg">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <div>
                            <p className="text-gray-800 text-xs sm:text-sm font-medium">API Key Required</p>
                            <p className="text-gray-500 text-xs">Add keys to process conversations</p>
                          </div>
                          <ApiKeySettings
                            trigger={
                              <Button variant="outline" size="sm" className="gap-2 w-full sm:w-auto">
                                <Key className="h-4 w-4" />
                                Add Keys
                              </Button>
                            }
                            onKeysChanged={() => setHasGeminiKey(hasApiKey('geminiApiKey'))}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {isDemoMode ? (
                  /* Demo mode: show the graph inline */
                  <div className="w-full h-[600px] rounded-lg overflow-hidden">
                    <VisualizationProvider userId={user?.id ?? ''}>
                      <Visualization />
                    </VisualizationProvider>
                  </div>
                ) : (
                  <div className="flex justify-center">
                    <Button
                      onClick={() => setShowValuesGraphModal(true)}
                      className="bg-gray-900 hover:bg-gray-800 text-white px-6 py-3 w-full"
                    >
                      Open Topic-Context Graph
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Stage 3: Persona Embodiment Experiment (was Stage 2) */}
          {activeSurveyTab === 'personas' && user && (
            <div className="mt-8 p-3 sm:p-4 border rounded-lg bg-white border-gray-200">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
                <span className="text-xs sm:text-sm text-gray-500 bg-gray-100 px-2 sm:px-3 py-1 rounded-full">Stage 2</span>
                <h3 className="text-base sm:text-lg font-semibold text-gray-900">Persona Embodiment</h3>
              </div>
              <p className="text-gray-500 text-xs sm:text-sm mb-3">
                See how well AI personas answer questions from your perspective. Rate how much each response sounds like you.
              </p>

              {/* Pre-generation Progress */}
              {isStage2PreGenerating && stage2PreGenProgress && (
                <div className="mb-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
                    <span className="text-gray-700 text-sm font-medium">{stage2PreGenProgress.message}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
                    <div
                      className="bg-gray-900 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${stage2PreGenProgress.progress}%` }}
                    ></div>
                  </div>
                  <p className="text-gray-500 text-xs text-center">
                    {stage2PreGenProgress.progress}% complete
                  </p>
                </div>
              )}

              {/* Show pre-generation button if needed — hidden in demo mode */}
              {!isDemoMode && !stage2ValidationStatus.hasPreGenerated && !isStage2PreGenerating && (
                <>
                  {stage2ValidationStatus.hasUser && stage2ValidationStatus.hasSurvey && stage2ValidationStatus.hasChatHistory && stage2ValidationStatus.hasWvsScenarios ? (
                    <>
                      <p className="text-gray-600 text-sm mb-3">
                        All requirements met! Click below to pre-generate persona responses for instant experiment experience.
                      </p>
                      {/* Check if user has permission or API key */}
                      {canGenerateSurveys ? (
                        <Button
                          onClick={handleStage2PreGenerate}
                          className="bg-gray-900 hover:bg-gray-800 text-white mr-4 mb-2"
                        >
                          Pre-Generate Persona Responses
                        </Button>
                      ) : (
                        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                          <div className="flex items-start gap-3">
                            <div className="p-2 bg-gray-100 rounded-full">
                              <Lock className="h-5 w-5 text-gray-600" />
                            </div>
                            <div className="flex-1">
                              <h5 className="font-medium text-gray-900 mb-1">API Key Required</h5>
                              <p className="text-gray-600 text-sm mb-3">
                                Add your API keys to pre-generate persona responses.
                              </p>
                              <ApiKeySettings
                                trigger={
                                  <Button variant="outline" size="sm" className="gap-2">
                                    <Key className="h-4 w-4" />
                                    Add API Keys
                                  </Button>
                                }
                                onKeysChanged={() => setHasGeminiKey(hasApiKey('geminiApiKey'))}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-gray-500 text-sm mb-3">
                      <p className="mb-2">To pre-generate persona responses, you need:</p>
                      <ul className="text-xs space-y-1 ml-2">
                        {!stage2ValidationStatus.hasSurvey && (
                          <li className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
                            Complete the survey
                          </li>
                        )}
                        {!stage2ValidationStatus.hasChatHistory && (
                          <li className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
                            Have at least one chat conversation
                          </li>
                        )}
                      </ul>
                    </div>
                  )}
                </>
              )}

              {/* Show regenerate button if pre-generated but might have errors — hidden in demo mode */}
              {!isDemoMode && stage2ValidationStatus.hasPreGenerated && !isStage2PreGenerating && !stage2Results?.length && (
                <div className="mb-4 p-2 sm:p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <p className="text-gray-800 text-xs sm:text-sm font-medium">Persona responses ready</p>
                      <p className="text-gray-500 text-xs">Click to regenerate if needed</p>
                    </div>
                    {canGenerateSurveys ? (
                      <Button
                        onClick={handleStage2PreGenerate}
                        disabled={isStage2PreGenerating}
                        className="bg-gray-900 hover:bg-gray-800 text-white text-xs sm:text-sm px-3 sm:px-4 py-2 w-full sm:w-auto"
                      >
                        Regenerate
                      </Button>
                    ) : (
                      <ApiKeySettings
                        trigger={
                          <Button variant="outline" size="sm" className="gap-2 w-full sm:w-auto">
                            <Key className="h-4 w-4" />
                            Add Keys
                          </Button>
                        }
                        onKeysChanged={() => setHasGeminiKey(hasApiKey('geminiApiKey'))}
                      />
                    )}
                  </div>
                </div>
              )}

              {/* Determine if Stage 3 is fully ready to begin */}
              {(() => {
                const isFullyReady = stage2ValidationStatus.hasUser &&
                  stage2ValidationStatus.hasSurvey &&
                  stage2ValidationStatus.hasChatHistory &&
                  stage2ValidationStatus.hasWvsScenarios &&
                  stage2ValidationStatus.hasPreGenerated;

                if (stage2Results && stage2Results.length > 0) {
                  if (isDemoMode && demoData?.stage2Experiment?.length) {
                    return (
                      <Stage2Modal
                        isOpen={true}
                        onClose={() => { }}
                        onComplete={() => { }}
                        demoRounds={demoData.stage2Experiment as any}
                        inline={true}
                      />
                    );
                  }
                  return (
                    <>
                      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg mb-3">
                        <p className="text-emerald-800 font-medium text-sm mb-1">
                          ✓ Stage 2 Completed!
                        </p>
                        <p className="text-emerald-700 text-xs">
                          You completed all 5 rounds of the persona embodiment experiment.
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button
                          onClick={handleBeginStage2}
                          variant="outline"
                          className="border-gray-300 text-gray-700 hover:bg-gray-50 w-full"
                          disabled={!isFullyReady}
                        >
                          Redo Stage 2 Experiment
                        </Button>
                        {/* <Button
                          onClick={handleStage2Reset}
                          variant="destructive"
                          disabled={isResetting}
                        >
                          {isResetting ? 'Resetting...' : 'Start Over'}
                        </Button> */}
                      </div>
                    </>
                  );
                } else if (isFullyReady) {
                  return (
                    <>
                      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg mb-3">
                        <p className="text-emerald-800 font-medium text-sm mb-1">
                          Ready to Begin
                        </p>
                        <p className="text-emerald-700 text-xs">
                          All requirements met and persona responses pre-generated. The experiment is ready to start!
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button
                          onClick={handleBeginStage2}
                          className="bg-gray-900 hover:bg-gray-800 text-white w-full"
                        >
                          Start Stage 2
                        </Button>
                        {/* <Button
                          onClick={handleStage2Reset}
                          variant="destructive"
                          disabled={isResetting}
                        >
                          {isResetting ? 'Resetting...' : 'Reset'}
                        </Button> */}
                      </div>
                    </>
                  );
                } else {
                  // Determine what's missing
                  const missingItems = [];
                  if (!stage2ValidationStatus.hasSurvey) missingItems.push('Complete the survey');
                  if (!stage2ValidationStatus.hasChatHistory) missingItems.push('Have at least one chat conversation');
                  if (!stage2ValidationStatus.hasPreGenerated) missingItems.push('Pre-generate persona responses');

                  return (
                    <>
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg mb-3">
                        <p className="text-amber-800 font-medium text-sm mb-2">
                          Requirements needed:
                        </p>
                        <ul className="text-amber-700 text-xs space-y-1">
                          {missingItems.map((item, idx) => (
                            <li key={idx} className="flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button
                          disabled
                          className="bg-gray-300 cursor-not-allowed text-gray-500"
                        >
                          Complete Requirements First
                        </Button>
                        <Button
                          onClick={handleStage2Reset}
                          variant="outline"
                          className="border-gray-300 text-gray-700 hover:bg-gray-50"
                          disabled={isResetting}
                        >
                          {isResetting ? 'Resetting...' : 'Reset'}
                        </Button>
                      </div>
                    </>
                  );
                }
              })()}
            </div>
          )}

          {/* Stage 3: Value Chart Evaluation (was Stage 1) */}
          {activeSurveyTab === 'evaluation' && (
            <div className="mt-8 p-3 sm:p-4 border rounded-lg bg-white border-gray-200">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
                <span className="text-xs sm:text-sm text-gray-500 bg-gray-100 px-2 sm:px-3 py-1 rounded-full">Stage 3</span>
                <h3 className="text-base sm:text-lg font-semibold text-gray-900">Value Chart Evaluation</h3>
              </div>
              <p className="text-gray-500 text-xs sm:text-sm mb-3">
                Compare value charts in 3 blind comparisons. Choose which better represents you to help evaluate prediction methods.
              </p>

              {stage3Selection && (
                <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <p className="text-emerald-800 font-medium text-sm mb-2">
                    ✓ Stage 3 Completed! Your Personal Rankings:
                  </p>
                  <div className="text-xs space-y-1">
                    {stage3Selection.map((roundResult, index) => (
                      <div key={index} className="text-emerald-700 pl-2 border-l-2 border-emerald-300">
                        {roundResult}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Show Generate Charts button when all data is ready but charts not generated — hidden in demo mode */}
              {!isDemoMode && showGenerateButton && (
                <>
                  <p className="text-gray-600 text-sm mb-3">
                    All required data is ready! Generate comparison charts to begin the evaluation study.
                  </p>
                  {/* Check if user has permission or API key */}
                  {canGenerateSurveys ? (
                    <Button
                      onClick={handleGenerateCharts}
                      className="bg-gray-900 hover:bg-gray-800 text-white mr-4 mb-2 w-full"
                    >
                      Start Stage 3
                    </Button>
                  ) : (
                    <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-gray-100 rounded-full">
                          <Lock className="h-5 w-5 text-gray-600" />
                        </div>
                        <div className="flex-1">
                          <h5 className="font-medium text-gray-900 mb-1">API Key Required</h5>
                          <p className="text-gray-600 text-sm mb-3">
                            Add your API keys to generate comparison charts.
                          </p>
                          <ApiKeySettings
                            trigger={
                              <Button variant="outline" size="sm" className="gap-2">
                                <Key className="h-4 w-4" />
                                Add API Keys
                              </Button>
                            }
                            onKeysChanged={() => setHasGeminiKey(hasApiKey('geminiApiKey'))}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Show Regenerate Charts button when charts exist but are incomplete — hidden in demo mode */}
              {!isDemoMode && showRegenerateButton && (
                <>
                  <p className="text-pink-700 text-sm mb-3">
                    Some charts failed to generate properly. Click below to regenerate all charts.
                  </p>
                  {canGenerateSurveys ? (
                    <Button
                      onClick={handleRegenerateCharts}
                      className="bg-pink-600 hover:bg-pink-700 text-white mr-4 mb-2 w-full"
                    >
                      Regenerate Charts
                    </Button>
                  ) : (
                    <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-gray-100 rounded-full">
                          <Lock className="h-5 w-5 text-gray-600" />
                        </div>
                        <div className="flex-1">
                          <h5 className="font-medium text-gray-900 mb-1">API Key Required</h5>
                          <p className="text-gray-600 text-sm mb-3">
                            Add your API keys to regenerate charts.
                          </p>
                          <ApiKeySettings
                            trigger={
                              <Button variant="outline" size="sm" className="gap-2">
                                <Key className="h-4 w-4" />
                                Add API Keys
                              </Button>
                            }
                            onKeysChanged={() => setHasGeminiKey(hasApiKey('geminiApiKey'))}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Show status while generating */}
              {isGeneratingCharts && generationProgress && (
                <div className="mb-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
                    <span className="text-gray-700 text-sm font-medium">{generationProgress.message}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
                    <div
                      className="bg-gray-900 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${generationProgress.progress}%` }}
                    ></div>
                  </div>
                  <p className="text-gray-500 text-xs text-center">
                    {generationProgress.progress}% complete
                  </p>
                </div>
              )}

              {/* Show completion status if Stage 3 is completed (hidden in demo mode since rankings already shown above) */}
              {chartEvaluationData?.all_rounds_completed && !isDemoMode && (
                <>
                  <Button
                    onClick={handleBeginStage3}
                    variant="outline"
                    className="border-gray-300 text-gray-700 hover:bg-gray-50 mr-2 w-full"
                  >
                    Review/Redo Stage 3
                  </Button>
                </>
              )}

              {/* Show Begin Stage 3 button when everything is ready but not completed — hidden in demo mode */}
              {!isDemoMode && showStage3Button && !chartEvaluationData?.all_rounds_completed && (
                <>
                  <p className="text-gray-600 text-sm mb-3">
                    All value charts are ready! Participate in our research study: 3 rounds comparing different prediction methods.
                  </p>
                  <Button
                    onClick={handleBeginStage3}
                    className="bg-gray-900 hover:bg-gray-800 text-white"
                  >
                    Begin Stage 3: Value Chart Evaluation
                  </Button>
                </>
              )}

              {/* Show guidance for incomplete data — hidden in demo mode */}
              {!isDemoMode && !showGenerateButton && !showRegenerateButton && !showStage3Button && !isGeneratingCharts && (
                <>
                  {!llmData ? (
                    <div className={`mb-4 p-4 border rounded-lg ${!stage2ValidationStatus.hasChatHistory ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
                      <h4 className={`font-medium text-sm mb-2 ${!stage2ValidationStatus.hasChatHistory ? 'text-amber-800' : 'text-gray-900'}`}>
                        {!stage2ValidationStatus.hasChatHistory ? 'Requirements needed:' : 'Generate AI Prediction (Required)'}
                      </h4>
                      {!stage2ValidationStatus.hasChatHistory ? (
                        <ul className="text-amber-700 text-xs space-y-1 mb-3">
                          <li className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                            Have at least one chat conversation
                          </li>
                        </ul>
                      ) : (
                        <p className="text-gray-600 text-sm mb-3">
                          Generate an AI prediction of your values based on your chat history. This is required for Stage 3.
                        </p>
                      )}

                      {/* Check if user has permission or API key */}
                      {canGenerateSurveys ? (
                        <>
                          <Button
                            onClick={handlePredictPVQ}
                            disabled={isLoadingLlm || !user || !stage2ValidationStatus.hasChatHistory}
                            className={`w-fit ${!stage2ValidationStatus.hasChatHistory
                              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                              : 'bg-gray-900 hover:bg-gray-800 text-white'}`}
                          >
                            {isLoadingLlm ? 'Generating AI Prediction...' : 'Generate AI PVQ Prediction'}
                          </Button>
                          {isLoadingLlm && <p className="text-gray-600 text-sm mt-2">Loading AI predictions, this may take some time...</p>}
                          {llmError && <p className="text-pink-600 text-sm mt-2">Error: {llmError}</p>}
                        </>
                      ) : (
                        <div className="p-3 sm:p-4 bg-white/50 border border-gray-200 rounded-lg">
                          <div className="flex items-start gap-2 sm:gap-3">
                            <div className="p-1.5 sm:p-2 bg-gray-100 rounded-full flex-shrink-0">
                              <Lock className="h-4 w-4 sm:h-5 sm:w-5 text-gray-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h5 className="font-medium text-gray-900 text-sm sm:text-base mb-1">API Keys Required</h5>
                              <p className="text-gray-600 text-xs sm:text-sm mb-2 sm:mb-3">
                                Add your Gemini key for predictions and Claude for chat.
                              </p>
                              <ApiKeySettings
                                showClaude={true}
                                trigger={
                                  <Button variant="outline" size="sm" className="gap-2 w-full sm:w-auto">
                                    <Key className="h-4 w-4" />
                                    Add API Keys
                                  </Button>
                                }
                                onKeysChanged={() => setHasGeminiKey(hasApiKey('geminiApiKey'))}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm mb-3">
                      Checking existing data...
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* Main Overlay Circular Visualization - shown when any data is available */}
          {activeSurveyTab === 'evaluation' && initialAuthCheckComplete && overlayDatasets.length > 0 && (
            <div className="mt-8 mb-8 p-4 border rounded-lg border-gray-200 bg-white">
              <CircularVisualization datasets={overlayDatasets} showExplanation={true} />
              <div className="flex flex-col items-center space-y-3 mb-4">
                <div className="flex justify-center gap-2">
                  {manualSurveyData && (
                    <button
                      type="button"
                      onClick={() => setShowManualInOverlay(!showManualInOverlay)}
                      className={`
                        inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium
                        transition-all duration-200 ease-in-out
                        border
                        ${showManualInOverlay
                          ? 'bg-blue-500 border-blue-600 text-white'
                          : 'bg-white border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-500'
                        }
                      `}
                      aria-pressed={showManualInOverlay}
                    >
                      <span className={`
                        w-3 h-3 rounded-full transition-colors duration-200
                        ${showManualInOverlay ? 'bg-white' : 'bg-blue-400'}
                      `} />
                      Manual Survey
                    </button>
                  )}
                  {llmData && (
                    <button
                      type="button"
                      onClick={() => setShowLlmInOverlay(!showLlmInOverlay)}
                      className={`
                        inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium
                        transition-all duration-200 ease-in-out
                        border
                        ${showLlmInOverlay
                          ? 'bg-rose-500 border-rose-600 text-white'
                          : 'bg-white border-gray-200 text-gray-500 hover:border-rose-300 hover:text-rose-500'
                        }
                      `}
                      aria-pressed={showLlmInOverlay}
                    >
                      <span className={`
                        w-3 h-3 rounded-full transition-colors duration-200
                        ${showLlmInOverlay ? 'bg-white' : 'bg-rose-400'}
                      `} />
                      LLM Prediction
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Results Area - LLM Prediction Details */}
          {activeSurveyTab === 'evaluation' && !showRetakeSurvey && (
            <div className="grid grid-cols-1 gap-4 sm:gap-6 mt-6 sm:mt-8">
              {/* LLM Prediction */}
              <div className="p-3 sm:p-4 border rounded-lg border-gray-200 bg-white">
                <div className="text-center border-b border-gray-100 pb-2 mb-3">
                  {confidenceFilterEnabled && llmData && llmReasoning && (
                    <div className="text-xs text-gray-600 mt-1">
                      {(() => {
                        const filteredData = getFilteredLlmData();
                        const totalCount = llmData?.length || 0;
                        const filteredCount = filteredData?.length || 0;
                        return `Showing ${filteredCount}/${totalCount} values (≥${(confidenceThreshold * 100).toFixed(0)}% confident)`;
                      })()}
                    </div>
                  )}
                </div>
                {isLoadingLlm && <p className="text-sm text-gray-500">Generating AI predictions...</p>}
                {llmError && <p className="text-red-500 text-sm">Error: {llmError}</p>}
                {llmData && (
                  <>
                    {/* Check if predictions have errors and show regenerate buttons — hidden in demo mode */}
                    {!isDemoMode && llmReasoning && llmReasoning.some((item: IndividualReasoningItem) =>
                      item.response?.toLowerCase().includes('error')
                    ) && (
                        <div className="mb-4 p-3 bg-pink-50 border border-pink-200 rounded-lg">
                          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                            <div>
                              <p className="text-pink-800 text-sm font-medium">
                                {llmReasoning.filter((item: IndividualReasoningItem) => item.response?.toLowerCase().includes('error')).length} predictions failed due to API errors
                              </p>
                              <p className="text-pink-600 text-xs">Choose to regenerate only failed ones or all predictions</p>
                            </div>
                            {canGenerateSurveys ? (
                              <div className="flex gap-2">
                                <Button
                                  onClick={() => {
                                    console.log('[Survey Page] Manually reloading LLM predictions...');
                                    loadLlmPredictions();
                                  }}
                                  variant="ghost"
                                  className="text-gray-500 hover:text-gray-700 text-sm px-2 py-2"
                                >
                                  <RefreshCw className="h-4 w-4" />
                                </Button>
                                <Button
                                  onClick={handleRegenerateFailedOnly}
                                  disabled={isLoadingLlm}
                                  className="bg-pink-600 hover:bg-pink-700 text-white text-sm px-3 py-2"
                                >
                                  {isLoadingLlm ? 'Regenerating...' : 'Regenerate Failed Only'}
                                </Button>
                                <Button
                                  onClick={handlePredictPVQ}
                                  disabled={isLoadingLlm}
                                  variant="outline"
                                  className="border-gray-300 text-gray-700 hover:bg-gray-50 text-sm px-3 py-2"
                                >
                                  Regenerate All
                                </Button>
                              </div>
                            ) : (
                              <ApiKeySettings
                                showClaude={true}
                                trigger={
                                  <Button variant="outline" size="sm" className="gap-2 text-gray-700">
                                    <Key className="h-4 w-4" />
                                    Add API Keys
                                  </Button>
                                }
                                onKeysChanged={() => setHasGeminiKey(hasApiKey('geminiApiKey'))}
                              />
                            )}
                          </div>
                        </div>
                      )}
                    {llmReasoning && llmReasoning.length > 0 && (
                      <div className="mt-3 sm:mt-4 border-t border-gray-100 pt-2 sm:pt-3">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                          <h4 className="text-xs sm:text-sm font-semibold text-gray-700">AI Reasoning for Each Question:</h4>
                          {!isDemoMode && (canGenerateSurveys ? (
                            <Button
                              onClick={handlePredictPVQ}
                              disabled={isLoadingLlm}
                              variant="outline"
                              className="text-xs px-2 sm:px-3 py-1 h-auto w-full sm:w-auto"
                            >
                              {isLoadingLlm ? 'Regenerating...' : 'Regenerate All'}
                            </Button>
                          ) : (
                            <ApiKeySettings
                              showClaude={true}
                              trigger={
                                <Button variant="ghost" size="sm" className="gap-1 text-xs h-auto py-1 w-full sm:w-auto">
                                  <Key className="h-3 w-3" />
                                  Add Keys
                                </Button>
                              }
                              onKeysChanged={() => setHasGeminiKey(hasApiKey('geminiApiKey'))}
                            />
                          ))}</div>
                        {llmReasoning
                          .slice(0, 57)
                          .sort((a: IndividualReasoningItem, b: IndividualReasoningItem) => a.questionId - b.questionId)
                          .map((item: IndividualReasoningItem, index: number) => {
                            // Find the question text from our definitions
                            const questionDef = PVQ_QUESTIONS_FOR_DISPLAY.find((q: { id: number; text: string; value_code: string }) => q.id === item.questionId);
                            const questionText = questionDef ? questionDef.text : `Question ${item.questionId}`;

                            return (
                              <ReasoningAccordionItem
                                key={`llm-reason-${item.questionId || index}`}
                                questionNumber={item.questionId}
                                questionText={questionText}
                                score={item.score}
                                manualScore={manualSurveyRawAnswers?.[item.questionId]} // Pass manual score
                                rawReasoning={item.response}
                                confidence={item.confidence}
                                highlightedSections={highlightedSections}
                                onToggleSectionHighlight={toggleSectionHighlight}
                                onRegenerate={isDemoMode ? undefined : handleRegenerateSingleQuestion}
                                isRegenerating={!isDemoMode && regeneratingQuestionIds.has(item.questionId)}
                              />);
                          })}
                        {llmReasoning.length > 57 && (
                          <p className="text-xs text-gray-500 mt-2">
                            ... and {llmReasoning.length - 57} more questions
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}
                {!isDemoMode && !isLoadingLlm && !llmData && !llmError && user && (
                  <div className="text-center py-10">
                    <p className="text-sm text-gray-600 mb-4">Generate an AI prediction of your values to see detailed reasoning for each question.</p>
                    <Button
                      onClick={handlePredictPVQ}
                      className="bg-gray-900 hover:bg-gray-800 text-white px-6 py-2 disabled:bg-gray-300 disabled:cursor-not-allowed"
                      disabled={(!manualSurveyData && !bypassSurvey) || !stage2ValidationStatus.hasChatHistory}
                    >
                      Generate AI PVQ Prediction
                    </Button>
                    {!stage2ValidationStatus.hasChatHistory ? (
                      <p className="text-xs text-amber-600 mt-2">You need at least one chat conversation first</p>
                    ) : !manualSurveyData && !bypassSurvey ? (
                      <p className="text-xs text-gray-500 mt-2">Complete the manual survey first to generate predictions</p>
                    ) : null}
                  </div>
                )}
                {!user && <p className="text-sm text-gray-400 text-center py-10">Log in to generate predictions.</p>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stage 0 Modal (Training) */}
      <Stage0Modal
        isOpen={showStage0Modal}
        onClose={() => setShowStage0Modal(false)}
        onComplete={handleStage0Complete}
      />

      {/* Stage 3 Modal (Persona Embodiment) — skipped in demo mode (shown inline instead) */}
      {user && !isDemoMode && (
        <Stage2Modal
          isOpen={showStage2Modal}
          onClose={() => setShowStage2Modal(false)}
          onComplete={handleStage2Complete}
        />
      )}

      {/* Stage 3 Modal (Chart Evaluation) */}
      <Stage3Modal
        isOpen={showStage3Modal}
        onClose={() => setShowStage3Modal(false)}
        chartEvaluationData={chartEvaluationData || undefined}
        onSelectionComplete={handleStage3RankingComplete}
      />

      {/* Values Graph Modal for Stage 2 */}
      {user && (
        <ValuesGraphModal
          isOpen={showValuesGraphModal}
          onClose={() => setShowValuesGraphModal(false)}
          userId={user.id}
        />
      )}
    </div>
  )
}

