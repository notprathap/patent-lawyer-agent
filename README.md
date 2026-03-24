# Patent Lawyer Agent

A multi-agent AI system that performs patent defensibility analysis across **US, EU/EPO, and UK** jurisdictions. It deconstructs patent claims, searches prior art, constructs adversarial invalidity arguments using jurisdiction-specific legal tests, and produces a structured Defensibility Opinion Memo.

## Architecture

Four specialized agents orchestrated by a Lead Counsel:

| Agent | Role |
|-------|------|
| **Claim Deconstructor** | Parses claims into elements, classifies types, flags means-plus-function |
| **Prior Art Investigator** | Searches USPTO, EPO, and Semantic Scholar for prior art per element |
| **Patent Examiner** | Constructs invalidity arguments: Graham/KSR (US), Problem-Solution (EU), Pozzoli (UK) |
| **Lead Counsel** | Orchestrates the pipeline, reflects on gaps, synthesizes the final memo |

Built with the raw Anthropic SDK (`@anthropic-ai/sdk`) with a custom agent loop — not the Claude Agent SDK.

## Tech Stack

- **Runtime:** TypeScript / Node.js
- **LLM:** Claude (Anthropic)
- **Database:** Neon PostgreSQL + pgvector (structured data + vector search)
- **ORM:** Prisma 7 with Neon adapter
- **Embeddings:** Local `all-MiniLM-L6-v2` via `@huggingface/transformers` (zero cost)
- **API:** Fastify
- **Frontend:** Next.js + Tailwind CSS
- **Prior Art Search:** USPTO PatentsView, EPO Open Patent Services, Semantic Scholar

## Prerequisites

