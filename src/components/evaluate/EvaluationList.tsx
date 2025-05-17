"use client"

import { useState, useEffect, useCallback } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import toast from 'react-hot-toast'
import Image from 'next/image'

interface Submission {
  id: string
  user_id: string
  full_name: string
  email: string
  phone_number: string
  location: string
  hobbies: string
  profile_picture_url: string
  source_code_url: string
  status: 'pending' | 'accepted' | 'rejected'
  feedback?: string
  created_at: string
  isUpdating?: boolean
}

type Filter = 'all' | 'pending' | 'accepted' | 'rejected'

export default function EvaluationList() {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [filteredSubmissions, setFilteredSubmissions] = useState<Submission[]>([])
  const [feedbackMap, setFeedbackMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const supabase = createClientComponentClient()

  // Fetch submissions and set up real-time subscription
  useEffect(() => {
    fetchSubmissions()
    const cleanup = setupRealtimeSubscription()
    
    return () => {
      cleanup()
    }
  }, [])
  
  // Apply filters when submissions, filter, or search term changes
  useEffect(() => {
    applyFilters()
  }, [submissions, filter, searchTerm])

  const fetchSubmissions = async () => {
    try {
      setLoading(true)
      
      const { data, error } = await supabase
        .from('submissions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      setSubmissions(data || []);
    } catch (error: any) {
      console.error('Error fetching submissions:', error.message);
      toast.error('Failed to load submissions');
    } finally {
      setLoading(false);
    }
  }

  const setupRealtimeSubscription = () => {
    const channel = supabase
      .channel('submissions-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'submissions' },
        (payload) => {
          const newSubmission = payload.new as Submission
          if (newSubmission) {
            setSubmissions((current) =>
              current.some((sub) => sub.id === newSubmission.id)
                ? current.map((sub) =>
                    sub.id === newSubmission.id ? newSubmission : sub
                  )
                : [newSubmission, ...current]
            )
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }

  const applyFilters = useCallback(() => {
    let filtered = [...submissions]
    
    // Apply status filter
    if (filter !== 'all') {
      filtered = filtered.filter(sub => sub.status === filter)
    }
    
    // Apply search filter (case insensitive)
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(sub => 
        sub.full_name.toLowerCase().includes(term) || 
        sub.email.toLowerCase().includes(term) ||
        sub.location.toLowerCase().includes(term)
      )
    }
    
    setFilteredSubmissions(filtered)
  }, [submissions, filter, searchTerm])

  const handleDownload = async (url: string, fileName: string) => {
    try {
      // Get a direct download URL from Supabase
      const fileNameEncoded = encodeURIComponent(fileName);
      const downloadUrl = `${url}?download=${fileNameEncoded}`;
      
      // Open in new window/tab for direct download
      window.open(downloadUrl, '_blank');
      
      toast.success('Download started');
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Failed to download file');
    }
  }

  const updateSubmission = async (id: string, status: 'accepted' | 'rejected') => {
    const feedback = feedbackMap[id];
    if (!feedback?.trim()) {
      toast.error('Please provide feedback before making a decision');
      return;
    }

    // Add a loading state for the specific submission being updated
    setSubmissions(prev => prev.map(sub => 
      sub.id === id ? { ...sub, isUpdating: true } : sub
    ));

    try {
      // Update submission in database first
      const { error } = await supabase
        .from('submissions')
        .update({ 
          status, 
          feedback 
        })
        .eq('id', id);

      if (error) throw error;

      // Update local state to reflect the change immediately
      setSubmissions(prevSubmissions => 
        prevSubmissions.map(sub => 
          sub.id === id ? { ...sub, status, feedback, isUpdating: false } : sub
        )
      );

      // Send email notification
      try {
        const response = await fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            submissionId: id,
            action: status,
            feedback
          })
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          
          try {
            // Try to parse as JSON if possible
            const errorData = JSON.parse(errorText);
            throw new Error(errorData.error || 'API request failed');
          } catch (parseError) {
            throw new Error(`API request failed with status ${response.status}: ${errorText.substring(0, 100)}...`);
          }
        }

        toast.success(`Submission ${status === 'accepted' ? 'approved' : 'rejected'} and email sent`);
      } catch (emailError: any) {
        console.error('Email error:', emailError);
        toast.error(`Email sending failed: ${emailError.message}`);
        
        // Add warning that the action was saved but email failed
        toast.error('Decision was recorded but the notification email failed to send');
      }
    } catch (error: any) {
      // Also remove loading state on error
      setSubmissions(prev => prev.map(sub => 
        sub.id === id ? { ...sub, isUpdating: false } : sub
      ));
      console.error('Error updating submission:', error);
      toast.error(error.message || 'Failed to update submission');
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
        <p className="text-gray-600">Loading submissions...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 rounded-lg shadow-sm">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search by name, email, or location..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Filter:</span>
            <div className="flex rounded-md overflow-hidden">
              <button
                onClick={() => setFilter('all')}
                className={`px-4 py-2 text-sm ${filter === 'all' 
                  ? 'bg-indigo-600 text-white' 
                  : 'bg-gray-100 text-gray-800 hover:bg-gray-200'}`}
              >
                All
              </button>
              <button
                onClick={() => setFilter('pending')}
                className={`px-4 py-2 text-sm ${filter === 'pending' 
                  ? 'bg-yellow-500 text-white' 
                  : 'bg-gray-100 text-gray-800 hover:bg-gray-200'}`}
              >
                Pending
              </button>
              <button
                onClick={() => setFilter('accepted')}
                className={`px-4 py-2 text-sm ${filter === 'accepted' 
                  ? 'bg-green-600 text-white' 
                  : 'bg-gray-100 text-gray-800 hover:bg-gray-200'}`}
              >
                Accepted
              </button>
              <button
                onClick={() => setFilter('rejected')}
                className={`px-4 py-2 text-sm ${filter === 'rejected' 
                  ? 'bg-red-600 text-white' 
                  : 'bg-gray-100 text-gray-800 hover:bg-gray-200'}`}
              >
                Rejected
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {submissions.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow-sm">
          <div className="flex justify-center mb-4">
            <Image src="/file.svg" width={64} height={64} alt="No submissions" />
          </div>
          <h3 className="text-xl font-medium text-gray-900">No submissions yet</h3>
          <p className="text-gray-500 mt-2">Submissions will appear here when developers apply</p>
        </div>
      ) : filteredSubmissions.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow-sm">
          <div className="flex justify-center mb-4">
            <Image src="/file.svg" width={64} height={64} alt="No results" />
          </div>
          <h3 className="text-xl font-medium text-gray-900">No results found</h3>
          <p className="text-gray-500 mt-2">Try adjusting your search or filter criteria</p>
        </div>
      ) : (
        filteredSubmissions.map((submission) => (
          <div 
            key={submission.id} 
            className={`bg-white rounded-lg shadow-md p-6 transition-all ${
              submission.status === 'accepted' ? 'border-l-4 border-green-500' :
              submission.status === 'rejected' ? 'border-l-4 border-red-500' : ''
            }`}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Developer Info */}
              <div className="flex flex-col items-center md:items-start">
                <div className="relative h-48 w-48 mx-auto mb-4 rounded-lg overflow-hidden">
                  <img
                    src={submission.profile_picture_url}
                    alt={submission.full_name}
                    className="object-cover h-full w-full"
                    onError={(e) => {
                      e.currentTarget.src = "/globe.svg"; // Fallback image
                    }}
                  />
                </div>
                
                <h3 className="text-xl font-semibold mb-4">
                  {submission.full_name}
                </h3>
                
                <div className="space-y-3 w-full">
                  <div className="flex items-center text-gray-700">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-gray-500" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                      <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                    </svg>
                    <span>{submission.email}</span>
                  </div>
                  
                  <div className="flex items-center text-gray-700">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-gray-500" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                    </svg>
                    <span>{submission.phone_number}</span>
                  </div>
                  
                  <div className="flex items-center text-gray-700">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-gray-500" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                    </svg>
                    <span>{submission.location}</span>
                  </div>
                </div>
                
                <div className="mt-4 w-full">
                  <h4 className="font-medium mb-2">Hobbies & Interests</h4>
                  <p className="text-gray-700 bg-gray-50 p-3 rounded-md text-sm">{submission.hobbies}</p>
                </div>
              </div>

              {/* Evaluation Section */}
              <div className="space-y-4">
                <button
                  onClick={() => handleDownload(
                    submission.source_code_url,
                    `${submission.full_name.replace(/\s+/g, '-')}-source.zip`
                  )}
                  className="w-full flex items-center justify-center py-3 px-4 bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                  Download Source Code
                </button>

                {submission.status === 'pending' ? (
                  <>
                    <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
                      <div className="flex">
                        <div className="flex-shrink-0">
                          <svg className="h-5 w-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <div className="ml-3">
                          <p className="text-sm text-yellow-700">
                            This submission is awaiting your review. Please provide thoughtful feedback.
                          </p>
                        </div>
                      </div>
                    </div>
                  
                    <textarea
                      value={feedbackMap[submission.id] || ''}
                      onChange={(e) => setFeedbackMap(prev => ({
                        ...prev,
                        [submission.id]: e.target.value
                      }))}
                      placeholder="Enter your feedback for the candidate..."
                      className="w-full p-3 border rounded-md h-32 focus:ring-indigo-500 focus:border-indigo-500"
                      required
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <button
                        onClick={() => updateSubmission(submission.id, 'accepted')}
                        disabled={submission.isUpdating}
                        className={`w-full py-3 px-4 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors flex items-center justify-center ${
                          submission.isUpdating ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                      >
                        {submission.isUpdating ? (
                          <>
                            <span className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></span>
                            Processing...
                          </>
                        ) : (
                          <>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                            Welcome to the Team
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => updateSubmission(submission.id, 'rejected')}
                        disabled={submission.isUpdating}
                        className={`w-full py-3 px-4 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors flex items-center justify-center ${
                          submission.isUpdating ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                      >
                        {submission.isUpdating ? (
                          <>
                            <span className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></span>
                            Processing...
                          </>
                        ) : (
                          <>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                            We Are Sorry
                          </>
                        )}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className={`p-4 rounded-md ${
                    submission.status === 'accepted' 
                      ? 'bg-green-50 border-green-200 border' 
                      : 'bg-red-50 border-red-200 border'
                  }`}>
                    <div className="flex items-start">
                      <div className="flex-shrink-0">
                        {submission.status === 'accepted' ? (
                          <svg className="h-6 w-6 text-green-600" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                        ) : (
                          <svg className="h-6 w-6 text-red-600" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                      <div className="ml-3">
                        <p className="font-semibold text-lg mb-2 mt-0">
                          {submission.status === 'accepted' ? 'Application Accepted' : 'Application Rejected'}
                        </p>
                        <div className="text-sm bg-white p-4 rounded border border-gray-100">
                          <p className="whitespace-pre-wrap">{submission.feedback || 'No feedback provided.'}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  )
}