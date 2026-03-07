'use client';

import React, { useEffect, Suspense } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { Hourglass } from 'lucide-react';

// Dashboard content component
function DashboardContent() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        // If not logged in, go to the root (login) page
        router.replace('/');
      } else if (user.isAdmin) {
        // Redirect admin users to the admin dashboard
        router.replace('/admin/dashboard');
      } else {
        // Redirect non-admin users directly to chat
        router.replace('/chat');
      }
    }
  }, [user, authLoading, router]);

  // Always show loading while determining where to redirect
  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <Hourglass className="h-12 w-12 animate-spin mb-4 text-primary" />
      <p>Redirecting...</p>
    </div>
  );
}

// Loading fallback for Suspense
function DashboardLoading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <Hourglass className="h-12 w-12 animate-spin mb-4 text-primary" />
      <p>Loading...</p>
    </div>
  );
}

// Main component with Suspense boundary
export default function UserDashboardPage() {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <DashboardContent />
    </Suspense>
  );
} 