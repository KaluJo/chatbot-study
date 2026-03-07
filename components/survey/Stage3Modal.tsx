'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { CircularVisualization, OverlayDataset } from './visualizations/CircularVisualization'
import { ProcessedValueResult } from './value-utils'
import { ChartEvaluationData } from '../../app/values/services/chart-evaluation-service'
import { CheckCircle } from 'lucide-react'

interface Stage3ModalProps {
  isOpen: boolean;
  onClose: () => void;
  chartEvaluationData?: ChartEvaluationData;
  onSelectionComplete: (rankings: RoundResult[], metadata?: { finalChoice?: string }) => void;
}

interface ChartData {
  id: string;
  data: ProcessedValueResult[];
  label: string;
  displayLabel: string;
}

interface RoundResult {
  roundNumber: number;
  roundType: 'binary' | 'final';
  charts: ChartData[];
  winner?: string; // Winner ID for binary comparisons
  ranking?: string[]; // Chart IDs in order from best to worst (for final round only)
  roundDescription: string;
}

type RoundPhase = 'setup' | 'comparison' | 'reveal' | 'complete';

// Helper function to get intensity adjective based on score magnitude
const getIntensityAdjective = (score: number): string => {
  const absScore = Math.abs(score);
  if (absScore < 0.75) return "slightly";
  if (absScore < 1.5) return "";
  return "strongly";
};

// Helper function to get contextual explanation for a value based on its score
const getValueExplanation = (valueCode: string, score: number, isPositive: boolean): string => {
  const intensity = getIntensityAdjective(score);
  const intensityText = intensity ? `${intensity} ` : '';
  const valueExplanations: Record<string, { positive: string; negative: string }> = {
    'UNN': { positive: `You ${intensityText}prioritize protecting the environment.`, negative: `Environmental concerns are ${intensityText}less central.` },
    'UNC': { positive: `You ${intensityText}value equality and justice for all people.`, negative: `Universal concern is ${intensityText}less emphasized.` },
    'UNT': { positive: `You ${intensityText}believe in accepting diverse perspectives.`, negative: `Tolerance for different viewpoints is ${intensityText}less prioritized.` },
    'BEC': { positive: `You ${intensityText}value caring for and helping those close to you.`, negative: `Caring for close relationships is ${intensityText}less emphasized.` },
    'BED': { positive: `You ${intensityText}value loyalty and being dependable.`, negative: `Being dependable is ${intensityText}less central.` },
    'SDT': { positive: `You ${intensityText}value independent thinking.`, negative: `Independent thinking is ${intensityText}less prioritized.` },
    'SDA': { positive: `You ${intensityText}value choosing your own actions.`, negative: `Personal autonomy is ${intensityText}less emphasized.` },
    'ST': { positive: `You ${intensityText}enjoy seeking new experiences and excitement.`, negative: `Seeking excitement is ${intensityText}less important.` },
    'HE': { positive: `You ${intensityText}value pleasure and having fun.`, negative: `Personal pleasure is ${intensityText}less central.` },
    'AC': { positive: `You ${intensityText}value personal success and achievement.`, negative: `Personal achievement is ${intensityText}less emphasized.` },
    'POD': { positive: `You ${intensityText}value having control and authority.`, negative: `Having power over people is ${intensityText}less appealing.` },
    'POR': { positive: `You ${intensityText}value control over resources.`, negative: `Control over resources is ${intensityText}less important.` },
    'FAC': { positive: `You ${intensityText}value maintaining your social image.`, negative: `Social image is ${intensityText}less of a concern.` },
    'SEP': { positive: `You ${intensityText}value personal safety and security.`, negative: `Personal security is ${intensityText}less emphasized.` },
    'SES': { positive: `You ${intensityText}value social order and stability.`, negative: `Social stability is ${intensityText}less prioritized.` },
    'COR': { positive: `You ${intensityText}value following rules and laws.`, negative: `Following rules is ${intensityText}less central.` },
    'COI': { positive: `You ${intensityText}value politeness and not disrupting harmony.`, negative: `Social courtesy is ${intensityText}less prioritized.` },
    'TR': { positive: `You ${intensityText}value traditions and customs.`, negative: `Traditions are ${intensityText}less important.` },
    'HUM': { positive: `You ${intensityText}value humility and recognizing your place.`, negative: `Humility is ${intensityText}less emphasized.` },
  };
  const explanation = valueExplanations[valueCode as keyof typeof valueExplanations];
  return explanation ? (isPositive ? explanation.positive : explanation.negative) : (isPositive ? 'More important' : 'Less important');
};


