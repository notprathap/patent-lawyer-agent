import { describe, it, expect } from 'vitest';
import { deconstructClaim } from '../../src/agents/claim-deconstructor.js';
import { investigatePriorArt } from '../../src/agents/prior-art-investigator.js';
import { CLAIM_DUAL_CAMERA } from '../fixtures/sample-claims.js';

// These are integration tests that call real APIs (Claude + patent search).
// They require ANTHROPIC_API_KEY to be set in .env.
// Run with: npx vitest run tests/unit/prior-art-investigator.test.ts

describe('Prior Art Investigator', () => {
  it('finds prior art for the dual camera claim', async () => {
    // First, parse the claim
    const claimResult = await deconstructClaim(CLAIM_DUAL_CAMERA.claimText);
    const parsedClaim = claimResult.data;

    // Then search for prior art
    const result = await investigatePriorArt(parsedClaim);
    const report = result.data;

    // Should have coverage entries for each element
    expect(report.elementCoverages.length).toBeGreaterThanOrEqual(1);

    // Should have searched at least 1 source
    expect(report.sourcesSearched.length).toBeGreaterThanOrEqual(1);

    // Should have used at least 1 search query
    expect(report.searchQueries.length).toBeGreaterThanOrEqual(1);

    // Total references should be tracked
    expect(report.totalReferencesFound).toBeGreaterThanOrEqual(0);

    // Each coverage entry should have valid structure
    for (const coverage of report.elementCoverages) {
      expect(coverage.elementId).toBeTruthy();
      expect(['strong', 'moderate', 'weak', 'none']).toContain(coverage.coverageLevel);

      // Each reference should have required fields
      for (const ref of coverage.references) {
        expect(ref.title).toBeTruthy();
        expect(ref.relevanceScore).toBeGreaterThanOrEqual(0);
        expect(ref.relevanceScore).toBeLessThanOrEqual(1);
        expect(ref.source).toBeTruthy();
        expect(ref.jurisdictions.length).toBeGreaterThanOrEqual(1);
      }
    }

    // Confidence should be reasonable
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);

    // Token usage tracked
    expect(result.tokensUsed.input).toBeGreaterThan(0);
    expect(result.tokensUsed.output).toBeGreaterThan(0);
  }, 300000); // 5 min timeout — multiple API calls with rate limit retries
});
