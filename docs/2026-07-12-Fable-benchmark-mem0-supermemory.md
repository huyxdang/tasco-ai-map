# Mem0 vs Supermemory benchmark log — 2026-07-12 (Fable)

## Entries

- **2026-07-12 ~01:57 — task: resume session, recall Valsea API details for STT/TTS provider toggle.**
  Tools: Supermemory `search-memory.js --both` (node script). Mem0: **unavailable** — no Mem0 MCP tools exposed in this session, so no parallel run possible (logged as a coverage gap, not a Mem0 failure).
  Latency: ~2s. Tokens: small (~400 returned).
  Relevance: **poor for the specific question** — returned stale OpenAI Realtime-era voice memories (superseded weeks ago by the ElevenLabs migration) and unrelated profile facts (mortgage-job NOC codes). Zero Valsea hits despite Valsea decisions being discussed in prior sessions. The gstack `/context-save` checkpoint file beat Supermemory decisively: it had the exact endpoints, auth shape, and env plan.
  Noise: high (5/5 user-profile results irrelevant).
  Agent-experience verdict: for session-resume, the checkpoint file is the real memory system; Supermemory served as a weak backstop and surfaced superseded facts without any "superseded" signal — that's actively dangerous if trusted blindly.

- **2026-07-12 ~02:05 — task: write-back of session decisions (Valsea toggle, district lock).**
  Tools: Supermemory `save-memory.js` — saved OK (id 5gLMG1ZQTEawtMRWeb9wdA). Mem0: no create/add tool exposed, so per the write rule, no Mem0 write claimed.
  Latency: ~2s. Verdict: write path is smooth; one-shot dense summary per session works well.
