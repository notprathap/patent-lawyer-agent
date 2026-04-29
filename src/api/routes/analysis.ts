import type { FastifyInstance } from 'fastify';
import { runAnalysis } from '../../orchestrator/lead-counsel.js';
import { runFTOAnalysis } from '../../orchestrator/lead-counsel-fto.js';
import {
  getAnalysis,
  listAnalyses,
  createAnalysisRecord,
  createFTOAnalysisRecord,
} from '../../db/repositories/analysis.repo.js';
import { logger } from '../../utils/logger.js';
import type { Jurisdiction } from '../../types/index.js';
import type { PatentToCheckInput } from '../../types/fto.js';

type AnalysisType = 'DEFENSIBILITY' | 'FTO';

function parseAnalysisType(value: string | undefined): AnalysisType {
  if (value && value.toUpperCase() === 'FTO') return 'FTO';
  return 'DEFENSIBILITY';
}

function parsePatentsToCheck(value: string | undefined): PatentToCheckInput[] {
  if (!value) return [];
  return value
    .split(/[\n,]+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((publicationNumber) => ({ publicationNumber }));
}

export function registerAnalysisRoutes(app: FastifyInstance) {
  // POST /api/v1/analyses — Start a new analysis (defensibility OR FTO)
  app.post('/api/v1/analyses', async (request, reply) => {
    // Shared fields
    let analysisType: AnalysisType = 'DEFENSIBILITY';
    let bodyText = '';                           // claimText for defensibility, productDescription for FTO
    let jurisdictions: Jurisdiction[] = ['US', 'EU', 'UK'];
    let technicalSpec: string | undefined;
    let patentsToCheck: PatentToCheckInput[] = [];

    const contentType = request.headers['content-type'] || '';

    if (contentType.includes('multipart/form-data')) {
      // Handle file upload (PDF / TXT / DOCX)
      const data = await request.file();
      if (!data) {
        return reply.status(400).send({ error: 'No file uploaded' });
      }

      const buffer = await data.toBuffer();
      const fileName = data.filename?.toLowerCase() || '';

      if (fileName.endsWith('.pdf')) {
        const { PDFParse } = await import('pdf-parse');
        const pdf = new PDFParse({ data: new Uint8Array(buffer) });
        try {
          const textResult = await Promise.race([
            pdf.getText(),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('PDF text extraction timed out after 120 seconds')), 120_000),
            ),
          ]);
          bodyText = textResult.text || '';
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          logger.error({ fileName, fileSize: buffer.length, error: message }, 'PDF parsing failed');
          return reply.status(422).send({ error: `Failed to extract text from PDF: ${message}` });
        } finally {
          await pdf.destroy().catch(() => {});
        }
      } else {
        bodyText = buffer.toString('utf-8');
      }

      bodyText = bodyText.replace(/\0/g, '');

      const fields = data.fields as Record<string, { value?: string } | undefined>;
      analysisType = parseAnalysisType(fields?.analysisType?.value);
      if (fields?.jurisdictions?.value) {
        jurisdictions = fields.jurisdictions.value
          .split(',')
          .map((j: string) => j.trim().toUpperCase()) as Jurisdiction[];
      }
      if (fields?.targetMarkets?.value) {
        // FTO uses targetMarkets; if provided, override jurisdictions
        jurisdictions = fields.targetMarkets.value
          .split(',')
          .map((j: string) => j.trim().toUpperCase()) as Jurisdiction[];
      }
      if (fields?.technicalSpec?.value) {
        technicalSpec = fields.technicalSpec.value;
      }
      if (fields?.patentsToCheck?.value) {
        patentsToCheck = parsePatentsToCheck(fields.patentsToCheck.value);
      }
    } else {
      const body = request.body as {
        analysisType?: string;
        // Defensibility
        claimText?: string;
        technicalSpec?: string;
        jurisdictions?: string[];
        // FTO
        productDescription?: string;
        targetMarkets?: string[];
        patentsToCheck?: Array<{ publicationNumber: string; notes?: string } | string>;
      } | null;

      analysisType = parseAnalysisType(body?.analysisType);

      if (analysisType === 'FTO') {
        if (!body?.productDescription) {
          return reply.status(400).send({ error: 'productDescription is required for FTO analysis' });
        }
        bodyText = body.productDescription;
        if (body.targetMarkets) {
          jurisdictions = body.targetMarkets.map((j) => j.toUpperCase()) as Jurisdiction[];
        }
        if (Array.isArray(body.patentsToCheck)) {
          patentsToCheck = body.patentsToCheck.map((p) =>
            typeof p === 'string'
              ? { publicationNumber: p }
              : { publicationNumber: p.publicationNumber, notes: p.notes },
          );
        }
      } else {
        if (!body?.claimText) {
          return reply.status(400).send({ error: 'claimText is required' });
        }
        bodyText = body.claimText;
        if (body.jurisdictions) {
          jurisdictions = body.jurisdictions.map((j) => j.toUpperCase()) as Jurisdiction[];
        }
        technicalSpec = body.technicalSpec;
      }
    }

    if (!bodyText.trim()) {
      const field = analysisType === 'FTO' ? 'productDescription' : 'claimText';
      return reply.status(400).send({ error: `${field} cannot be empty` });
    }

    if (jurisdictions.length === 0) {
      return reply.status(400).send({ error: 'At least one jurisdiction / target market is required' });
    }

    logger.info(
      { analysisType, jurisdictions, bodyLength: bodyText.length, patentsToCheck: patentsToCheck.length },
      'API: starting analysis',
    );

    // Create the DB record FIRST so we have a real ID to return immediately.
    let analysisId: string;
    try {
      if (analysisType === 'FTO') {
        analysisId = await createFTOAnalysisRecord(bodyText, jurisdictions, patentsToCheck);
      } else {
        analysisId = await createAnalysisRecord(bodyText, jurisdictions, technicalSpec);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ error: message }, 'API: failed to create analysis record');
      return reply.status(500).send({ error: `Failed to create analysis: ${message}` });
    }

    // Fire and forget — run the appropriate orchestrator asynchronously.
    if (analysisType === 'FTO') {
      runFTOAnalysis(bodyText, jurisdictions, patentsToCheck, analysisId)
        .then((result) => {
          logger.info({ analysisId: result.analysisId }, 'API: FTO analysis completed');
        })
        .catch((err) => {
          logger.error({ analysisId, error: err }, 'API: FTO analysis failed');
        });
    } else {
      runAnalysis(bodyText, jurisdictions, technicalSpec, analysisId)
        .then((result) => {
          logger.info({ analysisId: result.analysisId }, 'API: analysis completed');
        })
        .catch((err) => {
          logger.error({ analysisId, error: err }, 'API: analysis failed');
        });
    }

    return reply.status(202).send({
      analysisId,
      analysisType,
      status: 'PENDING',
      message: 'Analysis started. Poll GET /api/v1/analyses/:id for status.',
    });
  });

  // GET /api/v1/analyses — List analyses
  app.get('/api/v1/analyses', async (request) => {
    const query = request.query as { limit?: string; offset?: string };
    const limit = Math.min(parseInt(query.limit || '20', 10), 100);
    const offset = parseInt(query.offset || '0', 10);

    const analyses = await listAnalyses(limit, offset);

    return {
      data: analyses,
      pagination: { limit, offset },
    };
  });

  // GET /api/v1/analyses/:id — Get analysis details
  app.get('/api/v1/analyses/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const analysis = await getAnalysis(id);

    if (!analysis) {
      return reply.status(404).send({ error: 'Analysis not found' });
    }

    return {
      id: analysis.id,
      analysisType: analysis.analysisType,
      status: analysis.status,
      // Defensibility
      jurisdictions: analysis.jurisdictions,
      claimText: analysis.claimText,
      parsedClaim: analysis.parsedClaim,
      priorArtReport: analysis.priorArtReport,
      examinerAnalysis: analysis.examinerAnalysis,
      claimElements: analysis.claimElements,
      priorArtReferences: analysis.priorArtReferences,
      invalidityArguments: analysis.invalidityArguments,
      // FTO
      productDescription: analysis.productDescription,
      targetMarkets: analysis.targetMarkets,
      parsedProduct: analysis.parsedProduct,
      discoveredPatents: analysis.discoveredPatents,
      infringementReport: analysis.infringementReport,
      patentsToCheck: analysis.patentsToCheck,
      overallFtoRisk: analysis.overallFtoRisk,
      // Shared
      usRating: analysis.usRating,
      epoRating: analysis.epoRating,
      ukRating: analysis.ukRating,
      assessmentConfidence: analysis.assessmentConfidence,
      memo: analysis.memo,
      confidenceReport: analysis.confidenceReport,
      reflectionNotes: analysis.reflectionNotes,
      totalInputTokens: analysis.totalInputTokens,
      totalOutputTokens: analysis.totalOutputTokens,
      createdAt: analysis.createdAt,
      completedAt: analysis.completedAt,
    };
  });

  // GET /api/v1/analyses/:id/memo — Get just the memo
  app.get('/api/v1/analyses/:id/memo', async (request, reply) => {
    const { id } = request.params as { id: string };

    const analysis = await getAnalysis(id);

    if (!analysis) {
      return reply.status(404).send({ error: 'Analysis not found' });
    }

    if (!analysis.memo) {
      return reply.status(404).send({ error: 'Memo not yet generated', status: analysis.status });
    }

    return { memo: analysis.memo };
  });
}
