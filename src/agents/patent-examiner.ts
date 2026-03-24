import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  MultiJurisdictionAnalysisSchema,
  type MultiJurisdictionAnalysis,
  type ParsedClaim,
  type PriorArtReport,
  type Jurisdiction,
  type AgentResult,
} from '../types/index.js';
import { runStructuredAgentLoop } from './agent-loop.js';
import { logger } from '../utils/logger.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { legalLookupTool } from '../tools/legal-lookup.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SYSTEM_PROMPT = readFileSync(
  resolve(__dirname, '../prompts/patent-examiner.md'),
  'utf-8',
);

function buildUserMessage(
  parsedClaim: ParsedClaim,
  priorArtReport: PriorArtReport,
  jurisdictions: Jurisdiction[],
): string {
  // Format claim elements
  const elementList = parsedClaim.elements
    .map((el) => `- **${el.id}** (${el.type}): "${el.text}"`)
    .join('\n');

  // Format prior art references with coverage
  const coverageList = priorArtReport.elementCoverages
    .map((ec) => {
      const refs = ec.references
        .map(
          (ref) =>
            `    - [${ref.id}] "${ref.title}" (${ref.source}, score: ${ref.relevanceScore})` +
            (ref.publicationNumber ? ` — ${ref.publicationNumber}` : '') +
            `\n      Excerpt: "${ref.relevantExcerpt}"`,
        )
        .join('\n');
      return `  **${ec.elementId}** — Coverage: ${ec.coverageLevel}\n${refs || '    (no references found)'}`;
    })
    .join('\n\n');

  return `Construct invalidity arguments for the following patent claim across these jurisdictions: **${jurisdictions.join(', ')}**.

## Claim ${parsedClaim.claimNumber} (${parsedClaim.isIndependent ? 'Independent' : 'Dependent'})

**Full text:**
${parsedClaim.fullText}

## Claim Elements

${elementList}

## Prior Art Report

${coverageList}

## Instructions

1. Use the \`lookup_legal_standard\` tool to retrieve the legal framework for each jurisdiction.
2. Construct the strongest possible invalidity arguments using ONLY the prior art references listed above.
3. Apply the correct test for each jurisdiction (Graham/KSR for US, Problem-Solution for EU, Pozzoli for UK).
4. Identify divergences where outcomes differ across jurisdictions.
5. Submit your complete analysis using the \`submit_invalidity_analysis\` tool.`;
}

export async function examinePatent(
  parsedClaim: ParsedClaim,
  priorArtReport: PriorArtReport,
  jurisdictions: Jurisdiction[],
): Promise<AgentResult<MultiJurisdictionAnalysis>> {
  logger.info(
    {
      claimNumber: parsedClaim.claimNumber,
      jurisdictions,
      totalReferences: priorArtReport.totalReferencesFound,
    },
    'Patent Examiner: starting analysis',
  );

  const registry = new ToolRegistry();
  registry.register(legalLookupTool);

  const result = await runStructuredAgentLoop<MultiJurisdictionAnalysis>(
    buildUserMessage(parsedClaim, priorArtReport, jurisdictions),
    {
      systemPrompt: SYSTEM_PROMPT,
      tools: registry.getAll(),
      outputSchema: MultiJurisdictionAnalysisSchema,
      outputToolName: 'submit_invalidity_analysis',
      outputToolDescription:
        'Submit the complete multi-jurisdiction invalidity analysis with per-jurisdiction arguments, strength ratings, and divergences.',
      maxTurns: 15,
      maxTokens: 8192,
    },
  );

  const analysis = result.data;

  logger.info(
    {
      hasUS: !!analysis.us,
      hasEPO: !!analysis.epo,
      hasUK: !!analysis.uk,
      usStrength: analysis.us?.overallStrength,
      epoStrength: analysis.epo?.overallStrength,
      ukStrength: analysis.uk?.overallStrength,
      divergences: analysis.divergences.length,
      turns: result.turns,
      tokensUsed: result.tokensUsed,
    },
    'Patent Examiner: analysis complete',
  );

  return {
    data: analysis,
    reasoning: result.text,
    confidence: computeConfidence(analysis, jurisdictions),
    tokensUsed: result.tokensUsed,
  };
}

function computeConfidence(
  analysis: MultiJurisdictionAnalysis,
  requestedJurisdictions: Jurisdiction[],
): number {
  let score = 0.3;

  // Each jurisdiction analyzed adds confidence
  const analyzed: number[] = [];
  if (analysis.us && requestedJurisdictions.includes('US')) analyzed.push(1);
  if (analysis.epo && requestedJurisdictions.includes('EU')) analyzed.push(1);
  if (analysis.uk && requestedJurisdictions.includes('UK')) analyzed.push(1);

  const coverage = analyzed.length / requestedJurisdictions.length;
  score += coverage * 0.3;

  // Arguments constructed add confidence
  const usArgCount =
    (analysis.us?.anticipationArgs.length ?? 0) + (analysis.us?.obviousnessArgs.length ?? 0);
  const epoArgCount =
    (analysis.epo?.noveltyArgs.length ?? 0) + (analysis.epo?.inventiveStepArgs.length ?? 0);
  const ukArgCount =
    (analysis.uk?.noveltyArgs.length ?? 0) + (analysis.uk?.inventiveStepArgs.length ?? 0);
  const totalArgs = usArgCount + epoArgCount + ukArgCount;

  if (totalArgs >= 3) score += 0.15;
  if (totalArgs >= 6) score += 0.1;

  // Divergence analysis shows thoroughness
  if (analysis.divergences.length > 0) score += 0.1;

  // Overall assessment present
  if (analysis.overallAssessment) score += 0.05;

  return Math.min(score, 1.0);
}
