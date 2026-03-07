import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    // Check for service role key
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      console.warn('[API/Chat/Strategy] SUPABASE_SERVICE_ROLE_KEY not set, using anon key (RLS will apply)');
    }

    // Create client inside function to ensure env vars are loaded
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );

    const body = await request.json();
    const { userId, sessionId, strategy, timeOfDay } = body;

    if (!userId || !sessionId || !strategy) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, sessionId, strategy' },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from('conversation_strategies')
      .insert({
        user_id: userId,
        session_id: sessionId,
        strategy_data: strategy,
        time_of_day: timeOfDay || null
      });

    if (error) {
      console.error('[API/Chat/Strategy] Error saving strategy:', error.message);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API/Chat/Strategy] Error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: 'Failed to save strategy' },
      { status: 500 }
    );
  }
}
