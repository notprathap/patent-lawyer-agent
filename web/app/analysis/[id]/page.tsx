'use client';

import { useEffect, useState, use } from 'react';
import { getAnalysis } from '@/lib/api';
import ReactMarkdown from 'react-markdown';

const STEPS = [
  'PENDING', 'VALIDATING', 'DECONSTRUCTING', 'SEARCHING_PRIOR_ART',
  'EXAMINING', 'REFLECTING', 'SYNTHESIZING', 'COMPLETE',
];

const STEP_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  VALIDATING: 'Validating Input',
  DECONSTRUCTING: 'Deconstructing Claim',
  SEARCHING_PRIOR_ART: 'Searching Prior Art',
  EXAMINING: 'Examining Patent',
  REFLECTING: 'Reflecting',
  SYNTHESIZING: 'Synthesizing Memo',
  COMPLETE: 'Complete',
  FAILED: 'Failed',
};

interface Analysis {
  id: string;
  status: string;
  jurisdictions: string[];
  claimText: string;
  usRating: string | null;
  epoRating: string | null;
  ukRating: string | null;
  assessmentConfidence: string | null;
  memo: string | null;
  reflectionNotes: string | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  createdAt: string;
  completedAt: string | null;
}

function StatusTracker({ status, errorMessage }: { status: string; errorMessage?: string | null }) {
  const currentIdx = STEPS.indexOf(status);
  const isFailed = status === 'FAILED';

  return (
    <div className="bg-white rounded-lg border p-6 mb-6">
      <h2 className="text-sm font-medium text-gray-500 mb-4">ANALYSIS PROGRESS</h2>
      <div className="flex items-center gap-1">
        {STEPS.map((step, idx) => {
          const isActive = step === status;
          const isPast = idx < currentIdx;
          const isCurrent = isActive && status !== 'COMPLETE';

          return (
            <div key={step} className="flex-1 flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium mb-1 ${
                  isFailed && isActive
                    ? 'bg-red-500 text-white'
                    : isPast || status === 'COMPLETE'
                      ? 'bg-green-500 text-white'
                      : isCurrent
                        ? 'bg-blue-500 text-white animate-pulse'
                        : 'bg-gray-200 text-gray-500'
                }`}
              >
                {isPast || status === 'COMPLETE' ? '✓' : idx + 1}
              </div>
              <span className={`text-xs text-center ${isActive ? 'font-medium text-gray-900' : 'text-gray-400'}`}>
                {STEP_LABELS[step]}
              </span>
            </div>
          );
        })}
      </div>
      {isFailed && (
        <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
          <p className="font-medium">Analysis Failed</p>
          {errorMessage && <p className="mt-1">{errorMessage.replace(/^ERROR:\s*/, '')}</p>}
          {!errorMessage && <p className="mt-1">Check the API logs for details.</p>}
        </div>
      )}
    </div>
  );
}

function ConfidencePanel({ analysis }: { analysis: Analysis }) {
  const ratings = [
    { label: 'US', value: analysis.usRating },
    { label: 'EU/EPO', value: analysis.epoRating },
    { label: 'UK', value: analysis.ukRating },
  ];

  const ratingColor = (r: string | null) => {
    if (r === 'Strong') return 'text-green-600 bg-green-50 border-green-200';
    if (r === 'Moderate') return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    if (r === 'Weak') return 'text-red-600 bg-red-50 border-red-200';
    return 'text-gray-400 bg-gray-50 border-gray-200';
  };

  return (
    <div className="bg-white rounded-lg border p-6 mb-6">
      <h2 className="text-sm font-medium text-gray-500 mb-4">DEFENSIBILITY RATINGS</h2>
      <div className="grid grid-cols-3 gap-4 mb-4">
        {ratings.map((r) => (
          <div key={r.label} className={`border rounded-lg p-4 text-center ${ratingColor(r.value)}`}>
            <div className="text-xs font-medium mb-1">{r.label}</div>
            <div className="text-lg font-bold">{r.value || '-'}</div>
          </div>
        ))}
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-gray-500">Assessment Confidence</span>
        <span className="font-medium">{analysis.assessmentConfidence || '-'}</span>
      </div>
      <div className="flex justify-between text-sm mt-1">
        <span className="text-gray-500">Tokens Used</span>
        <span className="font-mono text-xs">{analysis.totalInputTokens.toLocaleString()} in / {analysis.totalOutputTokens.toLocaleString()} out</span>
      </div>
    </div>
  );
}

export default function AnalysisDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await getAnalysis(id);
        setAnalysis(data);
      } catch (err) {
        console.error('Failed to fetch analysis:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // Poll for status updates if not complete
    const interval = setInterval(async () => {
      try {
        const data = await getAnalysis(id);
        setAnalysis(data);
        if (data.status === 'COMPLETE' || data.status === 'FAILED') {
          clearInterval(interval);
        }
      } catch {
        // Ignore polling errors
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [id]);

  if (loading) return <p className="text-gray-500">Loading analysis...</p>;
  if (!analysis) return <p className="text-red-500">Analysis not found.</p>;

  const isComplete = analysis.status === 'COMPLETE';

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <a href="/" className="text-gray-400 hover:text-gray-600">&larr; Dashboard</a>
        <h1 className="text-2xl font-bold">Analysis {analysis.id.slice(0, 12)}...</h1>
      </div>

      <StatusTracker status={analysis.status} errorMessage={analysis.reflectionNotes} />

      {isComplete && <ConfidencePanel analysis={analysis} />}

      {isComplete && analysis.memo && (
        <div className="bg-white rounded-lg border p-6">
          <h2 className="text-sm font-medium text-gray-500 mb-4">DEFENSIBILITY OPINION MEMO</h2>
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown>{analysis.memo}</ReactMarkdown>
          </div>
        </div>
      )}

      {!isComplete && analysis.status !== 'FAILED' && (
        <div className="bg-white rounded-lg border p-12 text-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600">Analysis in progress...</p>
          <p className="text-sm text-gray-400 mt-1">Current step: {STEP_LABELS[analysis.status] || analysis.status}</p>
        </div>
      )}
    </div>
  );
}
