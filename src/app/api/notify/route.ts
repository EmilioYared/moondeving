import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { sendDeveloperNotification } from '@/lib/email/nodemailer'

export async function POST(request: Request) {
  try {
    // Updated to use the recommended pattern with await
    const cookieStore = cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })

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