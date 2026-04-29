'use client';

import { useState, useRef } from 'react';
import { startAnalysis, startFTOAnalysis, uploadFileAndAnalyze } from '@/lib/api';

type Mode = 'DEFENSIBILITY' | 'FTO';

export default function NewAnalysis() {
  const [mode, setMode] = useState<Mode>('DEFENSIBILITY');

  // Defensibility state
  const [claimText, setClaimText] = useState('');
  const [technicalSpec, setTechnicalSpec] = useState('');
  const [jurisdictions, setJurisdictions] = useState<string[]>(['US', 'EU', 'UK']);

  // FTO state
  const [productDescription, setProductDescription] = useState('');
  const [targetMarkets, setTargetMarkets] = useState<string[]>(['US', 'EU', 'UK']);
  const [patentsToCheckText, setPatentsToCheckText] = useState('');

  // Shared
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const fileToUpload = useRef<File | null>(null);

  const toggleMarket = (
    list: string[],
    setList: (next: string[]) => void,
    value: string,
  ) => {
    setList(list.includes(value) ? list.filter((j) => j !== value) : [...list, value]);
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

    if (ext === '.txt') {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = (e.target?.result as string) || '';
        if (mode === 'DEFENSIBILITY') setClaimText(text);
        else setProductDescription(text);
      };
      reader.readAsText(file);
    }
  };

  const handleSubmit = async () => {
    setError('');

    if (mode === 'DEFENSIBILITY') {
      if (!claimText.trim() && !fileToUpload.current) {
        setError('Please enter claim text or upload a file.');
        return;
      }
      if (jurisdictions.length === 0) {
        setError('Select at least one jurisdiction.');
        return;
      }
    } else {
      if (!productDescription.trim() && !fileToUpload.current) {
        setError('Please enter a product description or upload a file.');
        return;
      }
      if (targetMarkets.length === 0) {
        setError('Select at least one target market.');
        return;
      }
    }

    setSubmitting(true);
    try {
      let result;
      if (mode === 'DEFENSIBILITY') {
        if (fileToUpload.current && !claimText.trim()) {
          result = await uploadFileAndAnalyze(fileToUpload.current, jurisdictions);
        } else {
          result = await startAnalysis({
            claimText,
            jurisdictions,
            technicalSpec: technicalSpec || undefined,
          });
        }
      } else {
        const patentsToCheck = patentsToCheckText
          .split(/[\n,]+/)
          .map((s) => s.trim())
          .filter(Boolean)
          .map((publicationNumber) => ({ publicationNumber }));

        if (fileToUpload.current && !productDescription.trim()) {
          result = await uploadFileAndAnalyze(fileToUpload.current, targetMarkets, {
            analysisType: 'FTO',
            targetMarkets,
            patentsToCheck: patentsToCheck.map((p) => p.publicationNumber).join(','),
          });
        } else {
          result = await startFTOAnalysis({
            productDescription,
            targetMarkets,
            patentsToCheck,
          });
        }
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

  const isFTO = mode === 'FTO';

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">New Patent Analysis</h1>

      {/* Tabs */}
      <div className="bg-white rounded-t-lg border border-b-0 flex">
        {[
          { value: 'DEFENSIBILITY', label: 'Defensibility', sub: 'Is my claim valid?' },
          { value: 'FTO', label: 'Freedom to Operate', sub: 'Does my product infringe?' },
        ].map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setMode(t.value as Mode)}
            className={`flex-1 px-4 py-4 text-left transition-colors ${
              mode === t.value
                ? 'bg-blue-50 border-b-2 border-blue-600'
                : 'hover:bg-gray-50 border-b border-gray-200'
            }`}
          >
            <div className={`text-sm font-semibold ${mode === t.value ? 'text-blue-700' : 'text-gray-900'}`}>
              {t.label}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">{t.sub}</div>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-b-lg border p-6 space-y-6">
        {/* Body text input — claim or product description depending on mode */}
        {!isFTO ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Patent Claim Text
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Paste your patent claim text, including all points and sub-claims.
            </p>
            <textarea
              className="w-full h-48 px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
              placeholder="1. A camera system comprising:&#10;a first camera module having a first field of view;&#10;a second camera module having a second field of view..."
              value={claimText}
              onChange={(e) => setClaimText(e.target.value)}
            />
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Product / Process Description
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Describe the product or process you want to clear, including its key components, functions, and parameters.
            </p>
            <textarea
              className="w-full h-48 px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              placeholder="A consumer drone equipped with two cameras for stereoscopic obstacle avoidance, an ARM Cortex-M7 flight controller running a PID stabilization loop at 1 kHz, and a 3-cell LiPo battery..."
              value={productDescription}
              onChange={(e) => setProductDescription(e.target.value)}
            />
          </div>
        )}

        {/* File Upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Or Upload a File
          </label>
          <div
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
              dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
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

        {/* Markets / Jurisdictions */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {isFTO ? 'Target Markets' : 'Jurisdictions'}
          </label>
          <div className="flex gap-3">
            {['US', 'EU', 'UK'].map((jur) => {
              const list = isFTO ? targetMarkets : jurisdictions;
              const setter = isFTO ? setTargetMarkets : setJurisdictions;
              const active = list.includes(jur);
              return (
                <button
                  key={jur}
                  type="button"
                  onClick={() => toggleMarket(list, setter, jur)}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    active
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {jur === 'EU' ? 'EU/EPO' : jur}
                </button>
              );
            })}
          </div>
        </div>

        {/* Mode-specific extra inputs */}
        {!isFTO ? (
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
        ) : (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Patents to Check (optional)
            </label>
            <p className="text-xs text-gray-500 mb-2">
              One publication number per line — e.g. <code>US10123456B2</code>, <code>EP1234567A1</code>. The system will fetch each and map your product against its claims, plus discover additional candidate blockers via search.
            </p>
            <textarea
              className="w-full h-24 px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
              placeholder={'US10123456B2\nEP1234567A1'}
              value={patentsToCheckText}
              onChange={(e) => setPatentsToCheckText(e.target.value)}
            />
          </div>
        )}

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
          {submitting
            ? 'Starting Analysis...'
            : isFTO
              ? 'Run FTO Clearance Analysis'
              : 'Analyze Patent Claim'}
        </button>
      </div>
    </div>
  );
}
