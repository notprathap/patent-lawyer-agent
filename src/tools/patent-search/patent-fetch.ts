import { z } from 'zod/v4';
import { logger } from '../../utils/logger.js';
import type { ToolDefinition } from '../../agents/agent-loop.js';

// ---------------------------------------------------------------------------
// fetch_patent_by_number — best-effort retrieval of a single patent record
// for FTO claim mapping. Uses Google Patents' public landing page (no API
// key required) plus light HTML scraping for title/abstract/claims.
//
// This is intentionally low-fidelity: it returns whatever bibliographic
// fields we can confidently extract. The claim text it returns is not
// guaranteed to be complete; it is a starting point for the agent to map
// product features against. The agent should treat the response as a hint,
// not a definitive transcript.
// ---------------------------------------------------------------------------

const inputSchema = z.object({
  publicationNumber: z
    .string()
    .min(3)
    .describe('A patent publication number (e.g., "US10123456B2", "EP1234567A1", "WO2020123456A1").'),
});

export interface PatentFetchResult {
  publicationNumber: string;
  title: string;
  abstract: string;
  claimsText: string;        // best-effort — first independent claim usually present
  url: string;
  jurisdictionHint: 'US' | 'EU' | 'UK' | 'Other';
  source: 'Google_Patents';
  fetchedAt: string;
  // Set when the fetch produced a degraded result (HTTP error, anti-bot page,
  // or unparseable HTML). Agents can branch on this to avoid silently treating
  // empty claim text as "no claims to map against".
  fetchFailed?: boolean;
  fetchError?: string;
}

function jurisdictionFromPubNumber(pn: string): 'US' | 'EU' | 'UK' | 'Other' {
  const cc = pn.trim().toUpperCase().slice(0, 2);
  if (cc === 'US') return 'US';
  if (cc === 'EP') return 'EU';
  if (cc === 'GB') return 'UK';
  return 'Other';
}

async function executePatentFetch(input: z.infer<typeof inputSchema>): Promise<PatentFetchResult> {
  const pn = input.publicationNumber.trim().replace(/\s+/g, '').toUpperCase();
  const url = `https://patents.google.com/patent/${pn}/en`;

  logger.debug({ publicationNumber: pn }, 'Patent fetch: requesting Google Patents page');

  const response = await fetch(url, {
    headers: {
      // Google Patents serves a minimal landing page to default user agents
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
    },
  });

  if (!response.ok) {
    logger.warn(
      { publicationNumber: pn, status: response.status },
      'Patent fetch: Google Patents returned non-OK status',
    );
    return {
      publicationNumber: pn,
      title: `Patent ${pn} (fetch failed: HTTP ${response.status})`,
      abstract: '',
      claimsText: '',
      url,
      jurisdictionHint: jurisdictionFromPubNumber(pn),
      source: 'Google_Patents',
      fetchedAt: new Date().toISOString(),
      fetchFailed: true,
      fetchError: `HTTP ${response.status}`,
    };
  }

  const html = await response.text();

  // Very light extraction — Google Patents puts metadata in <meta> tags and
  // claim text in a <section itemprop="claims"> element. We avoid pulling in
  // a heavy DOM parser by using narrow regexes; the agent ultimately interprets
  // whatever we return.
  const title = pickMeta(html, 'DC.title') || pickMeta(html, 'og:title') || '';
  const abstract = pickMeta(html, 'DC.description') || pickAbstract(html);
  const claimsText = extractClaimsText(html);

  // If we extracted nothing useful, treat as a soft failure so the agent knows.
  const cleanedClaims = cleanWhitespace(claimsText);
  const cleanedTitle = cleanWhitespace(title);
  const fetchFailed = !cleanedTitle && !cleanedClaims;
  if (fetchFailed) {
    logger.warn({ publicationNumber: pn }, 'Patent fetch: parsed page yielded no title or claims');
  }

  return {
    publicationNumber: pn,
    title: cleanedTitle,
    abstract: cleanWhitespace(abstract),
    claimsText: cleanedClaims.slice(0, 8000),
    url,
    jurisdictionHint: jurisdictionFromPubNumber(pn),
    source: 'Google_Patents',
    fetchedAt: new Date().toISOString(),
    ...(fetchFailed ? { fetchFailed: true, fetchError: 'No parseable content found' } : {}),
  };
}

function pickMeta(html: string, name: string): string {
  const re = new RegExp(
    `<meta[^>]+(?:name|property)="${name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}"[^>]+content="([^"]+)"`,
    'i',
  );
  const m = html.match(re);
  return m?.[1] ?? '';
}

function pickAbstract(html: string): string {
  const m = html.match(/<section[^>]+itemprop="abstract"[^>]*>([\s\S]*?)<\/section>/i);
  if (m?.[1]) return stripTags(m[1]);
  return '';
}

function extractClaimsText(html: string): string {
  const m = html.match(/<section[^>]+itemprop="claims"[^>]*>([\s\S]*?)<\/section>/i);
  if (m?.[1]) return stripTags(m[1]);
  // Fallback: grab any element with class containing "claims"
  const m2 = html.match(/<(?:div|section)[^>]*class="[^"]*claims?[^"]*"[^>]*>([\s\S]*?)<\/(?:div|section)>/i);
  if (m2?.[1]) return stripTags(m2[1]);
  return '';
}

function stripTags(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

function cleanWhitespace(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export const patentFetchTool: ToolDefinition = {
  name: 'fetch_patent_by_number',
  description:
    'Fetch the title, abstract, and best-effort claim text for a single patent by its publication number (e.g., "US10123456B2", "EP1234567A1"). Source: Google Patents landing page. Use this when the user has provided specific patents to clear against, or to retrieve the full claim text for a candidate blocker found via search.',
  inputSchema,
  execute: async (input) => {
    const validated = input as z.infer<typeof inputSchema>;
    const result = await executePatentFetch(validated);
    return JSON.stringify(result, null, 2);
  },
};
