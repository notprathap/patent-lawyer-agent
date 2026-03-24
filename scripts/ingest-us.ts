/**
 * Ingest US patent law documents into the vector DB.
 * Sources: 35 U.S.C. key sections + SCOTUS landmark cases from Justia.
 */
import dotenv from 'dotenv';
dotenv.config();

import { fetchWithCache } from './lib/fetcher.js';
import { htmlToText, htmlToTextFromSelector } from './lib/parser.js';
import { chunkText } from './lib/chunker.js';
import { embedAndStore, type DocumentToEmbed } from './lib/embedder.js';

// Key 35 U.S.C. sections from Cornell LII
const US_STATUTES = [
  { section: '101', url: 'https://www.law.cornell.edu/uscode/text/35/101', title: '35 U.S.C. § 101 — Patentable Subject Matter' },
  { section: '102', url: 'https://www.law.cornell.edu/uscode/text/35/102', title: '35 U.S.C. § 102 — Novelty / Anticipation' },
  { section: '103', url: 'https://www.law.cornell.edu/uscode/text/35/103', title: '35 U.S.C. § 103 — Obviousness' },
  { section: '112', url: 'https://www.law.cornell.edu/uscode/text/35/112', title: '35 U.S.C. § 112 — Specification / Claims' },
];

// Landmark SCOTUS patent cases from Justia
const US_CASES = [
  { id: 'graham_v_john_deere', url: 'https://supreme.justia.com/cases/federal/us/383/1/', title: 'Graham v. John Deere Co. (1966) — Obviousness Four-Factor Test' },
  { id: 'ksr_v_teleflex', url: 'https://supreme.justia.com/cases/federal/us/550/398/', title: 'KSR International Co. v. Teleflex Inc. (2007) — Obviousness Rationales' },
  { id: 'alice_v_cls_bank', url: 'https://supreme.justia.com/cases/federal/us/573/208/', title: 'Alice Corp. v. CLS Bank International (2014) — Abstract Ideas' },
  { id: 'mayo_v_prometheus', url: 'https://supreme.justia.com/cases/federal/us/566/66/', title: 'Mayo Collaborative Services v. Prometheus Laboratories (2012) — Laws of Nature' },
];

export async function ingestUS(): Promise<number> {
  console.log('\n📜 Ingesting US patent law documents...\n');
  const documents: DocumentToEmbed[] = [];

  // Ingest statutes
  for (const statute of US_STATUTES) {
    try {
      const html = await fetchWithCache(statute.url);
      const text = htmlToTextFromSelector(html, '#content, .field-items, article, main') || htmlToText(html);

      if (text.length < 50) {
        console.log(`  [warn] Short text for ${statute.title}, using full page`);
        continue;
      }

      const chunks = chunkText(text);
      documents.push({
        source: '35_USC',
        jurisdiction: 'US',
        sectionId: statute.section,
        title: statute.title,
        sourceUrl: statute.url,
        chunks,
      });
      console.log(`  [parsed] ${statute.title} → ${chunks.length} chunks`);
    } catch (err) {
      console.error(`  [error] Failed to ingest ${statute.title}:`, err);
    }
  }

  // Ingest SCOTUS cases
  for (const caseInfo of US_CASES) {
    try {
      const html = await fetchWithCache(caseInfo.url);
      const text = htmlToTextFromSelector(html, '#opinion, .opinion, #tab-opinion, main article') || htmlToText(html);

      if (text.length < 100) {
        console.log(`  [warn] Short text for ${caseInfo.title}, skipping`);
        continue;
      }

      // Prepend case metadata to each chunk for context
      const chunks = chunkText(text).map((c) => ({
        ...c,
        text: `[${caseInfo.title}]\n\n${c.text}`,
      }));

      documents.push({
        source: 'SCOTUS',
        jurisdiction: 'US',
        sectionId: caseInfo.id,
        title: caseInfo.title,
        sourceUrl: caseInfo.url,
        chunks,
      });
      console.log(`  [parsed] ${caseInfo.title} → ${chunks.length} chunks`);
    } catch (err) {
      console.error(`  [error] Failed to ingest ${caseInfo.title}:`, err);
    }
  }

  // Embed and store
  const totalStored = await embedAndStore(documents);
  console.log(`\n✅ US ingestion complete: ${totalStored} chunks stored\n`);
  return totalStored;
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  ingestUS()
    .then((count) => { console.log(`Done: ${count} chunks`); process.exit(0); })
    .catch((err) => { console.error('Ingestion failed:', err); process.exit(1); });
}
