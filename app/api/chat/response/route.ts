import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

// 1. 初始化 DeepSeek 客户端
const openai = new OpenAI({
  baseURL: 'https://api.deepseek.com/v1',
  apiKey: process.env.DEEPSEEK_API_KEY,
});

export async function POST(request: NextRequest) {
  // 2. 检查你是否在 Vercel 中配置了 DeepSeek 的密码
  if (!process.env.DEEPSEEK_API_KEY) {
    return NextResponse.json(
      { error: 'DEEPSEEK_API_KEY not configured' },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const { messages, systemPrompt, maxTokens = 3000 } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'Messages array is required' },
        { status: 400 }
      );
    }

    if (!systemPrompt) {
      return NextResponse.json(
        { error: 'System prompt is required' },
        { status: 400 }
      );
    }

    // 3. 向 DeepSeek 发送请求 (OpenAI 格式)
    const response = await openai.chat.completions.create({
      model: "deepseek-chat",
      max_tokens: maxTokens,
      // 注意这里：DeepSeek 需要把系统提示词放在 role: "system" 的对象里
      messages: [
        { role: "system", content: systemPrompt },
        ...messages
      ],
    });

    // 4. 解析 DeepSeek 返回的文字
    if (response.choices && response.choices.length > 0) {
      const text = response.choices[0].message.content;
      return NextResponse.json({ text: text });
    }

    return NextResponse.json({ text: "Sorry about that, let's try again?" });

  } catch (error) {
    console.error('[API/Chat] Error:', error);
    return NextResponse.json(
      { error: 'Failed to get response', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}