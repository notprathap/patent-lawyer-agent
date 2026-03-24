import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { env } from '../config/env.js';

let client: PrismaClient | null = null;

export function getPrismaClient(): PrismaClient {
  if (!client) {
    if (!env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for database operations');
    }
    const adapter = new PrismaNeon({ connectionString: env.DATABASE_URL });
    client = new PrismaClient({ adapter });
  }
  return client;
}

export async function disconnectPrisma(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = null;
  }
}
