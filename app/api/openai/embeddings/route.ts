import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export async function POST(request: NextRequest) {
  // Check if API key is configured
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY not configured', embedding: null },
      { status: 503 }
    );
  }

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  try {
    const body = await request.json();
    const { text, model = "text-embedding-3-small" } = body;

    if (!text) {
      return NextResponse.json(
        { error: 'Text is required' },
        { status: 400 }
      );
    }

    const response = await openai.embeddings.create({
      model: model,
      input: text,
    });

    return NextResponse.json({ 
      embedding: response.data[0].embedding 
    });
  } catch (error) {
    // Check for auth errors (invalid API key)
    const errorMsg = error instanceof Error ? error.message : String(error);
    const isAuthError = errorMsg.includes('401') || 
      errorMsg.includes('invalid_api_key') ||
      errorMsg.includes('Incorrect API key') ||
      (errorMsg.includes('invalid') && errorMsg.includes('key'));
    
    if (isAuthError) {
      console.log('[API/OpenAI/Embeddings] Auth error - invalid API key');
      return NextResponse.json(
        { error: 'Invalid API key', embedding: null },
        { status: 503 }
      );
    }
    
    console.error('[API/OpenAI/Embeddings] Error:', errorMsg);
    return NextResponse.json(
      { error: 'Failed to generate embedding', details: errorMsg },
      { status: 500 }
    );
  }
}
