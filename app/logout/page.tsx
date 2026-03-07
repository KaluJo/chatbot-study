'use client'

import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useState } from 'react'

export default function LogoutPage() {
  const { user, logout } = useAuth()
  const router = useRouter()
  const [loggedOut, setLoggedOut] = useState(false)
  
  // Track logged in state
  const isLoggedIn = !!user
  
  // Handle logout
  const handleLogout = () => {
    logout()
    setLoggedOut(true)
    
    // Reset state after logout
    setTimeout(() => {
      router.push('/login')
    }, 1500)
  }
  
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md p-8">
        <h1 className="text-2xl font-bold mb-6 text-center">Logout</h1>
        
        {loggedOut ? (
          <div className="text-center">
            <p className="text-green-600 mb-4">
              Successfully logged out!
            </p>
            <p className="text-sm text-gray-500">
              Redirecting to login page...
            </p>
          </div>
        ) : isLoggedIn ? (
          <div className="space-y-4">
            <p className="mb-4">
              You are currently logged in as: <span className="font-bold">{user.name}</span>
            </p>
            <p className="text-sm text-gray-500 mb-6">
              Click the button below to log out of your account.
            </p>
            <Button 
              className="w-full" 
              variant="destructive" 
              onClick={handleLogout}
            >
              Log Out
            </Button>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-yellow-600 mb-4">
              You are not currently logged in.
            </p>
            <Button 
              className="mt-4" 
              variant="outline"
              onClick={() => router.push('/login')}
            >
              Go to Login
            </Button>
          </div>
        )}
        
        <div className="mt-6 pt-4 border-t text-center">
          <p className="text-xs text-gray-500">
            Debug note: This page allows forced logout regardless of redirects.
          </p>
        </div>
      </Card>
    </div>
  )
} 