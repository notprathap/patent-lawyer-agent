import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = resolve(__dirname, '..', 'cache');

// Ensure cache directory exists
if (!existsSync(CACHE_DIR)) {
  mkdirSync(CACHE_DIR, { recursive: true });
}

/**
 * Fetch a URL with local file caching and retry logic.
 */
export async function fetchWithCache(
  url: string,
  options?: { maxRetries?: number; headers?: Record<string, string> },
): Promise<string> {
  const { maxRetries = 3, headers = {} } = options ?? {};

  // Check cache first
  const cacheKey = createHash('md5').update(url).digest('hex');
  const cachePath = resolve(CACHE_DIR, `${cacheKey}.html`);

  if (existsSync(cachePath)) {
    console.log(`  [cache hit] ${url.slice(0, 80)}`);
    return readFileSync(cachePath, 'utf-8');
  }

  // Fetch with retry
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`  [fetching] ${url.slice(0, 80)}${attempt > 0 ? ` (attempt ${attempt + 1})` : ''}`);

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'PatentLawyerAgent/1.0 (legal-research)',
          ...headers,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const text = await response.text();

      // Cache the result
      writeFileSync(cachePath, text, 'utf-8');

      return text;
    } catch (err) {
      if (attempt === maxRetries - 1) throw err;
      const waitMs = (attempt + 1) * 2000;
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }

  throw new Error(`Failed to fetch ${url} after ${maxRetries} attempts`);
}
