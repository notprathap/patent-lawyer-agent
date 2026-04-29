'use client';

import { useEffect, useState, useRef, use } from 'react';
import { getAnalysis } from '@/lib/api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const DEFENSIBILITY_STEPS = [
  'PENDING',
  'VALIDATING',
  'DECONSTRUCTING',
  'SEARCHING_PRIOR_ART',
  'EXAMINING',
  'REFLECTING',
  'SYNTHESIZING',
  'COMPLETE',
];

const FTO_STEPS = [
  'PENDING',
  'VALIDATING',
  'DECONSTRUCTING_PRODUCT',
  'DISCOVERING_PATENTS',
  'ANALYZING_INFRINGEMENT',
  'REFLECTING',
  'SYNTHESIZING',
  'COMPLETE',
];

const STEP_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  VALIDATING: 'Validating Input',
  // Defensibility
  DECONSTRUCTING: 'Deconstructing Claim',
  SEARCHING_PRIOR_ART: 'Searching Prior Art',
  EXAMINING: 'Examining Patent',
  // FTO
  DECONSTRUCTING_PRODUCT: 'Deconstructing Product',
  DISCOVERING_PATENTS: 'Discovering Patents',
  MAPPING_PATENTS: 'Mapping Patents',
  ANALYZING_INFRINGEMENT: 'Analyzing Infringement',
  // Shared
  REFLECTING: 'Reflecting',
  SYNTHESIZING: 'Synthesizing Memo',
  COMPLETE: 'Complete',
  FAILED: 'Failed',
};

interface Analysis {
  id: string;
  analysisType: 'DEFENSIBILITY' | 'FTO';
  status: string;
  jurisdictions: string[];
  targetMarkets: string[];
  claimText: string;
  productDescription: string | null;
  usRating: string | null;
  epoRating: string | null;
  ukRating: string | null;
  overallFtoRisk: string | null;
  assessmentConfidence: string | null;
  memo: string | null;
  reflectionNotes: string | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  createdAt: string;
  completedAt: string | null;
}

