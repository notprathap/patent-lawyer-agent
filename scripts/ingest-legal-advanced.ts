/**
 * Ingest specialized legal knowledge for complex patent analysis.
 * Covers: Comvik (mixed HW/SW), G 2/21 (plausibility), Thaler (AI inventorship),
 * enablement, simulation sufficiency.
 */
import dotenv from 'dotenv';
dotenv.config();

import { fetchWithCache } from './lib/fetcher.js';
import { htmlToText } from './lib/parser.js';
import { chunkText } from './lib/chunker.js';
import { embedAndStore, type DocumentToEmbed } from './lib/embedder.js';

// EPO Board of Appeal decisions — specialized case law
const EPO_DECISIONS = [
  {
    id: 'T_641_00_COMVIK',
    url: 'https://www.epo.org/law-practice/case-law-appeals/recent/t000641eu1.html',
    title: 'T 641/00 (COMVIK) — Two Identities / Mixed Technical & Non-Technical Features',
    jurisdiction: 'EU',
    source: 'EPO_Case_Law',
  },
  {
    id: 'T_258_03_Hitachi',
    url: 'https://www.epo.org/law-practice/case-law-appeals/recent/t030258eu1.html',
    title: 'T 258/03 (Hitachi) — Any Technical Means Confers Patentability',
    jurisdiction: 'EU',
    source: 'EPO_Case_Law',
  },
  {
    id: 'G_1_19_Simulations',
    url: 'https://www.epo.org/law-practice/case-law-appeals/recent/g190001ex1.html',
    title: 'G 1/19 — Computer-Implemented Simulations as Patentable Inventions',
    jurisdiction: 'EU',
    source: 'EPO_Case_Law',
  },
  {
    id: 'G_2_21_Plausibility',
    url: 'https://www.epo.org/law-practice/case-law-appeals/recent/g210002ex1.html',
    title: 'G 2/21 — Plausibility Standard for Post-Filed Evidence',
    jurisdiction: 'EU',
    source: 'EPO_Case_Law',
  },
];

// UK Supreme Court / Court of Appeal — specialized decisions
const UK_DECISIONS = [
  {
    id: 'thaler_v_comptroller',
    url: 'https://www.bailii.org/uk/cases/UKSC/2023/49.html',
    title: 'Thaler v Comptroller-General [2023] UKSC 49 — AI Cannot Be Named as Inventor',
    jurisdiction: 'UK',
    source: 'UK_Case_Law',
  },
  {
    id: 'regeneron_v_kymab',
    url: 'https://www.bailii.org/uk/cases/UKSC/2020/27.html',
    title: 'Regeneron v Kymab [2020] UKSC 27 — Sufficiency for Complex Biological Inventions',
    jurisdiction: 'UK',
    source: 'UK_Case_Law',
  },
];

