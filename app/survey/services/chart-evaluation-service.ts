import { createClient } from '@/utils/supabase/client';
import { ProcessedValueResult } from '@/components/survey/value-utils';
import { generateAntiPersonChart } from './chart-generation-service';

export interface ChartEvaluationData {
  id: string;
  user_id: string;
  charts_generated: boolean;
  generation_completed_at?: string;
  generation_metadata?: any;
  
  // Chart data storage (all charts generated once)
  round_1_manual_data?: ProcessedValueResult[];
  round_1_anti_manual_data?: ProcessedValueResult[];
  round_2_llm_data?: ProcessedValueResult[];
  round_2_anti_llm_data?: ProcessedValueResult[];
  
  // Round 1: Anti-manual vs Manual (validation)
  round_1_completed: boolean;
  round_1_winner?: string; // 'manual' or 'anti-manual' (should be 'manual')
  round_1_completed_at?: string;
  
  // Round 2: Anti-LLM vs LLM (validation)
  round_2_completed: boolean;
  round_2_winner?: string; // 'llm-individual' or 'anti-individual' (should be 'llm-individual')
  round_2_completed_at?: string;
  
  // Round 3: LLM vs Manual (final choice)
  round_3_completed: boolean;
  round_3_winner?: string; // 'manual' or 'llm-individual' 
  round_3_completed_at?: string;
  
  // Overall completion
  all_rounds_completed: boolean;
  final_completed_at?: string;
  final_choice?: string; // The most important result: 'manual' or 'llm-individual'
  
  created_at: string;
  updated_at: string;
}

export interface GenerationProgress {
  step: string;
  progress: number; // 0-100
  message: string;
}

/**
 * Check if chart evaluation data exists for a user
 */
