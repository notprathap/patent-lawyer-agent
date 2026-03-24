'use client';

import { useState, useRef } from 'react';
import { startAnalysis, uploadFileAndAnalyze } from '@/lib/api';

export default function NewAnalysis() {
  const [claimText, setClaimText] = useState('');
  const [jurisdictions, setJurisdictions] = useState<string[]>(['US', 'EU', 'UK']);
  const [technicalSpec, setTechnicalSpec] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const fileToUpload = useRef<File | null>(null);

  const toggleJurisdiction = (jur: string) => {
    setJurisdictions((prev) =>
      prev.includes(jur) ? prev.filter((j) => j !== jur) : [...prev, jur],
    );
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleFile = (file: File) => {
    const validTypes = ['.txt', '.pdf', '.docx'];
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!validTypes.includes(ext)) {
      setError('Supported file types: .txt, .pdf, .docx');
      return;
    }
    setFileName(file.name);
    fileToUpload.current = file;

    // For .txt files, also read content into textarea
    if (ext === '.txt') {
      const reader = new FileReader();
      reader.onload = (e) => setClaimText(e.target?.result as string || '');
      reader.readAsText(file);
    }
  };

  const handleSubmit = async () => {
    setError('');
    if (!claimText.trim() && !fileToUpload.current) {
      setError('Please enter claim text or upload a file.');
      return;
    }
    if (jurisdictions.length === 0) {
      setError('Select at least one jurisdiction.');
      return;
    }

    setSubmitting(true);
    try {
      let result;
      if (fileToUpload.current && !claimText.trim()) {
        result = await uploadFileAndAnalyze(fileToUpload.current, jurisdictions);
      } else {
        result = await startAnalysis({
          claimText,
          jurisdictions,
          technicalSpec: technicalSpec || undefined,
        });
      }

      if (result.analysisId) {
        window.location.href = `/analysis/${result.analysisId}`;
      } else if (result.error) {
        setError(result.error);
        setSubmitting(false);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">New Patent Analysis</h1>

      <div className="bg-white rounded-lg border p-6 space-y-6">
        {/* Claim Text Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Patent Claim Text
          </label>
          <p className="text-xs text-gray-500 mb-2">
            Paste a single patent claim (e.g., Claim 1). Not the entire patent document.
          </p>
          <textarea
            className="w-full h-48 px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
            placeholder="1. A camera system comprising:&#10;a first camera module having a first field of view;&#10;a second camera module having a second field of view..."
            value={claimText}
            onChange={(e) => setClaimText(e.target.value)}
          />
        </div>

        {/* File Upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Or Upload a File
          </label>
          <div
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
              dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleFileDrop}
            onClick={() => fileRef.current?.click()}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.pdf,.docx"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            {fileName ? (
              <p className="text-sm text-gray-700">{fileName}</p>
            ) : (
              <p className="text-sm text-gray-500">
                Drag & drop a file here, or click to browse (.txt, .pdf, .docx)
              </p>
            )}
          </div>
        </div>

        {/* Jurisdictions */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Jurisdictions
          </label>
          <div className="flex gap-3">
            {['US', 'EU', 'UK'].map((jur) => (
              <button
                key={jur}
                type="button"
                onClick={() => toggleJurisdiction(jur)}
                className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  jurisdictions.includes(jur)
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {jur === 'EU' ? 'EU/EPO' : jur}
              </button>
            ))}
          </div>
        </div>

        {/* Technical Specification (optional) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Technical Specification (optional)
          </label>
          <textarea
            className="w-full h-24 px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            placeholder="Additional technical context about the invention..."
            value={technicalSpec}
            onChange={(e) => setTechnicalSpec(e.target.value)}
          />
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? 'Starting Analysis...' : 'Analyze Patent Claim'}
        </button>
      </div>
    </div>
  );
}