// Static specialized legal content (for topics without easily scrapeable URLs)
const STATIC_LEGAL_CONTENT: DocumentToEmbed[] = [
  {
    source: 'EPO_Case_Law',
    jurisdiction: 'EU',
    sectionId: 'Art_83_Sufficiency',
    title: 'EPC Article 83 — Sufficiency of Disclosure & Simulation Data',
    chunks: chunkText(`EPC Article 83 — Sufficiency of Disclosure

The European patent application shall disclose the invention in a manner sufficiently clear and complete for it to be carried out by a person skilled in the art.

Sufficiency and Simulation/Computational Data:
Under EPO practice, simulation data can satisfy sufficiency of disclosure (Article 83 EPC) if:
1. The simulation model is adequately described and reproducible
2. The simulated results are plausible to a person skilled in the art
3. The skilled person could implement the invention based on the disclosure without undue burden

G 2/21 Plausibility Standard:
The Enlarged Board of Appeal in G 2/21 addressed when post-published evidence can be relied upon. The key holding: a patent applicant may rely on post-published evidence to support a claimed technical effect, provided that the skilled person, having the common general knowledge in mind, would see no reason to consider the effect implausible at the filing date. This is the "ab initio implausibility" standard — the effect need not be proven at filing, only not implausible.

For inventions supported by computational/simulation data:
- High-fidelity physics simulations (FDTD, FEM, CFD) can provide "plausible" evidence of technical effects
- The simulation methodology must be described in sufficient detail
- The skilled person must be able to verify the simulation approach
- Actual experimental validation is not required at the priority date if the simulation is credible

Constructive Reduction to Practice (US equivalent):
Under US patent law, an applicant need not have physically built the invention. A "constructive reduction to practice" occurs when a patent application is filed that satisfies the enablement and written description requirements of 35 U.S.C. § 112(a). Simulation data can constitute constructive reduction to practice if it enables a person skilled in the art to make and use the invention without undue experimentation.`),
  },
  {
    source: 'EPO_Case_Law',
    jurisdiction: 'EU',
    sectionId: 'Comvik_Summary',
    title: 'T 641/00 COMVIK — Summary of Mixed Technical/Non-Technical Feature Analysis',
    chunks: chunkText(`T 641/00 (COMVIK) — Two-Identities Approach for Mixed Inventions

The COMVIK approach (from EPO Board of Appeal decision T 641/00) establishes how the EPO assesses inventive step for claims containing a mixture of technical and non-technical features.

Key Principles:
1. A claim may contain both technical and non-technical features.
2. Only features that contribute to the technical character of the invention are considered when assessing inventive step under Article 56 EPC.
3. Non-technical features (business methods, mathematical methods, aesthetic features) cannot support inventive step on their own.
4. However, a non-technical feature CAN contribute to technical character if it interacts with technical features to produce a technical effect.

Application to Hardware/Software Inventions:
For claims combining hardware apparatus with software algorithms:
- The hardware components (sensors, processors, waveguides, SPAD arrays) are inherently technical.
- Software algorithms are assessed based on whether they produce a "further technical effect" beyond merely running on a computer.
- An algorithm that controls or optimizes hardware behavior (e.g., signal processing, sensor data fusion, crosstalk suppression) HAS technical character.
- An algorithm that merely processes data without technical context (e.g., pure data analytics) may NOT have technical character.

The Comvik approach is combined with the Problem-Solution Approach:
- Step 1: Identify the closest prior art (considering only technical features)
- Step 2: Formulate the objective technical problem (may be influenced by non-technical requirements, but the problem itself must be technical)
- Step 3: Would-could analysis — only technical features count for inventive step

Practical Impact:
For mixed HW/SW patent claims, the claim drafter should:
- Ensure each software/algorithm feature is tied to a specific technical effect
- Frame algorithm steps as producing measurable technical improvements (noise reduction, resolution improvement, speed increase)
- Avoid purely abstract mathematical formulations without hardware context`),
  },
  {
    source: 'MPEP',
    jurisdiction: 'US',
    sectionId: '2164_Enablement',
    title: 'MPEP § 2164 — Enablement Requirement & In re Wands Factors',
    chunks: chunkText(`MPEP § 2164 — The Enablement Requirement (35 U.S.C. § 112(a))

The specification must enable a person skilled in the art to make and use the claimed invention without undue experimentation.

In re Wands Factors for Determining Undue Experimentation:
1. Quantity of experimentation necessary
2. Amount of direction or guidance presented in the specification
3. Presence or absence of working examples
4. Nature of the invention
5. State of the prior art
6. Relative skill of those in the art
7. Predictability or unpredictability of the art
8. Breadth of the claims

Simulation Data and Enablement:
Computational simulation data can satisfy the enablement requirement if:
- The simulation methodology is described with sufficient detail
- The simulation parameters and boundary conditions are specified
- A person skilled in the art could reproduce the simulation results
- The simulation results are consistent with known physical principles
- The breadth of the claims is commensurate with the scope of the simulation

Working examples are not strictly required. Prophetic examples (including simulation results) are acceptable if they are clearly identified as such and are scientifically sound.

For semiconductor/MEMS/photonic inventions:
- FDTD electromagnetic simulations are well-established in the art
- FEM structural/thermal simulations are routine
- CFD microfluidic simulations are accepted
- Multi-physics coupled simulations may require more detailed description
- The specification should describe the simulation tools, mesh parameters, boundary conditions, and validation methodology`),
  },
  {
    source: 'UK_Case_Law',
    jurisdiction: 'UK',
    sectionId: 'Thaler_Summary',
    title: 'Thaler v Comptroller-General — AI Inventorship (Summary)',
    chunks: chunkText(`Thaler v Comptroller-General of Patents [2023] UKSC 49 — AI Inventorship

The UK Supreme Court unanimously held that an artificial intelligence system (DABUS) cannot be named as the inventor on a patent application under the UK Patents Act 1977.

Key Holdings:
1. Section 7(2) Patents Act 1977: A patent may only be granted to a "person" — an AI machine is not a person.
2. Section 13(2): The inventor must be identified as a "person" — DABUS is not a person.
3. An AI system cannot be an "inventor" within the meaning of the Act.
4. The rights to the invention cannot be derived from an AI system to a human applicant.

Implications for AI-Assisted Inventions:
- If a human conceives the invention and uses AI as a tool (like a CAD program or optimizer), the human is the inventor.
- If the human defines the problem, the constraints, and the objective function, and uses AI/optimization tools to find solutions, the human retains inventorship.
- The distinction is between AI as inventor (not allowed) vs AI as tool (allowed).
- Using LLMs as middleware orchestrators, Bayesian optimization, or gradient descent solvers falls within the "AI as tool" category.

EPO Position:
The EPO's Enlarged Board of Appeal has indicated that only natural persons can be designated as inventors (EPO Guidelines A-III 5.3). The designation "DABUS" was refused.

US Position:
In Thaler v. Vidal (Fed. Cir. 2022), the US Federal Circuit similarly held that an AI cannot be an inventor under 35 U.S.C. § 100(f), which defines "inventor" as an "individual."`),
  },
];

