import { NextRequest, NextResponse } from 'next/server';

// Qwen models fallback chain (Alibaba Cloud DashScope)
const QWEN_FALLBACK_ORDER = [
  'qwen-plus',   // Recommended - best balance of capability and speed
  'qwen-turbo',  // Fastest, cost-efficient
  'qwen-max',    // Most advanced reasoning
];

// Check if error should trigger fallback to next model
function shouldFallback(errorMsg: string): boolean {
  const fallbackTriggers = [
    '429', 'too many requests', 'rate limit', 'quota', // Rate limits
    '503', 'unavailable', 'overloaded',                // Service unavailable
    'timeout', 'deadline_exceeded',                    // Timeouts
  ];
  return fallbackTriggers.some(trigger => 
    errorMsg.toLowerCase().includes(trigger)
  );
}

// Check if model doesn't exist
function isModelNotFound(errorMsg: string): boolean {
  return errorMsg.includes('404') || 
    errorMsg.toLowerCase().includes('not found') ||
    errorMsg.toLowerCase().includes('does not exist') ||
    errorMsg.toLowerCase().includes('invalid model');
}

async function tryQwenModel(
  model: string,
  prompt: string,
  apiKey: string,
  responseSchema?: Record<string, unknown>
): Promise<{ text: string | undefined; error?: string } | null> {
  try {
    let finalPrompt = prompt;
    const requestBody: any = {
      model: model,
      messages: [],
    };

    // If a JSON schema is expected, enforce it via prompt and JSON object type
    if (responseSchema) {
      finalPrompt += `\n\nIMPORTANT: You must output ONLY valid JSON matching this schema: ${JSON.stringify(responseSchema)}. Do not include markdown formatting like \`\`\`json.`;
      requestBody.response_format = { type: 'json_object' };
    }

    requestBody.messages.push({ role: 'user', content: finalPrompt });

    const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Qwen API Error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    let content = data.choices[0].message.content;
    
    // Clean up potential markdown formatting if JSON was requested
    if (responseSchema) {
      content = content.replace(/```json/gi, '').replace(/```/gi, '').trim();
    }

    return { text: content };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    if (shouldFallback(errorMsg)) {
      console.log(`[API/Qwen] Rate limit or unavailable on ${model}, trying next...`);
      return null; // Signal to try next model
    }
    
    if (isModelNotFound(errorMsg)) {
      console.log(`[API/Qwen] Model ${model} not found, trying next...`);
      return null; // Signal to try next model
    }
    
    // For other errors, return error details
    console.error(`[API/Qwen] Error on ${model}:`, errorMsg);
    return { text: undefined, error: errorMsg };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      prompt, 
      model = "qwen-plus",
      responseSchema,
      thinkingBudget, // Unused in standard Qwen API, kept for interface compatibility
      userApiKey, 
    } = body;

    // Use user-provided key if available, otherwise fall back to server key
    const apiKey = userApiKey || process.env.QWEN_API_KEY;
    const isUserKey = !!userApiKey;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'QWEN_API_KEY not configured. Add it to your .env.local file or provide your own key.' },
        { status: 503 }
      );
    }

    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    if (isUserKey) {
      console.log('[API/Qwen] Using user-provided API key');
    }
    
    // Find starting index based on requested model
    let startIndex = QWEN_FALLBACK_ORDER.indexOf(model);
    if (startIndex === -1) startIndex = 0;
    
    // Try each Qwen model in order
    for (let i = startIndex; i < QWEN_FALLBACK_ORDER.length; i++) {
      const currentModel = QWEN_FALLBACK_ORDER[i];
      console.log(`[API/Qwen] Trying ${currentModel}...`);
      
      const result = await tryQwenModel(
        currentModel, 
        prompt, 
        apiKey,
        responseSchema
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
          thinkingSummary: undefined, // Qwen compatible mode does not return explicit thinking traces
          model: currentModel,
          provider: 'qwen',
        });
      }
    }
    
    // All models exhausted - rate limited
    console.log('[API/Qwen] All models rate limited or unavailable');
    return NextResponse.json(
      { 
        error: 'Rate limit exceeded on all Qwen models. To fix this, please check your Alibaba Cloud DashScope quota.',
        retryAfter: 60 
      },
      { status: 429 }
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    // Check for auth errors
    if (errorMsg.includes('401') || errorMsg.includes('InvalidApiKey')) {
      return NextResponse.json(
        { error: 'Invalid QWEN_API_KEY. Check your API key at DashScope console.' },
        { status: 401 }
      );
    }
    
    console.error('[API/Qwen] Error:', errorMsg);
    return NextResponse.json(
      { error: 'Qwen API error', details: errorMsg },
      { status: 500 }
    );
  }
}