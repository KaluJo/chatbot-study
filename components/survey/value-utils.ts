// Map of value codes to full names and their positions in the circular model
export const VALUE_DATA = {
  // Self-Transcendence values
  UNN: { 
    name: 'Universalism-Nature', 
    color: '#3B82F6', // blue
    angle: 185, 
    quadrant: 'Self-Transcendence',
    description: 'Preservation of the natural environment'
  },
  UNC: { 
    name: 'Universalism-Concern', 
    color: '#2563EB', // darker blue
    angle: 202, 
    quadrant: 'Self-Transcendence',
    description: 'Commitment to equality, justice, and protection for all people'
  },
  UNT: { 
    name: 'Universalism-Tolerance', 
    color: '#60A5FA', // lighter blue
    angle: 219, 
    quadrant: 'Self-Transcendence',
    description: 'Acceptance and understanding of those who are different from oneself'
  },
  BEC: { 
    name: 'Benevolence-Care', 
    color: '#10B981', // green
    angle: 237.5, 
    quadrant: 'Self-Transcendence',
    description: 'Devotion to the welfare of ingroup members'
  },
  BED: { 
    name: 'Benevolence-Dependability', 
    color: '#34D399', // lighter green
    angle: 260, 
    quadrant: 'Self-Transcendence',
    description: 'Being a reliable and trustworthy member of the ingroup'
  },
  
  // Openness to Change values
  SDT: { 
    name: 'Self-Direction-Thought', 
    color: '#84CC16', // lime
    angle: 285, 
    quadrant: 'Openness to Change',
    description: 'Freedom to cultivate one\'s own ideas and abilities'
  },
  SDA: { 
    name: 'Self-Direction-Action', 
    color: '#A3E635', // lighter lime
    angle: 310, 
    quadrant: 'Openness to Change',
    description: 'Freedom to determine one\'s own actions'
  },
  ST: { 
    name: 'Stimulation', 
    color: '#F97316', // orange
    angle: 330, 
    quadrant: 'Openness to Change',
    description: 'Excitement, novelty, and challenge in life'
  },
  HE: { 
    name: 'Hedonism', 
    color: '#F59E0B', // amber
    angle: 350, 
    quadrant: 'Openness to Change/Self-Enhancement',
    description: 'Pleasure and sensuous gratification for oneself'
  },
  
  // Self-Enhancement values
  AC: { 
    name: 'Achievement', 
    color: '#EF4444', // red
    angle: 10, 
    quadrant: 'Self-Enhancement',
    description: 'Success according to social standards'
  },
  POD: { 
    name: 'Power-Dominance', 
    color: '#E11D48', // rose
    angle: 30, 
    quadrant: 'Self-Enhancement',
    description: 'Power through exercising control over people'
  },
  POR: { 
    name: 'Power-Resources', 
    color: '#FB7185', // lighter rose
    angle: 50, 
    quadrant: 'Self-Enhancement',
    description: 'Power through control of material and social resources'
  },
  FAC: { 
    name: 'Face', 
    color: '#C026D3', // fuchsia
    angle: 68.5, 
    quadrant: 'Self-Enhancement/Conservation',
    description: 'Security and power through maintaining one\'s public image and avoiding humiliation'
  },
  
  // Conservation values
  SEP: { 
    name: 'Security-Personal', 
    color: '#A855F7', // purple
    angle: 86.5, 
    quadrant: 'Conservation',
    description: 'Safety in one\'s immediate environment'
  },
  SES: { 
    name: 'Security-Societal', 
    color: '#8B5CF6', // violet
    angle: 104, 
    quadrant: 'Conservation',
    description: 'Safety and stability in the wider society'
  },
  TR: { 
    name: 'Tradition', 
    color: '#6366F1', // indigo
    angle: 120, 
    quadrant: 'Conservation',
    description: 'Maintaining and preserving cultural, family, or religious traditions'
  },
  COR: { 
    name: 'Conformity-Rules', 
    color: '#4F46E5', // darker indigo
    angle: 137.5, 
    quadrant: 'Conservation',
    description: 'Compliance with rules, laws, and formal obligations'
  },
  COI: { 
    name: 'Conformity-Interpersonal', 
    color: '#818CF8', // lighter indigo
    angle: 153, 
    quadrant: 'Conservation',
    description: 'Avoidance of upsetting or harming other people'
  },
  HUM: { 
    name: 'Humility', 
    color: '#A78BFA', // lighter violet
    angle: 170, 
    quadrant: 'Conservation/Self-Transcendence',
    description: 'Recognizing one\'s insignificance in the larger scheme of things'
  },
}

