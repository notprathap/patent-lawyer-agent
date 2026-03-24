import { z } from 'zod/v4';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import type { ToolDefinition } from '../../agents/agent-loop.js';

// ---------------------------------------------------------------------------
// USPTO PatentsView API v1
// Docs: https://search.patentsview.org/docs/
// Rate limit: 45 requests/minute with API key
// ---------------------------------------------------------------------------

const PATENTSVIEW_BASE = 'https://search.patentsview.org/api/v1/patent/';

const inputSchema = z.object({
  query: z.string().describe('Search query keywords for patent title and abstract'),
  maxResults: z.number().default(10).describe('Maximum number of results to return (max 100)'),
});

interface PatentsViewResult {
  patent_id: string;
  patent_number: string;
  patent_title: string;
  patent_abstract: string;
  patent_date: string;
}

interface PatentsViewResponse {
  error: boolean;
  count: number;
  total_hits: number;
  patents: PatentsViewResult[];
}

export interface USPTOSearchResult {
  patentId: string;
  patentNumber: string;
  title: string;
  abstract: string;
  date: string;
  url: string;
}

async function executeUSPTOSearch(input: {
  query: string;
  maxResults: number;
}): Promise<USPTOSearchResult[]> {
  const apiKey = env.PATENTSVIEW_API_KEY;
  if (!apiKey) {
    return [{
      patentId: '',
      patentNumber: '',
      title: 'USPTO search unavailable',
      abstract: 'PATENTSVIEW_API_KEY is not configured. Register at https://search.patentsview.org/',
      date: '',
      url: '',
    }];
  }

  const url = new URL(PATENTSVIEW_BASE);

  // PatentsView uses _text_any for keyword search across title + abstract
  const q = {
    _or: [
      { patent_title: { _text_any: input.query } },
      { patent_abstract: { _text_any: input.query } },
    ],
  };

  url.searchParams.append('q', JSON.stringify(q));
  url.searchParams.append(
    'f',
    JSON.stringify([
      'patent_id',
      'patent_title',
      'patent_abstract',
      'patent_date',
      'patent_number',
    ]),
  );
  url.searchParams.append('o', JSON.stringify({ size: Math.min(input.maxResults, 100) }));

  logger.debug({ query: input.query }, 'USPTO PatentsView: searching');

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'X-Api-Key': apiKey },
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error({ status: response.status, error: errorText }, 'USPTO PatentsView: API error');
    throw new Error(`USPTO API error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as PatentsViewResponse;

  if (data.error) {
    throw new Error('USPTO PatentsView returned an error response');
  }

  const results: USPTOSearchResult[] = (data.patents || []).map((p) => ({
    patentId: p.patent_id,
    patentNumber: p.patent_number,
    title: p.patent_title || '',
    abstract: p.patent_abstract || '',
    date: p.patent_date || '',
    url: `https://patents.google.com/patent/US${p.patent_number?.replace(/,/g, '')}`,
  }));

  logger.info(
    { query: input.query, resultCount: results.length, totalHits: data.total_hits },
    'USPTO PatentsView: search complete',
  );

  return results;
}

export const usptoSearchTool: ToolDefinition = {
  name: 'search_us_patents',
  description:
    'Search US patents via the USPTO PatentsView API. Returns patent titles, abstracts, publication numbers, and dates. Use this for finding US prior art.',
  inputSchema,
  execute: async (input) => {
    const validated = input as z.infer<typeof inputSchema>;
    const results = await executeUSPTOSearch(validated);
    return JSON.stringify(results, null, 2);
  },
};
