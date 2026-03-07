import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from "@google/genai";

// Gemini models fallback chain
// Model codes from https://ai.google.dev/gemini-api/docs/models
const GEMINI_FALLBACK_ORDER = [
  'gemini-2.5-flash',       // Stable - best price-performance (recommended)
  'gemini-2.5-flash-lite',  // Stable - fastest, cost-efficient
  'gemini-2.5-pro',         // Stable - advanced thinking (may have lower rate limits)
  'gemini-2.0-flash',       // Deprecated March 2026
];

// Check if error should trigger fallback to next model
function shouldFallback(errorMsg: string): boolean {
  const fallbackTriggers = [
    '429', 'RESOURCE_EXHAUSTED', 'quota', 'Too Many Requests', // Rate limits
    '503', 'UNAVAILABLE', 'overloaded',                         // Service unavailable
    'timeout', 'DEADLINE_EXCEEDED',                              // Timeouts
  ];
  return fallbackTriggers.some(trigger => 
    errorMsg.toLowerCase().includes(trigger.toLowerCase())
  );
}

// Check if model doesn't exist
function isModelNotFound(errorMsg: string): boolean {
  return errorMsg.includes('404') || 
    errorMsg.includes('NOT_FOUND') || 
    errorMsg.toLowerCase().includes('not found') ||
    errorMsg.toLowerCase().includes('does not exist');
}

async function tryGeminiModel(
  ai: GoogleGenAI,
  model: string,
  prompt: string,
  config: Record<string, unknown> | undefined
): Promise<{ text: string | undefined; thinkingSummary?: string; error?: string } | null> {
  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config,
    });

    return {
      text: response.text,
      thinkingSummary: response.candidates?.[0]?.content?.parts?.find(
        (p: { thought?: boolean }) => p.thought
      )?.text,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    if (shouldFallback(errorMsg)) {
      console.log(`[API/Gemini] Rate limit on ${model}, trying next...`);
      return null; // Signal to try next model
    }
    
    if (isModelNotFound(errorMsg)) {
      console.log(`[API/Gemini] Model ${model} not found, trying next...`);
      return null; // Signal to try next model
    }
    
    // For other errors, return error details
    console.error(`[API/Gemini] Error on ${model}:`, errorMsg);
    return { text: undefined, error: errorMsg };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      prompt, 
      model = "gemini-2.5-flash",
      responseSchema,
      thinkingBudget = 10000,
      userApiKey, // Optional: user-provided API key
    } = body;

    // Use user-provided key if available, otherwise fall back to server key
    const apiKey = userApiKey || process.env.GEMINI_API_KEY;
    const isUserKey = !!userApiKey;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY not configured. Add it to your .env.local file or provide your own key.' },
        { status: 503 }
      );
    }

    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    // Build Gemini config
    const geminiConfig: Record<string, unknown> = {};
    if (responseSchema) {
      geminiConfig.responseMimeType = "application/json";
      geminiConfig.responseSchema = responseSchema;
    }
    if (thinkingBudget) {
      geminiConfig.thinkingConfig = { thinkingBudget };
    }

    const ai = new GoogleGenAI({ apiKey });
    
    if (isUserKey) {
      console.log('[API/Gemini] Using user-provided API key');
    }
    
    // Find starting index based on requested model
    let startIndex = GEMINI_FALLBACK_ORDER.indexOf(model);
    if (startIndex === -1) startIndex = 0;
    
    // Try each Gemini model in order
    for (let i = startIndex; i < GEMINI_FALLBACK_ORDER.length; i++) {
      const currentModel = GEMINI_FALLBACK_ORDER[i];
      console.log(`[API/Gemini] Trying ${currentModel}...`);
      
      const result = await tryGeminiModel(
        ai, 
        currentModel, 
        prompt, 
        Object.keys(geminiConfig).length > 0 ? geminiConfig : undefined
      );
      
      if (result) {
        if (result.error) {
          // Non-recoverable error
          return NextResponse.json(
            { error: result.error },
            { status: 500 }
          );
        }
        
        return NextResponse.json({ 
          text: result.text,
          thinkingSummary: result.thinkingSummary,
          model: currentModel,
          provider: 'gemini',
        });
      }
    }
    
    // All models exhausted - rate limited
    console.log('[API/Gemini] All models rate limited or unavailable');
    return NextResponse.json(
      { 
        error: 'Rate limit exceeded on all Gemini models. To fix this:\n\n' +
          '1. Go to console.cloud.google.com\n' +
          '2. Select your project\n' +
          '3. Go to APIs & Services → Gemini API\n' +
          '4. Add a billing account to increase your quota\n\n' +
          'Or check ai.google.dev/gemini-api/docs/models for the latest available models.',
        retryAfter: 60 
      },
      { status: 429 }
    );

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    // Check for auth errors
    if (errorMsg.includes('401') || errorMsg.includes('API_KEY_INVALID')) {
      return NextResponse.json(
        { error: 'Invalid GEMINI_API_KEY. Check your API key at aistudio.google.com/apikey' },
        { status: 401 }
      );
    }
    
    console.error('[API/Gemini] Error:', errorMsg);
    return NextResponse.json(
      { error: 'Gemini API error', details: errorMsg },
      { status: 500 }
    );
  }
}