// Grouping values by their quadrants for better comparison
export const QUADRANTS = {
  'Self-Transcendence': ['UNN', 'UNC', 'UNT', 'BEC', 'BED', 'HUM'],
  'Conservation': ['TR', 'COR', 'COI', 'SEP', 'SES'],
  'Self-Enhancement': ['POD', 'POR', 'AC', 'FAC'],
  'Openness to Change': ['SDT', 'SDA', 'ST', 'HE'],
}

// Definitions for the 19 values in PVQ-RR and their corresponding question IDs
export const PVQ_BASIC_VALUES_ITEMS: Record<string, number[]> = {
  SDT: [1, 23, 39],    // Self-Direction Thought
  SDA: [16, 30, 56],   // Self-Direction Action
  ST: [10, 28, 43],    // Stimulation
  HE: [3, 36, 46],     // Hedonism
  AC: [17, 32, 48],    // Achievement
  POD: [6, 29, 41],    // Power Dominance
  POR: [12, 20, 44],   // Power Resources
  FAC: [9, 24, 49],    // Face
  SEP: [13, 26, 53],   // Security Personal
  SES: [2, 35, 50],    // Security Societal
  TR: [18, 33, 40],    // Tradition
  COR: [15, 31, 42],   // Conformity Rules
  COI: [4, 22, 51],    // Conformity Interpersonal
  HUM: [7, 38, 54],    // Humility
  UNN: [8, 21, 45],    // Universalism Nature
  UNC: [5, 37, 52],    // Universalism Concern
  UNT: [14, 34, 57],   // Universalism Tolerance
  BEC: [11, 25, 47],   // Benevolence Care
  BED: [19, 27, 55],   // Benevolence Dependability
};

// Definitions for the original 10 Higher Order Values based on PVQ-RR scoring guide
export const HIGHER_ORDER_VALUE_DEFINITIONS = {
  'Self-Direction': ['SDT', 'SDA'],
  'Stimulation': ['ST'],
  'Hedonism': ['HE'],
  'Achievement': ['AC'],
  'Power': ['POD', 'POR'],
  'Security': ['SEP', 'SES'],
  'Conformity': ['COR', 'COI'],
  'Tradition': ['TR'],
  'Benevolence': ['BEC', 'BED'],
  'Universalism': ['UNN', 'UNC', 'UNT'],
};

// Definitions for the 4 Higher Order Value categories
export const HIGHER_ORDER_CATEGORIES = {
  'Self-Transcendence': ['UNN', 'UNC', 'UNT', 'BEC', 'BED'],
  'Conservation': ['SEP', 'SES', 'TR', 'COR', 'COI'],
  'Self-Enhancement': ['AC', 'POD', 'POR'],
  'Openness to Change': ['SDT', 'SDA', 'ST', 'HE'],
};

// Note: HUM (Humility) and FAC (Face) are on the borders between categories
// According to the official PVQ-RR scoring guide: "Humility and Face may also be included in conservation, 
// if no structural analysis is done to check their location in your own sample. 
// Alternatively, they could be treated as separate values."
// We treat them as separate values in our current implementation.

// Types for value data
export interface ValueResult {
  value: string
  score: number // Represents raw average score before centering
}

export interface ProcessedValueResult {
  value: string; // Value code, e.g., "UNN"
  name: string;
  color: string;
  description: string;
  angle?: number; // Original angle from VALUE_DATA for circular visualizations
  rawValueInverted: number; // Mean raw score (1-6 scale, 6=high importance) before centering
  centeredScore: number; // MRAT-centered score
}

/**
 * Processes raw PVQ-RR answers (57 questions) to calculate centered scores for the 19 values.
 * Raw answers are on a 1-6 scale (6 = Very much like me, 1 = Not like me at all).
 *
 * Steps:
 * 1. Scores are already on the correct scale (6 = Very important, 1 = Not important).
 * 2. Calculate MRAT (Mean Rating Across All Fifty-seven items) using the scores.
 * 3. For each of the 19 values:
 *    a. Calculate its mean score using its constituent items.
 *    b. Subtract MRAT from this mean score to get the centered score.
 */
