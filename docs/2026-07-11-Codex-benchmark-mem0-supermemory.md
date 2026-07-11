# Mem0 vs Supermemory benchmark — Codex — 2026-07-11

## 15:55 +07 — Journey Checkout P1 implementation

- **Task:** Retrieve locked Journey Checkout decisions, implement and validate P1 end to end, then preserve the runtime outcome.
- **Mem0 tools:** Two parallel project-scoped `search_memories` calls (`decision`, `task_learning`); final `add_memory` outcome write.
- **Supermemory tools:** Project-scoped `search-memory.js`; final `save-memory.js` outcome write.
- **Tokens:** Not reported by either tool surface.
- **Latency:** Initial Mem0 retrieval completed in 8.7 s alongside repo discovery; Supermemory project retrieval returned within that command. Parallel final writes completed in 4.8 s: Supermemory returned saved ID `NZE3AG3qFAjEwbi3GRRN8b`; Mem0 accepted event `3bb98e97-6bf7-42e2-9821-eb7242657245` and was still processing at the first status poll.
- **Relevance/effectiveness:** Mem0 recovered the exact single-canvas, Journey Checkout, simulated receipt, and scope-exclusion decisions. Supermemory returned the same key product constraints in a shorter list and also surfaced the existing deterministic backend state.
- **Noise/failures:** The Mem0 `task_learning` search was empty; the typed `decision` search was strong. Supermemory mixed one unrelated older project memory into profile context but its project results were otherwise concise.
- **Agent-experience verdict:** **Mem0 was more precise for typed decision retrieval; Supermemory was faster to scan. Use both, with Mem0 as the stronger implementation-history source for this task.**

## 14:28 +07 — TASCO Atlas architecture and documentation

- **Task:** Retrieve prior project decisions/context, then preserve the camera-free Route Theater decision and documentation outcome.
- **Mem0 tools:** `search_memories` (one onboarding query plus three parallel project-scoped searches); `add_memory` twice; `get_event_status` for write receipts.
- **Supermemory tools:** project-scoped `search-memory.js`; `save-memory.js`.
- **Tokens:** Not reported by either tool surface.
- **Latency:** Mem0 onboarding search 3.4 s; the three-search comparison batch completed in 6.1 s wall-clock while Supermemory ran in parallel. The two Mem0 writes completed asynchronously in 14.5 s and 17.1 s. Supermemory save failed after 1.46 s.
- **Relevance/effectiveness:** Mem0 returned the exact single-canvas MapLibre decision, the 3D Route Theater wow-factor decision, dataset counts, API count, capability requirements, and missing-asset caveats. The decision and project-context filters were useful; the implementation filter was empty. Mem0 accepted two scoped write events for the final decision/outcome.
- **Noise/failures:** One Mem0 result described the repository before concurrent implementation began and was therefore stale as current-state evidence; it remained useful as source-audit history. One Mem0 write extraction changed “90-second demo flow” into “demonstration video”; Codex caught and corrected that memory with `update_memory`. Supermemory project search and save both returned `Connection error`, so it supplied no usable context and did not persist the outcome.
- **Agent-experience verdict:** **Mem0 wins this task decisively.** It returned relevant, correctly project-scoped context with low noise and exposed asynchronous write receipts. Supermemory was not usable because both read and write paths failed connectivity.

## 14:58 +07 — Map-to-Money office-hours decision

- **Task:** Recover the active TASCO product decisions, choose the hackathon wow wedge, and preserve the selected conversational Journey Checkout direction.
- **Mem0 tools:** Two parallel `search_memories` calls scoped by `user_id=edwardtran` and `app_id=huyxdang-tasco-ai-map`; two `add_memory` calls for the product decision and conversation-format preference.
- **Supermemory tools:** `save-memory.js` for the same product decision and preference.
- **Tokens:** Not reported by either tool surface.
- **Latency:** Mem0 parallel retrieval completed in 4.9 s. The parallel Mem0 writes plus Supermemory save completed in 9.0 s wall-clock.
- **Relevance/effectiveness:** Mem0 recovered the exact MapLibre/3D Route Theater decision and camera-free constraint. Supermemory preserved the combined Map-to-Money decision in one successful project-scoped write (`GxTdRBufW7V4CFXsfAyGuk`).
- **Noise/failures:** The Mem0 `session_state` filter returned no results, but the `decision` filter was precise. The two Mem0 writes were accepted asynchronously and returned pending event IDs. Supermemory connectivity succeeded in this run, correcting the earlier same-day failure state.
- **Agent-experience verdict:** **Use both.** Mem0 was better for structured, typed retrieval and prior-decision recovery; Supermemory was faster and simpler for preserving the consolidated decision once connectivity recovered.
