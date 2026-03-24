# Implementation Plan: Patent Lawyer Multi-Agent System

## Context

We have a comprehensive product spec (`PRODUCT_SPEC.md`) for a multi-agent patent defensibility analysis system ("Virtual Patent Law Firm"). The repo is greenfield — no source code exists yet. This plan takes us from zero to a production-deployable system in 10 incremental phases.

**Key architectural decisions:**
- **Raw `@anthropic-ai/sdk`** with custom agent loop (not Claude Agent SDK) — gives full control over domain-specific tools, context sharing, and structured output
- **TypeScript / Node.js** runtime
- **Neon PostgreSQL + pgvector** for both structured data and vector search (single DB)
- **Prisma ORM** for structured queries, raw SQL for vector operations
- **Fastify** for the REST API layer

---

## Phase 0: Project Scaffolding

**Goal:** Working TypeScript project with a "hello world" Claude API call.

**Create directory structure:**
```
src/
  agents/           # Agent definitions (system prompts, tool bindings)
  tools/            # Tool implementations (patent search, vector DB)
  orchestrator/     # Lead Counsel orchestration logic
  services/         # Business logic (embedding, search, scoring)
  db/               # Prisma client, repositories
  api/              # REST API routes
  types/            # Shared TypeScript types
  utils/            # Logging, error handling, retry
  config/           # Configuration loading
  prompts/          # System prompts for each agent (markdown files)
prisma/
  schema.prisma
scripts/            # Data ingestion (MPEP loader, etc.)
tests/
  unit/
  integration/
  fixtures/         # Sample patent claims
docker/
```

**Dependencies:**
```
@anthropic-ai/sdk, typescript, tsx, zod, prisma, @prisma/client,
dotenv, pino, vitest, @types/node, eslint, prettier
```

**Key files:**
- `src/config/env.ts` — Zod-validated env var loading
- `src/lib/claude.ts` — Anthropic client singleton
- `src/index.ts` — Entry point (test Claude call)
- `prisma/schema.prisma` — Datasource config for Neon
- `.env.example` — Required env var template
- `tsconfig.json`, `package.json`, `.eslintrc.js`, `.prettierrc`

**Verify:** `npx tsx src/index.ts` returns a Claude response.

---

## Phase 1: Core Agent Loop + Claim Deconstructor

**Goal:** Reusable agent loop framework + first working agent.

### 1a. Agent Loop (`src/agents/agent-loop.ts`)
The engine all agents share:
1. Send messages to Claude with tool definitions
2. If response has `tool_use` blocks → execute tools, append results
3. Loop until Claude returns final text response (or hits `maxTurns` limit)
4. Return Zod-validated structured output

### 1b. Type System (`src/types/index.ts`)
Core types flowing between agents:
- `ClaimElement` — { id, text, type: 'structural'|'functional'|'method_step', isMeansPlusFunction }
- `ParsedClaim` — { fullText, claimNumber, isIndependent, elements: ClaimElement[] }
- `AnalysisInput` — { claimText, technicalSpecification? }
- `AgentResult<T>` — { data: T, reasoning: string, confidence: number, tokensUsed: number }

### 1c. Claim Deconstructor (`src/agents/claim-deconstructor.ts`)
- System prompt: `src/prompts/claim-deconstructor.md`
- Pure reasoning agent (no external tools)
- Uses Claude's `tool_use` with a `submit_claim_analysis` tool to enforce `ParsedClaim` schema
- Identifies independent/dependent claims, classifies elements, flags means-plus-function limitations

**Verify:** Unit tests with 3-5 real patent claims (`tests/fixtures/sample-claims.ts`). Check element count, classification, means-plus-function detection.

---

## Phase 2: Prior Art Investigator + Search Tools

**Goal:** Second agent with real patent/NPL search capabilities.

### 2a. Tool Framework (`src/tools/tool-registry.ts`)
Standardized tool definition: name, description, Zod input schema, async `execute()`, error wrapper.

### 2b. Search Tools (start with free APIs)
- `src/tools/patent-search/uspto-search.ts` — USPTO PatentsView API (free, no key required)
- `src/tools/patent-search/semantic-scholar.ts` — Semantic Scholar API (free, 100 req/sec)
- Later: Add SerpAPI Google Patents, EPO, WIPO as paid tier

