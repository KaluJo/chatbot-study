import { NextRequest, NextResponse } from 'next/server'
;
import OpenAI from 'openai'
;

// 1. 初始化 DeepSeek 客户端
const openai = new
 OpenAI({
  baseURL: 'https://api.deepseek.com/v1'
,
  apiKey
: process.env.DEEPSEEK_API_KEY,
});

export async function POST(request: NextRequest) 
{
  // 2. 检查 DEEPSEEK_API_KEY
  if
 (!process.env.DEEPSEEK_API_KEY) {
    return
 NextResponse.json(
      { 
error: 'DEEPSEEK_API_KEY not configured'
 },
      { 
status: 503
 }
    );
  }

  try
 {
    const body = await
 request.json();
    const { systemPrompt, maxTokens = 1500
 } = body;

    if
 (!systemPrompt) {
      return
 NextResponse.json(
        { 
error: 'System prompt is required'
 },
        { 
status: 400
 }
      );
    }

    // 3. 向 DeepSeek 发送打招呼请求
    const response = await
 openai.chat.completions.create({
      model: "deepseek-chat"
,
      max_tokens
: maxTokens,
      messages
: [
        { 
role: "system", content
: systemPrompt },
        { 
role: "user", content: "Hello!"
 }
      ],
    });

    // 4. 解析 DeepSeek 返回的文字
    if (response.choices && response.choices.length > 0
) {
      const text = response.choices[0
].message.content;
      return NextResponse.json({ text
: text });
    }

    return NextResponse.json({ text: "Hey! How's it going?"
 });

  } 
catch
 (error) {
    // 兼容错误处理日志
    const isAuthError = error instanceof Error
 && 
      (error.message.includes(
'401'
) || 
       error.message.includes(
'authentication'
) ||
       error.message.includes(
'invalid') && error.message.includes('key'
));
    
    if
 (isAuthError) {
      console.log('[API/Chat/Greeting] Auth error - invalid API key'
);
      return
 NextResponse.json(
        { 
error: 'Invalid API key'
 },
        { 
status: 503
 }
      );
    }
    
    console.error('[API/Chat/Greeting] Error:', error instanceof Error
 ? error.message : error);
    return
 NextResponse.json(
      { 
error: error instanceof Error ? error.message : 'Unknown error'
 },
      { 
status: 500
 }
    );
  }
}