interface ValueDifference {
  valueCode: string;
  name: string;
  chartA: { score: number; isPositive: boolean };
  chartB: { score: number; isPositive: boolean };
  difference: number;
  type: 'polarity' | 'magnitude';
}

const calculateDifferences = (chartA: ChartData, chartB: ChartData): ValueDifference[] => {
  if (!chartA || !chartB) return [];

  const differences: ValueDifference[] = [];
  const allValueCodes = new Set([...chartA.data.map(d => d.value), ...chartB.data.map(d => d.value)]);

  allValueCodes.forEach(valueCode => {
    const dataA = chartA.data.find(d => d.value === valueCode);
    const dataB = chartB.data.find(d => d.value === valueCode);

    if (dataA && dataB) {
      const scoreA = dataA.centeredScore;
      const scoreB = dataB.centeredScore;
      const isPositiveA = scoreA > 0;
      const isPositiveB = scoreB > 0;
      const absDiff = Math.abs(scoreA - scoreB);

      let type: 'polarity' | 'magnitude' | null = null;

      if (isPositiveA !== isPositiveB) {
        type = 'polarity';
      } else if (absDiff > 1.5) {
        type = 'magnitude';
      }

      if (type) {
        differences.push({
          valueCode,
          name: dataA.name,
          chartA: { score: scoreA, isPositive: isPositiveA },
          chartB: { score: scoreB, isPositive: isPositiveB },
          difference: absDiff,
          type,
        });
      }
    }
  });

  return differences.sort((a, b) => b.difference - a.difference);
};

// Simplified display component for a single chart
const BinaryComparisonChart = ({ chartData }: { chartData: ChartData }) => {
  const overlayDatasets: OverlayDataset[] = [{
    id: chartData.id,
    label: chartData.displayLabel,
    data: chartData.data,
    color: 'rgba(156, 163, 175, 0.8)',
    isVisible: true,
  }];

  return (
    <div className="w-full max-w-md mx-auto">
      <CircularVisualization datasets={overlayDatasets} compact={true} />
    </div>
  );
};

