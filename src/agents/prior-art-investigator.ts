import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  PriorArtReportSchema,
  type PriorArtReport,
  type ParsedClaim,
  type AgentResult,
} from '../types/index.js';
import { runStructuredAgentLoop } from './agent-loop.js';
import { logger } from '../utils/logger.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { usptoSearchTool } from '../tools/patent-search/uspto-search.js';
import { epoSearchTool } from '../tools/patent-search/epo-ops-search.js';
import { semanticScholarSearchTool } from '../tools/patent-search/semantic-scholar-search.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SYSTEM_PROMPT = readFileSync(
  resolve(__dirname, '../prompts/prior-art-investigator.md'),
  'utf-8',
);

function buildUserMessage(parsedClaim: ParsedClaim): string {
  const elementList = parsedClaim.elements
    .map((el) => `- **${el.id}** (${el.type}): "${el.text}"`)
    .join('\n');

  return `Find prior art for the following patent claim.

## Claim ${parsedClaim.claimNumber} (${parsedClaim.isIndependent ? 'Independent' : 'Dependent'})

**Full text:**
${parsedClaim.fullText}

## Claim Elements to Search

${elementList}

Search for prior art references that teach, disclose, or are relevant to each of these elements. Use both patent databases and academic literature.`;
}

export async function investigatePriorArt(
  parsedClaim: ParsedClaim,
): Promise<AgentResult<PriorArtReport>> {
  logger.info(
    { claimNumber: parsedClaim.claimNumber, elementCount: parsedClaim.elements.length },
    'Prior Art Investigator: starting search',
  );

  // Register search tools
  const registry = new ToolRegistry();
  registry.register(usptoSearchTool);
  registry.register(epoSearchTool);
  registry.register(semanticScholarSearchTool);

  const result = await runStructuredAgentLoop<PriorArtReport>(
    buildUserMessage(parsedClaim),
    {
      systemPrompt: SYSTEM_PROMPT,
      tools: registry.getAll(),
      outputSchema: PriorArtReportSchema,
      outputToolName: 'submit_prior_art_report',
      outputToolDescription:
        'Submit the complete prior art report with per-element coverage, references, and search metadata.',
      maxTurns: 20, // More turns needed — agent makes multiple search calls
      maxTokens: 8192,
    },
  );

  const report = result.data;

  logger.info(
    {
      totalReferences: report.totalReferencesFound,
      sourcesSearched: report.sourcesSearched,
      queriesUsed: report.searchQueries.length,
      coverageSummary: report.elementCoverages.map((ec) => ({
        element: ec.elementId,
        level: ec.coverageLevel,
        refs: ec.references.length,
      })),
      turns: result.turns,
      tokensUsed: result.tokensUsed,
    },
    'Prior Art Investigator: search complete',
  );

  return {
    data: report,
    reasoning: result.text,
    confidence: computeConfidence(report),
    tokensUsed: result.tokensUsed,
  };
}

function computeConfidence(report: PriorArtReport): number {
  if (report.elementCoverages.length === 0) return 0;

  let score = 0.3;

  // More sources searched = more thorough
  if (report.sourcesSearched.length >= 2) score += 0.15;
  if (report.sourcesSearched.length >= 3) score += 0.1;

  // Coverage levels contribute to confidence
  const coverageLevels = report.elementCoverages.map((ec) => ec.coverageLevel);
  const strongCount = coverageLevels.filter((l) => l === 'strong').length;
  const moderateCount = coverageLevels.filter((l) => l === 'moderate').length;
  const total = coverageLevels.length;

  // Higher coverage = higher confidence in the assessment
  score += (strongCount / total) * 0.25;
  score += (moderateCount / total) * 0.15;

  // Multiple queries means the agent was thorough
  if (report.searchQueries.length >= 3) score += 0.05;

  return Math.min(score, 1.0);
}
