import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// In a client-side authentication system, we'll use a minimal middleware
// that only protects server-side routes if any

// List of paths that don't require authentication
const publicPaths = [
  '/',
  '/login',
  '/setup',      // Setup wizard
  '/_next',
  '/api',        // All API routes
  '/dashboard',  // Allow client-side protected routes
  '/admin',      // Allow client-side protected routes
  '/chat',       // Allow client-side protected routes
  '/visualization' // Allow client-side protected routes
]

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  
  // With client-side auth, we'll let most routes through
  // The client components will handle redirecting unauthenticated users
  const isPublicPath = publicPaths.some(publicPath => 
    pathname === publicPath || pathname.startsWith(`${publicPath}/`)
  ) || pathname.includes('.')
  
  // Let everything through except for specific server-protected routes
  // that we might add in the future
  if (isPublicPath) {
    return NextResponse.next()
  }
  
  // For any future server-protected routes, we could add logic here
  return NextResponse.next()
}

// Configure paths that match the middleware
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
