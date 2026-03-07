'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { User, RefreshCw, BarChart3, Shuffle } from 'lucide-react';
import { 
  getStage2Status, 
  saveRoundRatings, 
  resetStage2Experiment,
  Stage2ExperimentStatus,
  Stage2Round
} from '../../app/values/services/stage2-service';

interface Stage2ModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (results: any[]) => void;
  demoRounds?: Stage2Round[];
  inline?: boolean;
}

interface RoundRatings {
  user_embodiment_rating: number;
  anti_user_rating: number;
  schwartz_values_rating: number;
  random_schwartz_rating: number;
}

interface RandomizedPersona {
  key: keyof RoundRatings;
  label: string;
  response?: string;
  reasoning?: string;
}

const ratingOptions = [
  { value: 6, label: "Very much like me" },
  { value: 5, label: "Like me" },
  { value: 4, label: "Somewhat like me" },
  { value: 3, label: "A little like me" },
  { value: 2, label: "Not like me" },
  { value: 1, label: "Not like me at all" },
];

const getScoreLabel = (score: number) => {
  const option = ratingOptions.find(o => o.value === score);
  return option?.label || "";
};

const getScoreBgColor = (score: number) => {
  if (score >= 5) return '#f0fdf4'; // light green
  if (score === 4) return '#fafffe'; // barely green
  if (score === 3) return '#fffafa'; // barely pink
  if (score <= 2) return '#fef2f2'; // light pink
  return '#ffffff';
};

