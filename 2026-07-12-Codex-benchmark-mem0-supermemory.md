# Mem0 vs Supermemory — Codex — 2026-07-12

## 06:28 +07 — Recover exact TASCO demo decisions

- Task: retrieve prior TASCO hackathon decisions before locking the recording flow.
- Mem0: `search_memories` with reranking, top 5. Approx. 1,800 output tokens; shared parallel latency 3.2 s. Strong project grounding and product constraints, but it missed the newest Pizza 4P's/Trung Nguyên flow.
- Supermemory: `search-memory.js --project`. Approx. 140 output tokens; shared parallel latency 3.2 s. Found the newest locked two-stop route immediately and stayed concise, but omitted the detailed reservation/parking contract.
- Noise/failures: no tool failures. Mem0 returned several older, broadly related decisions; Supermemory mixed in unrelated user-profile facts.
- Agent-experience verdict: Supermemory was faster to consume for the newest exact route; Mem0 was better for richer supporting constraints. Use both, with current conversation as authority for the final hard-coded contract.

## 07:13 +07 — Recover confirmation and booking-flow context

- Task: recover the current TASCO recording state and prior decisions before adding spoken confirmation and removing visible implementation labels.
- Mem0: two parallel reranked `search_memories` calls scoped to `session_state` and `decision`, always with `user_id=edwardtran` and `app_id=huyxdang-tasco-ai-map`. Shared latency 5.3 s; combined tool output was roughly 11,100 tokens before truncation. It recovered the real-microphone constraint and no-commit preference, but also returned several older BigSet and 3D decisions.
- Supermemory: `search-memory.js --project` in the same parallel batch. Shared latency 5.3 s; roughly 150 useful output tokens. It returned the exact Pizza 4P's → Trung Nguyên, table, parking, discount, and receipt contract with very little reading overhead.
- Noise/failures: no call failure. Mem0's filtered result was substantially noisier; Supermemory included a few unrelated profile facts but the project results were directly useful.
- Agent-experience verdict: Supermemory was the better fast orientation layer; Mem0 was valuable for granular provenance and the current voice requirement. Dual retrieval prevented the older two-turn flow from overriding Edward's newest three-turn instruction.

## 07:19–07:24 +07 — Persist confirmation flow and supplied video integration

- Task: save the new no-disclosure presentation decision, three-turn booking flow, and seam-repaired driving-video outcome.
- Mem0: three `add_memory` events with explicit user/app scope. All completed successfully with reported async latencies of 9.1 s, 19.9 s, and 8.6 s; the video event required a second status check. Tool token counts were not exposed.
- Supermemory: two `save-memory.js` project writes, both acknowledged immediately with IDs `SFXfADhzKTsFwdGEhAEuFR` and `3Ftuty3wtMXs8cxvBzAiGk`; shared call latencies were 8.2 s and 6.5 s respectively. Tool token counts were not exposed.
- Relevance/effectiveness: both layers accepted concise, implementation-specific records with file paths and validation receipts. Mem0 linked the new decision/outcome to earlier voice-flow memories; Supermemory provided the fastest unambiguous persistence receipt.
- Noise/failures: no rejection or auth failure. Mem0's asynchronous extraction required separate polling rounds; the video event remained in progress at the first check and succeeded on the second.
- Agent-experience verdict: Supermemory is the smoother write path for time-sensitive coding; Mem0 adds useful linking and metadata but has noticeably higher completion latency. Keep writing to both until the benchmark ends.

## 07:34 +07 — Persist hidden-provider UI decision

- Task: save Edward's decision to hide Valsea and ElevenLabs from viewer-facing UI while retaining them as fixed internal STT/TTS defaults.
- Mem0: one scoped `add_memory` call with decision metadata; event `9acf3c77-4381-40f6-827d-f70cfd2d7dd1` completed successfully with 12.8 s reported async latency. Tool token count was not exposed; initial shared call latency was 5.7 s.
- Supermemory: one `save-memory.js` project write; immediately acknowledged as `jEyyhoQ1pSbJ5KKKCyCvWy` in the same 5.7 s batch. Tool token count was not exposed.
- Relevance/effectiveness: both layers captured the essential split between hidden vendors and unchanged working defaults without carrying screenshot noise.
- Noise/failures: no rejection or auth failure; Mem0 again required one status poll for completion.
- Agent-experience verdict: Supermemory remained the faster persistence receipt; Mem0's structured decision metadata is useful but slower to confirm.

