import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ParsedClaimSchema, type ParsedClaim, type AgentResult } from '../types/index.js';
import { runStructuredAgentLoop } from './agent-loop.js';
import { logger } from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SYSTEM_PROMPT = readFileSync(
  resolve(__dirname, '../prompts/claim-deconstructor.md'),
  'utf-8',
);

export async function deconstructClaim(claimText: string): Promise<AgentResult<ParsedClaim>> {
  logger.info('Claim Deconstructor: starting analysis');

  const result = await runStructuredAgentLoop<ParsedClaim>(
    `Analyze the following patent claim and break it down into its constituent elements.\n\n---\n\n${claimText}`,
    {
      systemPrompt: SYSTEM_PROMPT,
      outputSchema: ParsedClaimSchema,
      outputToolName: 'submit_claim_analysis',
      outputToolDescription:
        'Submit the structured claim analysis with all identified elements, classifications, and means-plus-function flags.',
      maxTurns: 5,
      maxTokens: 4096,
    },
  );

  logger.info(
    {
      elementCount: result.data.elements.length,
      isIndependent: result.data.isIndependent,
      claimNumber: result.data.claimNumber,
      turns: result.turns,
      tokensUsed: result.tokensUsed,
    },
    'Claim Deconstructor: analysis complete',
  );

  return {
    data: result.data,
    reasoning: result.text,
    confidence: computeConfidence(result.data),
    tokensUsed: result.tokensUsed,
  };
}

function computeConfidence(claim: ParsedClaim): number {
  let score = 0.5;

  // More elements parsed = more thorough analysis
  if (claim.elements.length >= 3) score += 0.15;
  if (claim.elements.length >= 5) score += 0.1;

  // Having a preamble and transition phrase means good structural parsing
  if (claim.preamble) score += 0.1;
  if (claim.transitionPhrase) score += 0.1;

  // Every element has a non-empty text
  const allElementsHaveText = claim.elements.every((e) => e.text.trim().length > 0);
  if (allElementsHaveText) score += 0.05;

  return Math.min(score, 1.0);
}
