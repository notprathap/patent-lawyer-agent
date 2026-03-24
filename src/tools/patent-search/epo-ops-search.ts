import { z } from 'zod/v4';
import { XMLParser } from 'fast-xml-parser';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import type { ToolDefinition } from '../../agents/agent-loop.js';

// ---------------------------------------------------------------------------
// EPO Open Patent Services (OPS) API v3.2
// Docs: https://developers.epo.org/
// Auth: OAuth2 client_credentials
// Response: XML (parsed with fast-xml-parser)
// ---------------------------------------------------------------------------

const EPO_AUTH_URL = 'https://ops.epo.org/3.2/auth/accesstoken';
const EPO_SEARCH_URL = 'https://ops.epo.org/3.2/rest-services/published-data/search';

const inputSchema = z.object({
  query: z.string().describe('Search query keywords for patent title'),
  maxResults: z.number().default(10).describe('Maximum results (max 25 per request)'),
});

// Cache the access token with expiry
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  const key = env.EPO_CONSUMER_KEY;
  const secret = env.EPO_CONSUMER_SECRET;

  if (!key || !secret) {
    throw new Error('EPO_CONSUMER_KEY and EPO_CONSUMER_SECRET are required');
  }

  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const credentials = Buffer.from(`${key}:${secret}`).toString('base64');

  const response = await fetch(EPO_AUTH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`EPO auth failed (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return cachedToken.token;
}

export interface EPOSearchResult {
  publicationNumber: string;
  title: string;
  date: string;
  url: string;
}

function parseEPOResponse(xml: string): EPOSearchResult[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
  });

  const parsed = parser.parse(xml);
  const results: EPOSearchResult[] = [];

  try {
    // Navigate the nested XML structure
    const searchResult =
      parsed?.['world-patent-data']?.['biblio-search']?.['search-result'] ??
      parsed?.['world-patent-data']?.['search-result'];

    if (!searchResult) return results;

    // exchange-documents can be an array or single object
    let documents = searchResult?.['exchange-documents']?.['exchange-document'];
    if (!documents) return results;
    if (!Array.isArray(documents)) documents = [documents];

    for (const doc of documents) {
      const biblio = doc?.['bibliographic-data'];
      if (!biblio) continue;

      // Extract publication number
      const pubRef = biblio?.['publication-reference']?.['document-id'];
      let pubNumber = '';
      let date = '';

      if (pubRef) {
        const refs = Array.isArray(pubRef) ? pubRef : [pubRef];
        for (const ref of refs) {
          if (ref?.['@_document-id-type'] === 'epodoc' || !pubNumber) {
            const country = ref?.country || '';
            const docNum = ref?.['doc-number'] || '';
            const kind = ref?.kind || '';
            pubNumber = `${country}${docNum}${kind}`;
            date = ref?.date?.toString() || date;
          }
        }
      }

      // Extract title
      let title = '';
      const titles = biblio?.['invention-title'];
      if (titles) {
        const titleList = Array.isArray(titles) ? titles : [titles];
        // Prefer English title
        for (const t of titleList) {
          if (typeof t === 'string') {
            title = t;
            break;
          }
          if (t?.['@_lang'] === 'en' || !title) {
            title = t?.['#text'] || t?.toString() || '';
          }
        }
      }

      if (pubNumber || title) {
        results.push({
          publicationNumber: pubNumber,
          title,
          date: date ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}` : '',
          url: `https://worldwide.espacenet.com/patent/search?q=pn%3D${pubNumber}`,
        });
      }
    }
  } catch (err) {
    logger.warn({ error: err }, 'EPO OPS: error parsing XML response');
  }

  return results;
}

async function executeEPOSearch(input: {
  query: string;
  maxResults: number;
}): Promise<EPOSearchResult[]> {
  if (!env.EPO_CONSUMER_KEY || !env.EPO_CONSUMER_SECRET) {
    return [{
      publicationNumber: '',
      title: 'EPO search unavailable',
      date: '',
      url: '',
    }];
  }

  const token = await getAccessToken();

  // Build CQL query — search by title keywords
  const cqlQuery = `ti="${input.query}"`;
  const maxResults = Math.min(input.maxResults, 25);

  const url = new URL(EPO_SEARCH_URL);
  url.searchParams.append('q', cqlQuery);
  url.searchParams.append('Range', `1-${maxResults}`);

  logger.debug({ cqlQuery }, 'EPO OPS: searching');

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/xml',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    // EPO returns 404 when no results are found — this is not an error
    if (response.status === 404 && errorText.includes('EntityNotFound')) {
      logger.debug({ query: input.query }, 'EPO OPS: no results found');
      return [];
    }
    logger.error({ status: response.status, error: errorText }, 'EPO OPS: API error');
    throw new Error(`EPO API error (${response.status}): ${errorText}`);
  }

  const xml = await response.text();
  const results = parseEPOResponse(xml);

  logger.info(
    { query: input.query, resultCount: results.length },
    'EPO OPS: search complete',
  );

  return results;
}

export const epoSearchTool: ToolDefinition = {
  name: 'search_eu_patents',
  description:
    'Search European and international patents via the EPO Open Patent Services API. Returns patent titles, publication numbers, and dates. Use this for finding EU/UK prior art.',
  inputSchema,
  execute: async (input) => {
    const validated = input as z.infer<typeof inputSchema>;
    const results = await executeEPOSearch(validated);
    return JSON.stringify(results, null, 2);
  },
};
