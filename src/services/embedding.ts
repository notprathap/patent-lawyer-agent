import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';
const EMBEDDING_MODEL = 'voyage-3';
export const EMBEDDING_DIMENSIONS = 1024;

interface VoyageEmbeddingResponse {
  data: Array<{ embedding: number[] }>;
  usage: { total_tokens: number };
}

/**
 * Embed a single text string via Voyage AI REST API.
 */
export async function embedText(text: string): Promise<number[]> {
  const results = await embedTexts([text]);
  return results[0];
}

/**
 * Embed multiple texts in a batch via Voyage AI REST API.
 * Max 128 texts per batch.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!env.VOYAGE_API_KEY) {
    throw new Error('VOYAGE_API_KEY is required for embedding operations');
  }

  // Small batches to stay within 10K TPM free tier (legal text chunks are ~500-1000 tokens each)
  const batchSize = 8;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);

    logger.debug(
      { batch: `${i + 1}-${Math.min(i + batchSize, texts.length)}/${texts.length}` },
      'Embedding batch',
    );

    const response = await fetch(VOYAGE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.VOYAGE_API_KEY}`,
      },
      body: JSON.stringify({
        input: batch,
        model: EMBEDDING_MODEL,
      }),
    });

    if (response.status === 429) {
      // Rate limited — wait a full minute and retry
      logger.debug('Embedding: rate limited, waiting 65s...');
      await new Promise((r) => setTimeout(r, 65000));

      const retryResponse = await fetch(VOYAGE_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.VOYAGE_API_KEY}`,
        },
        body: JSON.stringify({ input: batch, model: EMBEDDING_MODEL }),
      });

      if (!retryResponse.ok) {
        const errorText = await retryResponse.text();
        throw new Error(`Voyage AI API error after retry (${retryResponse.status}): ${errorText}`);
      }

      const retryData = (await retryResponse.json()) as VoyageEmbeddingResponse;
      for (const item of retryData.data) {
        allEmbeddings.push(item.embedding);
      }

      // Throttle subsequent requests
      await new Promise((r) => setTimeout(r, 21000));
      continue;
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Voyage AI API error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as VoyageEmbeddingResponse;

    if (!data.data || data.data.length === 0) {
      throw new Error('Voyage AI returned no embeddings');
    }

    for (const item of data.data) {
      allEmbeddings.push(item.embedding);
    }

    // Throttle to stay within 3 RPM free tier (21s between calls)
    if (i + batchSize < texts.length) {
      logger.debug('Embedding: throttling 21s for rate limit...');
      await new Promise((r) => setTimeout(r, 21000));
    }
  }

  return allEmbeddings;
}
