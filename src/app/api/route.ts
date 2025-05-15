import { createRouteHandlerClient , createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { sendDeveloperNotification } from '@/lib/email/nodemailer'

export async function POST(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { submissionId, action, feedback } = await request.json()

    // Log for debugging
    console.log("API called with:", { submissionId, action, feedback });
    console.log("Email credentials exist:", !!process.env.EMAIL_USER && !!process.env.EMAIL_PASSWORD);

    // Verify evaluator authentication
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get submission details
    const { data: submission } = await supabase
      .from('submissions')
      .select('*')
      .eq('id', submissionId)
      .single()

    if (!submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
    }

    // Send email notification using Nodemailer
    const emailSuccess = await sendDeveloperNotification(
      submission.email,
      action as 'accepted' | 'rejected',
      feedback,
      submission.full_name
    );

    if (!emailSuccess) {
      return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
    }

    console.log('Email sent successfully to:', submission.email);
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Notification error:', error);
    return NextResponse.json(
      { error: error.message }, 
      { status: 500 }
    )
  }
}

// Existing middleware code remains unchanged
export async function middleware(request: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req: request, res })
  const { data: { session } } = await supabase.auth.getSession()

  // Protect routes
  if (!session) {
    // If not logged in, redirect to login page
    if (request.nextUrl.pathname !== '/') {
      return NextResponse.redirect(new URL('/', request.url))
    }
  } else {
    // If logged in, check role and redirect if necessary
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', session.user.id)
      .single()

    if (userData?.role === 'developer' && request.nextUrl.pathname === '/evaluate') {
      return NextResponse.redirect(new URL('/submit', request.url))
    }

    if (userData?.role === 'evaluator' && request.nextUrl.pathname === '/submit') {
      return NextResponse.redirect(new URL('/evaluate', request.url))
    }
  }

  return res
}

export const config = {
  matcher: ['/', '/submit', '/evaluate']
}