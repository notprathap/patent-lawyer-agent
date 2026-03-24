/**
 * Ingest EU/EPO patent law documents into the vector DB.
 * Sources: EPC key articles from EPO website.
 */
import dotenv from 'dotenv';
dotenv.config();

import { fetchWithCache } from './lib/fetcher.js';
import { htmlToText, htmlToTextFromSelector } from './lib/parser.js';
import { chunkText } from './lib/chunker.js';
import { embedAndStore, type DocumentToEmbed } from './lib/embedder.js';

// EPC Articles from EPO
const EPC_ARTICLES = [
  { id: 'Art_52', url: 'https://www.epo.org/en/legal/epc/2020/a52.html', title: 'EPC Article 52 — Patentable Inventions' },
  { id: 'Art_54', url: 'https://www.epo.org/en/legal/epc/2020/a54.html', title: 'EPC Article 54 — Novelty' },
  { id: 'Art_56', url: 'https://www.epo.org/en/legal/epc/2020/a56.html', title: 'EPC Article 56 — Inventive Step' },
  { id: 'Art_57', url: 'https://www.epo.org/en/legal/epc/2020/a57.html', title: 'EPC Article 57 — Industrial Application' },
];

// EPO Guidelines Part G (Patentability) — key chapters
const EPO_GUIDELINES = [
  { id: 'G_I', url: 'https://www.epo.org/en/legal/guidelines-epc/2024/g_i.html', title: 'EPO Guidelines Part G, Ch. I — Patentability' },
  { id: 'G_II', url: 'https://www.epo.org/en/legal/guidelines-epc/2024/g_ii.html', title: 'EPO Guidelines Part G, Ch. II — Inventions' },
  { id: 'G_VI', url: 'https://www.epo.org/en/legal/guidelines-epc/2024/g_vi.html', title: 'EPO Guidelines Part G, Ch. VI — Novelty' },
  { id: 'G_VII', url: 'https://www.epo.org/en/legal/guidelines-epc/2024/g_vii.html', title: 'EPO Guidelines Part G, Ch. VII — Inventive Step (Problem-Solution Approach)' },
];

export async function ingestEU(): Promise<number> {
  console.log('\n🇪🇺 Ingesting EU/EPO patent law documents...\n');
  const documents: DocumentToEmbed[] = [];

  // Ingest EPC Articles
  for (const article of EPC_ARTICLES) {
    try {
      const html = await fetchWithCache(article.url);
      const text = htmlToTextFromSelector(html, '.content, article, main, .epc-content') || htmlToText(html);

      if (text.length < 50) {
        console.log(`  [warn] Short text for ${article.title}`);
        continue;
      }

      const chunks = chunkText(text);
      documents.push({
        source: 'EPC',
        jurisdiction: 'EU',
        sectionId: article.id,
        title: article.title,
        sourceUrl: article.url,
        chunks,
      });
      console.log(`  [parsed] ${article.title} → ${chunks.length} chunks`);
    } catch (err) {
      console.error(`  [error] Failed to ingest ${article.title}:`, err);
    }
  }

  // Ingest EPO Guidelines
  for (const guideline of EPO_GUIDELINES) {
    try {
      const html = await fetchWithCache(guideline.url);
      const text = htmlToTextFromSelector(html, '.content, article, main') || htmlToText(html);

      if (text.length < 50) {
        console.log(`  [warn] Short text for ${guideline.title}`);
        continue;
      }

      const chunks = chunkText(text);
      documents.push({
        source: 'EPO_Guidelines',
        jurisdiction: 'EU',
        sectionId: guideline.id,
        title: guideline.title,
        sourceUrl: guideline.url,
        chunks,
      });
      console.log(`  [parsed] ${guideline.title} → ${chunks.length} chunks`);
    } catch (err) {
      console.error(`  [error] Failed to ingest ${guideline.title}:`, err);
    }
  }

  const totalStored = await embedAndStore(documents);
  console.log(`\n✅ EU ingestion complete: ${totalStored} chunks stored\n`);
  return totalStored;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ingestEU()
    .then((count) => { console.log(`Done: ${count} chunks`); process.exit(0); })
    .catch((err) => { console.error('Ingestion failed:', err); process.exit(1); });
}
