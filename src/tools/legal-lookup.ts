import { z } from 'zod/v4';
import { JurisdictionSchema } from '../types/index.js';
import { lookupLegalStandard } from '../services/legal-knowledge.js';
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
    'Look up patent law standards, tests, and precedents for a specific jurisdiction (US, EU, UK). Use this to retrieve the correct legal framework for your analysis — e.g., Graham/KSR for US obviousness, Problem-Solution Approach for EPO inventive step, Windsurfing/Pozzoli for UK inventive step.',
  inputSchema,
  execute: async (input) => {
    const validated = input as z.infer<typeof inputSchema>;
    const results = lookupLegalStandard(validated.jurisdiction, validated.topic);

    if (results.length === 0) {
      return `No legal standards found for jurisdiction "${validated.jurisdiction}" with topic "${validated.topic}".`;
    }

    return JSON.stringify(results, null, 2);
  },
};
