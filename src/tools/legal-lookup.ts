import { z } from 'zod/v4';
import { JurisdictionSchema } from '../types/index.js';
import { lookupLegalStandard } from '../services/legal-knowledge.js';
import { searchLegalKnowledge, isKnowledgeBasePopulated } from '../services/rag-retrieval.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import type { ToolDefinition } from '../agents/agent-loop.js';

const inputSchema = z.object({
  jurisdiction: JurisdictionSchema.describe('The jurisdiction to look up: US, EU, or UK'),
  topic: z
    .string()
    .optional()
    .describe(
      'The legal topic to search for (e.g., "obviousness", "novelty", "inventive step", "Graham", "Pozzoli", "Problem-Solution"). If omitted, returns all standards for the jurisdiction.',
    ),
});

export const legalLookupTool: ToolDefinition = {
  name: 'lookup_legal_standard',
  description:
    'Look up patent law standards, tests, and precedents for a specific jurisdiction (US, EU, UK). Uses semantic search over the legal knowledge base when available, with fallback to static standards. Use this to retrieve the correct legal framework for your analysis.',
  inputSchema,
  execute: async (input) => {
    const validated = input as z.infer<typeof inputSchema>;

    // Try RAG search first if DATABASE_URL and VOYAGE_API_KEY are configured
    if (env.DATABASE_URL && env.VOYAGE_API_KEY && validated.topic) {
      try {
        const populated = await isKnowledgeBasePopulated();
        if (populated) {
          const ragResults = await searchLegalKnowledge(validated.topic, {
            jurisdiction: validated.jurisdiction,
            topK: 5,
          });

          if (ragResults.length > 0) {
            logger.debug(
              { jurisdiction: validated.jurisdiction, topic: validated.topic, results: ragResults.length },
              'Legal lookup: using RAG results',
            );

            const formatted = ragResults.map((r) => ({
              jurisdiction: r.jurisdiction,
              source: r.source,
              title: r.title,
              content: r.content,
              similarity: Math.round(r.similarity * 100) / 100,
              url: r.sourceUrl,
            }));

            return JSON.stringify(formatted, null, 2);
          }
        }
      } catch (err) {
        logger.debug({ error: err }, 'Legal lookup: RAG search failed, falling back to static');
      }
    }

    // Fallback to static knowledge base
    const results = lookupLegalStandard(validated.jurisdiction, validated.topic);

    if (results.length === 0) {
      return `No legal standards found for jurisdiction "${validated.jurisdiction}" with topic "${validated.topic}".`;
    }

    return JSON.stringify(results, null, 2);
  },
};
