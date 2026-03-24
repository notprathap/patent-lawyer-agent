import type { FastifyInstance } from 'fastify';

export function registerHealthRoute(app: FastifyInstance) {
  app.get('/api/v1/health', async () => {
    return {
      status: 'ok',
      service: 'patent-lawyer-agent',
      timestamp: new Date().toISOString(),
    };
  });
}
