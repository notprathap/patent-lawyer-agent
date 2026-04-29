import { getClaudeClient, DEFAULT_MODEL } from '../lib/claude.js';
import { logger } from '../utils/logger.js';
import type { Jurisdiction } from '../types/index.js';
import type {
  ParsedProduct,
  DiscoveredPatentsReport,
  FTOInfringementReport,
  FTOConfidenceReport,
  PatentToCheckInput,
} from '../types/fto.js';

const FTO_SYNTHESIS_SYSTEM_PROMPT = `You are a senior patent attorney drafting a Freedom-to-Operate (FTO) Clearance Opinion Memo. Write in formal legal prose suitable for attorney review. Be precise, cite specific patents by their IDs (P1, P2, ...) and publication numbers, and ground every assertion in the data provided.

IMPORTANT:
- This is a DRAFT memo for attorney review, not a final clearance opinion.
- v1 of this system does NOT verify legal status (in-force vs lapsed/expired). The memo MUST flag this as a known limitation in the Disclaimers section.
- Include the standard disclaimer at the end.
- Use the exact section structure provided.
- Do NOT fabricate any patents, case law, or legal citations beyond what is provided in the data.

FORMATTING RULES:
- Use proper markdown tables with headers (| H1 | H2 |) and separator rows (|---|---|).
- Format every patent reference as a markdown link: [Title](URL). Every patent must be clickable.
- Use the short patent labels (P1, P2, P3, ...) provided in the data.
- Use markdown headings (##, ###) for sections.
- Use bold (**text**) for risk levels and key terms.
- Use horizontal rules (---) between major sections.`;

export interface FTOMemoInput {
  product: ParsedProduct;
  productDescriptionRaw: string;
  patentsToCheck: PatentToCheckInput[];
  discoveredPatents: DiscoveredPatentsReport;
  infringementReport: FTOInfringementReport;
  confidenceReport: FTOConfidenceReport;
  targetMarkets: Jurisdiction[];
}

export interface FTOMemoResult {
  memo: string;
  tokensUsed: { input: number; output: number };
}

export async function generateFTOMemo(input: FTOMemoInput): Promise<FTOMemoResult> {
  logger.info('FTO Memo Generator: synthesizing clearance opinion');

  const client = getClaudeClient();
  const userMessage = buildFTOMemoPrompt(input);

  const response = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 8192,
    temperature: 0,
    system: FTO_SYNTHESIS_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  const text =
    response.content
      .filter((b) => b.type === 'text')
      .map((b) => ('text' in b ? (b as { text: string }).text : ''))
      .join('\n') || '';

  logger.info(
    {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      memoLength: text.length,
    },
    'FTO Memo Generator: synthesis complete',
  );

  return {
    memo: text,
    tokensUsed: {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
    },
  };
}