### 2c. Prior Art Investigator (`src/agents/prior-art-investigator.ts`)
- System prompt: `src/prompts/prior-art-investigator.md`
- Tools: `search_patents`, `search_academic_papers`, `refine_search_query`
- Takes `ParsedClaim` → generates queries per element → searches → scores relevance
- Iterative refinement: if coverage insufficient, generates new queries
- Output: `PriorArtReport` with per-element ranked references (all with verifiable URLs/pub numbers)

**New types:** `PriorArtReference`, `ElementCoverage`, `PriorArtReport`

**Verify:** Integration test with a known patent. Verify references have valid URLs/publication numbers.

---

## Phase 3: Patent Examiner (Adversarial Agent)

**Goal:** Construct invalidity arguments from prior art.

### 3a. Static Legal Knowledge Base (`src/services/legal-knowledge.ts`)
Pre-RAG stopgap with key legal standards:
- 35 U.S.C. §§ 101, 102, 103, 112 text
- Graham v. John Deere factors
- KSR v. Teleflex obviousness rationales
- Alice Corp v. CLS Bank 101 framework

### 3b. Patent Examiner (`src/agents/patent-examiner.ts`)
- System prompt: `src/prompts/patent-examiner.md`
- Tools: `lookup_legal_standard` (static lookup, replaced by RAG in Phase 6)
- Input: `ParsedClaim` + `PriorArtReport`
- Constructs anticipation (§102) and obviousness (§103) arguments
- Applies Graham v. John Deere factors, PHOSITA analysis
- Output: `InvalidityAnalysis` with per-argument strength ratings

**New types:** `AnticipationArgument`, `ObviousnessArgument`, `GrahamFactors`, `InvalidityAnalysis`

**Verify:** Feed examiner a claim + report with overlapping prior art. Verify it produces arguments with correct legal citations.

---

## Phase 4: Lead Counsel Orchestrator + End-to-End Pipeline

**Goal:** Chain all agents into a working pipeline that produces the final memo.

### 4a. Orchestrator (`src/orchestrator/lead-counsel.ts`)
**Deterministic workflow** (not an autonomous LLM deciding what to do):
1. Validate input (Claude call: is this a patent claim?)
2. Call Claim Deconstructor → `ParsedClaim`
3. Call Prior Art Investigator → `PriorArtReport`
4. Call Patent Examiner → `InvalidityAnalysis`
5. Reflection step (Claude call: check for gaps, inconsistencies)
6. If gaps → re-trigger specific agents
7. Synthesis step (Claude call: produce final memo)

### 4b. Session / Working Memory (`src/orchestrator/session.ts`)
In-memory session tracking: current step, intermediate results, element-to-reference mapping, issues found.

### 4c. Memo Generator (`src/services/memo-generator.ts`)
Template-driven structure (all 8 sections from PRODUCT_SPEC.md) with Claude-synthesized prose.

### 4d. Confidence Scorer (`src/services/confidence-scorer.ts`)
- **Defensibility Rating** (Strong/Moderate/Weak) — based on prior art coverage + argument strength
- **Assessment Confidence** (High/Medium/Low) — based on sources searched + coverage completeness

**Verify:** End-to-end test: real patent claim → complete 8-section memo. Target < 10 min.

**This is the first usable milestone — a working CLI tool.**

---

## Phase 5: Database + Persistence

**Goal:** Persist analyses to Neon PostgreSQL via Prisma.

### Prisma Schema Models
- `Analysis` — { id, status, claimText, technicalSpec, createdAt, updatedAt }
- `ClaimElement` — { id, analysisId, text, type, isMeansPlusFunction }
- `PriorArtReference` — { id, title, url, publicationNumber, source, relevantExcerpt }
- `ElementReference` — join table with relevanceScore, coverageLevel
- `InvalidityArgument` — { id, analysisId, type, strength, content (JSON) }
- `DefensibilityMemo` — { id, analysisId, content (JSON), rating, confidence }
- `SearchQuery` — { id, analysisId, query, source, resultCount }

