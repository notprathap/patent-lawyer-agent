/**
 * Ingest UK patent law documents into the vector DB.
 * Sources: UK Patents Act 1977 (legislation.gov.uk), key UK cases (BAILII).
 */
import dotenv from 'dotenv';
dotenv.config();

import { fetchWithCache } from './lib/fetcher.js';
import { htmlToText, xmlToText, htmlToTextFromSelector } from './lib/parser.js';
import { chunkText } from './lib/chunker.js';
import { embedAndStore, type DocumentToEmbed } from './lib/embedder.js';

// UK Patents Act 1977 — key sections via legislation.gov.uk
const UK_STATUTES = [
  { section: 's1', url: 'https://www.legislation.gov.uk/ukpga/1977/37/section/1', title: 'UK Patents Act 1977, Section 1 — Patentable Inventions' },
  { section: 's2', url: 'https://www.legislation.gov.uk/ukpga/1977/37/section/2', title: 'UK Patents Act 1977, Section 2 — Novelty' },
  { section: 's3', url: 'https://www.legislation.gov.uk/ukpga/1977/37/section/3', title: 'UK Patents Act 1977, Section 3 — Inventive Step' },
  { section: 's4', url: 'https://www.legislation.gov.uk/ukpga/1977/37/section/4', title: 'UK Patents Act 1977, Section 4 — Industrial Application' },
  { section: 's4A', url: 'https://www.legislation.gov.uk/ukpga/1977/37/section/4A', title: 'UK Patents Act 1977, Section 4A — Methods of Treatment or Diagnosis' },
  { section: 's14', url: 'https://www.legislation.gov.uk/ukpga/1977/37/section/14', title: 'UK Patents Act 1977, Section 14 — Making of Application' },
];

// Key UK patent cases from BAILII
const UK_CASES = [
  {
    id: 'pozzoli_v_bdmo',
    url: 'https://www.bailii.org/ew/cases/EWCA/Civ/2007/588.html',
    title: 'Pozzoli SpA v BDMO SA [2007] EWCA Civ 588 — Inventive Step (Pozzoli Test)',
  },
  {
    id: 'aerotel_macrossan',
    url: 'https://www.bailii.org/ew/cases/EWCA/Civ/2006/1371.html',
    title: 'Aerotel Ltd v Telco Holdings / Macrossan [2006] EWCA Civ 1371 — Excluded Subject Matter',
  },
  {
    id: 'actavis_v_eli_lilly',
    url: 'https://www.bailii.org/uk/cases/UKSC/2017/48.html',
    title: 'Actavis UK Ltd v Eli Lilly & Co [2017] UKSC 48 — Claim Construction & Equivalents',
  },
];

export async function ingestUK(): Promise<number> {
  console.log('\n🇬🇧 Ingesting UK patent law documents...\n');
  const documents: DocumentToEmbed[] = [];

  // Ingest UK statutes from legislation.gov.uk
  for (const statute of UK_STATUTES) {
    try {
      const html = await fetchWithCache(statute.url);
      const text = htmlToTextFromSelector(html, '#content, .LegClearFix, article, .legislation-body') || htmlToText(html);

      if (text.length < 30) {
        console.log(`  [warn] Short text for ${statute.title}`);
        continue;
      }

      const chunks = chunkText(text);
      documents.push({
        source: 'UK_Patents_Act',
        jurisdiction: 'UK',
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

  // Ingest UK case law from BAILII
  for (const caseInfo of UK_CASES) {
    try {
      const html = await fetchWithCache(caseInfo.url);
      const text = htmlToText(html);

      if (text.length < 100) {
        console.log(`  [warn] Short text for ${caseInfo.title}`);
        continue;
      }

      // Prepend case metadata to each chunk
      const chunks = chunkText(text).map((c) => ({
        ...c,
        text: `[${caseInfo.title}]\n\n${c.text}`,
      }));

      documents.push({
        source: 'UK_Case_Law',
        jurisdiction: 'UK',
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

  const totalStored = await embedAndStore(documents);
  console.log(`\n✅ UK ingestion complete: ${totalStored} chunks stored\n`);
  return totalStored;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ingestUK()
    .then((count) => { console.log(`Done: ${count} chunks`); process.exit(0); })
    .catch((err) => { console.error('Ingestion failed:', err); process.exit(1); });
}
