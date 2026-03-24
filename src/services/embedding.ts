import { logger } from '../utils/logger.js';

// Local embedding model — no API calls, no rate limits, no cost
const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';
export const EMBEDDING_DIMENSIONS = 384;

// Lazy-loaded pipeline — typed as `any` because the HF transformers pipeline return type is complex
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pipelineInstance: any = null;

async function getPipeline() {
  if (!pipelineInstance) {
    logger.info({ model: MODEL_NAME }, 'Loading local embedding model (first time only)...');
    const { pipeline } = await import('@huggingface/transformers');
    pipelineInstance = await pipeline('feature-extraction', MODEL_NAME, {
      dtype: 'fp32',
    });
    logger.info('Local embedding model loaded');
  }
  return pipelineInstance;
}

/**
 * Embed a single text string using local model.
 */
export async function embedText(text: string): Promise<number[]> {
  const results = await embedTexts([text]);
  return results[0];
}

/**
 * Embed multiple texts using local model.
 * No rate limits, no API calls — runs entirely on CPU.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const pipe = await getPipeline();
  const allEmbeddings: number[][] = [];

  // Process in small batches to avoid memory issues
  const batchSize = 16;
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);

    if (texts.length > batchSize) {
      logger.debug(
        { batch: `${i + 1}-${Math.min(i + batchSize, texts.length)}/${texts.length}` },
        'Embedding batch (local)',
      );
    }

    for (const text of batch) {
      // Truncate to model's max length (~256 tokens ≈ ~1200 chars for safety)
      const truncated = text.slice(0, 1200);
      const output = await pipe(truncated, { pooling: 'mean', normalize: true });

      // output.data is a Float32Array — convert to number[]
      const embedding = Array.from(output.data as Float32Array).slice(0, EMBEDDING_DIMENSIONS);
      allEmbeddings.push(embedding);
    }
  }

  return allEmbeddings;
}
