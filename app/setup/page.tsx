'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { Copy, Check, RefreshCw } from 'lucide-react';

interface ServiceStatus {
  supabase: boolean | null;
  claude: boolean | null;
  gemini: boolean | null;
  openai: boolean | null;
}

interface SupabaseStatus {
  connected: boolean | null;
  schemaReady: boolean | null;
  missingTables: string[];
  errorType?: 'missing_url' | 'missing_key' | 'invalid_url' | 'invalid_key' | 'connection_error' | 'no_schema';
  errorMessage?: string;
}

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<'services' | 'admin' | 'complete'>('services');
  const [services, setServices] = useState<ServiceStatus>({
    supabase: null,
    claude: null,
    gemini: null,
    openai: null,
  });
  const [adminName, setAdminName] = useState('');
  const [adminCode, setAdminCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [hasExistingUsers, setHasExistingUsers] = useState(false);
  const [sqlCopied, setSqlCopied] = useState(false);
  const [supabaseStatus, setSupabaseStatus] = useState<SupabaseStatus>({
    connected: null,
    schemaReady: null,
    missingTables: [],
  });

  async function copyDatabaseSql() {
    try {
      const res = await fetch('/api/setup/database-sql');
      const sql = await res.text();
      await navigator.clipboard.writeText(sql);
      setSqlCopied(true);
      setTimeout(() => setSqlCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy SQL:', err);
    }
  }

  useEffect(() => {
    checkServices();
  }, []);

  async function checkServices() {
    setServices({ supabase: null, claude: null, gemini: null, openai: null });
    setSupabaseStatus({ connected: null, schemaReady: null, missingTables: [] });
    checkSupabase();
    checkClaude();
    checkGemini();
    checkOpenAI();
  }

  async function checkSupabase() {
    setSupabaseStatus({ connected: null, schemaReady: null, missingTables: [] });
    
    try {
      // Use API route for better error detection
      const res = await fetch('/api/setup/check-supabase');
      const data = await res.json();
      
      switch (data.status) {
        case 'connected':
          setSupabaseStatus({ 
            connected: true, 
            schemaReady: true, 
            missingTables: [] 
          });
          setHasExistingUsers(data.hasUsers || false);
          setServices(s => ({ ...s, supabase: true }));
          break;
          
        case 'no_schema':
          setSupabaseStatus({ 
            connected: true, 
            schemaReady: false, 
            missingTables: data.missingTables || [],
            errorType: 'no_schema',
            errorMessage: data.message,
          });
          setServices(s => ({ ...s, supabase: false }));
          break;
          
        case 'missing_url':
          setSupabaseStatus({ 
            connected: false, 
            schemaReady: false, 
            missingTables: [],
            errorType: 'missing_url',
            errorMessage: data.message,
          });
          setServices(s => ({ ...s, supabase: false }));
          break;
          
        case 'missing_key':
          setSupabaseStatus({ 
            connected: false, 
            schemaReady: false, 
            missingTables: [],
            errorType: 'missing_key',
            errorMessage: data.message,
          });
          setServices(s => ({ ...s, supabase: false }));
          break;
          
        case 'invalid_url':
          setSupabaseStatus({ 
            connected: false, 
            schemaReady: false, 
            missingTables: [],
            errorType: 'invalid_url',
            errorMessage: data.message,
          });
          setServices(s => ({ ...s, supabase: false }));
          break;
          
        case 'invalid_key':
          setSupabaseStatus({ 
            connected: false, 
            schemaReady: false, 
            missingTables: [],
            errorType: 'invalid_key',
            errorMessage: data.message,
          });
          setServices(s => ({ ...s, supabase: false }));
          break;
          
        default:
          setSupabaseStatus({ 
            connected: false, 
            schemaReady: false, 
            missingTables: [],
            errorType: 'connection_error',
            errorMessage: data.message || 'Unknown error',
          });
          setServices(s => ({ ...s, supabase: false }));
      }
    } catch {
      setSupabaseStatus({ 
        connected: false, 
        schemaReady: false, 
        missingTables: [],
        errorType: 'connection_error',
        errorMessage: 'Failed to check Supabase status',
      });
      setServices(s => ({ ...s, supabase: false }));
    }
  }

  async function checkClaude() {
    try {
      const res = await fetch('/api/chat/greeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemPrompt: 'Say "OK"' }),
      });
      // 503 = not configured, 200 = working
      setServices(s => ({ ...s, claude: res.ok }));
    } catch {
      setServices(s => ({ ...s, claude: false }));
    }
  }

  async function checkGemini() {
    try {
      const res = await fetch('/api/gemini/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Say OK' }),
      });
      setServices(s => ({ ...s, gemini: res.ok }));
    } catch {
      setServices(s => ({ ...s, gemini: false }));
    }
  }

  async function checkOpenAI() {
    try {
      const res = await fetch('/api/openai/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'test' }),
      });
      setServices(s => ({ ...s, openai: res.ok }));
    } catch {
      setServices(s => ({ ...s, openai: false }));
    }
  }

  async function createAdminUser() {
    if (!adminName.trim() || !adminCode.trim()) {
      setError('Please provide both name and access code');
      return;
    }
    setCreating(true);
    setError('');

    try {
      const supabase = createClient();
      const { data: existing } = await supabase
        .from('value_graph_users')
        .select('id')
        .eq('access_code', adminCode.trim())
        .single();

      if (existing) {
        setError('This access code is already taken');
        setCreating(false);
        return;
      }

      const { error: createError } = await supabase
        .from('value_graph_users')
        .insert({
          name: adminName.trim(),
          access_code: adminCode.trim(),
          is_admin: true,
          strategy_type: 'vertical',
        });

      if (createError) {
        setError('Failed to create admin: ' + createError.message);
        setCreating(false);
        return;
      }
      setStep('complete');
    } catch (err) {
      setError('Error: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setCreating(false);
    }
  }

  const isLoading = services.supabase === null || services.claude === null;
  const canProceed = services.supabase === true;

  // Status display
  function Status({ ok, checking, required }: { ok: boolean | null; checking?: boolean; required?: boolean }) {
    if (ok === null || checking) return <span className="text-gray-400">checking...</span>;
    if (ok) return <span className="text-green-600">connected</span>;
    if (required) return <span className="text-red-600">not configured</span>;
    return <span className="text-yellow-600">using fallback</span>;
  }

  // Supabase detailed status display
  function SupabaseStatusDisplay() {
    if (supabaseStatus.connected === null) {
      return <span className="text-gray-400">checking...</span>;
    }
    if (!supabaseStatus.connected) {
      return <span className="text-red-600">not connected</span>;
    }
    if (!supabaseStatus.schemaReady) {
      return <span className="text-yellow-600">schema missing</span>;
    }
    return <span className="text-green-600">connected</span>;
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-xl mx-auto px-6 py-16">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-semibold text-gray-900">Setup</h1>
          {step === 'services' && (
            <button 
              onClick={checkServices}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              {isLoading ? 'Checking...' : 'Recheck'}
            </button>
          )}
        </div>
        <p className="text-gray-500 mb-10">Configure your environment to get started.</p>

        {/* Step 1: Services */}
        {step === 'services' && (
          <div className="space-y-8">
            
            {/* Required */}
            <section>
              <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-4">Required</h2>
              
              <div className="space-y-4">
                <ServiceRow
                  name="Supabase"
                  description="Database & auth"
                  status={<SupabaseStatusDisplay />}
                  expanded={services.supabase === false}
                >
                  {/* Show different content based on status */}
                  {!supabaseStatus.connected && supabaseStatus.connected !== null && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                      {supabaseStatus.errorType === 'missing_url' && (
                        <>
                          <p className="text-sm text-red-700 font-medium">Missing NEXT_PUBLIC_SUPABASE_URL</p>
                          <p className="text-sm text-red-600 mt-1">Add your Supabase project URL to <code className="bg-red-100 px-1 py-0.5 rounded text-xs">.env.local</code> and restart the dev server.</p>
                        </>
                      )}
                      {supabaseStatus.errorType === 'missing_key' && (
                        <>
                          <p className="text-sm text-red-700 font-medium">Missing NEXT_PUBLIC_SUPABASE_ANON_KEY</p>
                          <p className="text-sm text-red-600 mt-1">Add your Supabase publishable key to <code className="bg-red-100 px-1 py-0.5 rounded text-xs">.env.local</code> and restart the dev server.</p>
                        </>
                      )}
                      {supabaseStatus.errorType === 'invalid_url' && (
                        <>
                          <p className="text-sm text-red-700 font-medium">Invalid Supabase URL</p>
                          <p className="text-sm text-red-600 mt-1">NEXT_PUBLIC_SUPABASE_URL must be a valid URL like <code className="bg-red-100 px-1 py-0.5 rounded text-xs">https://xyz.supabase.co</code></p>
                        </>
                      )}
                      {supabaseStatus.errorType === 'invalid_key' && (
                        <>
                          <p className="text-sm text-red-700 font-medium">Invalid API key</p>
                          <p className="text-sm text-red-600 mt-1">Check that NEXT_PUBLIC_SUPABASE_ANON_KEY matches your Supabase project&apos;s publishable key.</p>
                        </>
                      )}
                      {supabaseStatus.errorType === 'connection_error' && (
                        <>
                          <p className="text-sm text-red-700 font-medium">Connection failed</p>
                          <p className="text-sm text-red-600 mt-1">{supabaseStatus.errorMessage || 'Check your Supabase URL and API key.'}</p>
                        </>
                      )}
                      {!supabaseStatus.errorType && (
                        <>
                          <p className="text-sm text-red-700 font-medium">Connection failed</p>
                          <p className="text-sm text-red-600 mt-1">Check your Supabase URL and API key in <code className="bg-red-100 px-1 py-0.5 rounded text-xs">.env.local</code></p>
                        </>
                      )}
                      <button 
                        onClick={checkServices}
                        disabled={isLoading}
                        className="mt-3 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-100 hover:bg-red-200 rounded transition-colors disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                        {isLoading ? 'Checking...' : 'Recheck'}
                      </button>
                    </div>
                  )}
                  
                  {supabaseStatus.connected && !supabaseStatus.schemaReady && (
                    <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <p className="text-sm text-yellow-700 font-medium">Database connected, but schema not found</p>
                      <p className="text-sm text-yellow-600 mt-1">
                        {supabaseStatus.missingTables.length > 0 ? (
                          <>Missing tables: {supabaseStatus.missingTables.slice(0, 3).join(', ')}
                          {supabaseStatus.missingTables.length > 3 && ` (+${supabaseStatus.missingTables.length - 3} more)`}</>
                        ) : (
                          'Tables not found.'
                        )}
                      </p>
                      <p className="text-sm text-yellow-600 mt-1">Run the SQL script below, then click Recheck.</p>
                      <button 
                        onClick={checkServices}
                        disabled={isLoading}
                        className="mt-3 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-yellow-700 bg-yellow-100 hover:bg-yellow-200 rounded transition-colors disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                        {isLoading ? 'Checking...' : 'Recheck'}
                      </button>
                    </div>
                  )}

                  <ol className="text-sm text-gray-600 space-y-3 list-decimal list-inside">
                    <li>Create a project at <a href="https://supabase.com" className="text-blue-600 hover:underline" target="_blank">supabase.com</a></li>
                    <li>
                      <span>Copy the database setup script and paste into <strong>SQL Editor</strong>:</span>
                      <div className="mt-2 flex items-center gap-2">
                        <code className="flex-1 bg-gray-100 px-3 py-2 rounded text-xs text-gray-600">setup/database.sql</code>
                        <button
                          onClick={copyDatabaseSql}
                          className="flex items-center gap-1.5 px-3 py-2 bg-gray-900 text-white text-xs rounded hover:bg-gray-800 transition-colors"
                        >
                          {sqlCopied ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              Copied!
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              Copy SQL
                            </>
                          )}
                        </button>
                      </div>
                    </li>
                    <li>
                      Go to <strong>Settings → API Keys</strong> and copy your keys to <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">.env.local</code>:
                      <pre className="mt-2 p-3 bg-gray-50 rounded text-xs overflow-x-auto">
{`NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...`}
                      </pre>
                      <p className="mt-2 text-xs text-gray-400">Use the <strong>Publishable key</strong> (recommended) or legacy anon key</p>
                    </li>
                    <li>Restart dev server and click <strong>Recheck</strong></li>
                  </ol>
                </ServiceRow>

                <ServiceRow
                  name="Claude"
                  description="Chat responses"
                  status={<Status ok={services.claude} required />}
                  expanded={services.claude === false}
                >
                  <ol className="text-sm text-gray-600 space-y-2 list-decimal list-inside">
                    <li>Get key from <a href="https://console.anthropic.com" className="text-blue-600 hover:underline" target="_blank">console.anthropic.com</a></li>
                    <li>
                      Add to <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">.env.local</code>:
                      <pre className="mt-2 p-3 bg-gray-50 rounded text-xs overflow-x-auto">ANTHROPIC_API_KEY=sk-ant-...</pre>
                    </li>
                    <li>Restart dev server</li>
                  </ol>
                </ServiceRow>
              </div>
            </section>

            {/* Optional */}
            <section>
              <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-4">Optional</h2>
              
              <div className="space-y-4">
                <ServiceRow
                  name="Gemini"
                  description="Conversation strategies"
                  status={<Status ok={services.gemini} />}
                  expanded={services.gemini === false}
                >
                  <p className="text-sm text-gray-600">
                    Without this, chat uses generic strategies. 
                    Add <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">GEMINI_API_KEY</code> from{' '}
                    <a href="https://aistudio.google.com/api-keys" className="text-blue-600 hover:underline" target="_blank">aistudio.google.com</a>
                  </p>
                </ServiceRow>

                <ServiceRow
                  name="OpenAI"
                  description="Topic embeddings"
                  status={<Status ok={services.openai} />}
                  expanded={services.openai === false}
                >
                  <p className="text-sm text-gray-600">
                    Without this, uses text-based similarity. 
                    Add <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">OPENAI_API_KEY</code> from{' '}
                    <a href="https://platform.openai.com/api-keys" className="text-blue-600 hover:underline" target="_blank">platform.openai.com</a>
                  </p>
                </ServiceRow>
              </div>
            </section>

            {/* Actions */}
            <div className="pt-4 flex gap-3">
              {hasExistingUsers ? (
                <button 
                  onClick={() => router.push('/login')}
                  className="flex-1 px-4 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
                >
                  Go to Login
                </button>
              ) : (
                <button 
                  onClick={() => setStep('admin')}
                  disabled={!canProceed || isLoading}
                  className="flex-1 px-4 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Checking...' : canProceed ? 'Continue' : 'Configure Supabase first'}
                </button>
              )}
            </div>

            {hasExistingUsers && (
              <p className="text-sm text-gray-500 text-center">
                Users already exist. Log in to access the admin dashboard.
              </p>
            )}

            {/* Tips */}
            <section className="pt-6 border-t border-gray-100">
              <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-4">Tips</h2>
              <ul className="text-sm text-gray-500 space-y-2">
                <li className="flex gap-2">
                  <span className="text-gray-300">•</span>
                  <span><strong className="text-gray-600">Deploying to Vercel?</strong> Add environment variables in Project Settings, not <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">.env.local</code></span>
                </li>
                <li className="flex gap-2">
                  <span className="text-gray-300">•</span>
                  <span>Models can also be configured in <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">app/config/models.ts</code></span>
                </li>
                <li className="flex gap-2">
                  <span className="text-gray-300">•</span>
                  <span>Contact <a href="mailto:bhayun@ethz.ch" className="text-blue-600 hover:underline">bhayun@ethz.ch</a> for help.</span>
                </li>
              </ul>
            </section>
          </div>
        )}

        {/* Step 2: Admin Creation */}
        {step === 'admin' && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Admin Name</label>
              <input
                type="text"
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                placeholder="e.g., Research Lead"
                className="w-full px-3 py-2 bg-white text-gray-900 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent placeholder:text-gray-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Access Code</label>
              <input
                type="text"
                value={adminCode}
                onChange={(e) => setAdminCode(e.target.value)}
                placeholder="e.g., admin-2024"
                className="w-full px-3 py-2 bg-white text-gray-900 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent placeholder:text-gray-400"
              />
              <p className="text-sm text-gray-500 mt-1">You will use this to log in.</p>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
            )}

            <div className="flex gap-3 pt-2">
              <button 
                onClick={() => setStep('services')}
                className="px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Back
              </button>
              <button 
                onClick={createAdminUser}
                disabled={creating}
                className="flex-1 px-4 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:bg-gray-400"
              >
                {creating ? 'Creating...' : 'Create Admin'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Complete */}
        {step === 'complete' && (
          <div className="text-center space-y-6">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-1">Setup Complete</h2>
              <p className="text-gray-500">Your admin account is ready.</p>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg text-left">
              <p className="text-sm text-gray-500 mb-2">Your credentials:</p>
              <p className="text-gray-900"><strong>Name:</strong> {adminName}</p>
              <p className="text-gray-900"><strong>Code:</strong> {adminCode}</p>
            </div>

            <button 
              onClick={() => router.push('/login')}
              className="w-full px-4 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
            >
              Go to Login
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Modular service row component
function ServiceRow({ 
  name, 
  description, 
  status, 
  expanded, 
  children 
}: { 
  name: string; 
  description: string; 
  status: React.ReactNode; 
  expanded?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-gray-900">{name}</h3>
          <p className="text-sm text-gray-500">{description}</p>
        </div>
        <div className="text-sm">{status}</div>
      </div>
      {expanded && children && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          {children}
        </div>
      )}
    </div>
  );
}