function buildFTOMemoPrompt(input: FTOMemoInput): string {
  const {
    product,
    productDescriptionRaw,
    patentsToCheck,
    discoveredPatents,
    infringementReport,
    confidenceReport,
    targetMarkets,
  } = input;

  const featureRows = product.features
    .map((f) => `| ${f.id} | ${f.type} | ${f.text} |`)
    .join('\n');

  const patentRows = discoveredPatents.patents
    .map(
      (p) =>
        `| **${p.id}** | [${p.publicationNumber}](${p.url}) | ${p.title.slice(0, 80)} | ${p.source} | ${p.jurisdictions.join(', ') || '—'} | ${p.assignee || '—'} |`,
    )
    .join('\n');

  const marketScoreLines = confidenceReport.marketScores
    .map((m) => `- **${m.market}**: ${m.risk} — ${m.rationale}`)
    .join('\n');

  const perPatentDetails = infringementReport.perPatentAnalyses
    .map((a) => {
      const perMarket = a.perJurisdictionRisk
        .map((j) => `      - ${j.jurisdiction}: **${j.risk}** — ${j.reasoning}`)
        .join('\n');

      const claimMaps = a.claimMappings
        .map((cm) => {
          const elementMappings = cm.mappings
            .map(
              (m) =>
                `        - ${m.productFeatureId} ↔ "${m.claimElementText.slice(0, 100)}" — literal: ${m.literalMatch}, equivalent: ${m.equivalentMatch}. ${m.rationale}`,
            )
            .join('\n');
          return [
            `    - ${cm.jurisdiction} | Claim ${cm.claimNumber ?? '?'}: literal=${cm.literalInfringementRisk}, DOE=${cm.doctrineOfEquivalentsRisk}`,
            `      Notes: ${cm.jurisdictionalNotes}`,
            `      Element-by-element mapping:`,
            elementMappings || '        (no per-element mapping)',
          ].join('\n');
        })
        .join('\n');

      return [
        `### Patent ${a.patentId} — ${a.publicationNumber} "${a.title.slice(0, 80)}"`,
        `  Per-market risk:\n${perMarket}`,
        `  Claim mappings:\n${claimMaps || '    (no claim mappings)'}`,
        `  Recommendation: ${a.recommendation}`,
      ].join('\n');
    })
    .join('\n\n');

  const userPatentsList = patentsToCheck.length
    ? patentsToCheck
        .map((p, i) => `${i + 1}. ${p.publicationNumber}${p.notes ? ` — ${p.notes}` : ''}`)
        .join('\n')
    : '(none)';

  return `Draft a complete Freedom-to-Operate Clearance Opinion Memo using the following data. Follow the exact 9-section structure below.

## DATA

### Risk Scores (USE EXACTLY THESE — do not recompute)
Overall FTO risk (MANDATORY — use this exact level): **${confidenceReport.overallRisk}**
Per-market risk (MANDATORY):
${marketScoreLines}
Assessment confidence (MANDATORY — use exactly): ${confidenceReport.assessmentConfidence}
Confidence rationale: ${confidenceReport.confidenceRationale}

### Product Under Review
${product.industry ? `Industry: ${product.industry}\n` : ''}
Original description (verbatim, may be truncated): "${productDescriptionRaw.slice(0, 2000)}"

Atomic feature breakdown:
| ID | Type | Description |
|----|------|-------------|
${featureRows}

### User-Supplied Patents to Check
${userPatentsList}

### Patent Landscape (${discoveredPatents.totalFound} patents)
| ID | Publication # | Title | Source | Markets | Assignee |
|----|----------------|-------|--------|---------|----------|
${patentRows || '| — | — | (no patents discovered) | — | — | — |'}

Search methodology:
- Sources: ${discoveredPatents.sourcesSearched.join(', ') || '—'}
- Queries used: ${discoveredPatents.searchQueries.length}

### Per-Patent Infringement Analysis
${perPatentDetails || '(no patents analyzed)'}

### Cross-Market Divergences
${infringementReport.divergences.length > 0 ? infringementReport.divergences.map((d, i) => `${i + 1}. ${d}`).join('\n') : 'No significant cross-market divergences identified.'}

### Design-Around Opportunities
${infringementReport.designAroundOpportunities.length > 0 ? infringementReport.designAroundOpportunities.map((d, i) => `${i + 1}. ${d}`).join('\n') : 'None identified.'}

### Overall Examiner Assessment
${infringementReport.overallAssessment || '—'}

## REQUIRED MEMO STRUCTURE

Write the memo with these exact sections, using markdown:

1. **EXECUTIVE SUMMARY**
   - Product summary (1-2 sentences in plain English).
   - Overall FTO risk: **${confidenceReport.overallRisk}**.
   - Per-market risk table (one row per market): ${targetMarkets.join(', ')}.
   - Assessment confidence: ${confidenceReport.assessmentConfidence}.
   - Headline: blocking patents (if any) and primary recommended action.

2. **PRODUCT ANALYSIS**
   - Industry / domain.
   - Atomic feature table.
   - Notes on any features the system found difficult to classify.

3. **PATENT LANDSCAPE**
   - Table of all discovered patents (P1, P2, ...).
   - Brief paragraph on the search methodology and known limitations.
   - Caveat that legal status (in-force vs. lapsed) was not verified.

4. **PER-PATENT INFRINGEMENT ASSESSMENT** (one subsection per patent)
   For each patent, draft a subsection with:
   - Patent header: P# — [Publication #](URL) — Title — Assignee
   - Summary of the relevant claim(s) being asserted against the product.
   - Per-market analysis (one paragraph per target market) applying the correct test:
     * **US**: literal infringement (all-elements rule) + Doctrine of Equivalents (Graver Tank function-way-result + Warner-Jenkinson). Note Festo prosecution-history-estoppel limitation.
     * **EU**: EPC Article 69 + Protocol; note that infringement is decided by national courts (and the UPC for unitary patents).
     * **UK**: Patents Act 1977 s.60 (infringement) + s.125 (extent), plus Actavis v Eli Lilly equivalents test. Mention s.60(2) indirect infringement only if relevant.
   - Per-claim element-by-element mapping table (Feature ID ↔ Claim Element Excerpt | Literal? | Equivalent? | Rationale).
   - Per-market risk verdict and reasoning.
   - Recommendation (design-around / license / drop / verify status).

5. **CROSS-MARKET DIVERGENCES**
   - Where the same patent yields different risk levels in different target markets — explain why (different equivalence tests, family scope, national doctrine).

6. **CLEARANCE STRATEGY**
   - Prioritized action list across the patent portfolio.
   - Design-around opportunities (concrete, feature-level changes).
   - License candidates (high-risk-but-narrow patents in priority markets).
   - Verify-legal-status list (every patent flagged Medium or higher).

7. **RISK MATRIX**
   - Per-patent × per-market risk matrix table.

8. **EXHIBITS**
   - Exhibit A: Full discovered-patent list with URLs.
   - Exhibit B: Element-by-element mapping tables (one per patent × market).
   - Exhibit C: Search methodology and queries used.
   - Exhibit D: Legal frameworks applied (cite the statutes/cases by name).

9. **DISCLAIMERS**
   - Standard AI-generated draft disclaimer.
   - **EXPLICIT v1 LIMITATION**: "Legal status (in-force, lapsed, expired) of the listed patents has NOT been independently verified. The user must confirm in-force status with INPADOC, the relevant national register, or counsel before relying on any clearance conclusion."
   - **EXPLICIT v1 LIMITATION**: "US Doctrine of Equivalents analysis does NOT account for prosecution-history estoppel under Festo because prosecution-history data was not retrieved. The actual scope of equivalents may be narrower than indicated."
   - **DOE LIMITATION** (always include): Where independent claim text was not retrieved for a patent (search-only result), the assessment is based on title and abstract only and should be treated as a heuristic, not a substantive mapping.

End with: "DISCLAIMER: This analysis is generated by an AI system and must be reviewed by a licensed patent attorney before reliance. It does not constitute legal advice."`;
}
