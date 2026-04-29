import { getClaudeClient, DEFAULT_MODEL } from '../lib/claude.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';
import { deconstructProduct } from '../agents/product-deconstructor.js';
import { discoverPatents } from '../agents/patent-discoverer.js';
import { analyzeInfringement } from '../agents/infringement-examiner.js';
import { computeFTOConfidenceReport } from '../services/fto-confidence-scorer.js';
import { generateFTOMemo } from '../services/fto-memo-generator.js';
import {
  createFTOSession,
  addTokenUsage,
  type FTOSession,
} from './session-fto.js';
import {
  updateAnalysisStatus,
  createFTOAnalysisRecord,
  persistFTOParsedProduct,
  persistFTODiscoveredPatents,
  persistFTOInfringementReport,
  persistFTOFinalResults,
  persistFailure,
} from '../db/repositories/analysis.repo.js';
import type { Jurisdiction } from '../types/index.js';
import type {
  FTOConfidenceReport,
  PatentToCheckInput,
} from '../types/fto.js';

export interface FTOAnalysisResult {
  session: FTOSession;
  memo: string;
  confidenceReport: FTOConfidenceReport;
  analysisId?: string;
}

/**
 * Lead Counsel — FTO Orchestrator.
 *
 * Steps:
 * 1. VALIDATING                — basic input check
 * 2. DECONSTRUCTING_PRODUCT    — split product into atomic features
 * 3. DISCOVERING_PATENTS       — fetch user-supplied patents + search blockers
 * 4. ANALYZING_INFRINGEMENT    — per-patent, per-market infringement assessment
 * 5. REFLECTING                — sanity-check coverage and divergences
 * 6. SYNTHESIZING              — clearance opinion memo
 */
