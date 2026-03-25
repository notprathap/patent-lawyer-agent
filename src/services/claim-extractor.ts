import { getClaudeClient, DEFAULT_MODEL } from '../lib/claude.js';
import { logger } from '../utils/logger.js';

export interface ExtractedClaims {
  claims: string[];
  summary: string;
  isAlreadyFormalClaim: boolean;
}

/**
 * Analyze input text and either confirm it's a formal patent claim,
 * or extract key innovations and draft potential claims from a technical document.
 */
export async function extractOrDraftClaims(inputText: string): Promise<ExtractedClaims> {
  const client = getClaudeClient();

  // Truncate very long inputs to fit in context (keep first ~50K chars ≈ 12K tokens)
  const truncated = inputText.length > 50000 ? inputText.slice(0, 50000) + '\n\n[... truncated]' : inputText;

  const response = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 4096,
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: `Analyze the following text and determine if it is a formal patent claim or a technical document describing innovations.

**If it IS a formal patent claim** (starts with a claim number, uses standard patent claim language like "comprising", "wherein", etc.):
- Respond with: FORMAL_CLAIM
- Then reproduce the claim text as-is.

**If it is NOT a formal patent claim** (e.g., a technical briefing, invention disclosure, research paper, product description):
- Respond with: TECHNICAL_DOCUMENT
- Provide a one-paragraph summary of the key innovations described.
- Then draft 1-3 formal independent patent claims based on the most novel and patentable innovations described. Write them in standard patent claim format (numbered, with preamble, transitional phrase, and body elements).

Format your response EXACTLY as:

TYPE: FORMAL_CLAIM or TECHNICAL_DOCUMENT
SUMMARY: <one paragraph summary>
CLAIMS:
<claim 1 text>
---
<claim 2 text>
---
<claim 3 text>

TEXT TO ANALYZE:
${truncated}`,
      },
    ],
  });

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => ('text' in b ? (b as { text: string }).text : ''))
    .join('') || '';

  logger.info(
    {
      inputLength: inputText.length,
      truncated: inputText.length > 50000,
      outputTokens: response.usage.output_tokens,
    },
    'Claim extractor: analysis complete',
  );

  // Parse response
  const isFormal = text.includes('TYPE: FORMAL_CLAIM') || text.includes('FORMAL_CLAIM');

  if (isFormal) {
    return {
      claims: [inputText], // Use the original text as-is
      summary: 'Input is already a formal patent claim.',
      isAlreadyFormalClaim: true,
    };
  }

  // Extract summary
  const summaryMatch = text.match(/SUMMARY:\s*([\s\S]*?)(?=\nCLAIMS:|$)/i);
  const summary = summaryMatch?.[1]?.trim() || 'Technical document with potential patentable innovations.';

  // Extract claims
  const claimsSection = text.match(/CLAIMS:\s*([\s\S]*?)$/i)?.[1] || '';
  const claims = claimsSection
    .split(/\n---\n/)
    .map((c) => c.trim())
    .filter((c) => c.length > 20); // Filter out empty/tiny fragments

  if (claims.length === 0) {
    // Fallback: try to find anything that looks like a claim
    const fallbackClaims = claimsSection
      .split(/\n\d+\.\s+/)
      .map((c) => c.trim())
      .filter((c) => c.length > 50);

    if (fallbackClaims.length > 0) {
      return {
        claims: fallbackClaims.map((c, i) => `${i + 1}. ${c}`),
        summary,
        isAlreadyFormalClaim: false,
      };
    }
  }

  return {
    claims: claims.length > 0 ? claims : [`1. ${summary}`],
    summary,
    isAlreadyFormalClaim: false,
  };
}
