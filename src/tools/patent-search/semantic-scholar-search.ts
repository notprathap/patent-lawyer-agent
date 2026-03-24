import { z } from 'zod/v4';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import type { ToolDefinition } from '../../agents/agent-loop.js';

// ---------------------------------------------------------------------------
// Semantic Scholar Academic Graph API
// Docs: https://www.semanticscholar.org/product/api
// Rate limit: 1000 req/sec shared (unauthenticated), 1 req/sec (with key)
// ---------------------------------------------------------------------------

const S2_BASE = 'https://api.semanticscholar.org/graph/v1/paper/search';

const inputSchema = z.object({
  query: z.string().describe('Search query for academic papers'),
  maxResults: z.number().default(10).describe('Maximum results to return (max 100)'),
});

interface S2Author {
  authorId: string;
  name: string;
}

interface S2Paper {
  paperId: string;
  title: string;
  abstract: string | null;
  authors: S2Author[];
  year: number | null;
  citationCount: number;
  publicationVenue: { name: string } | null;
  openAccessPdf: { url: string } | null;
  externalIds: { DOI?: string; ArXiv?: string } | null;
}

interface S2Response {
  total: number;
  offset: number;
  data: S2Paper[];
}

export interface SemanticScholarResult {
  paperId: string;
  title: string;
  abstract: string;
  authors: string;
  year: number | null;
  citationCount: number;
  venue: string;
  url: string;
  doi: string;
}

async function executeSemanticScholarSearch(input: {
  query: string;
  maxResults: number;
}): Promise<SemanticScholarResult[]> {
  const url = new URL(S2_BASE);
  url.searchParams.append('query', input.query);
  url.searchParams.append(
    'fields',
    'title,abstract,authors,year,citationCount,publicationVenue,openAccessPdf,externalIds',
  );
  url.searchParams.append('limit', String(Math.min(input.maxResults, 100)));

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (env.SEMANTIC_SCHOLAR_API_KEY) {
    headers['x-api-key'] = env.SEMANTIC_SCHOLAR_API_KEY;
  }

  logger.debug({ query: input.query }, 'Semantic Scholar: searching');

  // Retry with backoff for rate limiting (429)
  let response: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    response = await fetch(url.toString(), { method: 'GET', headers });
    if (response.status !== 429) break;
    const waitMs = (attempt + 1) * 2000;
    logger.debug({ attempt, waitMs }, 'Semantic Scholar: rate limited, retrying');
    await new Promise((r) => setTimeout(r, waitMs));
  }

  if (!response || !response.ok) {
    const errorText = response ? await response.text() : 'No response';
    const status = response?.status || 0;
    // Return empty results on rate limit rather than crashing the agent
    if (status === 429) {
      logger.warn({ query: input.query }, 'Semantic Scholar: rate limited after retries, returning empty');
      return [];
    }
    logger.error({ status, error: errorText }, 'Semantic Scholar: API error');
    throw new Error(`Semantic Scholar API error (${status}): ${errorText}`);
  }

  const data = (await response.json()) as S2Response;

  const results: SemanticScholarResult[] = data.data.map((paper) => ({
    paperId: paper.paperId,
    title: paper.title,
    abstract: paper.abstract || '',
    authors: paper.authors.map((a) => a.name).join(', '),
    year: paper.year,
    citationCount: paper.citationCount,
    venue: paper.publicationVenue?.name || '',
    url:
      paper.openAccessPdf?.url ||
      (paper.externalIds?.DOI ? `https://doi.org/${paper.externalIds.DOI}` : '') ||
      `https://www.semanticscholar.org/paper/${paper.paperId}`,
    doi: paper.externalIds?.DOI || '',
  }));

  logger.info(
    { query: input.query, resultCount: results.length, totalHits: data.total },
    'Semantic Scholar: search complete',
  );

  return results;
}

export const semanticScholarSearchTool: ToolDefinition = {
  name: 'search_academic_papers',
  description:
    'Search academic papers and non-patent literature via Semantic Scholar. Returns paper titles, abstracts, authors, citation counts, and URLs. Use this for finding non-patent prior art (journals, conference papers, preprints).',
  inputSchema,
  execute: async (input) => {
    const validated = input as z.infer<typeof inputSchema>;
    const results = await executeSemanticScholarSearch(validated);
    return JSON.stringify(results, null, 2);
  },
};
