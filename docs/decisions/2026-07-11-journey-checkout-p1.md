Date: 2026-07-11
Status: active
Question: How should TASCO Atlas implement the P1 Journey Checkout without weakening organic ranking or implying real commerce?
Decision: Keep ranking authoritative and attach a deterministic 2–3 action simulated journey afterward. Carry compact journey state client-side, require a strictly lower total for cheaper revisions, confirm idempotently in the browser, create one simulated VETC receipt, and reuse Route Theater as the payoff.

Extension (2026-07-12): explicit café → phở requests carry ordered `requestedCategories` plus index-aligned `requestedCuisines` beside the legacy dining action kind. Each leg ranks from its own segment and an explicit dish is a hard deterministic POI match, including during cheaper revisions. The client-carried context retains the current user turn plus three prior turns, but an explicit new topic rebases both history and constraints. The optional NLU translator may emit only the ordered stop and cuisine enums the deterministic engine supports; it still cannot choose POIs.
Recording-flow extension (2026-07-12): the submission path adds exactly one time turn after the Italian choice, producing four real microphone turns total: request, cuisine, `19:00`, then confirmation of July 12 at `19:00`. A positive phrase starts the existing four-second booking state before the result is revealed and VETC checkout continues unchanged. User-facing recording copy omits implementation labels such as `Mô phỏng`, while internal `simulated: true` fields and deterministic fixtures remain unchanged and no external service call was added.
Why: This proves route-to-commerce orchestration while remaining dataset-grounded, offline-capable, transparent, and achievable in the hackathon scope.
Applies to: `src/lib/journey.ts`, chat/API contracts, Atlas journey UI, OpenAPI, docs, and focused tests.
Tradeoff: Prices, availability, wallet confirmation, rewards, and receipt are demonstrations only; no fulfillment or durable transaction exists.
Risk / Blast Radius: Viewers may mistake demo commerce for live TASCO/VETC behavior. Every commercial surface therefore displays `Mô phỏng`, and map/WebGL failure preserves checkout with a manual theater fallback.
Revisit when: TASCO supplies verified inventory, pricing, wallet identity/payment APIs, consent requirements, fulfillment, and dispute/refund contracts.
Related Edward Rules: Inspect real repo state first; preserve intentional working-tree changes; do not present unsupported claims as current truth.
Related Project Notes: `README.md`, `docs/architecture.md`, `docs/example-conversations.md`, `Deliverables.md`.
Source: Locked P1 autoplan, CEO plan, engineering review/test plan, and implementation validation on `codex/hackathon-prototype`.
