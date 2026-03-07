import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Check if env vars are set
  if (!url) {
    return NextResponse.json({
      status: 'missing_url',
      message: 'NEXT_PUBLIC_SUPABASE_URL is not set',
    });
  }

  if (!key) {
    return NextResponse.json({
      status: 'missing_key',
      message: 'NEXT_PUBLIC_SUPABASE_ANON_KEY is not set',
    });
  }

  // Validate URL format
  try {
    new URL(url);
  } catch {
    return NextResponse.json({
      status: 'invalid_url',
      message: 'NEXT_PUBLIC_SUPABASE_URL is not a valid URL',
    });
  }

  // Try to connect
  try {
    const supabase = createClient(url, key);
    
    // Try a simple query to check connection
    const { data, error } = await supabase
      .from('value_graph_users')
      .select('id')
      .limit(1);

    if (error) {
      // Check for specific error types
      if (error.message?.includes('relation') && error.message?.includes('does not exist')) {
        return NextResponse.json({
          status: 'no_schema',
          message: 'Connected but tables not found. Run the SQL setup script.',
          tables: [],
        });
      }
      
      if (error.code === 'PGRST301') {
        return NextResponse.json({
          status: 'no_schema',
          message: 'Connected but tables not found. Run the SQL setup script.',
        });
      }

      // Check for auth errors
      if (error.message?.includes('Invalid API key') || error.code === 'PGRST301') {
        return NextResponse.json({
          status: 'invalid_key',
          message: 'API key is invalid. Check NEXT_PUBLIC_SUPABASE_ANON_KEY.',
        });
      }

      return NextResponse.json({
        status: 'error',
        message: error.message,
        code: error.code,
      });
    }

    // Success - check which tables exist
    const tables = ['value_graph_users', 'chatlog', 'chat_windows', 'contexts', 'topics', 'items', 'value_nodes'];
    const missingTables: string[] = [];
    
    for (const table of tables) {
      const { error: tableError } = await supabase.from(table).select('id').limit(1);
      if (tableError && (tableError.message?.includes('does not exist') || tableError.code === 'PGRST301')) {
        missingTables.push(table);
      }
    }

    if (missingTables.length > 0) {
      return NextResponse.json({
        status: 'no_schema',
        message: 'Connected but some tables are missing. Run the SQL setup script.',
        missingTables,
      });
    }

    return NextResponse.json({
      status: 'connected',
      message: 'Supabase is fully configured',
      hasUsers: (data?.length ?? 0) > 0,
    });
  } catch (err) {
    return NextResponse.json({
      status: 'connection_error',
      message: err instanceof Error ? err.message : 'Failed to connect to Supabase',
    });
  }
}
