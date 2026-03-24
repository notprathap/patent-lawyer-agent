import type { AnalysisStatus } from '@prisma/client';
import { getPrismaClient } from '../client.js';
import { logger } from '../../utils/logger.js';
import type { AnalysisSession } from '../../orchestrator/session.js';
import type { ConfidenceReport } from '../../services/confidence-scorer.js';

/**
 * Create a new analysis record from session data.
 */
export async function createAnalysis(session: AnalysisSession): Promise<string> {
  const prisma = getPrismaClient();

  const analysis = await prisma.analysis.create({
    data: {
      claimText: session.claimText,
      technicalSpec: session.technicalSpecification,
      jurisdictions: session.jurisdictions,
      status: sessionStepToStatus(session.step),
    },
  });

  logger.debug({ analysisId: analysis.id }, 'DB: analysis created');
  return analysis.id;
}

/**
 * Create a new analysis record directly from parameters (used by API route).
 */
export async function createAnalysisRecord(
  claimText: string,
  jurisdictions: string[],
  technicalSpec?: string,
): Promise<string> {
  const prisma = getPrismaClient();

  const analysis = await prisma.analysis.create({
    data: {
      claimText,
      technicalSpec: technicalSpec || null,
      jurisdictions,
      status: 'PENDING',
    },
  });

  logger.debug({ analysisId: analysis.id }, 'DB: analysis record created');
  return analysis.id;
}

/**
 * Persist a failure reason to the analysis record.
 */
export async function persistFailure(
  analysisId: string,
  errorMessage: string,
): Promise<void> {
  const prisma = getPrismaClient();
  await prisma.analysis.update({
    where: { id: analysisId },
    data: {
      status: 'FAILED',
      reflectionNotes: `ERROR: ${errorMessage}`,
    },
  });
}

/**
 * Update analysis status.
 */
export async function updateAnalysisStatus(
  analysisId: string,
  status: AnalysisStatus,
): Promise<void> {
  const prisma = getPrismaClient();
  await prisma.analysis.update({
    where: { id: analysisId },
    data: { status },
  });
}

/**
 * Persist claim elements after deconstruction.
 */
export async function persistClaimElements(
  analysisId: string,
  session: AnalysisSession,
): Promise<void> {
  const prisma = getPrismaClient();
  const claim = session.parsedClaim;
  if (!claim) return;

  await prisma.analysis.update({
    where: { id: analysisId },
    data: { parsedClaim: claim as object },
  });

  await prisma.claimElement.createMany({
    data: claim.elements.map((el, idx) => ({
      analysisId,
      elementIndex: el.id,
      text: el.text,
      type: el.type,
      isMeansPlusFunction: el.isMeansPlusFunction,
      position: idx,
    })),
  });

  logger.debug({ analysisId, elements: claim.elements.length }, 'DB: claim elements persisted');
}

/**
 * Persist prior art report and references.
 */
export async function persistPriorArtReport(
  analysisId: string,
  session: AnalysisSession,
): Promise<void> {
  const prisma = getPrismaClient();
  const report = session.priorArtReport;
  if (!report) return;

  await prisma.analysis.update({
    where: { id: analysisId },
    data: { priorArtReport: report as object },
  });

  // Collect unique references across all element coverages
  const seenRefs = new Set<string>();
  const refsToCreate: Array<{
    analysisId: string;
    refIndex: string;
    title: string;
    url: string;
    publicationNumber: string | null;
    source: string;
    date: string | null;
    relevantExcerpt: string;
    jurisdictions: string[];
  }> = [];

  for (const coverage of report.elementCoverages) {
    for (const ref of coverage.references) {
      if (!seenRefs.has(ref.id)) {
        seenRefs.add(ref.id);
        refsToCreate.push({
          analysisId,
          refIndex: ref.id,
          title: ref.title,
          url: ref.url,
          publicationNumber: ref.publicationNumber ?? null,
          source: ref.source,
          date: ref.date ?? null,
          relevantExcerpt: ref.relevantExcerpt,
          jurisdictions: ref.jurisdictions,
        });
      }
    }
  }

  if (refsToCreate.length > 0) {
    await prisma.priorArtReference.createMany({ data: refsToCreate });
  }

  // Persist search queries
  if (report.searchQueries.length > 0) {
    await prisma.searchQuery.createMany({
      data: report.searchQueries.map((q) => ({
        analysisId,
        query: q,
        source: 'mixed',
        resultCount: 0,
      })),
    });
  }

  logger.debug(
    { analysisId, references: refsToCreate.length, queries: report.searchQueries.length },
    'DB: prior art report persisted',
  );
}

/**
 * Persist examiner analysis and invalidity arguments.
 */
