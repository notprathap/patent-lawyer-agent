# Patent Lawyer Agent - Product Specification

## Overview

An autonomous multi-agent system that acts as a "Virtual Patent Law Firm," providing patent defensibility analysis. The system breaks down patent claims, searches prior art, constructs adversarial arguments, and synthesizes a professional opinion memo — all grounded in verifiable citations and legal frameworks (35 U.S.C. §§ 101, 102, 103, 112).

This is an **accelerator for real patent attorneys**, not a replacement. Every output is a draft ready for human review.

---

## System Architecture: Multi-Agent "Virtual Firm"

The system is composed of four specialized agents, each with a narrowly scoped responsibility to reduce cognitive load and minimize errors.

### Agent 1: Claim Deconstructor

- **Role:** Parse the user's patent claim and break it into distinct, independent elements and limitations.
- **Input:** Raw patent claim text + technical specification.
- **Output:** Structured list of claim elements (e.g., Element A: "a sensor configured to…", Element B: "a processor that…").
- **Responsibilities:**
  - Identify independent and dependent claims.
  - Extract preamble, transitional phrases, and body elements.
  - Classify each element by type (structural, functional, method step).
  - Flag means-plus-function limitations (35 U.S.C. § 112(f)).

### Agent 2: Prior Art Investigator

- **Role:** Search for prior art matching each claim element.
- **Input:** Structured claim elements from Agent 1.
- **Output:** Ranked list of prior art references per element, with relevance scores and excerpts.
- **Responsibilities:**
  - Generate Boolean and semantic search queries per element.
  - Search patent databases (USPTO, EPO, WIPO, Google Patents).
  - Search non-patent literature (IEEE Xplore, arXiv, scientific journals).
  - Iteratively refine queries when initial results are insufficient.
  - Return direct URLs / publication numbers for every reference.

### Agent 3: Patent Examiner (Adversarial Agent)

- **Role:** Attempt to invalidate the claim using retrieved prior art.
- **Input:** Claim elements + prior art references from Agent 2.
- **Output:** Structured invalidity arguments with supporting evidence.
- **Responsibilities:**
  - Construct **anticipation** arguments (35 U.S.C. § 102) — single reference teaches all elements.
  - Construct **obviousness** arguments (35 U.S.C. § 103) — combine references with motivation to combine.
  - Evaluate whether a Person Having Ordinary Skill in the Art (PHOSITA) would find the combination obvious.
  - Apply Graham v. John Deere factors for obviousness analysis.
  - Identify the strongest and weakest elements of the claim.

### Agent 4: Lead Counsel (Orchestrator)

- **Role:** Manage workflow, synthesize findings, and draft the final opinion.
- **Input:** All outputs from Agents 1-3.
- **Output:** Defensibility Opinion Memo with exhibits and risk assessment.
- **Responsibilities:**
  - Orchestrate the execution flow across all agents.
  - Trigger reflection/self-correction loops before finalizing.
  - Validate that all citations are real and verifiable.
  - Cross-check legal reasoning against the MPEP vector database.
  - Assign confidence scores to the overall assessment.
  - Produce the final structured output.

---

## Tool Integration

Each agent is equipped with specialized tools it can independently invoke.

### Patent Database Tools

| Tool | Purpose | API/Source |
|------|---------|------------|
| Google Patents Search | Broad patent search with semantic capabilities | Google Patents API |
| USPTO Full-Text Search | US patent and application search | USPTO Open Data API |
| EPO Search | European patent search | EPO Open Patent Services API |
| WIPO Search | International patent search | WIPO PATENTSCOPE API |

### Non-Patent Literature (NPL) Tools

| Tool | Purpose | API/Source |
|------|---------|------------|
| IEEE Xplore Search | Engineering and CS publications | IEEE Xplore API |
| arXiv Search | Preprint scientific papers | arXiv API |
| Semantic Scholar | Broad scientific literature | Semantic Scholar API |
| Google Scholar | General academic search | SerpAPI / ScraperAPI |

### Legal Knowledge Base (RAG)

A continuously updated vector database providing grounded legal reasoning:

| Content | Description |
|---------|-------------|
| MPEP (Manual of Patent Examining Procedure) | Complete examination guidelines |
| PTAB Decisions | Patent Trial and Appeal Board rulings |
| Landmark Patent Case Law | Key precedents (KSR v. Teleflex, Alice Corp v. CLS Bank, etc.) |
| 35 U.S.C. Statutes | Full patent statute text |

