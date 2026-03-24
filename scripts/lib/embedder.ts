import { getPrismaClient } from '../../src/db/client.js';
import { embedTexts, EMBEDDING_DIMENSIONS } from '../../src/services/embedding.js';
import type { Chunk } from './chunker.js';

export interface DocumentToEmbed {
  source: string;
  jurisdiction: string;
  sectionId: string;
  title: string;
  sourceUrl?: string;
  chunks: Chunk[];
}

/**
 * Embed and store document chunks in the LegalDocument table with pgvector.
 * Idempotent: deletes existing documents for the same source+sectionId before inserting.
 *
 * Embeds ALL chunks across all documents in a single batch call to minimize API calls
 * (important for staying within Voyage AI's 3 RPM free tier).
 */
export async function embedAndStore(documents: DocumentToEmbed[]): Promise<number> {
  const prisma = getPrismaClient();

  // Collect all chunks into a flat list with metadata
  const allChunks: Array<{
    text: string;
    doc: DocumentToEmbed;
    chunk: Chunk;
  }> = [];

  for (const doc of documents) {
    for (const chunk of doc.chunks) {
      allChunks.push({ text: chunk.text, doc, chunk });
    }
  }

  if (allChunks.length === 0) return 0;

  console.log(`  [embedding] ${allChunks.length} total chunks across ${documents.length} documents`);

  // Embed all chunks in one call (embedTexts handles batching + rate limiting internally)
  const embeddings = await embedTexts(allChunks.map((c) => c.text));

  console.log(`  [storing] Writing ${allChunks.length} chunks to pgvector...`);

  // Delete existing documents for all sources being ingested (idempotent)
  const deletedSections = new Set<string>();
  for (const doc of documents) {
    const key = `${doc.source}|${doc.sectionId}`;
    if (!deletedSections.has(key)) {
      await prisma.$executeRawUnsafe(
        `DELETE FROM "LegalDocument" WHERE "source" = $1 AND "sectionId" = $2`,
        doc.source,
        doc.sectionId,
      );
      deletedSections.add(key);
    }
  }

  // Insert all chunks with embeddings
  for (let i = 0; i < allChunks.length; i++) {
    const { doc, chunk } = allChunks[i];
    const embedding = embeddings[i];
    const id = `${doc.source}_${doc.sectionId}_${chunk.index}`;
    const embeddingStr = `[${embedding.join(',')}]`;

    await prisma.$executeRawUnsafe(
      `INSERT INTO "LegalDocument" ("id", "content", "source", "jurisdiction", "sectionId", "title", "sourceUrl", "metadata", "embedding")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::vector(${EMBEDDING_DIMENSIONS}))
       ON CONFLICT ("source", "sectionId", "title") DO UPDATE SET
         "content" = EXCLUDED."content",
         "embedding" = EXCLUDED."embedding",
         "metadata" = EXCLUDED."metadata"`,
      id,
      chunk.text,
      doc.source,
      doc.jurisdiction,
      doc.sectionId,
      `${doc.title} [chunk ${chunk.index}]`,
      doc.sourceUrl || null,
      JSON.stringify({ chunkIndex: chunk.index, totalChunks: doc.chunks.length }),
      embeddingStr,
    );
  }

  console.log(`  [done] ${allChunks.length} chunks stored`);
  return allChunks.length;
}
