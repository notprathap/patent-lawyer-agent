import { getClaudeClient, DEFAULT_MODEL } from '../lib/claude.js';
import { logger } from '../utils/logger.js';
import type {
  ParsedClaim,
  PriorArtReport,
  MultiJurisdictionAnalysis,
  Jurisdiction,
} from '../types/index.js';
import type { ConfidenceReport } from './confidence-scorer.js';

const SYNTHESIS_SYSTEM_PROMPT = `You are a senior patent attorney drafting a Defensibility Opinion Memo. Write in formal legal prose suitable for attorney review. Be precise, cite specific references by their IDs and titles, and ground every assertion in the data provided.

IMPORTANT:
- This is a DRAFT memo for attorney review, not a final legal opinion.
- Include the disclaimer at the end.
- Use the exact section structure provided.
- Do NOT fabricate any references, case law, or legal citations beyond what is provided in the data.

FORMATTING RULES:
- Use proper markdown tables with headers (| Header1 | Header2 |) and separator rows (|---|---|).
- Format all prior art references as markdown links: [Title](URL) — every reference must be clickable.
- Use markdown headings (##, ###) for sections.
- Use bold (**text**) for key terms and ratings.
- Use bullet lists for enumerations.`;

export interface MemoInput {
  parsedClaim: ParsedClaim;
  priorArtReport: PriorArtReport;
  analysis: MultiJurisdictionAnalysis;
  confidenceReport: ConfidenceReport;
  jurisdictions: Jurisdiction[];
}

export interface MemoResult {
  memo: string;
  tokensUsed: { input: number; output: number };
}

export async function generateMemo(input: MemoInput): Promise<MemoResult> {
  logger.info('Memo Generator: synthesizing opinion memo');

  const client = getClaudeClient();
  const userMessage = buildMemoPrompt(input);

  const response = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 8192,
    temperature: 0,
    system: SYNTHESIS_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  const text =
    response.content
      .filter((b) => b.type === 'text')
      .map((b) => 'text' in b ? (b as { text: string }).text : '')
      .join('\n') || '';

  logger.info(
    {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      memoLength: text.length,
    },
    'Memo Generator: synthesis complete',
  );

  return {
    memo: text,
    tokensUsed: {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
    },
  };
}

function buildMemoPrompt(input: MemoInput): string {
  const { parsedClaim, priorArtReport, analysis, confidenceReport, jurisdictions } = input;

  // Format jurisdiction scores
  const jurScores = confidenceReport.jurisdictionScores
    .map((s) => `- ${s.jurisdiction}: ${s.defensibility}`)
    .join('\n');

  // Format element breakdown
  const elements = parsedClaim.elements
    .map((e) => `| ${e.id} | ${e.type} | ${e.text} | ${e.isMeansPlusFunction ? 'Yes' : 'No'} |`)
    .join('\n');

  // Format prior art references
  const allRefs = priorArtReport.elementCoverages
    .flatMap((ec) => ec.references)
    .filter((ref, idx, arr) => arr.findIndex((r) => r.id === ref.id) === idx);

  const refList = allRefs
    .map(
      (r) =>
        `- [${r.id}] "${r.title}" (${r.source}${r.publicationNumber ? `, ${r.publicationNumber}` : ''})` +
        `${r.date ? ` — ${r.date}` : ''}` +
        `\n  URL: ${r.url}` +
        `\n  Jurisdictions: ${r.jurisdictions.join(', ')}`,
    )
    .join('\n');

  // Format coverage matrix
  const coverageMatrix = priorArtReport.elementCoverages
    .map((ec) => {
      const refs = ec.references.map((r) => `[${r.id}] (${r.relevanceScore})`).join(', ');
      return `| ${ec.elementId} | ${ec.coverageLevel} | ${refs || 'none'} |`;
    })
    .join('\n');

  // Format US analysis summary
  const usSection = analysis.us
    ? `US Invalidity Strength: ${analysis.us.overallStrength}
Anticipation Arguments: ${analysis.us.anticipationArgs.length}
Obviousness Arguments: ${analysis.us.obviousnessArgs.length}
Strongest Elements: ${analysis.us.strongestElements.join(', ') || 'none identified'}
Weakest Elements: ${analysis.us.weakestElements.join(', ') || 'none identified'}
Summary: ${analysis.us.summary}

${formatUSDetails(analysis)}`
    : 'Not analyzed.';

  // Format EPO analysis summary
  const epoSection = analysis.epo
    ? `EPO Invalidity Strength: ${analysis.epo.overallStrength}
Novelty Arguments: ${analysis.epo.noveltyArgs.length}
Inventive Step Arguments: ${analysis.epo.inventiveStepArgs.length}
Strongest Elements: ${analysis.epo.strongestElements.join(', ') || 'none identified'}
Weakest Elements: ${analysis.epo.weakestElements.join(', ') || 'none identified'}
Summary: ${analysis.epo.summary}

${formatEPODetails(analysis)}`
    : 'Not analyzed.';

  // Format UK analysis summary
  const ukSection = analysis.uk
    ? `UK Invalidity Strength: ${analysis.uk.overallStrength}
Novelty Arguments: ${analysis.uk.noveltyArgs.length}
Inventive Step Arguments: ${analysis.uk.inventiveStepArgs.length}
Strongest Elements: ${analysis.uk.strongestElements.join(', ') || 'none identified'}
Weakest Elements: ${analysis.uk.weakestElements.join(', ') || 'none identified'}
Summary: ${analysis.uk.summary}

${formatUKDetails(analysis)}`
    : 'Not analyzed.';

  // Format divergences
  const divergences = analysis.divergences.length > 0
    ? analysis.divergences.map((d, i) => `${i + 1}. ${d}`).join('\n')
    : 'No significant divergences identified.';

  return `Draft a complete Patent Defensibility Opinion Memo using the following data. Follow the exact 10-section structure below.

## DATA

### Confidence Scores (USE EXACTLY THESE — do not recompute)
Per-Jurisdiction Defensibility (MANDATORY — use these exact ratings in the Executive Summary):
${jurScores}
Assessment Confidence (MANDATORY — use this exact level): ${confidenceReport.assessmentConfidence}
Confidence Rationale: ${confidenceReport.confidenceRationale}

IMPORTANT: The defensibility ratings and confidence level above are pre-computed by the scoring engine. You MUST use these exact values in the memo. Do NOT override them with your own assessment.

### Claim ${parsedClaim.claimNumber} (${parsedClaim.isIndependent ? 'Independent' : 'Dependent'})
Full Text: ${parsedClaim.fullText}
${parsedClaim.preamble ? `Preamble: ${parsedClaim.preamble}` : ''}
${parsedClaim.transitionPhrase ? `Transition: ${parsedClaim.transitionPhrase}` : ''}

Element Breakdown:
| ID | Type | Text | Means+Function |
|----|------|------|----------------|
${elements}

### Prior Art References
${refList || '(none found)'}

### Element-to-Reference Coverage Matrix
| Element | Coverage | References |
|---------|----------|------------|
${coverageMatrix}

### US Analysis
${usSection}

### EU/EPO Analysis
${epoSection}

### UK Analysis
${ukSection}

### Cross-Jurisdictional Divergences
${divergences}

### Overall Assessment
${analysis.overallAssessment}

## REQUIRED MEMO STRUCTURE

Write the memo with these exact sections:

1. EXECUTIVE SUMMARY — Claim summary, per-jurisdiction defensibility ratings (${jurisdictions.join('/')}), confidence level, key risk areas and divergences.

2. CLAIM ANALYSIS — Full claim text, element breakdown table, classification notes.

3. PRIOR ART LANDSCAPE — For each element: closest references, relevance scores, coverage assessment.

4. US ANALYSIS — 4a. Anticipation (§ 102), 4b. Obviousness (§ 103) with Graham factors and KSR rationales.

5. EU/EPO ANALYSIS — 5a. Novelty (Art. 54), 5b. Inventive Step via Problem-Solution Approach (Art. 56).

6. UK ANALYSIS — 6a. Novelty (s.2), 6b. Inventive Step via Windsurfing/Pozzoli (s.3).

7. CROSS-JURISDICTIONAL COMPARISON — Side-by-side, divergences, strategic implications.

8. DEFENSIBILITY ASSESSMENT — Per-element strength by jurisdiction, overall opinion, strongest differentiators, vulnerable elements.

9. RECOMMENDATIONS — Claim amendments, filing strategy, prosecution considerations per jurisdiction.

10. EXHIBITS — A: Full reference list, B: Element-to-reference matrix, C: Search methodology, D: Legal frameworks applied.

End with: "DISCLAIMER: This analysis is generated by an AI system and must be reviewed by a licensed patent attorney before reliance. It does not constitute legal advice."`;
}

