import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { registerAnalysisRoutes } from './routes/analysis.js';
import { registerHealthRoute } from './routes/health.js';

export async function createServer() {
  const app = Fastify({
    logger: false, // We use our own Pino logger
    bodyLimit: 10 * 1024 * 1024, // 10MB max body size
    requestTimeout: 30000, // 30s timeout for request handling
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
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    logger.info({ port: env.PORT }, 'API server started');
    console.log(`\nPatent Lawyer Agent API running at http://localhost:${env.PORT}`);
    console.log(`Health check: http://localhost:${env.PORT}/api/v1/health\n`);
  } catch (err) {
    logger.error(err, 'Failed to start server');
    process.exit(1);
  }
}