function StatusTracker({
  status,
  steps,
  errorMessage,
}: {
  status: string;
  steps: string[];
  errorMessage?: string | null;
}) {
  // If the backend ever emits a status outside the type-specific list (e.g. a
  // reserved enum value not yet wired into the orchestrator), don't blank out
  // the tracker — fall back to a clearly-pending visual at the last known step.
  const rawIdx = steps.indexOf(status);
  const isFailed = status === 'FAILED';
  const isUnknownInProgress = rawIdx === -1 && !isFailed && status !== 'COMPLETE';
  const currentIdx = isUnknownInProgress ? steps.length - 2 : rawIdx;

  return (
    <div className="bg-white rounded-lg border p-6 mb-6">
      <h2 className="text-sm font-medium text-gray-500 mb-4">ANALYSIS PROGRESS</h2>
      <div className="flex items-center gap-1">
        {steps.map((step, idx) => {
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
              <span
                className={`text-xs text-center ${
                  isActive ? 'font-medium text-gray-900' : 'text-gray-400'
                }`}
              >
                {STEP_LABELS[step] ?? step}
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

function DefensibilityRatings({ analysis }: { analysis: Analysis }) {
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
      <FooterRow analysis={analysis} />
    </div>
  );
}

function FTORiskPanel({ analysis }: { analysis: Analysis }) {
  const ratings = [
    { label: 'US', value: analysis.usRating },
    { label: 'EU', value: analysis.epoRating },
    { label: 'UK', value: analysis.ukRating },
  ];

  const riskColor = (r: string | null) => {
    if (r === 'Clear') return 'text-green-700 bg-green-50 border-green-200';
    if (r === 'Low') return 'text-emerald-700 bg-emerald-50 border-emerald-200';
    if (r === 'Medium') return 'text-yellow-700 bg-yellow-50 border-yellow-200';
    if (r === 'High') return 'text-red-700 bg-red-50 border-red-200';
    return 'text-gray-400 bg-gray-50 border-gray-200';
  };

  return (
    <div className="bg-white rounded-lg border p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-gray-500">FTO RISK ASSESSMENT</h2>
        {analysis.overallFtoRisk && (
          <div
            className={`text-xs font-semibold border rounded-full px-3 py-1 ${riskColor(
              analysis.overallFtoRisk,
            )}`}
          >
            Overall: {analysis.overallFtoRisk}
          </div>
        )}
      </div>
      <div className="grid grid-cols-3 gap-4 mb-4">
        {ratings.map((r) => (
          <div key={r.label} className={`border rounded-lg p-4 text-center ${riskColor(r.value)}`}>
            <div className="text-xs font-medium mb-1">{r.label}</div>
            <div className="text-lg font-bold">{r.value || '-'}</div>
          </div>
        ))}
      </div>
      <FooterRow analysis={analysis} />
      <div className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
        v1 limitation: legal status (in-force vs. lapsed) of the listed patents was not independently verified. Confirm legal status before relying on any clearance conclusion.
      </div>
    </div>
  );
}

function FooterRow({ analysis }: { analysis: Analysis }) {
  return (
    <>
      <div className="flex justify-between text-sm">
        <span className="text-gray-500">Assessment Confidence</span>
        <span className="font-medium">{analysis.assessmentConfidence || '-'}</span>
      </div>
      <div className="flex justify-between text-sm mt-1">
        <span className="text-gray-500">Tokens Used</span>
        <span className="font-mono text-xs">
          {analysis.totalInputTokens.toLocaleString()} in /{' '}
          {analysis.totalOutputTokens.toLocaleString()} out
        </span>
      </div>
    </>
  );
}

export default function AnalysisDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);
  const pdfContentRef = useRef<HTMLDivElement>(null);

  const handleExportPDF = () => {
    if (!pdfContentRef.current || !analysis) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const doc = printWindow.document;

    document.querySelectorAll('style, link[rel="stylesheet"]').forEach((el) => {
      doc.head.appendChild(el.cloneNode(true));
    });

    const printStyle = doc.createElement('style');
    printStyle.textContent = [
      'body { background: white; padding: 32px; max-width: 900px; margin: 0 auto; }',
      '@page { margin: 15mm; size: A4; }',
      '@media print { body { padding: 0; } }',
    ].join('\n');
    doc.head.appendChild(printStyle);

    doc.title =
      analysis.analysisType === 'FTO'
        ? `Patent FTO Clearance Opinion - ${analysis.id.slice(0, 12)}`
        : `Patent Defensibility Analysis - ${analysis.id.slice(0, 12)}`;

    doc.body.appendChild(pdfContentRef.current.cloneNode(true));

    printWindow.addEventListener('afterprint', () => printWindow.close());
    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
    };
  };

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
  const isFTO = analysis.analysisType === 'FTO';
  const steps = isFTO ? FTO_STEPS : DEFENSIBILITY_STEPS;
  const memoLabel = isFTO ? 'FTO CLEARANCE OPINION MEMO' : 'DEFENSIBILITY OPINION MEMO';

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <a href="/" className="text-gray-400 hover:text-gray-600">
          &larr; Dashboard
        </a>
        <h1 className="text-2xl font-bold">
          {isFTO ? 'FTO Analysis' : 'Defensibility Analysis'} {analysis.id.slice(0, 12)}…
        </h1>
        <span
          className={`px-2 py-1 rounded-full text-xs font-medium ${
            isFTO ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
          }`}
        >
          {isFTO ? 'FTO' : 'Defensibility'}
        </span>
      </div>

      <StatusTracker status={analysis.status} steps={steps} errorMessage={analysis.reflectionNotes} />

      {isComplete && (
        <div className="flex justify-end mb-4">
          <button
            onClick={handleExportPDF}
            disabled={!analysis.memo}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            Export PDF
          </button>
        </div>
      )}

      <div ref={pdfContentRef}>
        {isComplete && (isFTO ? <FTORiskPanel analysis={analysis} /> : <DefensibilityRatings analysis={analysis} />)}

        {isComplete && analysis.memo && (
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-sm font-medium text-gray-500 mb-4">{memoLabel}</h2>
            <div className="prose prose-sm max-w-none prose-table:border-collapse prose-th:border prose-th:border-gray-300 prose-th:bg-gray-50 prose-th:px-3 prose-th:py-2 prose-td:border prose-td:border-gray-300 prose-td:px-3 prose-td:py-2">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ href, children }) => (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 underline"
                    >
                      {children}
                    </a>
                  ),
                  table: ({ children }) => (
                    <div className="overflow-x-auto my-4">
                      <table className="min-w-full border-collapse border border-gray-300 text-sm">
                        {children}
                      </table>
                    </div>
                  ),
                  thead: ({ children }) => <thead className="bg-gray-50">{children}</thead>,
                  th: ({ children }) => (
                    <th className="border border-gray-300 px-3 py-2 text-left font-medium text-gray-700">
                      {children}
                    </th>
                  ),
                  td: ({ children }) => (
                    <td className="border border-gray-300 px-3 py-2 text-gray-600">{children}</td>
                  ),
                }}
              >
                {analysis.memo}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>

      {!isComplete && analysis.status !== 'FAILED' && (
        <div className="bg-white rounded-lg border p-12 text-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600">Analysis in progress...</p>
          <p className="text-sm text-gray-400 mt-1">
            Current step: {STEP_LABELS[analysis.status] || analysis.status}
          </p>
        </div>
      )}
    </div>
  );
}
