/**
 * Split text into chunks of approximately `maxTokens` tokens (estimated as words * 1.3).
 * Preserves paragraph boundaries where possible.
 */
export interface Chunk {
  text: string;
  index: number;
}

export function chunkText(
  text: string,
  options?: { maxTokens?: number; overlapTokens?: number },
): Chunk[] {
  const { maxTokens = 800, overlapTokens = 100 } = options ?? {};

  // Rough token estimate: 1 token ≈ 0.75 words, so maxTokens * 0.75 words
  const maxWords = Math.floor(maxTokens * 0.75);
  const overlapWords = Math.floor(overlapTokens * 0.75);

  // Split into paragraphs
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 0);

  const chunks: Chunk[] = [];
  let currentWords: string[] = [];
  let chunkIndex = 0;

  for (const para of paragraphs) {
    const paraWords = para.split(/\s+/).filter((w) => w.length > 0);

    // If adding this paragraph exceeds the limit, flush current chunk
    if (currentWords.length + paraWords.length > maxWords && currentWords.length > 0) {
      chunks.push({
        text: currentWords.join(' '),
        index: chunkIndex++,
      });

      // Keep overlap from end of current chunk
      if (overlapWords > 0) {
        currentWords = currentWords.slice(-overlapWords);
      } else {
        currentWords = [];
      }
    }

    // If a single paragraph is too long, split it further
    if (paraWords.length > maxWords) {
      // Flush any accumulated words first
      if (currentWords.length > 0) {
        chunks.push({
          text: currentWords.join(' '),
          index: chunkIndex++,
        });
        currentWords = [];
      }

      // Split the long paragraph into fixed-size chunks
      for (let i = 0; i < paraWords.length; i += maxWords - overlapWords) {
        const slice = paraWords.slice(i, i + maxWords);
        chunks.push({
          text: slice.join(' '),
          index: chunkIndex++,
        });
      }
    } else {
      currentWords.push(...paraWords);
    }
  }

  // Flush remaining
  if (currentWords.length > 0) {
    chunks.push({
      text: currentWords.join(' '),
      index: chunkIndex,
    });
  }

  return chunks;
}
