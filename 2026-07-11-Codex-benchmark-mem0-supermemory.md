# Mem0 vs Supermemory benchmark — 2026-07-11

## Daily summary

For this implementation slice, Mem0 retrieval returned the most directly useful locked TASCO decisions, while Supermemory retrieval confirmed the same broad P1 history with more noise. Neither external layer accepted the checkpoint write: Mem0 rejected it as unsafe external persistence and Supermemory returned a connection error. Mem0 was the more useful read layer today; repo docs remained the authoritative implementation source.

## 18:31–18:40 ICT — TASCO Atlas first mobile redesign

- Task: retrieve prior design/architecture decisions, implement steps 1–4 plus Realtime WebRTC, and save the checkpoint.
- Mem0 tools: two parallel semantic searches (`decision`, `task_learning`) with `user_id=edwardtran` and `app_id=huyxdang-tasco-ai-map`; one `add_memory` attempt.
- Supermemory tools: project search script; save script.
- Tokens: tool did not expose per-layer token counts.
- Latency: Mem0 retrieval approximately 5 seconds in the combined call; Supermemory retrieval completed in the same window. Mem0 write returned in approximately 10 seconds; Supermemory save failed in that window.
- Relevance/effectiveness: Mem0 surfaced the exact `design.md` authority, single MapLibre canvas, and unsafe-driving exclusions. Supermemory reinforced the existing P1 implementation and branch context but added duplicated handoff history.
- Noise/failures: Mem0 write rejected due external-repo-detail risk. Supermemory save failed with `Connection error`. No successful memory write is claimed.
- Agent-experience verdict: Mem0 won this task for precise decision retrieval. Use repo-local `design.md`, decision notes, architecture, and tests as final authority; retry external writes only when the connector policy/network permits them.

## 18:48–19:02 ICT — QA regression repair

- Task: restore Journey Checkout/receipt/theater and correct Realtime grounding, mute, privacy, and tests after failed sign-off.
- Mem0 tools: parallel decision and task-learning searches with required project/user scope.
- Supermemory tools: project search script.
- Tokens: per-layer token counts were not exposed.
- Latency: both retrieval layers returned during the same approximately 4-second combined lookup.
- Relevance/effectiveness: Mem0 returned the exact single-canvas Route Theater and preserved-checkout decisions. Supermemory confirmed commit `13bcc77` as the source of the removed idempotent receipt behavior.
- Noise/failures: both layers repeated older handoff summaries; repo commit history was required for exact code recovery.
- Agent-experience verdict: Mem0 was better for constraints; Supermemory was useful for locating the prior completed implementation. The git object and current tests remained the exact source of truth.

## 19:04–19:11 ICT — second QA regression repair

- Task: fix Realtime stale closures, canonical three-stop composition, honest 3D readiness, and investigate the screenshot `N`.
- Mem0 tools: parallel decision and task-learning searches with required user/project scope.
- Supermemory tools: project search script.
- Tokens: not exposed per layer.
- Latency: combined retrieval completed in approximately 5 seconds.
- Relevance/effectiveness: Mem0 surfaced the three-action and same-canvas constraints; Supermemory reinforced the prior golden implementation history.
- Noise/failures: neither memory layer contained the exact stale-closure or Next.js portal cause; current code, golden tests, DOM inspection, and production screenshots were decisive.
- Agent-experience verdict: Mem0 remained the better constraint index. Exact debugging evidence came from the repository and runtime, not memory.
