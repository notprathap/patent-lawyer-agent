import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { createRequire } from 'node:module';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { warmUpPrisma } from '../db/client.js';
import { registerAnalysisRoutes } from './routes/analysis.js';
import { registerHealthRoute } from './routes/health.js';

export async function createServer() {
  const app = Fastify({
    logger: false, // We use our own Pino logger
    bodyLimit: 10 * 1024 * 1024, // 10MB max body size
    requestTimeout: 60000, // 60s — allows time for PDF text extraction before 202 response
  });

  // Plugins
  await app.register(cors, {
    origin: true, // Allow all origins in development
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  });

  await app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  });

  // Routes
  registerHealthRoute(app);
  registerAnalysisRoutes(app);

  return app;
}

export async function startServer() {
  const app = await createServer();

  try {
    // Pre-load pdfjs-dist worker module BEFORE opening connections.
    // The pdfjs fake-worker uses a dynamic import() that, when first executed
    // during request handling, causes an undici race condition that hangs
    // subsequent PrismaNeon DB operations. Loading it at startup avoids this.
    const _require = createRequire(import.meta.url);
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = _require.resolve(
      'pdfjs-dist/legacy/build/pdf.worker.mjs',
    );
    // Trigger the lazy worker module load now (cached via shadow())
    await import(pdfjs.GlobalWorkerOptions.workerSrc);

    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    await warmUpPrisma();
    logger.info({ port: env.PORT }, 'API server started');
    console.log(`\nPatent Lawyer Agent API running at http://localhost:${env.PORT}`);
    console.log(`Health check: http://localhost:${env.PORT}/api/v1/health\n`);
  } catch (err) {
    logger.error(err, 'Failed to start server');
    process.exit(1);
  }
}
