import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  DiscoveredPatentsReportSchema,
  type DiscoveredPatentsReport,
  type ParsedProduct,
  type PatentToCheckInput,
} from '../types/fto.js';
import type { AgentResult, Jurisdiction } from '../types/index.js';
import { runStructuredAgentLoop } from './agent-loop.js';
import { logger } from '../utils/logger.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { usptoSearchTool } from '../tools/patent-search/uspto-search.js';
import { epoSearchTool } from '../tools/patent-search/epo-ops-search.js';
import { patentFetchTool } from '../tools/patent-search/patent-fetch.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SYSTEM_PROMPT = readFileSync(
  resolve(__dirname, '../prompts/patent-discoverer.md'),
  'utf-8',
);

function buildUserMessage(
  product: ParsedProduct,
  targetMarkets: Jurisdiction[],
  patentsToCheck: PatentToCheckInput[],
): string {
  const featureList = product.features
    .map((f) => `- **${f.id}** (${f.type}): "${f.text}"`)
    .join('\n');

  const userPatents =
    patentsToCheck.length > 0
      ? patentsToCheck
          .map(
            (p) =>
              `- ${p.publicationNumber}${p.notes ? ` — ${p.notes}` : ''}`,
          )
          .join('\n')
      : '(none — discover blockers via search)';

  return `Identify third-party patents that may pose an infringement risk for the following product across these target markets: **${targetMarkets.join(', ')}**.

## Product
${product.industry ? `Industry: ${product.industry}\n` : ''}
**Features:**
${featureList}

## Target Markets
${targetMarkets.join(', ')}

## User-Supplied Patents to Check (fetch each one first)
${userPatents}

## Instructions

1. For every user-supplied patent above, call \`fetch_patent_by_number\` and include the result in your output with \`source: "User_Provided"\`.
2. Then run targeted searches via \`search_us_patents\` and/or \`search_eu_patents\` for additional candidates that read on the most distinctive product features.
3. For each promising candidate, fetch its full record via \`fetch_patent_by_number\` so independent claim text is available for downstream mapping.
4. Submit your complete report via \`submit_discovered_patents_report\`.`;
}

export async function discoverPatents(
  product: ParsedProduct,
  targetMarkets: Jurisdiction[],
  patentsToCheck: PatentToCheckInput[],
): Promise<AgentResult<DiscoveredPatentsReport>> {
  logger.info(
    {
      featureCount: product.features.length,
      targetMarkets,
      userSupplied: patentsToCheck.length,
    },
    'Patent Discoverer: starting search',
  );

  const registry = new ToolRegistry();
  registry.register(patentFetchTool);
  if (targetMarkets.includes('US')) registry.register(usptoSearchTool);
  if (targetMarkets.includes('EU') || targetMarkets.includes('UK')) {
    registry.register(epoSearchTool);
  }

  const result = await runStructuredAgentLoop<DiscoveredPatentsReport>(
    buildUserMessage(product, targetMarkets, patentsToCheck),
    {
      systemPrompt: SYSTEM_PROMPT,
      tools: registry.getAll(),
      outputSchema: DiscoveredPatentsReportSchema,
      outputToolName: 'submit_discovered_patents_report',
      outputToolDescription:
        'Submit the complete list of discovered candidate patents (user-supplied + searched) with title, claims text, and per-patent rationale.',
      maxTurns: 30,
      maxTokens: 8192,
    },
  );

  logger.info(
    {
      totalFound: result.data.totalFound,
      sourcesSearched: result.data.sourcesSearched,
      queriesUsed: result.data.searchQueries.length,
      turns: result.turns,
      tokensUsed: result.tokensUsed,
    },
    'Patent Discoverer: search complete',
  );

  return {
    data: result.data,
    reasoning: result.text,
    confidence: computeConfidence(result.data),
    tokensUsed: result.tokensUsed,
  };
}

function computeConfidence(report: DiscoveredPatentsReport): number {
  if (report.patents.length === 0) return 0.3;
  let score = 0.4;
  if (report.patents.length >= 3) score += 0.15;
  if (report.patents.length >= 6) score += 0.1;
  if (report.sourcesSearched.length >= 2) score += 0.1;
  // Patents with full claim text are much more useful than search-only results.
  const withClaims = report.patents.filter((p) => p.independentClaims.length > 0).length;
  if (withClaims >= report.patents.length * 0.5) score += 0.15;
  if (report.searchQueries.length >= 3) score += 0.1;
  return Math.min(score, 1.0);
}
