import { describe, it, expect } from 'vitest';
import { deconstructClaim } from '../../src/agents/claim-deconstructor.js';
import { investigatePriorArt } from '../../src/agents/prior-art-investigator.js';
import { examinePatent } from '../../src/agents/patent-examiner.js';
import { CLAIM_DUAL_CAMERA } from '../fixtures/sample-claims.js';

// End-to-end integration test: Claim → Prior Art → Examiner
// Requires ANTHROPIC_API_KEY in .env.
// Run with: npx vitest run tests/unit/patent-examiner.test.ts

describe('Patent Examiner', () => {
  it('produces multi-jurisdiction invalidity analysis for dual camera claim', async () => {
    // Step 1: Parse the claim
    const claimResult = await deconstructClaim(CLAIM_DUAL_CAMERA.claimText);
    const parsedClaim = claimResult.data;

    // Step 2: Find prior art
    const priorArtResult = await investigatePriorArt(parsedClaim);
    const priorArtReport = priorArtResult.data;

    // Step 3: Run the Patent Examiner across all 3 jurisdictions
    const result = await examinePatent(parsedClaim, priorArtReport, ['US', 'EU', 'UK']);
    const analysis = result.data;

    // Should have analysis for all 3 jurisdictions
    expect(analysis.us).toBeDefined();
    expect(analysis.epo).toBeDefined();
    expect(analysis.uk).toBeDefined();

    // US analysis structure
    if (analysis.us) {
      expect(['strong', 'moderate', 'weak']).toContain(analysis.us.overallStrength);
      expect(analysis.us.summary).toBeTruthy();
      expect(analysis.us.strongestElements).toBeDefined();
      expect(analysis.us.weakestElements).toBeDefined();
    }

    // EPO analysis structure
    if (analysis.epo) {
      expect(['strong', 'moderate', 'weak']).toContain(analysis.epo.overallStrength);
      expect(analysis.epo.summary).toBeTruthy();

      // Problem-Solution Approach should be applied if inventive step args exist
      for (const arg of analysis.epo.inventiveStepArgs) {
        expect(arg.closestPriorArt).toBeDefined();
        expect(arg.objectiveTechnicalProblem).toBeTruthy();
        expect(arg.couldWouldAnalysis).toBeTruthy();
      }
    }

    // UK analysis structure
    if (analysis.uk) {
      expect(['strong', 'moderate', 'weak']).toContain(analysis.uk.overallStrength);
      expect(analysis.uk.summary).toBeTruthy();

      // Pozzoli test should be applied if inventive step args exist
      for (const arg of analysis.uk.inventiveStepArgs) {
        expect(arg.skilledPersonAndCGK).toBeTruthy();
        expect(arg.inventiveConcept).toBeTruthy();
        expect(arg.differencesFromPriorArt).toBeTruthy();
        expect(arg.obviousnessAssessment).toBeTruthy();
      }
    }

    // Divergences should be identified
    expect(analysis.divergences).toBeDefined();

    // Overall assessment
    expect(analysis.overallAssessment).toBeTruthy();

    // Confidence and token tracking
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.tokensUsed.input).toBeGreaterThan(0);
    expect(result.tokensUsed.output).toBeGreaterThan(0);
  }, 600000); // 10 min — full pipeline: claim parse + prior art search + examiner analysis
});
