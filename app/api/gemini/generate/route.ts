import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // 提取前端传来的 prompt 和模型名称（默认使用 gemini-2.5-flash）
    const { 
      prompt, 
      model = "gemini-2.5-flash",
      userApiKey
    } = body;

    // 优先使用用户填写的 Key，否则使用 Vercel 环境变量里的 Key
    const apiKey = userApiKey || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY not configured.' },
        { status: 503 }
      );
    }

    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    console.log(`[API] Starting request to Universalbus for model: ${model}...`);

    // 核心改变：直接用原生 fetch 调用 Universalbus 的 OpenAI 兼容接口
    const response = await fetch('https://node.universalbus.cn/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`, 
      },
      body: JSON.stringify({
        model: model, 
        messages: [
          { role: 'user', content: prompt }
        ],
        // 注意：由于中转站走的是 OpenAI 协议，之前专属的 thinkingBudget 配置可能会导致中转站报错，所以这里先去掉复杂的配置，确保能通。
      }),
    });

    const data = await response.json();

    // 如果中转站返回错误（比如余额不足、模型名称不对等）
    if (!response.ok) {
      console.error("[Universalbus Error]:", data);
      return NextResponse.json(
        { error: data.error?.message || 'Universalbus API 请求失败' }, 
        { status: response.status }
      );
    }

    // 按照 OpenAI 的数据结构解析返回的文本
    const replyText = data.choices?.[0]?.message?.content;

    console.log(`[API] Request successful!`);

    // 返回给前端
    return NextResponse.json({ 
      text: replyText,
      model: model,
      provider: 'universalbus',
    });

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[API Fetch Error]:', errorMsg);
    return NextResponse.json(
      { error: '服务器内部错误，网络请求失败', details: errorMsg },
      { status: 500 }
    );
  }
}