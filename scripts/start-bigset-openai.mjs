#!/usr/bin/env node
import { spawn } from "node:child_process";

const apiKey = process.env.OPENAI_API_KEY?.trim();
if (!apiKey) {
  console.error("OPENAI_API_KEY is required. Load .env.local before running this adapter.");
  process.exit(1);
}

const model = process.env.BIGSET_OPENAI_MODEL?.trim() || "gpt-5.6-luna";
const child = spawn("npx", ["@adamexu/bigset", "start"], {
  stdio: "inherit",
  env: {
    ...process.env,
    // BigSet 0.1.x exposes only an OpenRouter-named OpenAI-compatible slot.
    // Point that slot at OpenAI directly and alias the credential in-memory.
    OPENROUTER_API_KEY: apiKey,
    OPENROUTER_BASE_URL: "https://api.openai.com/v1",
    SCHEMA_INFERENCE_MODEL: model,
    POPULATE_ORCHESTRATOR_MODEL: model,
    INVESTIGATE_SUBAGENT_MODEL: model,
    BIGSET_PROVIDER_ATTESTATION: `openai:${model}:chat-tools-reasoning-none`,
  },
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
