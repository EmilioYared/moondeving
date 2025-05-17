import { NextRequest, NextResponse } from 'next/server'
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'

// Define auth-exempt paths for better maintainability
const PUBLIC_PATHS = [
  '/_next',
  '/static',
  '/favicon.ico',
  '/api',
  '/images',
  '/fonts'
]

// Type for user roles
type UserRole = 'developer' | 'evaluator' | null

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })
  const path = req.nextUrl.pathname

  // Allow static files and Next.js internals
  if (PUBLIC_PATHS.some(publicPath => path.startsWith(publicPath))) {
    return res
  }

  // Check auth session
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()

  // Handle session error gracefully
  if (sessionError) {
    console.error('Session error:', sessionError)
    return NextResponse.redirect(new URL('/', req.url))
  }

  // If not logged in, only allow access to the login page
  if (!session) {
    if (path !== '/') {
      return NextResponse.redirect(new URL('/', req.url))
    }
    return res
  }

  // Get user role
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('role')
    .eq('id', session.user.id)
    .single()

  // Handle database error gracefully
  if (userError) {
    console.error('User data fetch error:', userError)
    await supabase.auth.signOut() // Force logout on data error
    return NextResponse.redirect(new URL('/', req.url))
  }

  const userRole = userData?.role as UserRole

  // Role-based routing
  switch (userRole) {
    case 'developer':
      if (path !== '/' && path !== '/submit') {
        return NextResponse.redirect(new URL('/submit', req.url))
      }
      break
    case 'evaluator':
      if (path !== '/' && path !== '/evaluate') {
        return NextResponse.redirect(new URL('/evaluate', req.url))
      }
      break
    default:
      // If role is missing or invalid, force logout
      await supabase.auth.signOut()
      return NextResponse.redirect(new URL('/', req.url))
  }

  return res
}

// Specify which routes should be protected
export const config = {
  matcher: ['/', '/submit', '/evaluate']
}