export function Stage2Modal({ isOpen, onClose, onComplete, demoRounds, inline }: Stage2ModalProps) {
  const { user } = useAuth();
  const [status, setStatus] = useState<Stage2ExperimentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentRoundIndex, setCurrentRoundIndex] = useState(0);
  const [ratings, setRatings] = useState<RoundRatings>({
    user_embodiment_rating: 0,
    anti_user_rating: 0,
    schwartz_values_rating: 0,
    random_schwartz_rating: 0
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [randomizedPersonas, setRandomizedPersonas] = useState<RandomizedPersona[]>([]);
  const [showDebrief, setShowDebrief] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);

  const currentRound = (!showDebrief && status?.rounds[currentRoundIndex]) ? status.rounds[currentRoundIndex] : null;

  useEffect(() => {
    if (isOpen && user?.id) {
      if (demoRounds && demoRounds.length > 0) {
        const demoStatus: Stage2ExperimentStatus = {
          rounds: demoRounds,
          currentRound: demoRounds.length,
          isComplete: true,
          hasGeneratedResponses: true,
          nextUnratedRound: null,
        };
        setStatus(demoStatus);
        setShowDebrief(true);
        setLoading(false);
      } else {
        loadStatus();
      }
    }
  }, [isOpen, user?.id, demoRounds]);

  useEffect(() => {
    if (currentRound) {
      const personas = [
        { key: 'user_embodiment_rating' as keyof RoundRatings, response: currentRound.user_embodiment_response },
        { key: 'anti_user_rating' as keyof RoundRatings, response: currentRound.anti_user_response },
        { key: 'schwartz_values_rating' as keyof RoundRatings, response: currentRound.schwartz_values_response },
        { key: 'random_schwartz_rating' as keyof RoundRatings, response: currentRound.random_schwartz_response }
      ];

      const shuffled = [...personas].sort(() => Math.random() - 0.5);
      const neutralLabels = ['Response A', 'Response B', 'Response C', 'Response D'];
      
      const randomizedPersonas = shuffled.map((persona, index) => ({
        key: persona.key,
        label: neutralLabels[index],
        response: persona.response,
        reasoning: undefined
      }));

      setRandomizedPersonas(randomizedPersonas);
    }
  }, [currentRound]);

  const loadStatus = async () => {
    if (!user?.id) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const result = await getStage2Status(user.id);
      
      if (result.success && result.data) {
        setStatus(result.data);
        
        if (result.data.isComplete) {
          setShowDebrief(true);
        } else {
          const firstIncompleteIndex = result.data.rounds.findIndex(
            (round: Stage2Round) => !round.user_embodiment_rating
          );
          
          if (firstIncompleteIndex >= 0) {
            setCurrentRoundIndex(firstIncompleteIndex);
          } else {
            setShowDebrief(true);
          }
        }
      } else {
        setError(result.error || 'Failed to load experiment status');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading experiment');
    } finally {
      setLoading(false);
    }
  };

  const handleRatingChange = (personaKey: keyof RoundRatings, value: string) => {
    setRatings(prev => ({
      ...prev,
      [personaKey]: parseInt(value)
    }));
  };

  const handleNextRound = async () => {
    if (!user?.id || !currentRound || isSubmitting) return;
    
    setIsSubmitting(true);
    
    try {
      const result = await saveRoundRatings(user.id, currentRound.round_number, ratings);
      
      if (result.success) {
        if (currentRoundIndex >= (status?.rounds.length || 0) - 1) {
          if (reviewMode) {
            setShowDebrief(true);
          } else {
            await loadStatus();
            setShowDebrief(true);
          }
        } else {
          const nextIndex = currentRoundIndex + 1;
          setCurrentRoundIndex(nextIndex);
          
          if (reviewMode && status?.rounds[nextIndex]) {
            const nextRound = status.rounds[nextIndex];
            setRatings({
              user_embodiment_rating: nextRound.user_embodiment_rating || 0,
              anti_user_rating: nextRound.anti_user_rating || 0,
              schwartz_values_rating: nextRound.schwartz_values_rating || 0,
              random_schwartz_rating: nextRound.random_schwartz_rating || 0
            });
          } else {
            setRatings({
              user_embodiment_rating: 0,
              anti_user_rating: 0,
              schwartz_values_rating: 0,
              random_schwartz_rating: 0
            });
          }
        }
      } else {
        setError(result.error || 'Failed to save ratings');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error saving ratings');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = async () => {
    if (!user?.id || isSubmitting) return;
    
    if (window.confirm('Are you sure you want to reset all your progress? This will delete all your responses.')) {
      setIsSubmitting(true);
      
      try {
        const result = await resetStage2Experiment(user.id);
        if (result.success) {
          onClose();
        } else {
          setError(result.error || 'Failed to reset experiment');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error resetting experiment');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleViewResultsAgain = () => {
    setShowDebrief(false);
    setReviewMode(true);
    setCurrentRoundIndex(0);
    if (status?.rounds[0]) {
      const round = status.rounds[0];
      setRatings({
        user_embodiment_rating: round.user_embodiment_rating || 0,
        anti_user_rating: round.anti_user_rating || 0,
        schwartz_values_rating: round.schwartz_values_rating || 0,
        random_schwartz_rating: round.random_schwartz_rating || 0
      });
    }
  };

  const handleFinishReview = () => {
    if (status) {
      const results = status.rounds.map((round: Stage2Round) => ({
        roundNumber: round.round_number,
        scenarioName: round.scenario_name,
        ratings: {
          user_embodiment: round.user_embodiment_rating,
          anti_user: round.anti_user_rating,
          schwartz_values: round.schwartz_values_rating,
          random_schwartz: round.random_schwartz_rating
        }
      }));
      onComplete(results);
    }
    onClose();
  };

  const renderPersonaCard = (persona: RandomizedPersona) => {
    if (!persona.response) return null;

    const selectedRating = ratings[persona.key];

    return (
      <div 
        key={persona.key} 
        className="border border-gray-200 rounded-lg p-4 bg-white"
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-medium text-gray-700">{persona.label}</span>
        </div>
        
        <p className="text-gray-700 mb-4 leading-relaxed">
          &ldquo;{persona.response}&rdquo;
        </p>
        
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-600">How much does this sound like you?</p>
          <div className="flex flex-wrap gap-2">
            {ratingOptions.map((option) => (
                <button
                key={option.value}
                onClick={() => handleRatingChange(persona.key, option.value.toString())}
                className={`px-3 py-1.5 text-sm rounded-md border-2 transition-all ${
                  selectedRating === option.value
                    ? option.value >= 4
                      ? 'border-emerald-500 bg-emerald-100 text-emerald-800 font-medium'
                      : 'border-pink-500 bg-pink-100 text-pink-800 font-medium'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                {option.value}/6 - {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className={inline ? "w-full mt-4" : "fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[200]"}>
      <div className={inline ? "w-full" : "bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto"}>
        <div className={inline ? "" : "p-6"}>
          {/* Header — hidden when inline (the survey page already has the section heading) */}
          {!inline && (
            <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-100">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  Persona Embodiment Experiment
                </h2>
                <p className="text-gray-500 text-sm mt-1">Rate how well each AI response sounds like you</p>
              </div>
              <div className="flex items-center gap-2">
                {!demoRounds && (
                  <button 
                    onClick={handleReset}
                    disabled={isSubmitting}
                    className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    Reset
                  </button>
                )}
                <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                  {status?.rounds ? `Round ${currentRoundIndex + 1} of ${status.rounds.length}` : 'Loading...'}
                </span>
              </div>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-300 border-t-gray-900 mx-auto mb-4"></div>
              <p className="text-gray-500">Loading...</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          {/* Active Round */}
          {!loading && !error && status && currentRound && !showDebrief && (
            <div className="space-y-6">
              {/* Progress */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">
                  Round {currentRound.round_number} of {status.rounds.length}
                  {reviewMode && ' (Review)'}
                </span>
                <div className="w-32 bg-gray-100 rounded-full h-1.5">
                  <div 
                    className="bg-gray-900 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${((currentRoundIndex + 1) / status.rounds.length) * 100}%` }}
                  />
                </div>
              </div>

              {/* Question */}
              <div>
                <h3 className="text-base font-semibold text-gray-900 mb-1">
                  {currentRound.scenario_name}
                </h3>
                <p className="text-sm text-gray-600 italic">
                  &ldquo;{currentRound.scenario_prompt}&rdquo;
                </p>
              </div>

              {/* Responses */}
              <div className="space-y-4">
                <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">
                  Rate each response
                </p>
                {randomizedPersonas.map((persona) => renderPersonaCard(persona))}
              </div>

              {/* Actions */}
              <div className="flex justify-between items-center pt-4 border-t border-gray-100">
                <p className="text-sm text-gray-500">
                  {Object.values(ratings).every(r => r >= 1 && r <= 6) 
                    ? 'All rated. Ready to continue.' 
                    : 'Rate all responses to continue.'}
                </p>
                <Button 
                  onClick={handleNextRound}
                  disabled={isSubmitting || Object.values(ratings).some(rating => rating < 1 || rating > 6)}
                  className="bg-gray-900 hover:bg-gray-800"
                >
                  {isSubmitting ? 'Saving...' : 
                    currentRoundIndex >= (status.rounds.length - 1) 
                      ? 'Complete' 
                      : 'Next Round'}
                </Button>
              </div>
            </div>
          )}

          {/* Debrief / Results */}
          {showDebrief && status && (
            <div className="space-y-6">
              <div className="text-center mb-6 mt-6">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-base font-semibold text-gray-900 mb-2">
                  Experiment Complete
                </h3>
                <p className="text-gray-600">
                  Here&apos;s how you rated each AI persona&apos;s response:
                </p>
              </div>

              {/* Results by Round */}
              <div className="space-y-6">
                {status.rounds.map((round: Stage2Round) => (
                  <div key={round.id} className="border border-gray-200 rounded-lg overflow-hidden">
                    {/* Round Header */}
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                      <span className="text-sm font-medium text-gray-500">Round {round.round_number}</span>
                      <h4 className="text-sm font-semibold text-gray-900">{round.scenario_name}</h4>
                      <p className="text-sm text-gray-600 italic mt-1">&ldquo;{round.scenario_prompt}&rdquo;</p>
                    </div>

                    {/* Personas */}
                    <div className="divide-y divide-gray-100">
                      {[
                        { 
                          icon: User, 
                          label: 'User Embodiment', 
                          subtitle: 'AI mimicking your style',
                          rating: round.user_embodiment_rating, 
                          response: round.user_embodiment_response 
                        },
                        { 
                          icon: RefreshCw, 
                          label: 'Anti-User', 
                          subtitle: 'AI with opposite views',
                          rating: round.anti_user_rating, 
                          response: round.anti_user_response 
                        },
                        { 
                          icon: BarChart3, 
                          label: 'Your Schwartz Values', 
                          subtitle: 'AI based on your survey',
                          rating: round.schwartz_values_rating, 
                          response: round.schwartz_values_response 
                        },
                        { 
                          icon: Shuffle, 
                          label: 'Random Values', 
                          subtitle: 'AI with random values',
                          rating: round.random_schwartz_rating, 
                          response: round.random_schwartz_response 
                        }
                      ].map((persona, idx) => {
                        const Icon = persona.icon;
                        const isLike = (persona.rating || 0) >= 4;
                        
                        return (
                          <div 
                            key={idx}
                            className="p-3 sm:p-4"
                            style={{ backgroundColor: getScoreBgColor(persona.rating || 3) }}
                          >
                            {/* Persona header — stacks on mobile */}
                            <div className="flex flex-wrap items-start gap-x-2 gap-y-1.5 mb-2">
                              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                <Icon size={13} className="text-gray-500 flex-shrink-0" />
                                <span className="text-sm font-medium text-gray-700 truncate">{persona.label}</span>
                              </div>
                              <div className="flex items-center gap-2 w-full sm:w-auto">
                                <span className="text-xs text-gray-400">({persona.subtitle})</span>
                                <span className={`ml-auto sm:ml-0 text-xs font-medium px-2 py-0.5 rounded border flex-shrink-0 ${
                                  isLike 
                                    ? 'border-emerald-400 bg-emerald-50 text-emerald-700' 
                                    : 'border-pink-400 bg-pink-50 text-pink-700'
                                }`}>
                                  {persona.rating}/6 — {getScoreLabel(persona.rating || 0)}
                                </span>
                              </div>
                            </div>
                            <p className="text-gray-700 text-sm leading-relaxed">
                              &ldquo;{persona.response}&rdquo;
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* What This Reveals */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-2">What This Reveals</h4>
                <p className="text-sm text-gray-600">
                  Responses in <span className="bg-green-100 px-1 rounded">green</span> are ones you felt represented you (4+ out of 6).
                  Responses in <span className="bg-red-100 px-1 rounded">pink</span> felt less like you. 
                  This helps us understand how well AI can capture your values and communication style.
                </p>
              </div>

              {/* Actions — hidden in inline/demo mode */}
              {!inline && (
                <div className="flex justify-center gap-3 pt-4">
                  <Button 
                    onClick={handleViewResultsAgain}
                    variant="outline"
                  >
                    Review Responses
                  </Button>
                  <Button 
                    onClick={handleFinishReview}
                    className="bg-gray-900 hover:bg-gray-800"
                  >
                    Complete
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
