# Patent Lawyer Agent - Product Specification

## Overview

An autonomous multi-agent system that acts as a "Virtual Patent Law Firm," providing patent defensibility analysis across **three jurisdictions: United States, European Union (EPO), and United Kingdom**. The system breaks down patent claims, searches prior art, constructs adversarial arguments, and synthesizes a professional opinion memo — all grounded in verifiable citations and jurisdiction-specific legal frameworks.

**Supported Jurisdictions:**
- **United States (US)** — 35 U.S.C. §§ 101, 102, 103, 112; MPEP; PTAB decisions
- **European Union (EU/EPO)** — European Patent Convention (EPC) Articles 52-57; EPO Guidelines for Examination; EPO Board of Appeal decisions
- **United Kingdom (UK)** — UK Patents Act 1977 Sections 1-6; UK IPO Examination Guidelines; UK case law

This is an **accelerator for real patent attorneys**, not a replacement. Every output is a draft ready for human review.

---

## System Architecture: Multi-Agent "Virtual Firm"

The system is composed of four specialized agents, each with a narrowly scoped responsibility to reduce cognitive load and minimize errors.

### Agent 1: Claim Deconstructor

- **Role:** Parse the user's patent claim and break it into distinct, independent elements and limitations.
- **Input:** Raw patent claim text + technical specification + target jurisdictions.
- **Output:** Structured list of claim elements (e.g., Element A: "a sensor configured to…", Element B: "a processor that…").
- **Responsibilities:**
  - Identify independent and dependent claims.
  - Extract preamble, transitional phrases, and body elements.
  - Classify each element by type (structural, functional, method step).
  - Flag means-plus-function limitations (US: 35 U.S.C. § 112(f)).
  - Flag jurisdiction-specific claim drafting concerns (e.g., method step clarity for EPO, sufficiency of disclosure for UK).

### Agent 2: Prior Art Investigator

- **Role:** Search for prior art matching each claim element.
- **Input:** Structured claim elements from Agent 1 + target jurisdictions.
- **Output:** Ranked list of prior art references per element, with relevance scores and excerpts.
- **Responsibilities:**
  - Generate Boolean and semantic search queries per element.
  - Search patent databases across all target jurisdictions:
    - **US:** USPTO PatentsView API, Google Patents
    - **EU:** EPO Open Patent Services (Espacenet), WIPO PATENTSCOPE
    - **UK:** UK IPO search (Ipsum), Espacenet (covers UK national filings)
  - Search non-patent literature (IEEE Xplore, arXiv, scientific journals).
  - Iteratively refine queries when initial results are insufficient.
  - Return direct URLs / publication numbers for every reference.
  - Tag each reference with the jurisdiction(s) it is relevant to.

### Agent 3: Patent Examiner (Adversarial Agent)

