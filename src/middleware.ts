import { NextRequest, NextResponse } from 'next/server'
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })
  const path = req.nextUrl.pathname

  // Allow static files and Next.js internals
  if (
    path.startsWith('/_next') ||
    path.startsWith('/static') ||
    path.startsWith('/favicon.ico') ||
    path.startsWith('/api')
  ) {
    return res
  }

  // Check auth session
  const { data: { session } } = await supabase.auth.getSession()

  // If not logged in, only allow access to the login page
  if (!session) {
    if (path !== '/') {
      return NextResponse.redirect(new URL('/', req.url))
    }
    return res
  }

  // Get user role
  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', session.user.id)
    .single()

  // Role-based routing
  if (userData?.role === 'developer') {
    if (path !== '/' && path !== '/submit') {
      return NextResponse.redirect(new URL('/submit', req.url))
    }
  } else if (userData?.role === 'evaluator') {
    if (path !== '/' && path !== '/evaluate') {
      return NextResponse.redirect(new URL('/evaluate', req.url))
    }
  } else {
    // If role is missing or invalid, force logout or redirect to login
    return NextResponse.redirect(new URL('/', req.url))
  }

  return res
}

// Specify which routes should be protected
export const config = {
  matcher: ['/', '/submit', '/evaluate']
}