- **Node.js 20+** (tested on 24.x)
- **Anthropic API key** — [console.anthropic.com](https://console.anthropic.com/)
- **Neon PostgreSQL database** — [console.neon.tech](https://console.neon.tech/)
- **EPO OPS credentials** (optional) — [developers.epo.org](https://developers.epo.org/)
- **USPTO PatentsView API key** (optional) — [search.patentsview.org](https://search.patentsview.org/)

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/notprathap/patent-lawyer-agent.git
cd patent-lawyer-agent
npm install
cd web && npm install && cd ..
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and add at minimum:

```
ANTHROPIC_API_KEY=sk-ant-...
DATABASE_URL=postgresql://...@...neon.tech/neondb?sslmode=require
```

### 3. Set up the database

```bash
# Generate Prisma client
npx prisma generate

# Run migrations (set DATABASE_URL in your environment)
npx prisma migrate dev

# Enable pgvector (run once via Neon console or psql)
# CREATE EXTENSION IF NOT EXISTS vector;
```

### 4. Hydrate the legal knowledge base

```bash
npm run db:ingest
```

This fetches, chunks, and embeds legal documents from all 3 jurisdictions (~309 chunks, takes ~60s):
- **US:** 35 U.S.C. statutes from Cornell LII, SCOTUS cases from Justia
- **EU:** EPC Articles from EPO, EPO Guidelines Part G
- **UK:** Patents Act from legislation.gov.uk, case law from BAILII

### 5. Run the system

**Option A: CLI**

```bash
# Analyze a claim from a file
npm run dev -- claim.txt

# Analyze inline text
npm run dev -- --claim "1. A method comprising..." --jurisdictions US,EU,UK

# Write output to a file
npm run dev -- claim.txt --output memo.md
```

**Option B: API + Web UI**

```bash
# Start both API and frontend in one command
npm run dev:all

# Or separately:
# Terminal 1: npm run api       (port 3000)
# Terminal 2: npm run web       (port 3001)
```

Open [http://localhost:3001](http://localhost:3001) to use the web UI.

**Option C: API only (curl)**

```bash
# Start analysis
curl -X POST http://localhost:3000/api/v1/analyses \
  -H "Content-Type: application/json" \
  -d '{"claimText": "1. A method comprising...", "jurisdictions": ["US", "EU", "UK"]}'

# Poll for status
curl http://localhost:3000/api/v1/analyses/<id>

# Get the memo
curl http://localhost:3000/api/v1/analyses/<id>/memo
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/analyses` | Start a new analysis (JSON body or file upload) |
| `GET` | `/api/v1/analyses` | List analyses (paginated: `?limit=20&offset=0`) |
| `GET` | `/api/v1/analyses/:id` | Get analysis status and full results |
| `GET` | `/api/v1/analyses/:id/memo` | Get just the memo text |
| `GET` | `/api/v1/health` | Health check |

## Project Structure

```
src/
  agents/              # Agent loop + 3 specialist agents
    agent-loop.ts      # Core agent loop (tool execution, structured output)
    claim-deconstructor.ts
    prior-art-investigator.ts
    patent-examiner.ts
  orchestrator/        # Lead Counsel workflow
    lead-counsel.ts    # 8-step deterministic pipeline
    session.ts         # In-memory session tracking
  services/            # Business logic
    legal-knowledge.ts # Static legal knowledge base (US/EU/UK)
    embedding.ts       # Local embeddings (all-MiniLM-L6-v2)
    rag-retrieval.ts   # Semantic search over pgvector
    memo-generator.ts  # Claude-synthesized opinion memo
    confidence-scorer.ts
    citation-validator.ts
    guardrails.ts      # Anti-hallucination checks
    input-validator.ts # Eligibility detection
  tools/               # Agent tools
    tool-registry.ts
    legal-lookup.ts    # RAG-first, static-fallback
    patent-search/     # USPTO, EPO, Semantic Scholar
  api/                 # Fastify REST API
    server.ts
    routes/analysis.ts
    routes/health.ts
  db/                  # Prisma client + repositories
  types/               # Shared TypeScript types
  prompts/             # Agent system prompts (markdown)
  config/              # Zod-validated env loading
  utils/               # Logger (Pino)
web/                   # Next.js frontend
  app/                 # App router pages
    page.tsx           # Dashboard
    new/page.tsx       # New analysis form
    analysis/[id]/     # Analysis detail + memo viewer
  lib/api.ts           # API client
scripts/               # Legal doc ingestion pipeline
  ingest-all.ts        # Run all jurisdictions
  ingest-us.ts         # US statutes + SCOTUS cases
  ingest-eu.ts         # EPC + EPO Guidelines
  ingest-uk.ts         # UK Patents Act + BAILII cases
  lib/                 # Fetcher, parser, chunker, embedder
prisma/
  schema.prisma        # 7 models + LegalDocument (pgvector)
tests/
  unit/                # Agent + guardrails tests
  integration/         # End-to-end pipeline test
  fixtures/            # Sample patent claims
```

## npm Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Run CLI analysis |
| `npm run api` | Start Fastify API server |
| `npm run build` | Compile TypeScript |
| `npm test` | Run all tests |
| `npm run db:generate` | Regenerate Prisma client |
| `npm run db:migrate` | Run database migrations |
| `npm run db:ingest` | Hydrate legal knowledge base |
| `npm run db:studio` | Open Prisma Studio |
| `npm run web` | Start Next.js frontend (port 3001) |
| `npm run dev:all` | Start API + frontend together |

## Guardrails

The system includes anti-hallucination checks:
- **Citation validation** — every legal argument must reference real statutes/case law
- **Cross-contamination detection** — US sections can't cite EPO Guidelines, etc.
- **Fabricated case law detection** — unknown cases checked against RAG DB
- **Confidence scoring** — per-jurisdiction defensibility ratings with automatic downgrade on issues
- **Disclaimer enforcement** — every memo includes a required legal disclaimer

## Output

The system produces a 10-section **Defensibility Opinion Memo** covering:

1. Executive Summary (per-jurisdiction ratings)
2. Claim Analysis (element breakdown)
3. Prior Art Landscape
4. US Analysis (Graham/KSR obviousness, 35 U.S.C. 102 anticipation)
5. EU/EPO Analysis (Problem-Solution Approach, EPC Art. 54/56)
6. UK Analysis (Windsurfing/Pozzoli test, UK Patents Act s.2/s.3)
7. Cross-Jurisdictional Comparison
8. Defensibility Assessment
9. Recommendations
10. Exhibits + Validation Report

## License

ISC