- **Role:** Attempt to invalidate the claim using retrieved prior art, applying the correct legal test for each target jurisdiction.
- **Input:** Claim elements + prior art references from Agent 2 + target jurisdictions.
- **Output:** Per-jurisdiction structured invalidity arguments with supporting evidence.
- **Responsibilities:**
  - **US Analysis:**
    - Construct **anticipation** arguments (35 U.S.C. § 102) — single reference teaches all elements.
    - Construct **obviousness** arguments (35 U.S.C. § 103) — combine references with motivation to combine.
    - Apply **Graham v. John Deere** factors. Apply **KSR v. Teleflex** rationales for obviousness.
    - Evaluate PHOSITA motivation to combine.
  - **EU/EPO Analysis:**
    - Apply the **Problem-Solution Approach** (EPO's structured inventive step test):
      1. Determine the closest prior art.
      2. Establish the objective technical problem.
      3. Assess whether the claimed solution would have been obvious to the skilled person.
    - Assess **novelty** under EPC Article 54.
    - Assess **inventive step** under EPC Article 56.
    - Apply **"could-would" approach** — would the skilled person have arrived at the invention, not merely could they have.
  - **UK Analysis:**
    - Apply the **Windsurfing/Pozzoli test** for inventive step:
      1. Identify the notional person skilled in the art and their common general knowledge.
      2. Identify the inventive concept of the claim.
      3. Identify differences between the prior art and the inventive concept.
      4. Assess whether those differences constitute steps which would have been obvious to the skilled person.
    - Assess **novelty** under UK Patents Act 1977 Section 2.
    - Assess **inventive step** under UK Patents Act 1977 Section 3.
    - Consider UK-specific case law (Pozzoli v. BDMO, Actavis v. Eli Lilly).
  - Identify the strongest and weakest elements of the claim per jurisdiction.
  - Highlight **divergences** — where the claim may be defensible in one jurisdiction but not another.

### Agent 4: Lead Counsel (Orchestrator)

- **Role:** Manage workflow, synthesize findings, and draft the final opinion.
- **Input:** All outputs from Agents 1-3.
- **Output:** Defensibility Opinion Memo with exhibits and risk assessment.
- **Responsibilities:**
  - Orchestrate the execution flow across all agents for each target jurisdiction.
  - Trigger reflection/self-correction loops before finalizing.
  - Validate that all citations are real and verifiable.
  - Cross-check legal reasoning against jurisdiction-specific knowledge bases (MPEP, EPO Guidelines, UK IPO Guidelines).
  - Assign per-jurisdiction confidence scores and an overall assessment.
  - Produce the final structured output with a **cross-jurisdictional comparison** section.
  - Highlight strategic filing recommendations based on per-jurisdiction outcomes.

---

## Tool Integration

Each agent is equipped with specialized tools it can independently invoke.

### Patent Database Tools

| Tool | Jurisdiction | Purpose | API/Source |
|------|-------------|---------|------------|
| Google Patents Search | All | Broad patent search with semantic capabilities | Google Patents API |
| USPTO Full-Text Search | US | US patent and application search | USPTO PatentsView API |
| EPO Espacenet Search | EU/UK | European and UK patent search | EPO Open Patent Services (OPS) API |
| UK IPO Search | UK | UK national patent search | UK IPO Ipsum |
| WIPO PATENTSCOPE | All | International PCT application search | WIPO PATENTSCOPE API |

### Non-Patent Literature (NPL) Tools

| Tool | Purpose | API/Source |
|------|---------|------------|
| IEEE Xplore Search | Engineering and CS publications | IEEE Xplore API |
| arXiv Search | Preprint scientific papers | arXiv API |
| Semantic Scholar | Broad scientific literature | Semantic Scholar API |
| Google Scholar | General academic search | SerpAPI / ScraperAPI |

### Legal Knowledge Base (RAG)

A continuously updated vector database providing grounded legal reasoning across all three jurisdictions:

| Content | Jurisdiction | Description |
|---------|-------------|-------------|
| MPEP (Manual of Patent Examining Procedure) | US | Complete US examination guidelines |
| PTAB Decisions | US | Patent Trial and Appeal Board rulings |
| US Case Law | US | Key precedents (Graham v. John Deere, KSR v. Teleflex, Alice Corp v. CLS Bank, Mayo v. Prometheus, etc.) |
| 35 U.S.C. Statutes | US | Full US patent statute text |
| EPO Guidelines for Examination | EU | Complete EPO examination guidelines (Parts A-H) |
| EPO Board of Appeal Decisions | EU | Key Board of Appeal case law (e.g., T 24/81 "BASF/Metal refining", T 641/00 "Two identities/COMVIK") |
| European Patent Convention (EPC) | EU | Full EPC text including Articles 52-57, Rules |
| EPO Case Law of the Boards of Appeal | EU | Systematic compilation of Board of Appeal jurisprudence |
| UK Patents Act 1977 | UK | Full UK patent statute text (Sections 1-6, 14, 72, 125) |
| UK IPO Examination Guidelines | UK | Manual of Patent Practice (MOPP) |
| UK Case Law | UK | Key precedents (Pozzoli v. BDMO, Aerotel/Macrossan, Actavis v. Eli Lilly, Conor v. Angiotech, HTC v. Apple) |

**Vector DB Technology:** Embeddings stored in Neon PostgreSQL with pgvector extension, with semantic search for retrieval-augmented generation. Documents tagged by jurisdiction for filtered retrieval.

---

## Agentic Workflow (Execution Loop)

The orchestrator drives a deterministic, step-by-step reasoning loop.

```
┌─────────────────────────────────────────────────────────┐
│                    User Input                           │
│         (Patent Claim + Technical Specification)        │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  Step 1: Ingestion & Planning (Lead Counsel)            │
│  - Validate input completeness                          │
│  - Identify target jurisdictions (US, EU, UK)           │
│  - Outline assessment plan                              │
│  - Identify claim type (utility, method, system, etc.)  │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  Step 2: Element-by-Element Analysis                    │
│  (Claim Deconstructor)                                  │
│  - Parse claim into discrete elements                   │
│  - Classify each element                                │
│  - Output structured element list                       │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  Step 3: Information Retrieval Loop                     │
│  (Prior Art Investigator)                               │
│  - For each element:                                    │
│    - Generate search queries (Boolean + semantic)       │
│    - Search patent DBs + NPL sources                    │
│    - Score and rank results                             │
│    - Refine queries if coverage is insufficient         │
│  - Iterate until all elements have adequate coverage    │
│    or search is exhausted                               │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  Step 4: Jurisdiction-Specific Invalidity Analysis       │
│  (Patent Examiner)                                      │
│  - Map prior art references to claim elements           │
│  - For each target jurisdiction, apply the correct test: │
│    US: Graham/KSR obviousness + §102 anticipation       │
│    EU: Problem-Solution Approach (EPC Art. 56)          │
│    UK: Windsurfing/Pozzoli inventive step test          │
│  - Identify cross-jurisdictional divergences            │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  Step 5: Self-Correction & Reflection                   │
│  (Lead Counsel)                                         │
│  - Verify all citations are real (URL/pub number check) │
│  - Cross-check reasoning against jurisdiction-specific  │
│    knowledge bases (MPEP, EPO Guidelines, UK MOPP)      │
│  - Challenge weak arguments                             │
│  - Re-trigger search if gaps are found                  │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  Step 6: Opinion Synthesis (Lead Counsel)               │
│  - Assign defensibility rating + confidence score       │
│  - Draft Opinion Memo with exhibits                     │
│  - Highlight risks and recommendations                  │
│  - Format for attorney review                           │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│                 Final Output                            │
│           Defensibility Opinion Memo                    │
└─────────────────────────────────────────────────────────┘
```

---

## Memory Management

### Short-Term Memory (Working Context)

- Shared scratchpad across agents within a single analysis session.
- Stores intermediate findings (e.g., "Found prior art for Element A; Element C appears highly novel").
- Tracks search state: which elements have been covered, which queries have been tried.
- Maintains the element-to-reference mapping as it evolves.

### Long-Term Memory (Cross-Session)

- History of the user's previous claims and analyses.
- Portfolio-level context (technology domain, competitive landscape).
- User preferences for output format and detail level.
- Commonly encountered prior art in the user's technology area.

---

## Output Format: Defensibility Opinion Memo

The final deliverable is a structured memo suitable for attorney review.

```
PATENT DEFENSIBILITY OPINION MEMO
==================================

1. EXECUTIVE SUMMARY
   - Claim summary (1-2 sentences)
   - Per-jurisdiction defensibility ratings:
     - US: [Strong | Moderate | Weak]
     - EU/EPO: [Strong | Moderate | Weak]
     - UK: [Strong | Moderate | Weak]
   - Overall confidence in assessment: [High | Medium | Low]
   - Key risk areas and jurisdictional divergences

2. CLAIM ANALYSIS
   - Full claim text
   - Element breakdown table
   - Element classification (structural / functional / method)
   - Jurisdiction-specific claim interpretation notes

3. PRIOR ART LANDSCAPE
   - For each element:
     - Closest prior art references (with URLs/pub numbers)
     - Relevance score and key excerpts
     - Coverage assessment
     - Jurisdiction tags (which DBs sourced each reference)

4. US ANALYSIS
   4a. Anticipation Analysis (35 U.S.C. § 102)
       - Single-reference invalidity arguments (if any)
       - Supporting evidence and citations
   4b. Obviousness Analysis (35 U.S.C. § 103)
       - Combination arguments
       - Motivation-to-combine analysis
       - Graham v. John Deere factor application
       - KSR v. Teleflex rationale application
       - Secondary considerations (commercial success, long-felt need, etc.)

5. EU/EPO ANALYSIS
   5a. Novelty Assessment (EPC Article 54)
       - Single-reference novelty arguments
       - Supporting evidence and citations
   5b. Inventive Step — Problem-Solution Approach (EPC Article 56)
       - Closest prior art identification
       - Objective technical problem formulation
       - "Could-would" analysis for the skilled person
       - Board of Appeal precedent citations

6. UK ANALYSIS
   6a. Novelty Assessment (UK Patents Act 1977, Section 2)
       - Single-reference novelty arguments
       - Supporting evidence and citations
   6b. Inventive Step — Windsurfing/Pozzoli Test (Section 3)
       - Step 1: Skilled person and common general knowledge
       - Step 2: Inventive concept of the claim
       - Step 3: Differences from the prior art
       - Step 4: Obviousness of those differences
       - UK case law citations

7. CROSS-JURISDICTIONAL COMPARISON
   - Side-by-side defensibility comparison (US vs EU vs UK)
   - Divergences: where outcomes differ and why
   - Strategic implications for filing/prosecution

8. DEFENSIBILITY ASSESSMENT
   - Element-by-element strength rating (per jurisdiction)
   - Overall defensibility opinion
   - Strongest differentiators
   - Vulnerable elements

9. RECOMMENDATIONS
   - Claim amendment suggestions (jurisdiction-specific)
   - Filing strategy: which jurisdictions to prioritize
   - Additional prior art searches recommended
   - Prosecution strategy considerations per jurisdiction

10. EXHIBITS
    - Exhibit A: Full prior art reference list (by jurisdiction)
    - Exhibit B: Element-to-reference mapping matrix
    - Exhibit C: Search methodology and queries used
    - Exhibit D: Legal framework reference (statutes and tests applied)
```

---

## Guardrails and Risk Mitigation

### Anti-Hallucination Measures

- **Citation Required Rule:** Every prior art reference must include a verifiable URL or publication number. No exceptions.
- **Legal Grounding Rule:** Every legal argument must cite a jurisdiction-appropriate source — US arguments cite MPEP/35 U.S.C./US case law; EU arguments cite EPC/EPO Guidelines/Board of Appeal decisions; UK arguments cite UK Patents Act/MOPP/UK case law.
- **No Fabricated Case Law:** The system must never generate fictitious case names or citations. If a precedent cannot be retrieved from the vector DB, it must not be cited.

### Confidence Scoring

Every output includes two independent scores:

| Score | Description |
|-------|-------------|
| **Defensibility Rating** | How defensible the claim is (Strong / Moderate / Weak) |
| **Assessment Confidence** | How confident the system is in its own analysis (High / Medium / Low) |

Low confidence triggers a recommendation for human deep-dive on the flagged elements.

### Human-in-the-Loop (HITL) Integration

- The system produces a **draft** memo, never a final legal opinion.
- All outputs include clear disclaimers: "This analysis is generated by an AI system and must be reviewed by a licensed patent attorney before reliance."
- Critical decision points (e.g., "no prior art found for any element") surface explicit prompts for human review.
- The attorney can override any agent's conclusion and re-trigger analysis.

### Input Validation

- Reject inputs that do not resemble patent claims or technical specifications.
- Flag overly broad or vague claims with a request for clarification.
- Detect and warn about subject matter eligibility issues per jurisdiction:
  - **US:** 35 U.S.C. § 101 (Alice/Mayo framework)
  - **EU:** EPC Article 52(2)/(3) exclusions (mathematical methods, business methods, computer programs "as such")
  - **UK:** UK Patents Act Section 1(2) exclusions (similar to EPC but with distinct UK case law — Aerotel/Macrossan test)

---

## Technology Stack

| Component | Technology |
|-----------|------------|
| Orchestration Framework | Raw @anthropic-ai/sdk with custom agent loop |
| Foundation Model | Claude (Anthropic) — primary reasoning |
| Vector Database | Neon PostgreSQL with pgvector |
| Embedding Model | Voyage AI / OpenAI Embeddings |
| Backend Runtime | Node.js (TypeScript) |
| API Layer | Fastify REST API |
| Task Queue | BullMQ (for long-running searches) |
| Monitoring | Langfuse (open-source LLM observability) |
| Storage | PostgreSQL (structured data) + S3 (documents) |

---

## Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| Analysis completion time | < 10 minutes for single claim (single jurisdiction), < 15 minutes (all three) |
| Citation accuracy | 100% verifiable (zero hallucinated references) |
| Prior art coverage | Minimum 3 databases searched per element |
| Concurrent analyses | Support 10+ simultaneous sessions |
| Data freshness | Patent DB indexes updated weekly |
| Legal knowledge DB | Updated within 30 days of publication (MPEP, EPO Guidelines, UK MOPP) |

---

## Future Enhancements

- **Portfolio Analysis Mode:** Analyze an entire patent portfolio for strengths, gaps, and overlap.
- **Prosecution History Tracker:** Monitor and advise on ongoing patent prosecution.
- **Additional Jurisdictions:** Extend analysis to JPO (Japan), CNIPA (China), KIPO (Korea) examination standards.
- **Claim Drafting Agent:** Generate claim language based on technical specifications and prior art landscape.
- **Inter Partes Review (IPR) Simulator:** Predict outcomes of potential IPR challenges.
- **Real-Time Patent Landscape Monitoring:** Alert when new prior art is published in the user's technology area.

---

## Disclaimer

This system is designed as a professional tool to assist licensed patent attorneys. It does not constitute legal advice. All outputs must be reviewed and validated by a qualified patent practitioner before any reliance or action.
