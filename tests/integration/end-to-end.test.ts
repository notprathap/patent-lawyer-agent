import { describe, it, expect } from 'vitest';
import { runAnalysis } from '../../src/orchestrator/lead-counsel.js';
import { CLAIM_DUAL_CAMERA } from '../fixtures/sample-claims.js';

// Full end-to-end integration test: claim text → complete defensibility memo.
// Requires ANTHROPIC_API_KEY in .env.
// Run with: npx vitest run tests/integration/end-to-end.test.ts

describe('End-to-End Pipeline', () => {
  it('produces a complete defensibility memo for the dual camera claim', async () => {
    const result = await runAnalysis(
      CLAIM_DUAL_CAMERA.claimText,
      ['US', 'EU', 'UK'],
    );

    // Session completed
    expect(result.session.step).toBe('complete');
    expect(result.session.completedAt).toBeDefined();

    // All intermediate results populated
    expect(result.session.parsedClaim).toBeDefined();
    expect(result.session.priorArtReport).toBeDefined();
    expect(result.session.examinerAnalysis).toBeDefined();

    // Memo generated
    expect(result.memo).toBeTruthy();
    expect(result.memo.length).toBeGreaterThan(500);

    // Memo contains key sections
    expect(result.memo).toContain('EXECUTIVE SUMMARY');
    expect(result.memo).toContain('DISCLAIMER');

    // Confidence report
    expect(result.confidenceReport.jurisdictionScores.length).toBe(3);
    for (const score of result.confidenceReport.jurisdictionScores) {
      expect(['US', 'EU', 'UK']).toContain(score.jurisdiction);
      expect(['Strong', 'Moderate', 'Weak']).toContain(score.defensibility);
      expect(score.rationale).toBeTruthy();
    }
    expect(['High', 'Medium', 'Low']).toContain(
      result.confidenceReport.assessmentConfidence,
    );

    // Token usage tracked across all agents
    expect(result.session.totalTokensUsed.input).toBeGreaterThan(0);
    expect(result.session.totalTokensUsed.output).toBeGreaterThan(0);
  }, 600000); // 10 min timeout for full pipeline
});