### Repository Layer
- `src/db/repositories/analysis.repo.ts`
- `src/db/repositories/reference.repo.ts`

### Orchestrator Integration
- Create `Analysis` record at start, persist results after each agent, update status progressively
- Enable resuming failed analyses from last successful step

**Verify:** Run pipeline → query DB → verify all data persisted. Kill mid-run → restart → verify resume.

**Important:** Run `npx prisma generate` after every schema change.

---

## Phase 6: RAG Pipeline (pgvector + MPEP/Case Law)

**Goal:** Replace static legal knowledge base with semantic search over real legal documents.

### 6a. Embedding Service (`src/services/embedding.ts`)
- Voyage AI SDK (`voyageai` package), model: `voyage-law-2` or `voyage-3`
- Batch embedding support, caching to avoid re-computation

### 6b. pgvector Setup
- Enable `vector` extension in Neon
- Prisma `Document` model: { id, content, embedding, source, sectionNumber, metadata }
- Raw SQL via `prisma.$queryRaw` for cosine similarity searches

### 6c. Ingestion Scripts (`scripts/`)
- `ingest-mpep.ts` — Start with Chapter 2100 (Patentability), expand later
- `ingest-statutes.ts` — 35 U.S.C. full text
- `ingest-case-law.ts` — Landmark cases (Graham, KSR, Alice, Mayo, etc.)
- Chunking: ~500-1000 tokens per chunk, 100 token overlap

### 6d. RAG Retrieval (`src/services/rag-retrieval.ts`)
- Query → embed → cosine similarity search → top-k results with scores
- Filter by source type (MPEP, case law, statutes)

### 6e. Replace `lookup_legal_standard` tool with `search_legal_knowledge` RAG tool

**Verify:** Ingest MPEP Ch. 2100, query "Graham v. John Deere factors" → verify correct section returned. Run full pipeline with RAG → verify legal citations come from vector DB.

---

## Phase 7: Guardrails + Anti-Hallucination

**Goal:** Implement all guardrails from PRODUCT_SPEC.md.

### Citation Validator (`src/services/citation-validator.ts`)
- Extract all citations from draft memo
- Patent citations: verify pub number format, optionally confirm via USPTO API
- NPL citations: HTTP HEAD to verify URL is reachable
- Legal citations: verify existence in RAG knowledge base

### Output Guardrails (`src/services/guardrails.ts`)
Post-processing pipeline:
1. **Citation Required** — flag factual claims without citations
2. **Legal Grounding** — flag legal assertions without MPEP/statute/case references
3. **No Fabricated Case Law** — cross-reference case names against RAG DB
4. **Confidence Adjustment** — downgrade score if citations fail validation

### Input Validator (`src/services/input-validator.ts`)
- Claude call to classify: valid patent claim?
- Reject non-patent text, flag overly broad claims
- Detect §101 eligibility issues (Alice/Mayo framework)

### Orchestrator Integration
Reflection step now: run citation validation → apply guardrails → re-trigger if issues found → append validation report to memo.

**Verify:** Test with fabricated case name → caught. Test missing citations → flagged. Test invalid patent numbers → caught.

---

## Phase 8: REST API Layer

**Goal:** Expose the system as an async REST API.

### Fastify Server (`src/api/server.ts`)
With Pino logging, Zod validation, CORS, rate limiting.

### Routes (`src/api/routes/`)
- `POST /api/v1/analyses` — Start analysis (returns ID immediately)
- `GET /api/v1/analyses/:id` — Status + results
- `GET /api/v1/analyses/:id/memo` — Final memo
- `GET /api/v1/analyses` — List (paginated)
- `POST /api/v1/analyses/:id/retry` — Retry failed
- `GET /api/v1/health` — Health check

### BullMQ Job Queue (`src/queue/`)
- `analysis-queue.ts` — Queue definition
- `analysis-worker.ts` — Worker runs the orchestrator
- POST creates DB record + enqueues job → worker runs pipeline → client polls for status

**New dependencies:** `fastify, @fastify/cors, @fastify/rate-limit, bullmq, ioredis`

**Infrastructure:** Redis (Docker Compose for dev, Cloud Memorystore for prod)

