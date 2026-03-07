'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'

// Component that handles the redirect
function LoginRedirect() {
  const router = useRouter()
  const searchParams = useSearchParams()
  
  useEffect(() => {
    // Preserve any query params when redirecting
    const callbackUrl = searchParams.get('callbackUrl')
    const redirectPath = callbackUrl ? `/?callbackUrl=${encodeURIComponent(callbackUrl)}` : '/'
    
    router.replace(redirectPath)
  }, [router, searchParams])

  return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <span className="ml-2">Redirecting...</span>
    </div>
  )
}

// Loading fallback
function RedirectLoading() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <span className="ml-2">Loading...</span>
    </div>
  )
}

// Main component with Suspense boundary for useSearchParams
export default function LoginPage() {
  return (
    <Suspense fallback={<RedirectLoading />}>
      <LoginRedirect />
    </Suspense>
  )
} 