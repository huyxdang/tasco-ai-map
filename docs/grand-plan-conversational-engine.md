# Grand Plan: TASCO Atlas Conversational Engine

Date: 2026-07-11 · Branch: `codex/conversation-scenario-eval`
Inputs: 7 hackathon track workbooks under `docs/AI Maps & Digital Experience/` (analyzed by one agent per track), `dataset.xlsx`, live user feedback.

## Where we are (shipped on this branch)

| Area | Status |
| --- | --- |
| Deterministic recommender correctness | Hard category filters, composite city+district matching, "gần <POI>" proximity anchors (5km), numeric budget parsing, profile avoid-exclusion, honest no-match responses |
| Clarification-first conversations | Bare/vague requests (no area + no criteria + no named place) get a clarifying question instead of instant recommendations; answers resolve in the next turn; no re-ask loops |
| Voice barge-in | Assistant speech is no longer killed by mic noise: `semantic_vad` eagerness lowered to `low`, `interrupt_response` stays off, and the client cancels audio only when transcription confirms real words (`isConfirmedSpeech`); browser mic uses echoCancellation + noiseSuppression + autoGainControl |
| Evaluation | 90-scenario benchmark: 8 workbook (`Conversation_Scenarios`) + 82 synthetic (`src/lib/synthetic-scenarios.ts`), currently **90/90 exact, 100% weighted**; regression tests lock ≥90% and workbook 8/8 |
| Demo behaviors | Destination requests route immediately with GPS (or show + ask start point without it), incl. English "Take me to Ben Thanh Market"; multi-hop synthesis ("I'm in Da Nang with a few friends…") returns grounded group suggestions |

## What the track datasets give us (agent findings)

- **Track 3 (Conversational Assistant)** — our core track. 30 labeled `Public_Evaluation` conversations expand our 8 categories; explicit clarification-required rows ("Big C gần tôi", "dẫn tôi đến sân bay") confirm the clarification-first contract. Gap: "Big C/GO!" brands are absent from our 80 POIs — handled today as clarify-with-area; could become dataset additions.
- **Track 1 (Search Understanding)** — 191 POIs, 151 addresses, **75-entry abbreviation dictionary**, 60 noisy eval queries (typos, no diacritics, "atm vcb q7"-style multi-abbreviation). We adopted the high-value aliases (ks, bv, tsn, ben thanh market); the rest of the dictionary is a ready-made backlog for `TOKEN_ALIASES`.
- **Track 2 (Semantic Ranking)** — 112 POIs, attribute taxonomy, 8 ranking signals, 61 queries with expected top POI IDs. Its `Public_Evaluation` could become a second (ranking-focused) eval suite; its `opening_hours` field motivates real time-aware filtering (we only have late-night tags).
- **Track 4 (Autocomplete)** — 60 prefix cases; validated our normalization approach and supplied the abbreviation/slang gaps (trà sữa, quán chay, ăn đêm synonyms).
- **Track 5 (Hotels)** — 30 hotels with room-level prices/availability/cancellation + sentiment reviews. No name overlap with our POIs; clean enrichment path for real budget filtering ("dưới 1 triệu" against actual room prices, not just tags).
- **Track 6 (Restaurants/Menus)** — dish-level menus with dietary tags/spice/price + OCR text. Unlocks dish-level search ("quán có món chay dưới 120k") we cannot answer today.
- **Track 7 (Group Drive)** — convoy scenarios, safety events, voice commands with priorities. Confirms the barge-in direction (noise ≠ command) and seeds future driving-mode evals; mostly out of current product scope.

**ID conflict warning:** Track 1/3/4 reuse `POI001…` IDs for *different* venues than `src/data/dataset.json`. Never merge by ID — merge by (name, city) with a re-keyed namespace (e.g. `T4-POI001`).

## Next phases (proposed order)

1. **Reservation flow (demo capability 3) — simulated end-to-end.** The safety contract forbids real bookings, so: deterministic slot generation per bookable POI (from `đặt bàn` attribute + popularity), multi-turn state machine (offer slots → user picks → confirm details → "đang đặt…" → simulated confirmation with receipt, all labeled *Mô phỏng*). A browser-agent backend can later replace the simulated executor behind the same state machine. Eval: new scenario category asserting the 5-step dialog order and grounded slot data.
2. **Dataset enrichment from Tracks 5+6** (hotel room pricing, menus/dietary) behind namespaced IDs, so budget/dish queries filter on real numbers. Honest no-match stays the fallback.
3. **Alias/normalization backlog from Tracks 1+4**: import the full abbreviation dictionaries into `TOKEN_ALIASES` (word-boundary safe), add slang mappings (ăn đêm→mở cửa khuya, trà sữa, quán chay) with eval rows per alias family.
4. **Time-aware filtering**: parse `opening_hours` where available; "mở cửa lúc 11 giờ đêm" should filter on hours, not tags.
5. **Ranking eval suite from Track 2** (61 labeled queries) as a separate `test:eval:ranking` — measures ordering quality, not conversation behavior.
6. **Voice polish**: measure barge-in latency (target: cancel within one transcript delta); consider server `interrupt_response: true` once client confirmation is proven redundant.

## Evaluation contract (do not weaken)

- Workbook 8 must stay 8/8; overall exact ≥90% enforced by `tests/conversation-scenarios-eval.test.ts`.
- Expectations derive from `dataset.json` ground truth, never from engine output.
- Honest no-match (zero recs + named unmet constraints) is the only acceptable answer when the dataset lacks coverage; fabricated venues always fail the eval.
- OpenAI may rephrase prose only; ranking, filtering, POI selection, and map actions stay deterministic.