### Docker Compose (`docker/docker-compose.yml`)
Services: app (API), worker (BullMQ), redis

**Verify:** POST claim → get ID → poll until complete → GET memo. Test concurrent analyses (3 at once).

---

## Phase 9: Observability + Production Hardening

**Goal:** Production-ready deployment with monitoring.

- **Structured logging** (`src/utils/logger.ts`) — Pino, request ID correlation, token/cost tracking per agent call
- **LLM observability** — Helicone proxy for automatic token/cost/latency tracking
- **Retry logic** (`src/utils/retry.ts`) — Exponential backoff, circuit breakers for external APIs
- **Cost control** — Max cost per analysis kill switch
- **Dockerfile** (`docker/Dockerfile`) — Multi-stage build (compile TS → slim Node.js production image)
- **Cloud Run config** — env vars from Secret Manager, min 0 / max 10 instances, 1Gi memory, 900s timeout

**Verify:** Deploy to Cloud Run → run analysis → verify logs in Cloud Logging → verify Helicone dashboard. Simulate API failure → confirm retry/circuit breaker works.

---

## Phase 10: Human-in-the-Loop + Polish

**Goal:** Attorney feedback loop and edge case handling.

- `POST /api/v1/analyses/:id/feedback` — Attorney feedback
- `POST /api/v1/analyses/:id/override` — Override agent conclusions
- `POST /api/v1/analyses/:id/reanalyze` — Re-trigger with guidance
- Webhook notifications on completion
- PDF memo generation (pdfkit or puppeteer)
- Edge cases: very long claims (summarization), method vs apparatus claims, design patents

---

## Sequencing + Milestones

```
Phase 0  Scaffolding               ──┐
Phase 1  Agent Loop + Claim          │  Milestone 1: First agent works
Phase 2  Prior Art + Search Tools    │
Phase 3  Patent Examiner             │
Phase 4  Orchestrator + E2E        ──┘  Milestone 2: CLI pipeline works end-to-end
Phase 5  Database + Persistence    ──┐  (can parallel with Phase 6)
Phase 6  RAG Pipeline              ──┘
Phase 7  Guardrails                ──── Milestone 3: Trustworthy output
Phase 8  REST API                  ──── Milestone 4: Deployable API
Phase 9  Production Hardening
Phase 10 HITL + Polish             ──── Milestone 5: Production-ready
```

Phases 5 and 6 can run in parallel. All other phases are sequential.

---

## Environment Variables

```
ANTHROPIC_API_KEY=             # Claude API
DATABASE_URL=                  # Neon PostgreSQL connection string
VOYAGE_API_KEY=                # Voyage AI embeddings (Phase 6+)
SERPAPI_API_KEY=                # Google Patents (optional, Phase 2+)
REDIS_URL=redis://localhost:6379  # BullMQ (Phase 8+)
HELICONE_API_KEY=              # Observability (Phase 9+, optional)
PORT=3000
NODE_ENV=development
```

---

## Key Risks + Mitigations

| Risk | Mitigation |
|------|-----------|
| Patent API rate limits | Circuit breakers, caching, graceful degradation |
| Context window overflow on complex claims | Element-by-element approach keeps per-call context small |
| Hallucinated citations | Citation validation is a hard gate — memo can't be "complete" until all pass |
| MPEP ingestion complexity | Start with Ch. 2100 only, expand incrementally |
| Cost per analysis | Track tokens, use Sonnet for most agents, Opus only for synthesis |
| pgvector + Prisma friction | Clean abstraction layer; evaluate Drizzle if friction is too high |

---

## Verification Plan

After each phase, verify with:
1. **Unit tests** — `npx vitest run` for agent logic, tool parsing, type validation
2. **Integration tests** — Real API calls with sample patent claims from `tests/fixtures/`
3. **End-to-end test** (Phase 4+) — Full claim → memo pipeline with known patent
4. **DB verification** (Phase 5+) — `npx prisma studio` to inspect persisted data
5. **API tests** (Phase 8+) — HTTP requests via curl or Vitest + supertest
6. **Production smoke test** (Phase 9+) — Deploy to Cloud Run, run analysis, verify logs
