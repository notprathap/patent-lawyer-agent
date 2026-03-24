import { z } from 'zod/v4';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  // Required
  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY is required'),

  // Database — required for persistence (Phase 5+), optional during early development
  DATABASE_URL: z.string().optional(),

  // Patent search APIs (Phase 2+)
  EPO_CONSUMER_KEY: z.string().optional(),
  EPO_CONSUMER_SECRET: z.string().optional(),
  SERPAPI_API_KEY: z.string().optional(),
  SEMANTIC_SCHOLAR_API_KEY: z.string().optional(),

  // Embedding / RAG (Phase 6+)
  VOYAGE_API_KEY: z.string().optional(),

  // Job queue (Phase 8+)
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Observability — Langfuse (Phase 9+)
  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_BASE_URL: z.string().default('https://cloud.langfuse.com'),

  // Application
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('Invalid environment variables:');
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }

  return result.data;
}

export const env = loadEnv();
