import { createClient } from '@/utils/supabase/client';
import { GEMINI_PRO, GEMINI_FLASH } from '@/app/config/models';

export interface ThinkingLogParams {
  userId?: string;
  serviceName: string;
  operationName: string;
  sessionId?: string;
  windowId?: string;
  modelName?: string;
  thinkingBudget?: number;
  promptExcerpt?: string;
  userApiKey?: string; // Optional: user-provided API key for features requiring their own key
}

export interface GeminiResponseWithThinking {
  text: string;
  thinking?: string;
}

// Model name for thinking-compatible operations
const THINKING_COMPATIBLE_MODEL = GEMINI_PRO;

// Export for convenience
export { GEMINI_PRO, GEMINI_FLASH };

/**
 * Enhanced Gemini API call that captures thinking summaries
 * Now uses API route instead of direct Gemini SDK call
 */
export async function callGeminiWithThinking(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _ai: unknown, // Kept for backwards compatibility, but not used
  config: {
    model?: string;
    contents: string;
    config?: {
      responseMimeType?: string;
      responseSchema?: unknown;
      thinkingConfig?: {
        thinkingBudget?: number;
      };
    };
  },
  logParams: ThinkingLogParams,
  logger?: (message: string, type?: 'info' | 'error' | 'warning') => void
): Promise<GeminiResponseWithThinking> {
  const startTime = Date.now();
  
  const log = (message: string, type: 'info' | 'error' | 'warning' = 'info') => {
    if (logger) {
      logger(message, type);
    }
    if (type === 'error') {
      console.error(message);
    } else if (type === 'warning') {
      console.warn(message);
    } else {
      console.log(message);
    }
  };

  try {
    log(`[${logParams.serviceName}] Starting Gemini call for ${logParams.operationName} via API route`);
    
    // Call server API route instead of direct Gemini SDK
    const response = await fetch('/api/gemini/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: config.contents,
        model: config.model || THINKING_COMPATIBLE_MODEL,
        responseSchema: config.config?.responseSchema,
        thinkingBudget: config.config?.thinkingConfig?.thinkingBudget || logParams.thinkingBudget || 10000,
        userApiKey: logParams.userApiKey, // Pass user's API key if provided
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      // Provide user-friendly error messages
      if (response.status === 429) {
        const retryAfter = data.retryAfter || 60;
        throw new Error(
          `Rate limit exceeded. The free tier of Gemini API has strict limits. ` +
          `To fix this: Go to console.cloud.google.com → APIs & Services → Gemini API → ` +
          `add a billing account to increase your quota. Retry in ${retryAfter}s.`
        );
      }
      if (response.status === 503) {
        throw new Error(
          `AI service not configured. Please add your GEMINI_API_KEY in .env.local ` +
          `or configure it in your deployment settings.`
        );
      }
      throw new Error(data.error || `API error: ${response.status}`);
    }
    const executionTime = Date.now() - startTime;
    
    if (data.error) {
      throw new Error(data.error);
    }

    const content = data.text || '';
    const thinking = data.thinkingSummary || '';
    
    log(`[${logParams.serviceName}] Completed ${logParams.operationName} in ${executionTime}ms`);
    
    if (thinking) {
      log(`[${logParams.serviceName}] 🧠 Thinking summary captured (${thinking.length} chars)`, 'info');
      
      // Store thinking summary in database (client-side Supabase call)
      await storeThinkingSummary({
        ...logParams,
        thinkingSummary: thinking,
        responseContent: content.substring(0, 5000),
        executionTimeMs: executionTime
      });
    } else {
      log(`[${logParams.serviceName}] ⚠️ No thinking summary was generated for this call`, 'warning');
    }
    
    return {
      text: content,
      thinking: thinking || undefined
    };
    
  } catch (error) {
    const executionTime = Date.now() - startTime;
    log(`[${logParams.serviceName}] Error in Gemini call: ${error instanceof Error ? error.message : String(error)}`, 'error');
    
    // Store error information
    if (logParams.userId) {
      try {
        await storeThinkingSummary({
          ...logParams,
          thinkingSummary: `ERROR: ${error instanceof Error ? error.message : String(error)}`,
          responseContent: '',
          executionTimeMs: executionTime
        });
      } catch (storeError) {
        log(`[${logParams.serviceName}] Failed to store error in thinking logs: ${storeError}`, 'error');
      }
    }
    
    throw error;
  }
}

/**
 * Store thinking summary in the database
 */
async function storeThinkingSummary(params: ThinkingLogParams & {
  thinkingSummary: string;
  responseContent: string;
  executionTimeMs: number;
}): Promise<void> {
  if (!params.userId) {
    console.log(`[${params.serviceName}] Skipping thinking summary storage - no user ID provided`);
    return;
  }

  try {
    const supabase = createClient();
    
    const { error } = await supabase
      .from('thinking_logs')
      .insert({
        user_id: params.userId,
        service_name: params.serviceName,
        operation_name: params.operationName,
        session_id: params.sessionId || null,
        window_id: params.windowId || null,
        thinking_summary: params.thinkingSummary,
        response_content: params.responseContent,
        model_name: params.modelName || THINKING_COMPATIBLE_MODEL,
        thinking_budget: params.thinkingBudget || null,
        prompt_excerpt: params.promptExcerpt ? params.promptExcerpt.substring(0, 500) : null,
        execution_time_ms: params.executionTimeMs
      });
    
    if (error) {
      console.error(`[${params.serviceName}] Error storing thinking summary:`, error);
    } else {
      console.log(`[${params.serviceName}] Successfully stored thinking summary for ${params.operationName}`);
    }
  } catch (error) {
    console.error(`[${params.serviceName}] Error storing thinking summary:`, error);
  }
}

/**
 * Simple Gemini call without thinking (for simpler use cases)
 */
export async function callGeminiSimple(
  prompt: string,
  model: string = GEMINI_FLASH,
  responseSchema?: unknown,
  userApiKey?: string
): Promise<string> {
  const response = await fetch('/api/gemini/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      model,
      responseSchema,
      userApiKey, // Pass user's API key if provided
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    // Provide user-friendly error messages
    if (response.status === 429) {
      const retryAfter = data.retryAfter || 60;
      throw new Error(
        `Rate limit exceeded. The free tier of Gemini API has strict limits. ` +
        `To fix this: Go to console.cloud.google.com → APIs & Services → Gemini API → ` +
        `add a billing account to increase your quota. Retry in ${retryAfter}s.`
      );
    }
    if (response.status === 503) {
      throw new Error(
        `AI service not configured. Please add your GEMINI_API_KEY in .env.local ` +
        `or configure it in your deployment settings.`
      );
    }
    throw new Error(data.error || `API error: ${response.status}`);
  }
  
  if (data.error) {
    throw new Error(data.error);
  }

  return data.text || '';
}
