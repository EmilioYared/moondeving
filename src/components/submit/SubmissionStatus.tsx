"use client"
import { useEffect, useState } from "react"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"

interface Submission {
  id: string
  status: "pending" | "accepted" | "rejected"
  feedback: string | null
}

export default function SubmissionStatus({ userId }: { userId: string }) {
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClientComponentClient()

  useEffect(() => {
    // Fetch initial submission
    const fetchSubmission = async () => {
      const { data, error } = await supabase
        .from("submissions")
        .select("id, status, feedback")
        .eq("user_id", userId)
        .single()
      if (data) setSubmission(data)
      setLoading(false)
    }
    fetchSubmission()

    // Subscribe to real-time updates for this user's submission
    const channel = supabase
      .channel("submission-status-" + userId)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "submissions", filter: `user_id=eq.${userId}` },
        (payload) => {
          if (payload.new) setSubmission(payload.new as Submission)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId])

  if (loading) return (
    <div className="mt-6 p-4 rounded-lg border bg-gray-50">
      <div className="flex items-center space-x-3">
        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600"></div>
        <p className="text-gray-600">Loading your submission status...</p>
      </div>
    </div>
  )
  
  if (!submission) return <div className="mt-6 p-4 rounded-lg border bg-gray-50 text-gray-500">No submission found.</div>

  return (
    <div className="mt-6 p-4 rounded-lg border bg-gray-50">
      <p>
        <strong>Status:</strong>{" "}
        <span
          className={
            submission.status === "pending"
              ? "text-yellow-600"
              : submission.status === "accepted"
              ? "text-green-600"
              : "text-red-600"
          }
        >
          {submission.status.charAt(0).toUpperCase() + submission.status.slice(1)}
        </span>
      </p>
      <p className="mt-2">
        <strong>Feedback:</strong>{" "}
        {submission.feedback ? submission.feedback : "No feedback yet."}
      </p>
    </div>
  )
}