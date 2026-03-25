/**
 * Run all ingestion scripts to hydrate the legal knowledge vector DB.
 * Usage: npx tsx scripts/ingest-all.ts
 */
import dotenv from 'dotenv';
dotenv.config();

import { ingestUS } from './ingest-us.js';
import { ingestEU } from './ingest-eu.js';
import { ingestUK } from './ingest-uk.js';
import { ingestLegalAdvanced } from './ingest-legal-advanced.js';
import { ingestTechnical } from './ingest-technical.js';
import { disconnectPrisma } from '../src/db/client.js';

async function main() {
  console.log('='.repeat(60));
  console.log('KNOWLEDGE BASE INGESTION (Legal + Technical)');
  console.log('='.repeat(60));

  const startTime = Date.now();
  let totalChunks = 0;

  try {
    // Layer 1: Core legal frameworks
    totalChunks += await ingestUS();
    totalChunks += await ingestEU();
    totalChunks += await ingestUK();

    // Layer 2: Specialized legal knowledge (Comvik, G 2/21, Thaler, enablement)
    totalChunks += await ingestLegalAdvanced();

    // Layer 3: Technical prior art (SPAD, ptychography, acoustofluidics, etc.)
    totalChunks += await ingestTechnical();

    const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('='.repeat(60));
    console.log(`INGESTION COMPLETE`);
    console.log(`  Total chunks: ${totalChunks}`);
    console.log(`  Duration: ${durationSec}s`);
    console.log('='.repeat(60));
  } finally {
    await disconnectPrisma();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Ingestion failed:', err);
    process.exit(1);
  });
