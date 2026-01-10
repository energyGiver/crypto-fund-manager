'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Card } from '@/components/Card';
import { apiClient, JobStatus } from '@/lib/api';

const STAGE_LABELS = {
  PENDING: 'Initializing...',
  FETCHING_TX: 'Fetching on-chain data...',
  CLASSIFYING: 'Classifying transactions...',
  PRICING: 'Calculating USD values...',
  CALCULATING: 'Computing taxes...',
  DONE: 'Complete!',
  ERROR: 'Error occurred',
};

export default function LoadingPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params.jobId as string;

  const [status, setStatus] = useState<JobStatus | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let interval: NodeJS.Timeout;

    const pollStatus = async () => {
      try {
        const jobStatus = await apiClient.getJobStatus(jobId);
        setStatus(jobStatus);

        if (jobStatus.stage === 'DONE') {
          clearInterval(interval);
          // Wait a moment then navigate
          setTimeout(() => {
            router.push(`/report/${jobId}`);
          }, 1000);
        } else if (jobStatus.stage === 'ERROR') {
          clearInterval(interval);
          setError(jobStatus.errors?.message || 'An error occurred');
        }
      } catch (err: any) {
        setError(err.message);
        clearInterval(interval);
      }
    };

    // Poll every 2 seconds
    pollStatus();
    interval = setInterval(pollStatus, 2000);

    return () => clearInterval(interval);
  }, [jobId, router]);

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-6">
      {/* Background */}
      <div className="fixed inset-0 bg-gradient-to-br from-zinc-900 via-black to-black">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/10 via-transparent to-transparent" />
      </div>

      {/* Content */}
      <div className="relative w-full max-w-2xl">
        <Card className="p-12">
          <div className="text-center space-y-8">
            {/* Logo/Icon */}
            <div className="w-20 h-20 mx-auto rounded-full bg-blue-600/20 flex items-center justify-center">
              <svg
                className={`w-10 h-10 text-blue-500 ${status?.stage !== 'DONE' && status?.stage !== 'ERROR' ? 'animate-spin' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
              >
                {status?.stage === 'DONE' ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} stroke="currentColor" d="M5 13l4 4L19 7" />
                ) : status?.stage === 'ERROR' ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} stroke="currentColor" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <>
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </>
                )}
              </svg>
            </div>

            {/* Status Text */}
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">
                {status ? STAGE_LABELS[status.stage] : 'Loading...'}
              </h1>
              <p className="text-zinc-400">
                {error ? error : 'This may take 30-60 seconds'}
              </p>
            </div>

            {/* Progress Bar */}
            {status && !error && (
              <div className="space-y-3">
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${status.progressPct}%` }}
                  />
                </div>
                <p className="text-sm text-zinc-500">{status.progressPct}% complete</p>
              </div>
            )}

            {/* Stage indicators */}
            {status && !error && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-8">
                {['FETCHING_TX', 'CLASSIFYING', 'PRICING', 'CALCULATING'].map((stage, idx) => {
                  const isActive = status.stage === stage;
                  const isPast = ['FETCHING_TX', 'CLASSIFYING', 'PRICING', 'CALCULATING'].indexOf(status.stage) > idx;
                  const isCurrent = isActive;

                  return (
                    <div key={stage} className="text-center">
                      <div className={`
                        w-8 h-8 mx-auto mb-2 rounded-full flex items-center justify-center
                        ${isPast || isActive ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-500'}
                        ${isCurrent ? 'ring-4 ring-blue-600/30' : ''}
                      `}>
                        {isPast ? (
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        ) : (
                          <span className="text-xs font-medium">{idx + 1}</span>
                        )}
                      </div>
                      <p className={`text-xs ${isActive ? 'text-white font-medium' : 'text-zinc-500'}`}>
                        {STAGE_LABELS[stage as keyof typeof STAGE_LABELS].replace('...', '')}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Error state */}
            {error && (
              <button
                onClick={() => router.push('/')}
                className="text-blue-500 hover:text-blue-400 text-sm font-medium"
              >
                ← Back to home
              </button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
