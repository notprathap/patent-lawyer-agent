import { describe, it, expect } from 'vitest';
import { deconstructClaim } from '../../src/agents/claim-deconstructor.js';
import {
  CLAIM_DUAL_CAMERA,
  CLAIM_PAGERANK,
  CLAIM_MEANS_PLUS_FUNCTION,
  CLAIM_DEPENDENT,
  CLAIM_PHARMA_METHOD,
  type SampleClaim,
} from '../fixtures/sample-claims.js';

// These are integration tests that call the real Claude API.
// They require ANTHROPIC_API_KEY to be set in .env.
// Run with: npx vitest run tests/unit/claim-deconstructor.test.ts

async function assertClaimParsing(sample: SampleClaim) {
  const result = await deconstructClaim(sample.claimText);
  const claim = result.data;

  // Claim number
  expect(claim.claimNumber).toBe(sample.expectedClaimNumber);

  // Independent vs dependent
  expect(claim.isIndependent).toBe(sample.expectedIsIndependent);

  // Minimum element count
  expect(claim.elements.length).toBeGreaterThanOrEqual(sample.expectedMinElements);

  // All elements have non-empty text
  for (const element of claim.elements) {
    expect(element.text.trim().length).toBeGreaterThan(0);
    expect(element.id).toBeTruthy();
    expect(['structural', 'functional', 'method_step']).toContain(element.type);
  }

  // Means-plus-function detection
  if (sample.expectedHasMeansPlusFunction) {
    const hasMPF = claim.elements.some((e) => e.isMeansPlusFunction);
    expect(hasMPF).toBe(true);
  }

  // Full text preserved
  expect(claim.fullText.length).toBeGreaterThan(0);

  // Confidence score is reasonable
  expect(result.confidence).toBeGreaterThan(0);
  expect(result.confidence).toBeLessThanOrEqual(1);

  // Token usage tracked
  expect(result.tokensUsed.input).toBeGreaterThan(0);
  expect(result.tokensUsed.output).toBeGreaterThan(0);

  return result;
}

describe('Claim Deconstructor', () => {
  it('parses a structural hardware claim (dual camera)', async () => {
    const result = await assertClaimParsing(CLAIM_DUAL_CAMERA);

    // Should identify structural elements like camera modules and processor
    const types = result.data.elements.map((e) => e.type);
    expect(types).toContain('structural');
  }, 60000);

  it('parses a method claim (PageRank)', async () => {
    const result = await assertClaimParsing(CLAIM_PAGERANK);

    // Method claims should have method_step elements
    const types = result.data.elements.map((e) => e.type);
    expect(types).toContain('method_step');
  }, 60000);

  it('detects means-plus-function limitations', async () => {
    const result = await assertClaimParsing(CLAIM_MEANS_PLUS_FUNCTION);

    // Should have at least 2 means-plus-function elements ("means for receiving", "means for converting")
    const mpfElements = result.data.elements.filter((e) => e.isMeansPlusFunction);
    expect(mpfElements.length).toBeGreaterThanOrEqual(2);
  }, 60000);

  it('identifies dependent claims', async () => {
    const result = await assertClaimParsing(CLAIM_DEPENDENT);

    expect(result.data.isIndependent).toBe(false);
    expect(result.data.dependsOn).toBe(1);
  }, 60000);

  it('parses a pharmaceutical method claim', async () => {
    const result = await assertClaimParsing(CLAIM_PHARMA_METHOD);

    // Should have method_step elements for each step
    const types = result.data.elements.map((e) => e.type);
    expect(types).toContain('method_step');
    expect(result.data.elements.length).toBeGreaterThanOrEqual(4);
  }, 60000);
});
