#!/usr/bin/env node
// Uploads the conversation-scenario eval results to Langfuse as scored traces —
// the judge-facing evidence that the 90-scenario benchmark is real and current.
//
// Usage: set -a; source .env.local; set +a; node scripts/upload-eval-langfuse.mjs

import { readFileSync } from "node:fs";

import { Langfuse } from "langfuse";

const secretKey = process.env.LANGFUSE_SECRET_KEY;
const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
if (!secretKey || !publicKey) {
  console.error("LANGFUSE_SECRET_KEY / LANGFUSE_PUBLIC_KEY missing — source .env.local first.");
  process.exit(1);
}

const report = JSON.parse(
  readFileSync("artifacts/evals/conversation-scenarios-traces.json", "utf8"),
);

const baseUrl =
  process.env.LANGFUSE_URL ||
  process.env.LANGFUSE_BASEURL ||
  process.env.LANGFUSE_HOST ||
  "https://jp.cloud.langfuse.com";
const langfuse = new Langfuse({ secretKey, publicKey, baseUrl });

const runTag = `eval-${report.generatedAt.slice(0, 16).replace(/[:T]/g, "-")}`;

for (const trace of report.traces) {
  const t = langfuse.trace({
    name: `eval:${trace.scenarioId}`,
    input: trace.turns.join("\n"),
    output: trace.actual.assistantResponse,
    metadata: {
      source: trace.source,
      category: trace.category,
      expectedBehavior: trace.expectedBehavior,
      requiredMapAction: trace.requiredMapAction,
      recommendationIds: trace.actual.recommendations.map((item) => item.id),
      failedCriteria: trace.criteria.filter((c) => !c.passed).map((c) => `${c.name}: ${c.detail}`),
    },
    tags: ["tasco-eval", trace.source, runTag],
  });
  t.score({ name: "scenario-score", value: trace.score / 100 });
  t.score({ name: "exact-pass", value: trace.status === "pass" ? 1 : 0 });
}

const summary = langfuse.trace({
  name: "eval:summary",
  input: `dataset.xlsx#Conversation_Scenarios + synthetic pack (${report.scenarioCount} scenarios)`,
  output: `${report.passed}/${report.scenarioCount} exact (${(report.exactPassRate * 100).toFixed(1)}%), weighted ${report.averageScore}%`,
  metadata: {
    workbook: report.workbook,
    synthetic: report.synthetic,
    generatedAt: report.generatedAt,
  },
  tags: ["tasco-eval", "summary", runTag],
});
summary.score({ name: "exact-pass-rate", value: report.exactPassRate });
summary.score({ name: "weighted-average", value: report.averageScore / 100 });

await langfuse.flushAsync();
await langfuse.shutdownAsync();

// Verify server-side — a silent 401 must not masquerade as success. Ingestion
// is asynchronous, so poll briefly before declaring failure.
let total = 0;
const expectedTotal = report.traces.length + 1; // one trace per scenario + summary
for (let attempt = 0; attempt < 6; attempt++) {
  await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 2_000 : 5_000));
  const verify = await fetch(`${baseUrl}/api/public/traces?tags=${encodeURIComponent(runTag)}&limit=1`, {
    headers: { Authorization: `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString("base64")}` },
  });
  if (!verify.ok) continue;
  const body = await verify.json();
  total = body.meta?.totalItems ?? 0;
  if (total >= expectedTotal) break;
}
if (total < expectedTotal) {
  console.error(`VERIFICATION FAILED: Langfuse reports ${total}/${expectedTotal} traces for tag ${runTag} after polling.`);
  process.exit(1);
}
console.log(`uploaded + verified: Langfuse holds ${total} traces for tag ${runTag} (expected at least ${expectedTotal}) at ${baseUrl}`);