export async function runFTOAnalysis(
  productDescription: string,
  targetMarkets: Jurisdiction[] = ['US', 'EU', 'UK'],
  patentsToCheck: PatentToCheckInput[] = [],
  preCreatedAnalysisId?: string,
): Promise<FTOAnalysisResult> {
  const session = createFTOSession(productDescription, targetMarkets, patentsToCheck);
  const persist = !!env.DATABASE_URL;
  let analysisId: string | undefined = preCreatedAnalysisId;

  logger.info(
    {
      sessionId: session.id,
      targetMarkets,
      patentsToCheckCount: patentsToCheck.length,
      persist,
      analysisId,
    },
    'Lead Counsel (FTO): starting freedom-to-operate analysis',
  );

  try {
    // Mirror the defensibility flow: create a DB record on demand if the caller
    // did not pre-create one. This keeps the orchestrator usable from CLI / tests.
    if (persist && !analysisId) {
      analysisId = await createFTOAnalysisRecord(productDescription, targetMarkets, patentsToCheck);
    }

    session.step = 'validating';
    if (persist && analysisId) await updateAnalysisStatus(analysisId, 'VALIDATING');
    if (!productDescription.trim()) {
      throw new Error('Product description is empty.');
    }

    // Step 2 — Deconstruct product
    session.step = 'deconstructing_product';
    if (persist && analysisId) {
      await updateAnalysisStatus(analysisId, 'DECONSTRUCTING_PRODUCT');
    }
    logger.info({ sessionId: session.id }, 'Lead Counsel (FTO): Step 2 — deconstructing product');
    const productResult = await deconstructProduct(session.productDescription);
    session.parsedProduct = productResult.data;
    addTokenUsage(session, productResult.tokensUsed);
    logger.info(
      { sessionId: session.id, features: session.parsedProduct.features.length },
      'Lead Counsel (FTO): product deconstructed',
    );
    if (persist && analysisId) await persistFTOParsedProduct(analysisId, session);

    // Step 3 — Discover patents
    session.step = 'discovering_patents';
    if (persist && analysisId) await updateAnalysisStatus(analysisId, 'DISCOVERING_PATENTS');
    logger.info({ sessionId: session.id }, 'Lead Counsel (FTO): Step 3 — discovering patents');
    const discoveryResult = await discoverPatents(
      session.parsedProduct,
      session.targetMarkets,
      session.patentsToCheck,
    );
    session.discoveredPatents = discoveryResult.data;
    addTokenUsage(session, discoveryResult.tokensUsed);
    logger.info(
      {
        sessionId: session.id,
        patentsFound: session.discoveredPatents.totalFound,
        sourcesSearched: session.discoveredPatents.sourcesSearched,
      },
      'Lead Counsel (FTO): patent discovery complete',
    );

    if (session.discoveredPatents.patents.length === 0) {
      session.issues.push(
        'WARNING: No patents discovered or supplied for FTO analysis. The clearance opinion will be sparse and should be treated as a starting point only.',
      );
    }

    if (persist && analysisId) await persistFTODiscoveredPatents(analysisId, session);

    // Step 4 — Infringement analysis
    session.step = 'analyzing_infringement';
    if (persist && analysisId) {
      await updateAnalysisStatus(analysisId, 'ANALYZING_INFRINGEMENT');
    }
    logger.info(
      { sessionId: session.id, targetMarkets },
      'Lead Counsel (FTO): Step 4 — analyzing infringement',
    );
    const infringementResult = await analyzeInfringement(
      session.parsedProduct,
      session.discoveredPatents,
      session.targetMarkets,
    );
    session.infringementReport = infringementResult.data;
    addTokenUsage(session, infringementResult.tokensUsed);
    logger.info(
      {
        sessionId: session.id,
        patentsAnalyzed: session.infringementReport.perPatentAnalyses.length,
        blockingPatents: session.infringementReport.blockingPatents.length,
        divergences: session.infringementReport.divergences.length,
      },
      'Lead Counsel (FTO): infringement analysis complete',
    );
    if (persist && analysisId) await persistFTOInfringementReport(analysisId, session);

    // Step 5 — Reflect
    session.step = 'reflecting';
    if (persist && analysisId) await updateAnalysisStatus(analysisId, 'REFLECTING');
    const reflectionNotes = await reflectFTO(session);
    session.reflectionNotes = reflectionNotes;
    if (reflectionNotes.includes('CRITICAL GAP')) {
      session.issues.push(`Reflection flagged critical gaps: ${reflectionNotes}`);
    }

    // Step 6 — Confidence + memo
    const confidenceReport = computeFTOConfidenceReport(
      session.discoveredPatents,
      session.infringementReport,
      session.targetMarkets,
    );

    session.step = 'synthesizing';
    if (persist && analysisId) await updateAnalysisStatus(analysisId, 'SYNTHESIZING');
    logger.info({ sessionId: session.id }, 'Lead Counsel (FTO): Step 6 — synthesizing memo');
    const memoResult = await generateFTOMemo({
      product: session.parsedProduct,
      productDescriptionRaw: session.productDescription,
      patentsToCheck: session.patentsToCheck,
      discoveredPatents: session.discoveredPatents,
      infringementReport: session.infringementReport,
      confidenceReport,
      targetMarkets: session.targetMarkets,
    });
    session.memo = memoResult.memo;
    addTokenUsage(session, memoResult.tokensUsed);

    session.step = 'complete';
    session.completedAt = new Date();
    const durationMs = session.completedAt.getTime() - session.startedAt.getTime();
    logger.info(
      {
        sessionId: session.id,
        durationMs,
        durationMin: (durationMs / 60000).toFixed(1),
        totalInputTokens: session.totalTokensUsed.input,
        totalOutputTokens: session.totalTokensUsed.output,
        memoLength: session.memo.length,
      },
      'Lead Counsel (FTO): analysis complete',
    );

    if (persist && analysisId) {
      await persistFTOFinalResults(analysisId, session, confidenceReport);
    }

    return {
      session,
      memo: session.memo,
      confidenceReport,
      analysisId,
    };
  } catch (error) {
    session.step = 'failed';
    const errorMessage = error instanceof Error ? error.message : String(error);
    session.issues.push(`Fatal error: ${errorMessage}`);
    if (persist && analysisId) {
      await persistFailure(analysisId, errorMessage).catch(() => {});
    }
    logger.error(
      { sessionId: session.id, error: errorMessage },
      'Lead Counsel (FTO): analysis failed',
    );
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Reflection — checks whether the FTO assessment has obvious holes.
// ---------------------------------------------------------------------------

async function reflectFTO(session: FTOSession): Promise<string> {
  const client = getClaudeClient();

  const patentSummary = session
    .discoveredPatents!.patents.map(
      (p) =>
        `${p.id}: ${p.publicationNumber} (${p.independentClaims.length} indep claims, source=${p.source})`,
    )
    .join(', ');

  const riskSummary = session
    .infringementReport!.perPatentAnalyses.map(
      (a) =>
        `${a.patentId}: ${a.perJurisdictionRisk.map((j) => `${j.jurisdiction}=${j.risk}`).join(',')}`,
    )
    .join('; ');

  const response = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 1024,
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: `Review the following FTO analysis for gaps or inconsistencies. Flag CRITICAL GAPs that warrant rerunning a step.

Target markets: ${session.targetMarkets.join(', ')}
Product features: ${session.parsedProduct!.features.length}
Discovered patents: ${session.discoveredPatents!.totalFound} (${patentSummary || 'none'})
Per-patent risk: ${riskSummary || 'none'}
Divergences identified: ${session.infringementReport!.divergences.length}
Blocking patents flagged: ${session.infringementReport!.blockingPatents.length}

Respond concisely. If everything looks reasonable, say "No critical gaps." If there are issues (e.g., a market not covered, no claim mappings despite available claim text, contradictions between blocker list and per-market risk), prefix with "CRITICAL GAP:" and explain.`,
      },
    ],
  });

  const text =
    response.content
      .filter((b) => b.type === 'text')
      .map((b) => ('text' in b ? (b as { text: string }).text : ''))
      .join('') || '';

  addTokenUsage(session, {
    input: response.usage.input_tokens,
    output: response.usage.output_tokens,
  });

  return text;
}

