import { getPrismaClient } from '../db/client.js';
import { embedText, EMBEDDING_DIMENSIONS } from './embedding.js';
import { logger } from '../utils/logger.js';
import type { Jurisdiction } from '../types/index.js';

export interface RAGResult {
  id: string;
  content: string;
  source: string;
  jurisdiction: string;
  sectionId: string;
  title: string;
  sourceUrl: string | null;
  similarity: number;
}

/**
 * Search the legal knowledge base using semantic similarity.
 */
export async function searchLegalKnowledge(
  query: string,
  options?: {
    jurisdiction?: Jurisdiction;
    source?: string;
    topK?: number;
    minSimilarity?: number;
  },
): Promise<RAGResult[]> {
  const { jurisdiction, source, topK = 5, minSimilarity = 0.3 } = options ?? {};

  logger.debug(
    { query: query.slice(0, 80), jurisdiction, source, topK },
    'RAG: searching legal knowledge base',
  );

  // Embed the query
  const queryEmbedding = await embedText(query);
  const embeddingStr = `[${queryEmbedding.join(',')}]`;

  // Build WHERE clause
  const conditions: string[] = [];
  const params: unknown[] = [embeddingStr, topK, minSimilarity];
  let paramIndex = 4;

  if (jurisdiction) {
    conditions.push(`"jurisdiction" = $${paramIndex}`);
    params.push(jurisdiction);
    paramIndex++;
  }

  if (source) {
    conditions.push(`"source" = $${paramIndex}`);
    params.push(source);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const prisma = getPrismaClient();

  const results = await prisma.$queryRawUnsafe<RAGResult[]>(
    `SELECT
      "id",
      "content",
      "source",
      "jurisdiction",
      "sectionId",
      "title",
      "sourceUrl",
      1 - ("embedding" <=> $1::vector(${EMBEDDING_DIMENSIONS})) as similarity
    FROM "LegalDocument"
    ${whereClause}
    ORDER BY "embedding" <=> $1::vector(${EMBEDDING_DIMENSIONS})
    LIMIT $2`,
    ...params,
  );

  // Filter by minimum similarity
  const filtered = results.filter((r) => r.similarity >= minSimilarity);

  logger.debug(
    { resultCount: filtered.length, topSimilarity: filtered[0]?.similarity },
    'RAG: search complete',
  );

  return filtered;
}

/**
 * Check if the legal knowledge base has been populated.
 */
export async function isKnowledgeBasePopulated(): Promise<boolean> {
  const prisma = getPrismaClient();
  const count = await prisma.legalDocument.count();
  return count > 0;
}
