/**
 * Ingest technical prior art knowledge from Semantic Scholar.
 * Fetches landmark papers in domains relevant to deep-tech patent analysis:
 * SPAD, ptychography, acoustic microfluidics, silicon photonics, etc.
 */
import dotenv from 'dotenv';
dotenv.config();

import { chunkText } from './lib/chunker.js';
import { embedAndStore, type DocumentToEmbed } from './lib/embedder.js';

const S2_BASE = 'https://api.semanticscholar.org/graph/v1/paper/search';

interface S2Paper {
  paperId: string;
  title: string;
  abstract: string | null;
  year: number | null;
  citationCount: number;
  externalIds: { DOI?: string } | null;
}

interface S2Response {
  total: number;
  data: S2Paper[];
}

// Technical domains to cover
const DOMAINS = [
  {
    id: 'spad_crosstalk',
    query: 'SPAD array optical crosstalk deep trench isolation single photon avalanche diode',
    label: 'SPAD Arrays & Optical Crosstalk',
  },
  {
    id: 'lensless_imaging',
    query: 'lensless computational imaging ptychography phase retrieval microscopy',
    label: 'Lensless Imaging & Ptychography',
  },
  {
    id: 'acoustic_microfluidics',
    query: 'acoustic radiation force microfluidics cell focusing acoustofluidics',
    label: 'Acoustic Microfluidics',
  },
  {
    id: 'silicon_photonics',
    query: 'silicon photonic waveguide thermo-optic compensation athermal design',
    label: 'Silicon Photonics & Thermo-Optic Effects',
  },
  {
    id: 'lab_on_chip_cmos',
    query: 'lab on chip CMOS biosensor monolithic integration biological',
    label: 'Lab-on-Chip CMOS Biosensors',
  },
  {
    id: 'spectral_unmixing_flim',
    query: 'spectral unmixing fluorescence lifetime imaging FLIM phasor',
    label: 'Spectral Unmixing & FLIM',
  },
  {
    id: 'ghost_cytometry',
    query: 'ghost cytometry computational cell classification machine learning',
    label: 'Ghost Cytometry',
  },
  {
    id: 'deformability_cytometry',
    query: 'deformability cytometry microfluidic cell mechanical properties',
    label: 'Deformability Cytometry',
  },
  {
    id: 'flow_cytometry_miniaturization',
    query: 'miniaturized flow cytometer microchip portable point of care',
    label: 'Flow Cytometry Miniaturization',
  },
  {
    id: 'metasurface_biosensing',
    query: 'metasurface biosensing silicon photonic wavelength filtering',
    label: 'Metasurface Biosensing',
  },
];

async function fetchPapers(query: string, limit: number = 8): Promise<S2Paper[]> {
  const url = new URL(S2_BASE);
  url.searchParams.append('query', query);
  url.searchParams.append('fields', 'title,abstract,year,citationCount,externalIds');
  url.searchParams.append('limit', String(limit));
  url.searchParams.append('sort', 'citationCount:desc');

  // Retry with backoff for rate limiting
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });

    if (response.status === 429) {
      const waitMs = (attempt + 1) * 3000;
      console.log(`    [rate limited] waiting ${waitMs / 1000}s...`);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }

    if (!response.ok) {
      console.error(`    [error] Semantic Scholar ${response.status}`);
      return [];
    }

    const data = (await response.json()) as S2Response;
    return data.data.filter((p) => p.abstract && p.abstract.length > 50);
  }

  return [];
}

export async function ingestTechnical(): Promise<number> {
  console.log('\n🔬 Ingesting technical prior art knowledge...\n');
  const documents: DocumentToEmbed[] = [];

  for (const domain of DOMAINS) {
    console.log(`  [searching] ${domain.label}...`);

    const papers = await fetchPapers(domain.query);

    if (papers.length === 0) {
      console.log(`    [warn] No papers found for ${domain.label}`);
      continue;
    }

    // Create a single document per domain with all paper abstracts
    const paperTexts = papers.map((p) => {
      const doi = p.externalIds?.DOI ? `DOI: ${p.externalIds.DOI}` : '';
      return `Title: ${p.title}\nYear: ${p.year || 'Unknown'}\nCitations: ${p.citationCount}\n${doi}\n\nAbstract: ${p.abstract}`;
    });

    const combinedText = `TECHNICAL PRIOR ART: ${domain.label}\n\nThe following are key publications in the field of ${domain.label}. This represents the state of the art as known to a Person Skilled in the Art (PHOSITA).\n\n${paperTexts.join('\n\n---\n\n')}`;

    const chunks = chunkText(combinedText);

    documents.push({
      source: 'technical_prior_art',
      jurisdiction: 'ALL',
      sectionId: domain.id,
      title: `Technical Prior Art: ${domain.label}`,
      chunks,
    });

    console.log(`    [parsed] ${papers.length} papers → ${chunks.length} chunks`);

    // Throttle between domains to avoid Semantic Scholar rate limits
    await new Promise((r) => setTimeout(r, 2000));
  }

  const totalStored = await embedAndStore(documents);
  console.log(`\n✅ Technical prior art ingestion complete: ${totalStored} chunks stored\n`);
  return totalStored;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ingestTechnical()
    .then((count) => { console.log(`Done: ${count} chunks`); process.exit(0); })
    .catch((err) => { console.error('Ingestion failed:', err); process.exit(1); });
}
