'use client';

import { useEffect, useState } from 'react';
import { listAnalyses } from '@/lib/api';

interface AnalysisSummary {
  id: string;
  status: string;
  jurisdictions: string[];
  usRating: string | null;
  epoRating: string | null;
  ukRating: string | null;
  assessmentConfidence: string | null;
  createdAt: string;
  completedAt: string | null;
}

function RatingBadge({ rating }: { rating: string | null }) {
  if (!rating) return <span className="text-gray-400">-</span>;
  const colors: Record<string, string> = {
    Strong: 'bg-green-100 text-green-800',
    Moderate: 'bg-yellow-100 text-yellow-800',
    Weak: 'bg-red-100 text-red-800',
  };
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[rating] || 'bg-gray-100'}`}>
      {rating}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    COMPLETE: 'bg-green-100 text-green-800',
    FAILED: 'bg-red-100 text-red-800',
    PENDING: 'bg-gray-100 text-gray-800',
  };
  const isRunning = !['COMPLETE', 'FAILED', 'PENDING'].includes(status);
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${isRunning ? 'bg-blue-100 text-blue-800 animate-pulse' : colors[status] || 'bg-gray-100'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

export default function Dashboard() {
  const [analyses, setAnalyses] = useState<AnalysisSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listAnalyses()
      .then((res) => setAnalyses(res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Analysis Dashboard</h1>
        <a href="/new" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
          New Analysis
        </a>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading analyses...</p>
      ) : analyses.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border">
          <p className="text-gray-500 mb-4">No analyses yet.</p>
          <a href="/new" className="text-blue-600 hover:underline">Start your first analysis</a>
        </div>
      ) : (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Jurisdictions</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">US</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">EU</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">UK</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Confidence</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {analyses.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => window.location.href = `/analysis/${a.id}`}>
                  <td className="px-4 py-3"><StatusBadge status={a.status} /></td>
                  <td className="px-4 py-3 text-sm">{a.jurisdictions.join(', ')}</td>
                  <td className="px-4 py-3"><RatingBadge rating={a.usRating} /></td>
                  <td className="px-4 py-3"><RatingBadge rating={a.epoRating} /></td>
                  <td className="px-4 py-3"><RatingBadge rating={a.ukRating} /></td>
                  <td className="px-4 py-3 text-sm">{a.assessmentConfidence || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{new Date(a.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
