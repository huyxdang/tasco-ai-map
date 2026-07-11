import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { runConversationScenarioEval, scenarioEvalMarkdown } from "../src/lib/conversation-scenario-eval";

describe("Conversation_Scenarios evaluation", () => {
  it("runs every workbook scenario and records auditable traces", () => {
    const report = runConversationScenarioEval();
    const jsonPath = resolve("artifacts/evals/conversation-scenarios-traces.json");
    const markdownPath = resolve("artifacts/evals/conversation-scenarios-report.md");
    mkdirSync(dirname(jsonPath), { recursive: true });
    writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(markdownPath, scenarioEvalMarkdown(report));

    expect(report.scenarioCount).toBe(90);
    expect(report.workbook.count).toBe(8);
    expect(report.synthetic.count).toBe(82);
    expect(report.traces.slice(0, 8).map((trace) => trace.scenarioId)).toEqual([
      "S001", "S002", "S003", "S004", "S005", "S006", "S007", "S008",
    ]);
    expect(report.traces.slice(8).every((trace) => trace.scenarioId.startsWith("SYN"))).toBe(true);
    expect(report.traces.every((trace) => trace.criteria.reduce((sum, item) => sum + item.weight, 0) === 100)).toBe(true);
    expect(report.traces.every((trace) => trace.actual.recommendations.every((item) => item.id.startsWith("POI")))).toBe(true);
  });

  it("passes every workbook scenario exactly", () => {
    const report = runConversationScenarioEval();
    const notExact = report.traces
      .filter((trace) => trace.source === "workbook" && trace.status !== "pass")
      .map((trace) => `${trace.scenarioId}: ${trace.criteria.filter((item) => !item.passed).map((item) => item.detail).join("; ")}`);

    expect(notExact).toEqual([]);
    expect(report.workbook.passed).toBe(8);
  });

  it("stays above the 90% bar across all 90 scenarios", () => {
    const report = runConversationScenarioEval();
    const failures = report.traces
      .filter((trace) => trace.status !== "pass")
      .map((trace) => `${trace.scenarioId}: ${trace.criteria.filter((item) => !item.passed).map((item) => item.detail).join("; ")}`);

    expect(report.exactPassRate, failures.join("\n")).toBeGreaterThanOrEqual(0.9);
    expect(report.averageScore).toBeGreaterThanOrEqual(90);
    expect(report.failed).toBe(0);
  });

  it("keeps S008 honest: the no-match answer is grounded, not fabricated", () => {
    const report = runConversationScenarioEval();
    const s008 = report.traces.find((trace) => trace.scenarioId === "S008");

    expect(s008?.actual.recommendations).toEqual([]);
    expect(s008?.actual.mapAction.poiIds).toEqual([]);
    expect(s008?.actual.assistantResponse).toContain("chưa có nhà hàng");
    expect(s008?.actual.assistantResponse).toContain("Tân Sơn Nhất");
    expect(s008?.actual.assistantResponse).toContain("mở cửa khuya");
  });
});
