'use client'

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';

export default function DisabledSynthesisPage() {
  const router = useRouter();
  const { user } = useAuth();
  
  // Redirect admins to the admin synthesis page
  useEffect(() => {
    if (user?.isAdmin) {
      router.push('/admin/synthesis');
    }
  }, [user, router]);

  return (
    <div className="container mx-auto p-6 flex flex-col items-center justify-center min-h-[80vh]">
      <div className="w-full max-w-md p-6 bg-white rounded-lg text-center space-y-6">
        <div className="flex justify-center">
          <AlertCircle className="h-16 w-16 text-amber-500" />
      </div>
      
        <h1 className="text-2xl font-bold text-gray-800">Synthesis Page Moved</h1>
        
        <p className="text-gray-600">
          The synthesis functionality is now available exclusively through the admin interface.
        </p>
        
        {user?.isAdmin ? (
          <div className="space-y-2">
            <p className="text-gray-600">Redirecting you to the admin synthesis page...</p>
            <Button 
              className="w-full" 
              onClick={() => router.push('/admin/synthesis')}
            >
              Go to Admin Synthesis
            </Button>
              </div>
            ) : (
          <div className="space-y-2">
            <p className="text-sm text-gray-500">
              If you need access to synthesis features, please contact an administrator.
            </p>
            <Button 
              variant="outline" 
              className="w-full" 
              onClick={() => router.push('/')}
            >
              Return to Home
            </Button>
          </div>
        )}
        </div>
    </div>
  );
} 