import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  FTOInfringementReportSchema,
  type FTOInfringementReport,
  type ParsedProduct,
  type DiscoveredPatentsReport,
} from '../types/fto.js';
import type { AgentResult, Jurisdiction } from '../types/index.js';
import { runStructuredAgentLoop } from './agent-loop.js';
import { logger } from '../utils/logger.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { legalLookupTool } from '../tools/legal-lookup.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SYSTEM_PROMPT = readFileSync(
  resolve(__dirname, '../prompts/infringement-examiner.md'),
  'utf-8',
);

function buildUserMessage(
  product: ParsedProduct,
  patentsReport: DiscoveredPatentsReport,
  targetMarkets: Jurisdiction[],
): string {
  const featureList = product.features
    .map((f) => `- **${f.id}** (${f.type}): "${f.text}"`)
    .join('\n');

  const patentList = patentsReport.patents
    .map((p) => {
      const claims =
        p.independentClaims.length > 0
          ? p.independentClaims
              .map((c, i) => `      Claim ${i + 1}: "${c.slice(0, 1500)}"`)
              .join('\n')
          : '      (No independent claim text retrieved — assess from title/abstract only.)';
      return [
        `  **${p.id}** [${p.publicationNumber}] "${p.title}" — ${p.source}`,
        `    Markets: ${p.jurisdictions.join(', ') || 'unknown'}`,
        `    Abstract: "${(p.abstract || 'n/a').slice(0, 600)}"`,
        `    Independent claims:`,
        claims,
        `    Rationale: ${p.relevanceRationale}`,
      ].join('\n');
    })
    .join('\n\n');

  return `Assess infringement risk for the following product against each discovered patent across these markets: **${targetMarkets.join(', ')}**.

## Product Features
${product.industry ? `Industry: ${product.industry}\n` : ''}
${featureList}

## Discovered Patents
${patentList || '(none discovered)'}

## Instructions

1. For each target market, call \`lookup_legal_standard\` to retrieve the infringement / equivalence framework (use topics like "literal infringement", "doctrine of equivalents", "Festo" for US; "Article 69", "Protocol" for EU; "Actavis", "s.60", "s.125" for UK).
2. For each patent, for each market, map every product feature against every recited claim element of every independent claim. Mark literal vs equivalent matches honestly.
3. Assign per-claim risk levels and aggregate per-jurisdiction risk per patent.
4. Identify cross-market divergences and recommend actions.
5. Submit your complete report via \`submit_infringement_report\`.`;
}

export async function analyzeInfringement(
  product: ParsedProduct,
  patentsReport: DiscoveredPatentsReport,
  targetMarkets: Jurisdiction[],
): Promise<AgentResult<FTOInfringementReport>> {
  logger.info(
    {
      featureCount: product.features.length,
      patentCount: patentsReport.patents.length,
      targetMarkets,
    },
    'Infringement Examiner: starting analysis',
  );

  const registry = new ToolRegistry();
  registry.register(legalLookupTool);

  const result = await runStructuredAgentLoop<FTOInfringementReport>(
    buildUserMessage(product, patentsReport, targetMarkets),
    {
      systemPrompt: SYSTEM_PROMPT,
      tools: registry.getAll(),
      outputSchema: FTOInfringementReportSchema,
      outputToolName: 'submit_infringement_report',
      outputToolDescription:
        'Submit the complete FTO infringement report with per-patent, per-market risk assessment, divergences, and design-around opportunities.',
      maxTurns: 20,
      maxTokens: 12000,
    },
  );

  logger.info(
    {
      patentsAnalyzed: result.data.perPatentAnalyses.length,
      blockingPatents: result.data.blockingPatents.length,
      divergences: result.data.divergences.length,
      designArounds: result.data.designAroundOpportunities.length,
      turns: result.turns,
      tokensUsed: result.tokensUsed,
    },
    'Infringement Examiner: analysis complete',
  );

  return {
    data: result.data,
    reasoning: result.text,
    confidence: computeConfidence(result.data, patentsReport, targetMarkets),
    tokensUsed: result.tokensUsed,
  };
}

function computeConfidence(
  report: FTOInfringementReport,
  patentsReport: DiscoveredPatentsReport,
  targetMarkets: Jurisdiction[],
): number {
  let score = 0.3;

  // Coverage: did we analyze every patent?
  if (patentsReport.patents.length > 0) {
    const coverage = report.perPatentAnalyses.length / patentsReport.patents.length;
    score += coverage * 0.2;
  } else {
    // No patents to analyze = either nothing to clear or discovery failed.
    return 0.4;
  }

  // Each patent assessed in every market = thorough.
  const fullCoverage = report.perPatentAnalyses.every(
    (a) => a.perJurisdictionRisk.length === targetMarkets.length,
  );
  if (fullCoverage) score += 0.15;

  // Per-claim mapping is stronger than no mapping.
  const withClaimMappings = report.perPatentAnalyses.filter(
    (a) => a.claimMappings.length > 0,
  ).length;
  if (withClaimMappings >= report.perPatentAnalyses.length * 0.5) score += 0.15;

  // Divergence + design-around analysis shows depth.
  if (report.divergences.length > 0) score += 0.1;
  if (report.designAroundOpportunities.length > 0) score += 0.1;

  return Math.min(score, 1.0);
}