**Vector DB Technology:** Embeddings stored in a vector database (e.g., Pinecone, Weaviate, or pgvector on Neon) with semantic search for retrieval-augmented generation.

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
│  Step 4: Combinatorial / Obviousness Analysis           │
│  (Patent Examiner)                                      │
│  - Map prior art references to claim elements           │
│  - Construct anticipation arguments (single ref)        │
│  - Construct obviousness arguments (combined refs)      │
│  - Evaluate PHOSITA motivation to combine               │
│  - Apply Graham v. John Deere factors                   │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  Step 5: Self-Correction & Reflection                   │
│  (Lead Counsel)                                         │
│  - Verify all citations are real (URL/pub number check) │
│  - Cross-check reasoning against MPEP vector DB         │
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
   - Defensibility rating: [Strong | Moderate | Weak]
   - Confidence in assessment: [High | Medium | Low]
   - Key risk areas

2. CLAIM ANALYSIS
   - Full claim text
   - Element breakdown table
   - Element classification (structural / functional / method)

3. PRIOR ART LANDSCAPE
   - For each element:
     - Closest prior art references (with URLs/pub numbers)
     - Relevance score and key excerpts
     - Coverage assessment

4. ANTICIPATION ANALYSIS (§ 102)
   - Single-reference invalidity arguments (if any)
   - Supporting evidence and citations

5. OBVIOUSNESS ANALYSIS (§ 103)
   - Combination arguments
   - Motivation-to-combine analysis
   - Graham v. John Deere factor application
   - Secondary considerations (commercial success, long-felt need, etc.)

6. DEFENSIBILITY ASSESSMENT
   - Element-by-element strength rating
   - Overall defensibility opinion
   - Strongest differentiators
   - Vulnerable elements

7. RECOMMENDATIONS
   - Claim amendment suggestions
   - Additional prior art searches recommended
   - Prosecution strategy considerations

8. EXHIBITS
   - Exhibit A: Full prior art reference list
   - Exhibit B: Element-to-reference mapping matrix
   - Exhibit C: Search methodology and queries used
```

---

## Guardrails and Risk Mitigation

### Anti-Hallucination Measures

- **Citation Required Rule:** Every prior art reference must include a verifiable URL or publication number. No exceptions.
- **Legal Grounding Rule:** Every legal argument must cite a specific statute section, MPEP section, or case law precedent from the RAG database.
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
- Detect and warn about potential 35 U.S.C. § 101 subject matter eligibility issues (Alice/Mayo framework).

---

## Technology Stack

| Component | Technology |
|-----------|------------|
| Orchestration Framework | LangGraph / CrewAI / AutoGen |
| Foundation Model | Claude (Anthropic) — primary reasoning |
| Vector Database | Neon (pgvector) / Pinecone / Weaviate |
| Embedding Model | Voyage AI / OpenAI Embeddings |
| Backend Runtime | Node.js (TypeScript) or Python |
| API Layer | REST / GraphQL |
| Task Queue | Bull / Celery (for long-running searches) |
| Monitoring | LangSmith / Helicone (LLM observability) |
| Storage | PostgreSQL (structured data) + S3 (documents) |

---

## Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| Analysis completion time | < 10 minutes for single claim |
| Citation accuracy | 100% verifiable (zero hallucinated references) |
| Prior art coverage | Minimum 3 databases searched per element |
| Concurrent analyses | Support 10+ simultaneous sessions |
| Data freshness | Patent DB indexes updated weekly |
| MPEP/Case law DB | Updated within 30 days of publication |

---

## Future Enhancements

- **Portfolio Analysis Mode:** Analyze an entire patent portfolio for strengths, gaps, and overlap.
- **Prosecution History Tracker:** Monitor and advise on ongoing patent prosecution.
- **International Filing Advisor:** Extend analysis to EPO, JPO, CNIPA examination standards.
- **Claim Drafting Agent:** Generate claim language based on technical specifications and prior art landscape.
- **Inter Partes Review (IPR) Simulator:** Predict outcomes of potential IPR challenges.
- **Real-Time Patent Landscape Monitoring:** Alert when new prior art is published in the user's technology area.

---

## Disclaimer

This system is designed as a professional tool to assist licensed patent attorneys. It does not constitute legal advice. All outputs must be reviewed and validated by a qualified patent practitioner before any reliance or action.
