'use client'

import { useState, useEffect, Suspense } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle, Sun, SunMoon, Loader2 } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { isDemoMode } from '@/lib/demo'

// Demo mode loading overlay — auto-navigates to /chat after brief delay
function DemoLoadingOverlay() {
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      const timer = setTimeout(() => router.replace('/chat'), 1800);
      return () => clearTimeout(timer);
    }
  }, [user, router]);

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-background gap-6">
      <div className="flex flex-col items-center gap-3">
        <Sun className="h-12 w-12 text-primary animate-pulse" />
        <h1 className="text-2xl font-semibold tracking-tight">Talk to Day</h1>
        <p className="text-sm text-muted-foreground">Loading demo experience...</p>
      </div>
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-2 h-2 rounded-full bg-primary animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}

// Login form component that handles authentication
function AuthHandler() {
  const [accessCode, setAccessCode] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [checkingSetup, setCheckingSetup] = useState(true)
  const { user, login, error, isLoading: authLoading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl')
  const [timeOfDay, setTimeOfDay] = useState<'morning' | 'afternoon' | 'evening' | 'night'>('morning')
  
  // Self-registration state
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [registerName, setRegisterName] = useState('')
  const [registerError, setRegisterError] = useState('')
  const [generatedCode, setGeneratedCode] = useState<string | null>(null)
  const [codeCopied, setCodeCopied] = useState(false)

  // Check if first-time setup is needed
  useEffect(() => {
    async function checkSetup() {
      try {
        const supabase = createClient();
        const { data: users, error } = await supabase
          .from('value_graph_users')
          .select('id')
          .limit(1);
        
        // If database error (not configured) or no users exist, redirect to setup
        if (error || !users || users.length === 0) {
          router.push('/setup');
          return;
        }
      } catch {
        // If there's an error checking (Supabase not configured), redirect to setup
        console.log('Could not connect to database, redirecting to setup');
        router.push('/setup');
        return;
      }
      setCheckingSetup(false);
    }
    checkSetup();
  }, [router]);

  // Determine time of day for UI customization
  useEffect(() => {
    const updateTimeOfDay = () => {
      const hour = new Date().getHours();
      if (hour >= 5 && hour < 12) {
        setTimeOfDay('morning');
      } else if (hour >= 12 && hour < 17) {
        setTimeOfDay('afternoon');
      } else if (hour >= 17 && hour < 22) {
        setTimeOfDay('evening');
      } else {
        setTimeOfDay('night');
      }
    };
    
    updateTimeOfDay();
  }, []);

  // Handle routing based on authentication state
  useEffect(() => {
    if (!authLoading && user) {
      // If a specific callbackUrl is provided
      if (callbackUrl) {
        // Check if the callback URL is for an admin route
        const isAdminRoute = callbackUrl.startsWith('/admin');
        
        // If it's an admin route but user is not admin, redirect to chat instead
        if (isAdminRoute && !user.isAdmin) {
          router.push('/chat');
        } else {
          // Otherwise, respect the callbackUrl
          router.push(callbackUrl);
        }
      } else {
        // Default routing based on role
        if (user.isAdmin) {
          router.push('/admin/dashboard');
        } else {
          router.push('/chat'); // Non-admin users go directly to chat
        }
      }
    }
  }, [user, authLoading, router, callbackUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await login(accessCode);
      // Routing will be handled by the useEffect above
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setRegisterError('');
    setGeneratedCode(null);

    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('self_register', {
        new_user_name: registerName.trim(),
      });

      if (error) {
        setRegisterError(error.message);
        return;
      }

      if (data && data.length > 0 && data[0].success) {
        // Show the generated access code to the user
        setGeneratedCode(data[0].access_code);
      } else {
        setRegisterError(data?.[0]?.message || 'Failed to create account');
      }
    } catch (err) {
      setRegisterError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyCode = async () => {
    if (generatedCode) {
      await navigator.clipboard.writeText(generatedCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };

  const handleProceedToLogin = () => {
    if (generatedCode) {
      setAccessCode(generatedCode);
    }
    setMode('login');
    setGeneratedCode(null);
    setRegisterName('');
  };

  // If checking setup or authentication is in progress, show a loading state
  if (checkingSetup || authLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <Loader2 className="h-12 w-12 animate-spin mb-4 text-primary" />
        <p>{checkingSetup ? 'Loading...' : 'Authenticating...'}</p>
      </div>
    );
  }

  // If user is already authenticated, show a loading/redirecting state
  if (user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <Loader2 className="h-12 w-12 animate-spin mb-4 text-primary" />
        <p>Redirecting...</p>
      </div>
    );
  }

  // If not authenticated, show the login or registration form
  return (
    <div className="grid place-items-center min-h-screen w-full p-4 bg-gradient-to-br from-background to-muted/30">
      <Card className="w-full max-w-xs">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-medium tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/70 p-1 pb-0 flex items-center justify-center gap-2">
            {(timeOfDay === 'morning' || timeOfDay === 'afternoon') ? 
              <Sun className="h-8 w-12 text-black" /> : 
              <SunMoon className="h-8 w-12 text-black" />
            }
            Talk to Day
            {(timeOfDay === 'morning' || timeOfDay === 'afternoon') ? 
              <SunMoon className="h-8 w-12 text-black" /> :
              <Sun className="h-8 w-12 text-black" />
            }
          </CardTitle>
        </CardHeader>

        {mode === 'login' ? (
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-6">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="grid gap-2">
                <Input
                  id="accessCode"
                  placeholder="Enter access code"
                  type="text" 
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  disabled={isLoading}
                  required
                  className="w-full h-12 text-lg text-center"
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <Button 
                type="submit" 
                className="w-full h-11 text-md"
                disabled={isLoading || !accessCode.trim()}
              >
                {isLoading ? 'Logging in...' : 'Log In'}
              </Button>
              <button 
                type="button"
                onClick={() => { setMode('register'); setRegisterError(''); }}
                className="text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                Need an account? Create one
              </button>
            </CardFooter>
          </form>
        ) : generatedCode ? (
          // Success screen showing the generated access code
          <div>
            <CardContent className="space-y-5 pt-2">
              <div className="text-center space-y-1">
                <div className="text-green-600 text-sm font-medium">Account created!</div>
                <p className="text-xs text-muted-foreground">
                  Here&apos;s your access code
                </p>
              </div>
              
              <button
                type="button"
                onClick={handleCopyCode}
                className="w-full bg-gradient-to-b from-slate-50 to-slate-100 hover:from-slate-100 hover:to-slate-150 border border-slate-200 p-5 rounded-xl transition-all active:scale-[0.98] group"
              >
                <code className="text-3xl font-mono font-bold tracking-widest text-slate-800">
                  {generatedCode}
                </code>
                <div className="text-xs text-muted-foreground mt-2 group-hover:text-slate-600">
                  {codeCopied ? '✓ Copied!' : 'Tap to copy'}
                </div>
              </button>
              
              <p className="text-xs text-center text-muted-foreground leading-relaxed">
                Save this code somewhere safe.<br />
                You&apos;ll need it to log in.
              </p>
            </CardContent>
            <CardFooter>
              <Button 
                type="button"
                onClick={handleProceedToLogin}
                className="w-full h-11"
              >
                Continue
              </Button>
            </CardFooter>
          </div>
        ) : (
          <form onSubmit={handleRegister}>
            <CardContent className="space-y-4">
              {registerError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{registerError}</AlertDescription>
                </Alert>
              )}
              <div className="grid gap-2">
                <Input
                  id="registerName"
                  placeholder="Your username"
                  type="text" 
                  value={registerName}
                  onChange={(e) => setRegisterName(e.target.value)}
                  disabled={isLoading}
                  required
                  className="w-full h-12 text-lg text-center"
                />
                <p className="text-xs text-muted-foreground text-center">
                  A secure access code will be generated for you.
                </p>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <Button 
                type="submit" 
                className="w-full h-11 text-md"
                disabled={isLoading || !registerName.trim()}
              >
                {isLoading ? 'Creating...' : 'Create Account'}
              </Button>
              <button 
                type="button"
                onClick={() => { setMode('login'); setRegisterError(''); }}
                className="text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                Already have a code? Log in
              </button>
            </CardFooter>
          </form>
        )}
      </Card>
    </div>
  );
}

// Loading fallback for Suspense
function AppLoading() {
  return (
    <div className="grid place-items-center min-h-screen w-full p-4 bg-gradient-to-br from-background to-muted/30">
      <Card className="w-full max-w-xs">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-medium tracking-tight">Talk to Day</CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center items-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    </div>
  );
}

// Main component with Suspense boundary for useSearchParams
export default function HomePage() {
  return (
    <Suspense fallback={<AppLoading />}>
      {isDemoMode ? <DemoLoadingOverlay /> : <AuthHandler />}
    </Suspense>
  );
}
