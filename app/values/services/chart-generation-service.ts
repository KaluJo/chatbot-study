import { Type } from "@google/genai";
import { ProcessedValueResult, VALUE_DATA } from '@/components/survey/value-utils';
import { callGeminiWithThinking, ThinkingLogParams } from '@/app/utils/thinking-logger';
import { GEMINI_PRO } from '@/app/config/models';

// Constants
const MODEL_NAME = GEMINI_PRO;

// Interface for anti-person generation result
export interface AntiPersonResult {
  success: boolean;
  data?: {
    processedResults: ProcessedValueResult[];
    reasoning: string;
  };
  error?: string;
}

/**
 * Generate an "anti-person" chart with opposite Schwartz values
 * @param originalValues - The original ProcessedValueResult array to create opposites of
 * @param userId - User ID for thinking logs
 * @param chartType - Optional chart type for caching/logging purposes
 * @param userApiKey - Optional user-provided Gemini API key
 * @returns Anti-person ProcessedValueResult array
 */
export async function generateAntiPersonChart(
  originalValues: ProcessedValueResult[],
  userId?: string,
  chartType?: string,
  userApiKey?: string
): Promise<AntiPersonResult> {
  try {
    console.log(`[Anti-Person Generation] Starting generation for ${chartType || 'unknown'} chart type`);

    // Format the original values for the prompt
    const valuesDescription = originalValues.map(val => 
      `${val.name} (${val.value}): centered score ${val.centeredScore.toFixed(2)}, raw score ${val.rawValueInverted.toFixed(2)}`
    ).join('\n');

    const prompt = `You are an expert in Schwartz's theory of basic human values and psychological profiling.

TASK: Create an "anti-person" - someone with completely opposite value priorities to the given person.

ORIGINAL PERSON'S VALUES:
${valuesDescription}

INSTRUCTIONS:
Analyze the original person's values and create their psychological opposite. For each of the 19 Schwartz values, provide a score from 1-6 where:
- 1 = Not at all important to this anti-person
- 2 = Not important 
- 3 = Slightly not important
- 4 = Slightly important
- 5 = Important
- 6 = Very important

ANTI-PERSON LOGIC:
- If original person scores HIGH on a value (above their average), anti-person should score LOW
- If original person scores LOW on a value (below their average), anti-person should score HIGH
- Create realistic opposing patterns that form a coherent personality
- Consider value relationships: Security ↔ Stimulation, Conformity ↔ Self-Direction, etc.

Provide exactly one score (1-6) for each value code in the specified order.

REQUIRED VALUES IN ORDER:
1. SDT (Self-Direction-Thought)
2. SDA (Self-Direction-Action)
3. ST (Stimulation)
4. HE (Hedonism)
5. AC (Achievement)
6. POD (Power-Dominance)
7. POR (Power-Resources)
8. FAC (Face)
9. SEP (Security-Personal)
10. SES (Security-Societal)
11. TR (Tradition)
12. COR (Conformity-Rules)
13. COI (Conformity-Interpersonal)
14. HUM (Humility)
15. UNN (Universalism-Nature)
16. UNC (Universalism-Concern)
17. UNT (Universalism-Tolerance)
18. BEC (Benevolence-Caring)
19. BED (Benevolence-Dependability)`;

    const thinkingParams: ThinkingLogParams = {
      userId,
      serviceName: 'chart-generation-service',
      operationName: `generateAntiPersonChart${chartType ? `_${chartType}` : ''}`,
      modelName: MODEL_NAME,
      thinkingBudget: 10000,
      promptExcerpt: prompt.substring(0, 500),
      userApiKey
    };

    const response = await callGeminiWithThinking(
      null,
      {
        model: MODEL_NAME,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              scores: {
                type: Type.ARRAY,
                items: { type: Type.INTEGER },
                description: "Array of exactly 19 scores (1-6) for the values in order: SDT,SDA,ST,HE,AC,POD,POR,FAC,SEP,SES,TR,COR,COI,HUM,UNN,UNC,UNT,BEC,BED"
              },
              reasoning: { type: Type.STRING }
            },
            required: ["scores", "reasoning"]
          },
          thinkingConfig: {
            thinkingBudget: 10000,
          }
        }
      },
      thinkingParams
    );

    const responseText = response.text;
    if (!responseText) {
      return { success: false, error: 'Empty response from AI' };
    }

    try {
      const parsed = JSON.parse(responseText);
      
      if (!parsed.scores || !Array.isArray(parsed.scores) || parsed.scores.length !== 19) {
        throw new Error(`Invalid response format: expected 19 scores, got ${parsed.scores?.length || 0}`);
      }
      
      // Validate and log the scores for debugging
      console.log('[Anti-Person] Generated scores:', parsed.scores);
      
      // Convert array of scores to ProcessedValueResult format
      const processedResults = convertScoresToProcessedResults(parsed.scores);
      
      console.log(`[Anti-Person Generation] Successfully generated ${processedResults.length} processed results for ${chartType || 'unknown'} chart`);
      
      return {
        success: true,
        data: {
          processedResults,
          reasoning: parsed.reasoning || "Anti-person generated"
        }
      };
    } catch (parseError) {
      console.error('Error parsing anti-person response:', parseError);
      return { success: false, error: 'Failed to parse AI response' };
    }
  } catch (error) {
    console.error('Error generating anti-person chart:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Generate a random chart with centered scores
 * @returns Random ProcessedValueResult array
 */
export function generateRandomChart(): ProcessedValueResult[] {
  const allValueCodes = Object.keys(VALUE_DATA);
  
  // Generate random scores between 1-6, then center them
  const rawScores = allValueCodes.map(() => Math.random() * 5 + 1); // 1-6 range
  const mrat = rawScores.reduce((sum, score) => sum + score, 0) / rawScores.length;
  
  return allValueCodes.map((valueCode, index) => {
    const valueData = VALUE_DATA[valueCode as keyof typeof VALUE_DATA];
    const rawScore = rawScores[index];
    
    return {
      value: valueCode,
      name: valueData.name,
      color: valueData.color,
      description: valueData.description,
      angle: valueData.angle,
      rawValueInverted: rawScore,
      centeredScore: rawScore - mrat
    };
  });
}

/**
 * Convert array of scores to ProcessedValueResult format (similar to batch prediction service)
 */
function convertScoresToProcessedResults(scores: number[]): ProcessedValueResult[] {
  // Define the value codes in the exact order we expect them
  const valueCodesInOrder = [
    'SDT', 'SDA', 'ST', 'HE', 'AC', 'POD', 'POR', 'FAC', 
    'SEP', 'SES', 'TR', 'COR', 'COI', 'HUM', 'UNN', 'UNC', 'UNT', 'BEC', 'BED'
  ];
  
  // Calculate MRAT from the predicted scores (like batch prediction service)
  const sumOfScores = scores.reduce((sum, score) => sum + score, 0);
  const mrat = sumOfScores / scores.length;
  
  return scores.map((score, index) => {
    const valueCode = valueCodesInOrder[index];
    const valueData = VALUE_DATA[valueCode as keyof typeof VALUE_DATA];
    
    if (!valueData) {
      console.warn(`No value data found for code: ${valueCode}`);
    }
    
    // Validate and clamp scores to 1-6 range
    const clampedScore = Math.min(6, Math.max(1, Math.round(score)));
    
    return {
      value: valueCode,
      name: valueData?.name || `Unknown Value: ${valueCode}`,
      color: valueData?.color || '#cccccc',
      description: valueData?.description || 'No description available',
      angle: valueData?.angle,
      rawValueInverted: clampedScore,
      centeredScore: clampedScore - mrat
    };
  });
} 