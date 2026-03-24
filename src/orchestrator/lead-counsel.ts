import { getClaudeClient, DEFAULT_MODEL } from '../lib/claude.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';
import { deconstructClaim } from '../agents/claim-deconstructor.js';
import { investigatePriorArt } from '../agents/prior-art-investigator.js';
import { examinePatent } from '../agents/patent-examiner.js';
import { computeConfidenceReport, type ConfidenceReport } from '../services/confidence-scorer.js';
import { generateMemo } from '../services/memo-generator.js';
import { validateClaimInput } from '../services/input-validator.js';
import { runGuardrails, type GuardrailResult } from '../services/guardrails.js';
import {
  createSession,
  addTokenUsage,
  type AnalysisSession,
} from './session.js';
import {
  createAnalysis,
  updateAnalysisStatus,
  persistClaimElements,
  persistPriorArtReport,
  persistExaminerAnalysis,
  persistFinalResults,
} from '../db/repositories/analysis.repo.js';
import type { Jurisdiction } from '../types/index.js';

export interface AnalysisResult {
  session: AnalysisSession;
  memo: string;
  confidenceReport: ConfidenceReport;
  guardrailResult?: GuardrailResult;
  analysisId?: string;
}

/**
 * Lead Counsel Orchestrator — deterministic workflow that chains all agents.
 *
 * Steps:
 * 1. Validate input
 * 2. Deconstruct claim → ParsedClaim
 * 3. Search prior art → PriorArtReport
 * 4. Examine patent (all jurisdictions) → MultiJurisdictionAnalysis
 * 5. Reflect — check for gaps
 * 6. Score confidence
 * 7. Synthesize final memo
 */
