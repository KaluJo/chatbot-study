import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export async function POST(request: NextRequest) {
  // Check if API key is configured
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY not configured' },
      { status: 503 }
    );
  }

  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  try {
    const body = await request.json();
    const { systemPrompt, maxTokens = 1500 } = body;

    if (!systemPrompt) {
      return NextResponse.json(
        { error: 'System prompt is required' },
        { status: 400 }
      );
    }

    const response = await anthropic.messages.create({
      model: process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: "Hello!" }],
    });

    if (response.content && response.content.length > 0) {
      const firstContent = response.content[0];
      if ('text' in firstContent) {
        return NextResponse.json({ text: firstContent.text });
      }
    }

    return NextResponse.json({ text: "Hey! How's it going?" });
  } catch (error) {
    // Check for auth errors (invalid API key)
    const isAuthError = error instanceof Error && 
      (error.message.includes('401') || 
       error.message.includes('authentication') ||
       error.message.includes('invalid') && error.message.includes('key'));
    
    if (isAuthError) {
      console.log('[API/Chat/Greeting] Auth error - invalid API key');
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 503 }
      );
    }
    
    console.error('[API/Chat/Greeting] Error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