export async function getChartEvaluationData(userId: string): Promise<{
  success: boolean;
  data?: ChartEvaluationData;
  error?: string;
}> {
  try {
    const supabase = createClient();
    
    const { data, error } = await supabase
      .from('stage3_experiment')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
      throw error;
    }
    
    return {
      success: true,
      data: data ? {
        ...data,
        // Parse JSONB fields back to arrays/objects
        round_1_manual_data: data.round_1_manual_data as ProcessedValueResult[],
        round_1_anti_manual_data: data.round_1_anti_manual_data as ProcessedValueResult[],
        
        round_2_llm_data: data.round_2_llm_data as ProcessedValueResult[],
        round_2_anti_llm_data: data.round_2_anti_llm_data as ProcessedValueResult[],
      } : undefined
    };
  } catch (error) {
    console.error('Error getting chart evaluation data:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Generate all charts for simplified Stage 1 experiment (2 rounds only)
 * @param userId - User ID
 * @param manualData - Manual survey data
 * @param llmBatchData - Not used anymore but kept for compatibility
 * @param llmData - LLM prediction data
 * @param onProgress - Progress callback
 * @param forceRegenerate - Force regeneration of charts
 * @param userApiKey - Optional user-provided Gemini API key
 */
export async function generateAndStoreAllCharts(
  userId: string,
  manualData?: ProcessedValueResult[],
  llmBatchData?: ProcessedValueResult[], // Not used anymore but kept for compatibility
  llmData?: ProcessedValueResult[],
  onProgress?: (progress: GenerationProgress) => void,
  forceRegenerate = false,
  userApiKey?: string
): Promise<{
  success: boolean;
  data?: ChartEvaluationData;
  error?: string;
}> {
  try {
    const supabase = createClient();
    
    onProgress?.({ step: 'Initializing', progress: 5, message: 'Initializing chart generation...' });
    
    // Only 2 rounds needed now: Manual + LLM
    const availableRounds = [];
    if (manualData) availableRounds.push('manual');
    if (llmData) availableRounds.push('llm');
    
    const totalRounds = availableRounds.length;
    const progressPerRound = Math.floor(80 / Math.max(totalRounds, 1)); // Reserve 10% for start/save
    
    // Track what data is available
    const availableData = {
      manual: !!manualData,
      llm: !!llmData
    };
    
    // Check if we already have some data cached in database (unless forcing regeneration)
    onProgress?.({ step: 'Checking Cache', progress: 10, message: forceRegenerate ? 'Force regenerating all charts...' : 'Checking for existing chart data...' });
    
    let chartData: Partial<ChartEvaluationData> = {};
    
    if (!forceRegenerate) {
      const existingData = await getChartEvaluationData(userId);
      if (existingData.success && existingData.data) {
        // Use existing data as base and only regenerate missing parts
        chartData = { ...existingData.data };
        console.log('[Chart Generation] Found existing chart data, checking what needs regeneration...');
      }
    } else {
      console.log('[Chart Generation] Force regeneration requested, ignoring existing data...');
    }
    
    // Initialize new chart data if none exists or force regeneration
    if (!chartData.user_id) {
      chartData = {
        user_id: userId,
        charts_generated: false,
        generation_metadata: {
          available_data: availableData,
          generation_timestamp: new Date().toISOString(),
          force_regenerate: forceRegenerate
        },
        round_1_completed: false,
        round_2_completed: false,
        round_3_completed: false,
        all_rounds_completed: false
      };
    }
    
    let currentProgress = 15;
    let roundCounter = 0;
    
    // Helper function to save progress incrementally
    const saveProgressToDatabase = async (progressData: Partial<ChartEvaluationData>, stepName: string) => {
      try {
        progressData.updated_at = new Date().toISOString();
        const { error } = await supabase
          .from('stage3_experiment')
          .upsert({
            user_id: userId,
            ...progressData
          }, { 
            onConflict: 'user_id',
            ignoreDuplicates: false 
          });
        
        if (error) {
          console.error(`[Chart Generation] Failed to save ${stepName} progress:`, error);
        } else {
          console.log(`[Chart Generation] Saved ${stepName} progress to database`);
        }
      } catch (err) {
        console.error(`[Chart Generation] Error saving ${stepName} progress:`, err);
      }
    };
    
    // Round 1: Manual vs Anti-Manual
    if (manualData) {
      roundCounter++;
      
      // Check if we already have this round's data (unless force regenerating)
      if (forceRegenerate || !chartData.round_1_manual_data || !chartData.round_1_anti_manual_data) {
        onProgress?.({ 
          step: `Round 1 (${roundCounter}/${totalRounds})`, 
          progress: currentProgress, 
          message: 'Generating Manual vs Anti-Manual charts...' 
        });
        
        chartData.round_1_manual_data = manualData;
        
        // Generate anti-manual chart
        onProgress?.({ 
          step: `Round 1 (${roundCounter}/${totalRounds})`, 
          progress: currentProgress + Math.floor(progressPerRound * 0.5), 
          message: 'Generating Anti-Manual personality chart...' 
        });
        
        const antiManualResult = await generateAntiPersonChart(manualData, userId, 'anti-manual', userApiKey);
        if (!antiManualResult.success || !antiManualResult.data) {
          const errorMsg = `Failed to generate anti-manual chart: ${antiManualResult.error}`;
          onProgress?.({ step: 'Error', progress: currentProgress, message: errorMsg });
          throw new Error(errorMsg);
        }
        chartData.round_1_anti_manual_data = antiManualResult.data.processedResults;
        
        console.log('[Chart Generation] Generated Round 1 anti-manual chart');
        
        // SAVE PROGRESS IMMEDIATELY after Round 1 completes
        await saveProgressToDatabase({
          round_1_manual_data: chartData.round_1_manual_data,
          round_1_anti_manual_data: chartData.round_1_anti_manual_data,
          generation_metadata: chartData.generation_metadata
        }, 'Round 1');
      } else {
        console.log('[Chart Generation] Using cached Round 1 data');
      }
      
      currentProgress += progressPerRound;
    }
    
    // Round 2: LLM vs Anti-LLM
    if (llmData) {
      roundCounter++;
      
      // Check if we already have this round's data (unless force regenerating)
      if (forceRegenerate || !chartData.round_2_llm_data || !chartData.round_2_anti_llm_data) {
        onProgress?.({ 
          step: `Round 2 (${roundCounter}/${totalRounds})`, 
          progress: currentProgress, 
          message: 'Generating LLM vs Anti-LLM charts...' 
        });
        
        chartData.round_2_llm_data = llmData;
        
        // Generate anti-LLM chart
        onProgress?.({ 
          step: `Round 2 (${roundCounter}/${totalRounds})`, 
          progress: currentProgress + Math.floor(progressPerRound * 0.5), 
          message: 'Generating Anti-LLM personality chart...' 
        });
        
        const antiLlmResult = await generateAntiPersonChart(llmData, userId, 'anti-llm', userApiKey);
        if (!antiLlmResult.success || !antiLlmResult.data) {
          const errorMsg = `Failed to generate anti-LLM chart: ${antiLlmResult.error}`;
          onProgress?.({ step: 'Error', progress: currentProgress, message: errorMsg });
          throw new Error(errorMsg);
        }
        chartData.round_2_anti_llm_data = antiLlmResult.data.processedResults;
        
        console.log('[Chart Generation] Generated Round 2 anti-LLM chart');
        
        // SAVE PROGRESS IMMEDIATELY after Round 2 completes
        await saveProgressToDatabase({
          round_2_llm_data: chartData.round_2_llm_data,
          round_2_anti_llm_data: chartData.round_2_anti_llm_data
        }, 'Round 2');
      } else {
        console.log('[Chart Generation] Using cached Round 2 data');
      }
      
      currentProgress += progressPerRound;
    }
    
    // Mark as generated
    chartData.charts_generated = true;
    chartData.generation_completed_at = new Date().toISOString();
    chartData.updated_at = new Date().toISOString();
    
    onProgress?.({ step: 'Saving', progress: 95, message: 'Saving all charts to database...' });
    
    // Upsert to database with proper conflict resolution
    const { data: savedData, error: saveError } = await supabase
      .from('stage3_experiment')
      .upsert(chartData, { 
        onConflict: 'user_id',
        ignoreDuplicates: false 
      })
      .select()
      .single();
    
    if (saveError) {
      console.error('[Chart Generation] Database save error:', saveError);
      throw saveError;
    }
    
    onProgress?.({ step: 'Complete', progress: 100, message: 'All charts generated and saved successfully!' });
    
    console.log('[Chart Generation] Successfully saved chart data for user', userId);
    
    // Parse the saved data back to proper format
    const result: ChartEvaluationData = {
      ...savedData,
      round_1_manual_data: savedData.round_1_manual_data as ProcessedValueResult[],
      round_1_anti_manual_data: savedData.round_1_anti_manual_data as ProcessedValueResult[],
      
      round_2_llm_data: savedData.round_2_llm_data as ProcessedValueResult[],
      round_2_anti_llm_data: savedData.round_2_anti_llm_data as ProcessedValueResult[],
    };
    
    return {
      success: true,
      data: result
    };
    
  } catch (error) {
    console.error('Error generating and storing charts:', error);
    onProgress?.({ step: 'Error', progress: 0, message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Save Stage 1 completion results to database (simplified 3-round system)
 */
export async function saveStage3Results(
  userId: string,
  roundResults: any[],
  roundMetadata?: { finalChoice?: string }
): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const supabase = createClient();
    
    // Prepare update data based on round results
    const updateData: any = {};
    
    roundResults.forEach(result => {
      const roundNum = result.roundNumber;
      const winner = result.winner;
      const completedAt = new Date().toISOString();
      
      if (roundNum >= 1 && roundNum <= 3) {
        // All 3 rounds are binary comparisons
        updateData[`round_${roundNum}_completed`] = true;
        updateData[`round_${roundNum}_winner`] = winner;
        updateData[`round_${roundNum}_completed_at`] = completedAt;
      }
    });
    
    // Store final choice (most important result from round 3)
    if (roundMetadata?.finalChoice) {
      updateData.final_choice = roundMetadata.finalChoice;
    }
    
    // Mark overall completion if all 3 rounds are done
    const hasAllRounds = roundResults.length >= 3 &&
                        roundResults.some(r => r.roundNumber === 1) &&
                        roundResults.some(r => r.roundNumber === 2) &&
                        roundResults.some(r => r.roundNumber === 3);
    
    if (hasAllRounds) {
      updateData.all_rounds_completed = true;
      updateData.final_completed_at = new Date().toISOString();
    }
    
    updateData.updated_at = new Date().toISOString();
    
    const { error } = await supabase
      .from('stage3_experiment')
      .update(updateData)
      .eq('user_id', userId);
    
    if (error) {
      throw error;
    }
    
    console.log('[Chart Evaluation] Saved Stage 1 results for user', userId, 'with', roundResults.length, 'rounds');
    return { success: true };
    
  } catch (error) {
    console.error('Error saving Stage 1 results:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
} 