export async function runAnalysis(
  claimText: string,
  jurisdictions: Jurisdiction[] = ['US', 'EU', 'UK'],
  technicalSpecification?: string,
  preCreatedAnalysisId?: string,
): Promise<AnalysisResult> {
  const session = createSession(claimText, jurisdictions, technicalSpecification);
  const persist = !!env.DATABASE_URL;
  let analysisId: string | undefined = preCreatedAnalysisId;

  logger.info(
    { sessionId: session.id, jurisdictions, persist, analysisId },
    'Lead Counsel: starting patent defensibility analysis',
  );

  try {
    // Create DB record if persistence is enabled and not pre-created
    if (persist && !analysisId) {
      analysisId = await createAnalysis(session);
      logger.debug({ analysisId }, 'Lead Counsel: DB record created');
    }

    // Step 1: Validate input (enhanced with eligibility detection)
    session.step = 'validating';
    if (persist && analysisId) await updateAnalysisStatus(analysisId, 'VALIDATING');
    const inputValidation = await validateClaimInput(session.claimText, jurisdictions);
    addTokenUsage(session, inputValidation.tokensUsed);

    if (!inputValidation.isValid) {
      throw new Error(`Input validation failed: ${inputValidation.reason}`);
    }

    if (inputValidation.eligibilityWarnings.length > 0) {
      for (const warn of inputValidation.eligibilityWarnings) {
        session.issues.push(`${warn.jurisdiction} eligibility concern (${warn.framework}): ${warn.concern}`);
      }
      logger.warn(
        { warnings: inputValidation.eligibilityWarnings },
        'Lead Counsel: subject matter eligibility concerns detected',
      );
    }

    logger.info({ sessionId: session.id, validation: inputValidation.reason.slice(0, 100) }, 'Lead Counsel: input validated');

    // Step 2: Deconstruct claim
    session.step = 'deconstructing';
    if (persist && analysisId) await updateAnalysisStatus(analysisId, 'DECONSTRUCTING');
    logger.info({ sessionId: session.id }, 'Lead Counsel: Step 2 — deconstructing claim');
    const claimResult = await deconstructClaim(session.claimText);
    session.parsedClaim = claimResult.data;
    addTokenUsage(session, claimResult.tokensUsed);

    logger.info(
      {
        sessionId: session.id,
        elements: session.parsedClaim.elements.length,
        isIndependent: session.parsedClaim.isIndependent,
      },
      'Lead Counsel: claim deconstructed',
    );
    if (persist && analysisId) await persistClaimElements(analysisId, session);

    // Step 3: Search prior art
    session.step = 'searching_prior_art';
    if (persist && analysisId) await updateAnalysisStatus(analysisId, 'SEARCHING_PRIOR_ART');
    logger.info({ sessionId: session.id }, 'Lead Counsel: Step 3 — searching prior art');
    const priorArtResult = await investigatePriorArt(session.parsedClaim);
    session.priorArtReport = priorArtResult.data;
    addTokenUsage(session, priorArtResult.tokensUsed);

    logger.info(
      {
        sessionId: session.id,
        totalReferences: session.priorArtReport.totalReferencesFound,
        sourcesSearched: session.priorArtReport.sourcesSearched,
      },
      'Lead Counsel: prior art search complete',
    );
    if (persist && analysisId) await persistPriorArtReport(analysisId, session);

    // Step 4: Examine patent across all jurisdictions
    session.step = 'examining';
    if (persist && analysisId) await updateAnalysisStatus(analysisId, 'EXAMINING');
    logger.info(
      { sessionId: session.id, jurisdictions },
      'Lead Counsel: Step 4 — examining patent',
    );
    const examinerResult = await examinePatent(
      session.parsedClaim,
      session.priorArtReport,
      jurisdictions,
    );
    session.examinerAnalysis = examinerResult.data;
    addTokenUsage(session, examinerResult.tokensUsed);

    logger.info(
      {
        sessionId: session.id,
        usStrength: session.examinerAnalysis.us?.overallStrength,
        epoStrength: session.examinerAnalysis.epo?.overallStrength,
        ukStrength: session.examinerAnalysis.uk?.overallStrength,
        divergences: session.examinerAnalysis.divergences.length,
      },
      'Lead Counsel: examination complete',
    );
    if (persist && analysisId) await persistExaminerAnalysis(analysisId, session);

    // Step 5: Reflect — check for gaps and inconsistencies
    session.step = 'reflecting';
    if (persist && analysisId) await updateAnalysisStatus(analysisId, 'REFLECTING');
    logger.info({ sessionId: session.id }, 'Lead Counsel: Step 5 — reflecting');
    const reflectionNotes = await reflect(session);
    session.reflectionNotes = reflectionNotes;

    if (reflectionNotes.includes('CRITICAL GAP')) {
      session.issues.push(`Reflection flagged critical gaps: ${reflectionNotes}`);
      logger.warn(
        { sessionId: session.id, notes: reflectionNotes },
        'Lead Counsel: critical gaps found during reflection',
      );
    }

    // Step 6: Score confidence
    const confidenceReport = computeConfidenceReport(
      session.priorArtReport,
      session.examinerAnalysis,
      jurisdictions,
    );

    logger.info(
      {
        sessionId: session.id,
        scores: confidenceReport.jurisdictionScores.map((s) => ({
          jur: s.jurisdiction,
          def: s.defensibility,
        })),
        confidence: confidenceReport.assessmentConfidence,
      },
      'Lead Counsel: confidence scored',
    );

    // Step 7: Synthesize final memo
    session.step = 'synthesizing';
    if (persist && analysisId) await updateAnalysisStatus(analysisId, 'SYNTHESIZING');
    logger.info({ sessionId: session.id }, 'Lead Counsel: Step 7 — synthesizing memo');
    const memoResult = await generateMemo({
      parsedClaim: session.parsedClaim,
      priorArtReport: session.priorArtReport,
      analysis: session.examinerAnalysis,
      confidenceReport,
      jurisdictions,
    });
    session.memo = memoResult.memo;
    addTokenUsage(session, memoResult.tokensUsed);

    // Step 8: Run guardrails
    logger.info({ sessionId: session.id }, 'Lead Counsel: Step 8 — running guardrails');
    const guardrailResult = await runGuardrails(session.memo, jurisdictions, confidenceReport);

    // Use the memo with validation report appended
    session.memo = guardrailResult.memoWithReport;

    if (guardrailResult.confidenceAdjustment.shouldDowngrade) {
      session.issues.push(`Confidence downgraded: ${guardrailResult.confidenceAdjustment.reason}`);
      logger.warn(
        { reason: guardrailResult.confidenceAdjustment.reason },
        'Lead Counsel: confidence downgraded by guardrails',
      );
    }

    if (!guardrailResult.passed) {
      logger.warn(
        { errors: guardrailResult.validationReport.failed },
        'Lead Counsel: guardrail errors detected — memo may need attorney review',
      );
    }

    // Complete
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
        guardrailsPassed: guardrailResult.passed,
      },
      'Lead Counsel: analysis complete',
    );

    // Persist final results
    if (persist && analysisId) {
      await persistFinalResults(analysisId, session, confidenceReport);
    }

    return {
      session,
      memo: session.memo,
      confidenceReport,
      guardrailResult,
      analysisId,
    };
  } catch (error) {
    session.step = 'failed';
    const errorMessage = error instanceof Error ? error.message : String(error);
    session.issues.push(`Fatal error: ${errorMessage}`);
    if (persist && analysisId) {
      await updateAnalysisStatus(analysisId, 'FAILED').catch(() => {});
    }
    logger.error(
      { sessionId: session.id, error: errorMessage },
      'Lead Counsel: analysis failed',
    );
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Step 5: Reflection
// ---------------------------------------------------------------------------

async function reflect(session: AnalysisSession): Promise<string> {
  const client = getClaudeClient();

  const coverageSummary = session.priorArtReport!.elementCoverages
    .map((ec) => `${ec.elementId}: ${ec.coverageLevel} (${ec.references.length} refs)`)
    .join(', ');

  const response = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `Review the following analysis for gaps or inconsistencies. Flag any CRITICAL GAPs that would require re-running agents.

Claim elements: ${session.parsedClaim!.elements.length}
Prior art coverage: ${coverageSummary}
US analysis: ${session.examinerAnalysis!.us ? `${session.examinerAnalysis!.us.overallStrength} (${session.examinerAnalysis!.us.obviousnessArgs.length} obviousness args)` : 'missing'}
EPO analysis: ${session.examinerAnalysis!.epo ? `${session.examinerAnalysis!.epo.overallStrength} (${session.examinerAnalysis!.epo.inventiveStepArgs.length} inventive step args)` : 'missing'}
UK analysis: ${session.examinerAnalysis!.uk ? `${session.examinerAnalysis!.uk.overallStrength} (${session.examinerAnalysis!.uk.inventiveStepArgs.length} inventive step args)` : 'missing'}
Divergences: ${session.examinerAnalysis!.divergences.length}

Respond concisely. If everything looks reasonable, say "No critical gaps." If there are issues, prefix with "CRITICAL GAP:" and explain.`,
      },
    ],
  });

  const text =
    response.content
      .filter((b) => b.type === 'text')
      .map((b) => 'text' in b ? (b as { text: string }).text : '')
      .join('') || '';

  addTokenUsage(session, {
    input: response.usage.input_tokens,
    output: response.usage.output_tokens,
  });

  return text;
}
