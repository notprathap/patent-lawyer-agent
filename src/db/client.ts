import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { env } from '../config/env.js';

let requestClient: PrismaClient | null = null;
let backgroundClient: PrismaClient | null = null;

function createClient(poolMax: number): PrismaClient {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for database operations');
  }
  const adapter = new PrismaNeon({
    connectionString: env.DATABASE_URL,
    max: poolMax,
    connectionTimeoutMillis: 15_000,
    idleTimeoutMillis: 30_000,
  });
  return new PrismaClient({ adapter });
}

/**
 * Client for request handlers (creating records, responding to API calls).
 * Has its own pool so background analysis can never starve it.
 */
export function getPrismaClient(): PrismaClient {
  if (!requestClient) {
    requestClient = createClient(3);
  }
  return requestClient;
}

/**
 * Client for background analysis work (persisting results, status updates).
 * Separate pool so it doesn't block incoming API requests.
 */
export function getBackgroundPrismaClient(): PrismaClient {
  if (!backgroundClient) {
    backgroundClient = createClient(5);
  }
  return backgroundClient;
}

/**
 * Warm up the DB connection pool.
 */
export async function warmUpPrisma(): Promise<void> {
  const prisma = getPrismaClient();
  await prisma.$executeRawUnsafe('SELECT 1');
}

export async function disconnectPrisma(): Promise<void> {
  if (requestClient) {
    await requestClient.$disconnect();
    requestClient = null;
  }
  if (backgroundClient) {
    await backgroundClient.$disconnect();
    backgroundClient = null;
  }
}