## 08:03 +07 — Recover the current one-step submission scope

- Task: retrieve the latest TASCO voice-flow decision before adding Edward's single time question under a 45-minute submission deadline.
- Mem0: two parallel reranked `search_memories` calls with `user_id=edwardtran` and `app_id=huyxdang-tasco-ai-map`; shared latency 6.3 s. It recovered the current flow and the no-scope-creep constraint directly.
- Supermemory: one parallel `search-memory.js --project` call; shared latency 6.3 s. It returned profile context but no project result useful for this exact state.
- Noise/failures: no tool failure. Supermemory's result was irrelevant to the implementation decision; Mem0 was concise enough to act on.
- Agent-experience verdict: Mem0 was clearly better for the newest exact state in this retrieval. The live user instruction remained authoritative.

## 08:07–08:08 +07 — Persist the one-step scope guard and validated outcome

- Task: save the decision that only one 19:00 state may be inserted, plus the validated implementation outcome.
- Mem0: two scoped `add_memory` events. Both succeeded: decision event `5893b9fc-d55c-4705-b8f5-03e97e963f0d` in 26.3 s and outcome event `6df1a916-5f86-446f-959a-a15ff1e6b66e` in 19.7 s. Tool token counts were not exposed; initial shared call latency was 8.1 s.
- Supermemory: one `save-memory.js` project write, immediately acknowledged as `nhP8ZHS7UhgGbPwT2DE3Bw` in the same 8.1 s batch. Tool token count was not exposed.
- Relevance/effectiveness: both layers retained the exact no-scope-creep boundary and the 127-pass validation receipt. Mem0 linked each record to prior TASCO memories; Supermemory gave the fastest persistence receipt.
- Noise/failures: no rejection or auth failure. Mem0 required later polling and completed substantially after Supermemory acknowledged the write.
- Agent-experience verdict: Supermemory was smoother for an urgent write receipt; Mem0 produced richer structured linkage. Both now hold the same core decision.

## 08:14–08:16 +07 — Replace July 18 with July 12 and persist the override

- Task: recover the current date contract, change only the booking date to July 12, and prevent the superseded July 18 value from returning.
- Mem0 retrieval: two parallel reranked `search_memories` calls with `user_id=edwardtran` and `app_id=huyxdang-tasco-ai-map`; shared latency 5.0 s. It surfaced the exact July 18 record and current no-scope-creep flow. Output token count was not exposed.
- Supermemory retrieval: injected context identified the July 18 contract; a follow-up `search-memory.js --project` call took 1.9 s and recovered the one-step scope guard, though the just-saved July 12 override had not surfaced yet. Output was roughly 340 tokens.
- Mem0 write: scoped event `b05f21fe-cfd1-4843-bea7-ac68e87acf17` succeeded in 7.6 s and linked the July 12 override to the superseded July 18 memory. Tool token count was not exposed.
- Supermemory write: `save-memory.js` acknowledged the same override as `tnn5FAWauQVcwNjCybBnxb` in 2.4 s. Tool token count was not exposed.
- Relevance/effectiveness: Mem0 provided the clearest old-value target and explicit linked supersession; Supermemory supplied the quickest write receipt.
- Noise/failures: no rejection or auth failure. Supermemory search indexing lagged its successful save receipt; Mem0 required status polling but completed quickly.
- Agent-experience verdict: Mem0 was better for safe correction of a stale exact value; Supermemory remained faster for persistence acknowledgement.

## 08:33–08:34 +07 — Persist verified high-level stack summary

- Task: save the repo-verified technology summary used for hackathon submission copy.
- Mem0: scoped `add_memory` event `88e3339b-3d6c-4e00-a5c4-c40fe8d0b460` succeeded in 12.7 s after polling. Tool token count was not exposed.
- Supermemory: `save-memory.js` acknowledged the same stack summary as `BNWUZJcS9vcZNMrzAMeXj6` in 1.6 s. Tool token count was not exposed.
- Relevance/effectiveness: both layers captured Next.js, React, TypeScript, MapLibre/OpenStreetMap, deterministic search, OpenAI, Valsea, and ElevenLabs without implementation noise.
- Noise/failures: no rejection or auth failure. Mem0 required four status checks before completion; Supermemory returned an immediate receipt.
- Agent-experience verdict: Supermemory was substantially smoother for this small factual write; Mem0's eventual structured record was accurate but operationally slower.
