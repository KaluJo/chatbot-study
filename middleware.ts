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

  // In demo mode, redirect the root to /chat so Google sees a proper 301
  // instead of a JS-driven redirect from a thin loading page
  if (pathname === '/' && process.env.NEXT_PUBLIC_DEMO_MODE === 'true') {
    return NextResponse.redirect(new URL('/chat', request.url), 301)
  }

  // With client-side auth, we'll let most routes through
  // The client components will handle redirecting unauthenticated users
  const isPublicPath = publicPaths.some(publicPath => 
    pathname === publicPath || pathname.startsWith(`${publicPath}/`)
  ) || pathname.includes('.')
  
  if (isPublicPath) {
    return NextResponse.next()
  }
  
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