export async function ingestLegalAdvanced(): Promise<number> {
  console.log('\n⚖️  Ingesting specialized legal knowledge...\n');
  const documents: DocumentToEmbed[] = [...STATIC_LEGAL_CONTENT];

  // Fetch EPO decisions
  for (const decision of EPO_DECISIONS) {
    try {
      const html = await fetchWithCache(decision.url);
      const text = htmlToText(html);

      if (text.length < 100) {
        console.log(`  [warn] Short text for ${decision.title}`);
        continue;
      }

      const chunks = chunkText(text).map((c) => ({
        ...c,
        text: `[${decision.title}]\n\n${c.text}`,
      }));

      documents.push({
        source: decision.source,
        jurisdiction: decision.jurisdiction,
        sectionId: decision.id,
        title: decision.title,
        sourceUrl: decision.url,
        chunks,
      });
      console.log(`  [parsed] ${decision.title} → ${chunks.length} chunks`);
    } catch (err) {
      console.error(`  [error] Failed to ingest ${decision.title}:`, err);
    }
  }

  // Fetch UK decisions
  for (const decision of UK_DECISIONS) {
    try {
      const html = await fetchWithCache(decision.url);
      const text = htmlToText(html);

      if (text.length < 100) {
        console.log(`  [warn] Short text for ${decision.title}`);
        continue;
      }

      const chunks = chunkText(text).map((c) => ({
        ...c,
        text: `[${decision.title}]\n\n${c.text}`,
      }));

      documents.push({
        source: decision.source,
        jurisdiction: decision.jurisdiction,
        sectionId: decision.id,
        title: decision.title,
        sourceUrl: decision.url,
        chunks,
      });
      console.log(`  [parsed] ${decision.title} → ${chunks.length} chunks`);
    } catch (err) {
      console.error(`  [error] Failed to ingest ${decision.title}:`, err);
    }
  }

  // Add static content
  for (const doc of STATIC_LEGAL_CONTENT) {
    console.log(`  [static] ${doc.title} → ${doc.chunks.length} chunks`);
  }

  const totalStored = await embedAndStore(documents);
  console.log(`\n✅ Advanced legal ingestion complete: ${totalStored} chunks stored\n`);
  return totalStored;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ingestLegalAdvanced()
    .then((count) => { console.log(`Done: ${count} chunks`); process.exit(0); })
    .catch((err) => { console.error('Ingestion failed:', err); process.exit(1); });
}
