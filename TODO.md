# TODO

Open follow-ups, surfaced from the v1 FTO workflow. Each item lists context + the proposed fix.

---

## FTO discovery accuracy fixes (TBD)

### 1. EPO search is title-only — most queries return zero hits

**File:** `src/tools/patent-search/epo-ops-search.ts`, line 164

The current CQL query is `ti="<query>"`, which requires every word to appear in the patent title as an exact phrase. For multi-word technical queries (e.g. `"metasurface optical collection lab-on-chip microfluidics"`) almost nothing matches. Real run `cmok5vc200000ney9dl00z34n` issued 10 reasonable queries against EPO and got 0 results from every one.

**Fix:** Switch to `ti any "<terms>" OR ab any "<terms>"` so the search hits title *or* abstract, with token-any rather than exact-phrase matching. Verify CQL grammar against the EPO OPS reference before shipping.

### 2. USPTO not searched — `PATENTSVIEW_API_KEY` missing from `.env`

**File:** `.env` / `src/tools/patent-search/uspto-search.ts` line 47-56

When `PATENTSVIEW_API_KEY` is absent, the tool returns a single stub result and the agent excludes USPTO from `sourcesSearched`. The user's run only searched EPO. Free key available at https://search.patentsview.org.

**Fix:**
- Provision the key in `.env` (and in deployment env).
- Add a startup-time warning in `src/api/server.ts` if `PATENTSVIEW_API_KEY` is missing — fail loudly instead of silently degrading.

### 3. Zero-discovery runs report "Clear" — confidence scorer is too generous

**File:** `src/services/fto-confidence-scorer.ts`

When `discoveredPatents.totalFound === 0` and every search returned zero results, the per-market max is `Clear`, the overall risk becomes `Clear`, and `assessmentConfidence` can land at `High` because all markets were "covered." This is misleading — the agent honestly reported "nothing found," but the math interprets that as "no blockers," which is a different statement.

**Fix:**
- If `totalFound === 0` AND `searchQueries.length > 0` (we tried but found nothing), force `assessmentConfidence = "Low"` and bubble up an explicit `Inconclusive` overall-risk state (or refuse to render `Clear` ratings). Surface this in the memo executive summary.
- Consider a separate `RiskLevel.Inconclusive` slot rather than reusing `Clear`.

### 4. Critical-gap reflection doesn't re-trigger discovery

**File:** `src/orchestrator/lead-counsel-fto.ts`, around the reflection step

`reflectFTO()` already returns `CRITICAL GAP: Zero discovered patents is highly suspicious for a product with 85 features...` but the orchestrator only logs the gap and proceeds to memo synthesis. The defensibility flow has the same shape.

**Fix:** When reflection flags `CRITICAL GAP` AND `discoveredPatents.totalFound === 0`, re-run `discoverPatents()` once with a "broader query strategy" instruction injected into the user message. Cap at one re-run to avoid loops.

### 5. No assignee-name search — can't reliably find named competitors

**Context:** The user knew Cytochip and MetaLenz patents likely block the product, but the discoverer's keyword searches surfaced neither even when they ran (would not have, since EPO searched titles only). When the user knows specific competitors, the system should be able to search their full portfolios.

**Fix:**
- Extend `search_us_patents` (USPTO PatentsView supports `assignees.assignee_organization`) and add an `assignee` field to the EPO tool (CQL `pa="..."`).
- Add a `searchByAssignee` tool for the discoverer.
- Add a "known competitors" textarea on the FTO form (`web/app/new/page.tsx`); pass company names through to the discoverer prompt as an explicit "search these assignees first" instruction.

---

## Smaller follow-ups (not blocking, surfaced in code review)

### 6. `markets` fallback logic in dashboard is a symptom of dual fields

**File:** `web/app/page.tsx` (the `markets = a.targetMarkets?.length ? ... : a.jurisdictions` ladder)

`createFTOAnalysisRecord` mirrors `targetMarkets` into `jurisdictions` for back-compat. The UI duplicates the fallback logic. Better: API normalises one `markets` field server-side and clients read only that.

### 7. `persistFinalResults` and `persistFTOFinalResults` share most fields

**File:** `src/db/repositories/analysis.repo.ts`

Most of the `prisma.analysis.update` payload is identical. Extract a base helper that takes (`memo`, `confidenceReport`, `reflectionNotes`, `tokens`, `usRating/epoRating/ukRating`) and let the two callers pass the type-specific extras.

### 8. `extractTextFromResponse` pattern duplicated

Pattern `response.content.filter(b => b.type === 'text').map(b => 'text' in b ? b.text : '').join('')` appears in `lead-counsel-fto.ts`, `lead-counsel.ts` reflection, `fto-memo-generator.ts`, `memo-generator.ts`, `input-validator.ts`. Extract a one-line helper to `src/lib/claude.ts`.

### 9. Per-agent `computeConfidence` is dead weight

**Files:** `src/agents/*.ts` (every agent)

Each agent computes a `confidence` score that gets attached to `AgentResult` and is never read by anything downstream. Either remove it or wire it into the assessment-confidence calculation.

### 10. `cleanWhitespace` in `patent-fetch.ts` only handles 6 HTML entities

**File:** `src/tools/patent-search/patent-fetch.ts`

A patent claim text passing through `cleanWhitespace` may still contain entities like `&mdash;`, `&reg;`, numeric refs, etc. Use a proper decoder (`he` or similar) or document the limitation explicitly so a future reader knows.

### 11. Migration script `_prisma_migrations` upsert targets `id`, not `migration_name`

**File:** `scripts/apply-fto-migration.ts`

`ON CONFLICT (id)` on a freshly-`gen_random_uuid()`-generated id never fires. The upfront `SELECT … WHERE finished_at IS NOT NULL` guard prevents reruns from re-executing DDL, so this is low-blast-radius — but the conflict clause should be `ON CONFLICT (migration_name)` for correctness if the unique index allows.

### 12. FTO orchestrator skips guardrails

**File:** `src/orchestrator/lead-counsel-fto.ts`

The defensibility flow runs `runGuardrails()` on the synthesized memo (citation validation, disclaimer check, confidence downgrade). The FTO flow does not. The FTO memo prompt instructs the LLM to include the disclaimer, but there's no programmatic check. Either add a guardrails pass or document the omission.
