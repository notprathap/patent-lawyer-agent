import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ParsedProductSchema, type ParsedProduct } from '../types/fto.js';
import type { AgentResult } from '../types/index.js';
import { runStructuredAgentLoop } from './agent-loop.js';
import { logger } from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SYSTEM_PROMPT = readFileSync(
  resolve(__dirname, '../prompts/product-deconstructor.md'),
  'utf-8',
);

export async function deconstructProduct(
  productDescription: string,
): Promise<AgentResult<ParsedProduct>> {
  logger.info('Product Deconstructor: starting analysis');

  const result = await runStructuredAgentLoop<ParsedProduct>(
    `Decompose the following product / process description into atomic features for FTO claim mapping.\n\n---\n\n${productDescription}`,
    {
      systemPrompt: SYSTEM_PROMPT,
      outputSchema: ParsedProductSchema,
      outputToolName: 'submit_parsed_product',
      outputToolDescription:
        'Submit the structured product analysis with all identified features and their classifications.',
      maxTurns: 5,
      maxTokens: 4096,
    },
  );

  logger.info(
    {
      featureCount: result.data.features.length,
      industry: result.data.industry,
      turns: result.turns,
      tokensUsed: result.tokensUsed,
    },
    'Product Deconstructor: analysis complete',
  );

  return {
    data: result.data,
    reasoning: result.text,
    confidence: computeConfidence(result.data),
    tokensUsed: result.tokensUsed,
  };
}

function computeConfidence(product: ParsedProduct): number {
  let score = 0.4;
  if (product.features.length >= 3) score += 0.2;
  if (product.features.length >= 6) score += 0.15;
  const types = new Set(product.features.map((f) => f.type));
  if (types.size >= 2) score += 0.1;
  if (types.size >= 3) score += 0.1;
  if (product.industry) score += 0.05;
  return Math.min(score, 1.0);
}