export async function persistExaminerAnalysis(
  analysisId: string,
  session: AnalysisSession,
): Promise<void> {
  const prisma = getPrismaClient();
  const analysis = session.examinerAnalysis;
  if (!analysis) return;

  await prisma.analysis.update({
    where: { id: analysisId },
    data: { examinerAnalysis: analysis as object },
  });

  const argsToCreate: Array<{
    analysisId: string;
    jurisdiction: string;
    type: string;
    strength: string;
    content: object;
  }> = [];

  // US arguments
  if (analysis.us) {
    for (const arg of analysis.us.anticipationArgs) {
      argsToCreate.push({
        analysisId,
        jurisdiction: 'US',
        type: 'anticipation',
        strength: arg.strength,
        content: arg as object,
      });
    }
    for (const arg of analysis.us.obviousnessArgs) {
      argsToCreate.push({
        analysisId,
        jurisdiction: 'US',
        type: 'obviousness',
        strength: arg.strength,
        content: arg as object,
      });
    }
  }

  // EPO arguments
  if (analysis.epo) {
    for (const arg of analysis.epo.noveltyArgs) {
      argsToCreate.push({
        analysisId,
        jurisdiction: 'EU',
        type: 'novelty',
        strength: arg.strength,
        content: arg as object,
      });
    }
    for (const arg of analysis.epo.inventiveStepArgs) {
      argsToCreate.push({
        analysisId,
        jurisdiction: 'EU',
        type: 'inventive_step',
        strength: arg.strength,
        content: arg as object,
      });
    }
  }

  // UK arguments
  if (analysis.uk) {
    for (const arg of analysis.uk.noveltyArgs) {
      argsToCreate.push({
        analysisId,
        jurisdiction: 'UK',
        type: 'novelty',
        strength: arg.strength,
        content: arg as object,
      });
    }
    for (const arg of analysis.uk.inventiveStepArgs) {
      argsToCreate.push({
        analysisId,
        jurisdiction: 'UK',
        type: 'inventive_step',
        strength: arg.strength,
        content: arg as object,
      });
    }
  }

  if (argsToCreate.length > 0) {
    await prisma.invalidityArgument.createMany({ data: argsToCreate });
  }

  logger.debug(
    { analysisId, arguments: argsToCreate.length },
    'DB: examiner analysis persisted',
  );
}

/**
 * Persist the final memo and confidence report.
 */
export async function persistFinalResults(
  analysisId: string,
  session: AnalysisSession,
  confidenceReport: ConfidenceReport,
): Promise<void> {
  const prisma = getPrismaClient();

  const usScore = confidenceReport.jurisdictionScores.find((s) => s.jurisdiction === 'US');
  const epoScore = confidenceReport.jurisdictionScores.find((s) => s.jurisdiction === 'EU');
  const ukScore = confidenceReport.jurisdictionScores.find((s) => s.jurisdiction === 'UK');

  await prisma.analysis.update({
    where: { id: analysisId },
    data: {
      status: 'COMPLETE',
      memo: session.memo,
      confidenceReport: confidenceReport as object,
      reflectionNotes: session.reflectionNotes,
      usRating: usScore?.defensibility,
      epoRating: epoScore?.defensibility,
      ukRating: ukScore?.defensibility,
      assessmentConfidence: confidenceReport.assessmentConfidence,
      totalInputTokens: session.totalTokensUsed.input,
      totalOutputTokens: session.totalTokensUsed.output,
      completedAt: new Date(),
    },
  });

  logger.debug({ analysisId }, 'DB: final results persisted');
}

/**
 * Load an analysis by ID.
 */
export async function getAnalysis(analysisId: string) {
  const prisma = getPrismaClient();
  return prisma.analysis.findUnique({
    where: { id: analysisId },
    include: {
      claimElements: { orderBy: { position: 'asc' } },
      priorArtReferences: true,
      invalidityArguments: true,
      searchQueries: { orderBy: { executedAt: 'asc' } },
    },
  });
}

/**
 * List analyses with pagination.
 */
export async function listAnalyses(limit = 20, offset = 0) {
  const prisma = getPrismaClient();
  return prisma.analysis.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
    select: {
      id: true,
      status: true,
      jurisdictions: true,
      usRating: true,
      epoRating: true,
      ukRating: true,
      assessmentConfidence: true,
      createdAt: true,
      completedAt: true,
    },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sessionStepToStatus(step: string): AnalysisStatus {
  const map: Record<string, AnalysisStatus> = {
    pending: 'PENDING',
    validating: 'VALIDATING',
    deconstructing: 'DECONSTRUCTING',
    searching_prior_art: 'SEARCHING_PRIOR_ART',
    examining: 'EXAMINING',
    reflecting: 'REFLECTING',
    synthesizing: 'SYNTHESIZING',
    complete: 'COMPLETE',
    failed: 'FAILED',
  };
  return map[step] ?? 'PENDING';
}