function formatUSDetails(analysis: MultiJurisdictionAnalysis): string {
  if (!analysis.us) return '';
  const parts: string[] = [];

  for (const arg of analysis.us.obviousnessArgs) {
    parts.push(`Obviousness argument (${arg.strength}):
  References: ${arg.referenceTitles.join(' + ')}
  Motivation to combine: ${arg.motivationToCombine}
  Graham factors:
    Scope/Content: ${arg.grahamFactors.scopeAndContent}
    Differences: ${arg.grahamFactors.differenceFromPriorArt}
    Skill Level: ${arg.grahamFactors.levelOfOrdinarySkill}
    ${arg.grahamFactors.secondaryConsiderations ? `Secondary: ${arg.grahamFactors.secondaryConsiderations}` : ''}
  ${arg.ksrRationale ? `KSR rationale: ${arg.ksrRationale}` : ''}`);
  }

  return parts.join('\n\n');
}

function formatEPODetails(analysis: MultiJurisdictionAnalysis): string {
  if (!analysis.epo) return '';
  const parts: string[] = [];

  for (const arg of analysis.epo.inventiveStepArgs) {
    parts.push(`Problem-Solution Approach (${arg.strength}):
  Closest prior art: [${arg.closestPriorArt.referenceId}] "${arg.closestPriorArt.referenceTitle}"
  Justification: ${arg.closestPriorArt.justification}
  Objective technical problem: ${arg.objectiveTechnicalProblem}
  Could-would analysis: ${arg.couldWouldAnalysis}
  Conclusion: ${arg.conclusion}`);
  }

  return parts.join('\n\n');
}

function formatUKDetails(analysis: MultiJurisdictionAnalysis): string {
  if (!analysis.uk) return '';
  const parts: string[] = [];

  for (const arg of analysis.uk.inventiveStepArgs) {
    parts.push(`Pozzoli Test (${arg.strength}):
  Step 1 — Skilled person & CGK: ${arg.skilledPersonAndCGK}
  Step 2 — Inventive concept: ${arg.inventiveConcept}
  Step 3 — Differences: ${arg.differencesFromPriorArt}
  Step 4 — Obviousness: ${arg.obviousnessAssessment}
  Conclusion: ${arg.conclusion}`);
  }

  return parts.join('\n\n');
}