export function processValueResults(
  rawAnswers: Record<number, number> // e.g., {1: score, 2: score, ..., 57: score}
): ProcessedValueResult[] {
  if (Object.keys(rawAnswers).length !== 57) {
    console.warn("processValueResults: Expected 57 answers, received:", Object.keys(rawAnswers).length);
    return [];
  }

  const scores: Record<number, number> = {};
  let sumOfAllScores = 0;
  for (let i = 1; i <= 57; i++) {
    const rawScore = rawAnswers[i];
    if (rawScore === undefined || rawScore < 1 || rawScore > 6) {
      console.warn('Invalid raw score for question ' + i + ': ' + rawScore);
      scores[i] = 3.5; 
    } else {
      scores[i] = rawScore; // No inversion needed - 6 already means high importance
    }
    sumOfAllScores += scores[i];
  }

  const mrat = sumOfAllScores / 57;
  const processedResults: ProcessedValueResult[] = [];

  for (const valueCode in PVQ_BASIC_VALUES_ITEMS) {
    const items = PVQ_BASIC_VALUES_ITEMS[valueCode];
    let sumOfValueScores = 0;
    let validItemsCount = 0;
    items.forEach(itemId => {
      if (scores[itemId] !== undefined) {
        sumOfValueScores += scores[itemId];
        validItemsCount++;
      }
    });

    if (validItemsCount > 0) {
      const rawValue = sumOfValueScores / validItemsCount;
      const centeredScore = rawValue - mrat;
      const valueMetaData = VALUE_DATA[valueCode as keyof typeof VALUE_DATA];
      if (valueMetaData) {
        processedResults.push({
          value: valueCode,
          name: valueMetaData.name,
          color: valueMetaData.color,
          description: valueMetaData.description,
          angle: valueMetaData.angle,
          rawValueInverted: rawValue,
          centeredScore: centeredScore,
        });
      }
    } else {
      console.warn('No valid items found for value code ' + valueCode);
    }
  }
  return processedResults;
}

/**
 * Calculate the average centered scores for each of the four higher-order value categories.
 * Uses the centered scores of the 19 values.
 */
export function calculateHigherOrderCategoryScores(
  centeredBasicValues: ProcessedValueResult[]
): Record<string, number> {
  const higherOrderScores: Record<string, number> = {};
  for (const category in HIGHER_ORDER_CATEGORIES) {
    const constituentValueCodes = HIGHER_ORDER_CATEGORIES[category as keyof typeof HIGHER_ORDER_CATEGORIES];
    let sumOfCenteredScores = 0;
    let count = 0;
    constituentValueCodes.forEach(valueCode => {
      const basicValueResult = centeredBasicValues.find(v => v.value === valueCode);
      if (basicValueResult) {
        sumOfCenteredScores += basicValueResult.centeredScore;
        count++;
      }
    });
    if (count > 0) {
      higherOrderScores[category] = sumOfCenteredScores / count;
    } else {
      higherOrderScores[category] = 0;
    }
  }
  return higherOrderScores;
}

/**
 * Calculate the average centered scores for the original 10 values.
 * Uses the centered scores of the 19 values.
 */
export function calculateOriginalTenValueScores(
  centeredBasicValues: ProcessedValueResult[]
): Record<string, number> {
  const originalValueScores: Record<string, number> = {};
  for (const originalValue in HIGHER_ORDER_VALUE_DEFINITIONS) {
    const constituentValueCodes = HIGHER_ORDER_VALUE_DEFINITIONS[originalValue as keyof typeof HIGHER_ORDER_VALUE_DEFINITIONS];
    let sumOfCenteredScores = 0;
    let count = 0;
    constituentValueCodes.forEach(valueCode => {
      const basicValueResult = centeredBasicValues.find(v => v.value === valueCode);
      if (basicValueResult) {
        sumOfCenteredScores += basicValueResult.centeredScore;
        count++;
      }
    });
    if (count > 0) {
      originalValueScores[originalValue] = sumOfCenteredScores / count;
    } else {
      originalValueScores[originalValue] = 0;
    }
  }
  return originalValueScores;
}

/**
 * For visualizations, calculate quadrant average scores from the 19 centered values
 */
export function calculateQuadrantAverageCenteredScores(results: ProcessedValueResult[]): Record<string, number> {
  return Object.entries(QUADRANTS).reduce((acc, [quadrant, values]) => {
    const quadrantScores = results
      .filter(r => values.includes(r.value))
      .map(r => r.centeredScore); 
    const average = quadrantScores.length > 0 
      ? quadrantScores.reduce((sum, score) => sum + score, 0) / quadrantScores.length 
      : 0; 
    acc[quadrant] = average;
    return acc;
  }, {} as Record<string, number>);
} 