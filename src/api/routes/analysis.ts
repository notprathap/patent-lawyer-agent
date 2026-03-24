import type { FastifyInstance } from 'fastify';
import { runAnalysis } from '../../orchestrator/lead-counsel.js';
import {
  getAnalysis,
  listAnalyses,
  createAnalysisRecord,
} from '../../db/repositories/analysis.repo.js';
import { logger } from '../../utils/logger.js';
import type { Jurisdiction } from '../../types/index.js';

export function registerAnalysisRoutes(app: FastifyInstance) {
  // POST /api/v1/analyses — Start a new analysis
  app.post('/api/v1/analyses', async (request, reply) => {
    let claimText = '';
    let jurisdictions: Jurisdiction[] = ['US', 'EU', 'UK'];
    let technicalSpec: string | undefined;

    const contentType = request.headers['content-type'] || '';

    if (contentType.includes('multipart/form-data')) {
      // Handle file upload
      const data = await request.file();
      if (!data) {
        return reply.status(400).send({ error: 'No file uploaded' });
      }

      const buffer = await data.toBuffer();
      claimText = buffer.toString('utf-8');

      // Check for additional fields in the multipart form
      const fields = data.fields as Record<string, { value?: string } | undefined>;
      if (fields?.jurisdictions?.value) {
        jurisdictions = fields.jurisdictions.value.split(',').map((j: string) => j.trim().toUpperCase()) as Jurisdiction[];
      }
      if (fields?.technicalSpec?.value) {
        technicalSpec = fields.technicalSpec.value;
      }
    } else {
      // Handle JSON body
      const body = request.body as {
        claimText?: string;
        jurisdictions?: string[];
        technicalSpec?: string;
      } | null;

      if (!body?.claimText) {
        return reply.status(400).send({ error: 'claimText is required' });
      }

      claimText = body.claimText;
      if (body.jurisdictions) {
        jurisdictions = body.jurisdictions.map((j) => j.toUpperCase()) as Jurisdiction[];
      }
      technicalSpec = body.technicalSpec;
    }

    if (!claimText.trim()) {
      return reply.status(400).send({ error: 'claimText cannot be empty' });
    }

    logger.info({ jurisdictions, claimLength: claimText.length }, 'API: starting analysis');

    // Create the DB record FIRST so we have a real ID to return immediately
    const analysisId = await createAnalysisRecord(claimText, jurisdictions, technicalSpec);

    // Fire and forget — run analysis asynchronously, passing the pre-created ID
    runAnalysis(claimText, jurisdictions, technicalSpec, analysisId)
      .then((result) => {
        logger.info({ analysisId: result.analysisId }, 'API: analysis completed');
      })
      .catch((err) => {
        logger.error({ analysisId, error: err }, 'API: analysis failed');
      });

    return reply.status(202).send({
      analysisId,
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
      status: analysis.status,
      jurisdictions: analysis.jurisdictions,
      claimText: analysis.claimText,
      usRating: analysis.usRating,
      epoRating: analysis.epoRating,
      ukRating: analysis.ukRating,
      assessmentConfidence: analysis.assessmentConfidence,
      memo: analysis.memo,
      confidenceReport: analysis.confidenceReport,
      parsedClaim: analysis.parsedClaim,
      priorArtReport: analysis.priorArtReport,
      examinerAnalysis: analysis.examinerAnalysis,
      reflectionNotes: analysis.reflectionNotes,
      totalInputTokens: analysis.totalInputTokens,
      totalOutputTokens: analysis.totalOutputTokens,
      createdAt: analysis.createdAt,
      completedAt: analysis.completedAt,
      claimElements: analysis.claimElements,
      priorArtReferences: analysis.priorArtReferences,
      invalidityArguments: analysis.invalidityArguments,
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
