# Refactor plan (ponytail audit, 2026-07-12)

Post-hackathon. Nothing here blocks the demo. Total codebase: 5,751 lines — small.
The debt is concentration, not volume. Rule for every phase: **shortest diff, delete first, no new abstractions.**

## Phase 1 — Delete (1-2 hrs, zero risk)

| What | Why | Size |
|---|---|---|
| `stage`/`DemoStage`/`SCRIPT`/`advanceDemo`/`?demo=1` rail in tasco-atlas.tsx | Scripted-demo machinery; chips/card/route are data-driven now, only the interrupt banner reads `stage` — key it on a real event | −60 lines |
| `isTextMode` + `realtimeMode "scripted"` half-paths | Voice works; text composer can show whenever STT isn't connected, one boolean not three states | −20 lines |
| `MapMode` type + leftover 3D plumbing outside the theater | Toggle already removed; type + prop threading remain | −10 lines |
| Stale docs: `docs/architecture.md`, `docs/example-conversations.md` sections describing OpenAI-realtime/gpt-voice flow | They document the evicted stack; wrong docs are worse than none | rewrite or delete |

## Phase 2 — Dedupe (1 hr, mechanical)

One `src/lib/geo-lite.mjs`-style shared module is NOT the answer — just import from the
existing modules:

- `haversine` exists in `src/lib/geo.ts` but is re-implemented in `merge-enrichment.mjs`, `pull-overture.mjs`, and the probe scripts. Scripts can't import TS → convert the two constants they need OR make scripts `--experimental-strip-types` runnable against src. Pick whichever is a 5-line change.
- `normalizeText` re-implemented (with drift risk) in both .mjs scripts.
- `CITY_CENTERS` copied in 3 places (`search.ts`, `dataset-integrity.test.ts`, pull script). One export in `search.ts` (already has it), import elsewhere. The test's independent copy is INTENTIONAL (ground truth) — keep it, comment why.

## Phase 3 — Split the two fat files (half a day, only if they keep hurting)

- **tasco-atlas.tsx (924)** → `useVoiceSession()` hook (STT+TTS+barge-in, ~200 lines) + `screens/` for Checkout/Receipt/Driving/VetcHome (already separate functions — move, don't rewrite). Live sheet stays. No state library, no context provider — props are fine at this size.
- **chat.ts (851)** → pull the constraint vocabulary + budget/party parsing into `constraints.ts` (~200 lines, pure functions, already test-covered via recommender tests). handleChat orchestration stays put.
- **search.ts (602)**: leave it. Cohesive, hot path, tests pin it.

## Phase 4 — Vocabulary consolidation (opportunistic)

Same Vietnamese token lists live in 4 places: `KNOWN_CONSTRAINTS` (chat.ts), `CATEGORY_HINTS` (search.ts), `ATTRIBUTE_VI/CATEGORY_VI` (nlu.ts), `attribute-dictionary.json` (bigset). They drift.
Single source: `scripts/bigset-jobs/attribute-dictionary.json` is already the canonical file — generate/import the nlu.ts maps from it. Do NOT unify CATEGORY_HINTS (search semantics differ: hard/soft/phrases).

## Explicitly NOT doing (YAGNI list)

- No Redux/Zustand/state library — component state is fine at 1 screen-at-a-time.
- No repository/service layers over data.ts — it's 50 lines and perfect.
- No monorepo/packages split, no barrel files, no DI.
- No CSS refactor (globals.css works; demo app).
- No embeddings/vector ranking until someone shows a query the scorer misses.
- No Supabase until the logged triggers fire (user writes / >100k POIs).
- `openai.ts` rename (it's the AI-SDK prose polisher now) — cosmetic, skip unless touching the file anyway.

## Order of operations

1 → 2 are safe any time (evals pin behavior; run `pnpm test` + `test:eval` after each).
3 only when a feature actually collides with the file layout.
4 next time an attribute gets added twice and drifts — that's the trigger, not the calendar.