// Component to display the table of differences
const ComparisonTable = ({
  differences,
  chartLabels,
  selections,
  onSelect,
}: {
  differences: ValueDifference[];
  chartLabels: { a: string, b: string };
  selections: Record<string, 'a' | 'b'>;
  onSelect: (valueCode: string, choice: 'a' | 'b') => void;
}) => {
  if (differences.length === 0) {
    return (
      <div className="mt-8 text-center p-4 bg-gray-50 rounded-lg border border-gray-200">
        <p className="text-gray-600">The two charts are very similar in their value priorities.</p>
      </div>
    );
  }

  const tally = Object.values(selections).reduce((acc, val) => {
    if (val === 'a') acc.a++;
    if (val === 'b') acc.b++;
    return acc;
  }, { a: 0, b: 0 });

  return (
    <div className="mt-8 pt-6 border-t border-gray-200">
      <h4 className="text-lg font-semibold text-center text-gray-900 mb-2">Key Differences</h4>
      <p className="text-center text-sm text-gray-500 mb-6 max-w-2xl mx-auto">
        Click the statement that sounds more like you to help decide.
      </p>

      <div className="flex justify-center items-center gap-6 mb-6 p-3 bg-gray-50 rounded-lg border border-gray-200 max-w-md mx-auto">
        <span className="text-sm text-gray-600">Your tally:</span>
        <span className="font-medium text-gray-900">Chart {chartLabels.a}: {tally.a}</span>
        <span className="font-medium text-gray-900">Chart {chartLabels.b}: {tally.b}</span>
      </div>

      <div className="space-y-3 max-w-4xl mx-auto">
        {differences.map(diff => {
          const isASelected = selections[diff.valueCode] === 'a';
          const isBSelected = selections[diff.valueCode] === 'b';
          return (
            <div key={diff.valueCode} className="border border-gray-200 rounded-lg overflow-hidden bg-white">
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
                <span className="font-medium text-gray-900">{diff.name}</span>
                <span className="text-sm text-gray-500 ml-2">({diff.valueCode})</span>
              </div>
              <div className="grid grid-cols-2 divide-x divide-gray-200">
                <button
                  className={`p-4 text-left transition-colors ${
                    isASelected 
                      ? 'bg-emerald-100 border-l-4 border-l-emerald-500' 
                      : 'hover:bg-gray-50'
                  }`}
                  onClick={() => onSelect(diff.valueCode, 'a')}
                >
                  <div className={`text-sm font-medium mb-1 ${diff.chartA.isPositive ? 'text-emerald-600' : 'text-pink-600'}`}>
                    Score: {diff.chartA.score.toFixed(2)}
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed">{getValueExplanation(diff.valueCode, diff.chartA.score, diff.chartA.isPositive)}</p>
                  {isASelected && (
                    <span className="inline-block mt-2 text-xs font-medium text-emerald-700 bg-emerald-200 px-2 py-0.5 rounded">Selected</span>
                  )}
                </button>
                <button
                  className={`p-4 text-left transition-colors ${
                    isBSelected 
                      ? 'bg-emerald-100 border-r-4 border-r-emerald-500' 
                      : 'hover:bg-gray-50'
                  }`}
                  onClick={() => onSelect(diff.valueCode, 'b')}
                >
                  <div className={`text-sm font-medium mb-1 ${diff.chartB.isPositive ? 'text-emerald-600' : 'text-pink-600'}`}>
                    Score: {diff.chartB.score.toFixed(2)}
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed">{getValueExplanation(diff.valueCode, diff.chartB.score, diff.chartB.isPositive)}</p>
                  {isBSelected && (
                    <span className="inline-block mt-2 text-xs font-medium text-emerald-700 bg-emerald-200 px-2 py-0.5 rounded">Selected</span>
                  )}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  );
};


export const Stage3Modal = ({
  isOpen,
  onClose,
  chartEvaluationData,
  onSelectionComplete
}: Stage3ModalProps) => {
  const [currentRound, setCurrentRound] = useState(1);
  const [currentPhase, setCurrentPhase] = useState<RoundPhase>('setup');
  const [chartOrder, setChartOrder] = useState<ChartData[]>([]);
  const [selectedChart, setSelectedChart] = useState<string | null>(null);
  const [differenceSelections, setDifferenceSelections] = useState<Record<string, 'a' | 'b'>>({});
  const [roundResults, setRoundResults] = useState<RoundResult[]>([]);
  const [roundWinners, setRoundWinners] = useState<Record<number, string>>({});
  const [generatingCharts, setGeneratingCharts] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset everything when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentRound(1);
      setCurrentPhase('setup');
      setChartOrder([]);
      setSelectedChart(null);
      setDifferenceSelections({});
      setRoundResults([]);
      setRoundWinners({});
      setGeneratingCharts(false);
      setError(null);
    }
  }, [isOpen]);

  // Load charts for the current round
  useEffect(() => {
    if (isOpen && currentPhase === 'setup') {
      loadRoundCharts();
    }
  }, [isOpen, currentRound, currentPhase]);

  const loadRoundCharts = () => {
    setGeneratingCharts(true);
    setError(null);

    try {
      if (!chartEvaluationData) throw new Error('No chart evaluation data available');

      let roundCharts: ChartData[] = [];
      const getChart = (id: string, data?: ProcessedValueResult[]) => {
        if (!data) throw new Error(`Missing data for chart ID: ${id}`);
        return { id, data, label: 'Chart', displayLabel: '' };
      };

      switch (currentRound) {
        case 1: roundCharts = [getChart('anti-manual', chartEvaluationData.round_1_anti_manual_data), getChart('manual', chartEvaluationData.round_1_manual_data)]; break;
        case 2: roundCharts = [getChart('anti-llm', chartEvaluationData.round_2_anti_llm_data), getChart('llm', chartEvaluationData.round_2_llm_data)]; break;
        case 3: roundCharts = [getChart('llm', chartEvaluationData.round_2_llm_data), getChart('manual', chartEvaluationData.round_1_manual_data)]; break;
        default: throw new Error('Invalid round number');
      }

      const randomizedCharts = [...roundCharts].sort(() => Math.random() - 0.5);
      const chartsWithLabels = randomizedCharts.map((chart, index) => ({
        ...chart,
        displayLabel: String.fromCharCode(65 + index) // A, B
      }));
      setChartOrder(chartsWithLabels);

      setCurrentPhase('comparison');
    } catch (err) {
      console.error('Error loading round charts:', err);
      setError(err instanceof Error ? err.message : 'Failed to load charts');
    } finally {
      setGeneratingCharts(false);
    }
  };

  const handleDifferenceSelection = (valueCode: string, choice: 'a' | 'b') => {
    setDifferenceSelections(prev => {
      // If clicking the same one again, unselect it.
      if (prev[valueCode] === choice) {
        const newSelections = { ...prev };
        delete newSelections[valueCode];
        return newSelections;
      }
      return { ...prev, [valueCode]: choice };
    });
  };

  const handleBinaryToggle = (chartId: string) => {
    setSelectedChart(chartId);
  };

  const handleNextRound = () => {
    const winner = selectedChart;
    if (!winner) return;

    const roundResult: RoundResult = {
      roundNumber: currentRound,
      roundType: 'binary',
      charts: chartOrder,
      winner,
      roundDescription: getRoundDescription()
    };

    setRoundWinners(prev => ({ ...prev, [currentRound]: winner }));
    const newResults = [...roundResults, roundResult];
    setRoundResults(newResults);

    const maxRounds = getMaxRounds();
    if (currentRound < maxRounds) {
      setCurrentRound(currentRound + 1);
      setCurrentPhase('setup');
      setSelectedChart(null);
      setDifferenceSelections({});
      // Scroll to top of modal content when advancing rounds
      setTimeout(() => {
        const modalContent = document.querySelector('[role="dialog"] .overflow-y-auto');
        if (modalContent) {
          modalContent.scrollTop = 0;
        }
      }, 100);
    } else {
      setCurrentPhase('complete');
      // The final round (round 3) winner is the most important result
      const finalChoice = newResults[2]?.winner; // Round 3 result
      onSelectionComplete(newResults, { finalChoice });
    }
  };

  const getMaxRounds = () => {
    if (!chartEvaluationData) return 0;
    const { round_1_manual_data, round_1_anti_manual_data, round_2_llm_data, round_2_anti_llm_data } = chartEvaluationData;
    if (round_1_manual_data && round_1_anti_manual_data && round_2_llm_data && round_2_anti_llm_data) {
      return 3;
    }
    let rounds = 0;
    if (round_1_manual_data && round_1_anti_manual_data) rounds++;
    if (round_2_llm_data && round_2_anti_llm_data) rounds++;
    return rounds + 1; // Add 1 for the final comparison round
  };

  const getRoundDescription = () => {
    switch (currentRound) {
      case 1: return "Which chart is more like you?";
      case 2: return "Which chart is more like you?";
      case 3: return "Final choice: Which prediction method is more like you?";
      default: return "Select the chart that better represents your values.";
    }
  };

  const getActualChartLabel = (chartId: string) => {
    switch (chartId) {
      case 'manual': return 'Your Manual Survey';
      case 'anti-manual': return 'Anti-Person (Opposite of You)';
      case 'llm': return 'LLM Prediction';
      case 'anti-llm': return 'Anti-LLM (Opposite)';
      default: return chartId;
    }
  };

  const handleClose = () => { onClose(); };

  const maxRounds = getMaxRounds();
  if (maxRounds === 0) {
    return (
      <Dialog open={isOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Stage 3: Incomplete Data</DialogTitle>
            <DialogDescription>
              Chart evaluation data is not available or is incomplete. Please ensure all data sources are ready and try again.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end mt-4">
            <Button onClick={handleClose}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-7xl max-h-[95vh] flex flex-col">
        <DialogHeader className="border-b border-gray-100 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl font-semibold text-gray-900">
                Value Chart Evaluation
              </DialogTitle>
              <DialogDescription className="text-gray-500 mt-1">
                {currentPhase === 'setup' ? 'Preparing charts...' : getRoundDescription()}
              </DialogDescription>
            </div>
            <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
              Round {currentRound} of {maxRounds}
            </span>
          </div>
        </DialogHeader>

        <div className="flex-grow overflow-y-auto -mx-6 px-6">
          {currentPhase === 'setup' && (
            <div className="text-center py-12">
              {generatingCharts ? (
                <div>
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-300 border-t-gray-900 mx-auto mb-4"></div>
                  <p className="text-gray-500">Loading charts...</p>
                </div>
              ) : error ? (
                <div>
                  <p className="text-red-600 mb-4">{error}</p>
                  <Button onClick={loadRoundCharts} variant="outline">Retry</Button>
                </div>
              ) : null}
            </div>
          )}

          {currentPhase === 'comparison' && chartOrder.length === 2 && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start pt-4">
                {chartOrder.map(chart => (
                  <div 
                    key={chart.id} 
                    className={`border-2 rounded-lg transition-all duration-200 ${
                      selectedChart === chart.id 
                        ? 'border-emerald-500 bg-emerald-100' 
                        : 'border-gray-200 bg-white'
                    }`}
                  >
                    <div className="p-4 border-b border-gray-100">
                      <h3 className="text-xl font-semibold text-center text-gray-900">Chart {chart.displayLabel}</h3>
                    </div>
                    <div className="p-4">
                      <BinaryComparisonChart chartData={chart} />
                    </div>
                    <div className="p-4 border-t border-gray-100">
                      <button
                        onClick={() => handleBinaryToggle(chart.id)}
                        className={`w-full py-3 px-4 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                          selectedChart === chart.id 
                            ? 'bg-emerald-600 text-white hover:bg-emerald-700' 
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {selectedChart === chart.id && <CheckCircle size={18} />}
                        {selectedChart === chart.id ? 'Selected' : 'This is more like me'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              
              <ComparisonTable 
                differences={calculateDifferences(chartOrder[0], chartOrder[1])} 
                chartLabels={{ a: chartOrder[0].displayLabel, b: chartOrder[1].displayLabel }}
                selections={differenceSelections}
                onSelect={handleDifferenceSelection}
              />
            </>
          )}

          {currentPhase === 'complete' && (
            <div className="text-center py-12">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Evaluation Complete</h3>
              <p className="text-gray-600 mb-8">
                Thank you for completing all {maxRounds} rounds.
              </p>
              
              <div className="max-w-md mx-auto bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-4 py-3 bg-gray-100 border-b border-gray-200">
                  <h4 className="font-medium text-gray-900">Your Choices</h4>
                </div>
                <div className="divide-y divide-gray-200">
                  {roundResults.map((result, index) => (
                    <div key={index} className="px-4 py-3 flex justify-between items-center">
                      <span className="text-sm text-gray-600">Round {result.roundNumber}</span>
                      <span className="font-medium text-gray-900">{getActualChartLabel(result.winner!)}</span>
                    </div>
                  ))}
                </div>
              </div>
              
              <Button onClick={handleClose} className="mt-8 bg-gray-900 hover:bg-gray-800">Close</Button>
            </div>
          )}
        </div>
        
        {currentPhase === 'comparison' && (
          <div className="flex justify-between items-center pt-4 border-t border-gray-100 -mx-6 px-6">
            <button 
              onClick={handleClose}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Cancel
            </button>
            <Button
              onClick={handleNextRound}
              disabled={!selectedChart}
              className="bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300"
            >
              {currentRound < maxRounds ? 'Continue to Next Round' : 'Complete Evaluation'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}; 