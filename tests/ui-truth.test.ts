import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

// Regression lock for the "Quán Bụi incident": the live recommendation card
// once rendered a fabricated restaurant with literal distance/time/price
// strings while ignoring the deterministic response it received. The design
// contract is explicit — "the exact amount and place must come from
// deterministic output, not from example copy."
const FORBIDDEN_LITERALS = [
  "Quán Bụi",
  "Sông Quê",
  "880.000",
  "1.000.000 ₫\"",
  "800 m",
  "8 phút",
  "22 phút",
  "4,5 km",
  "Tiết kiệm 120.000",
  "Xem hành trình đề xuất",
];

describe("UI truthfulness", () => {
  const source = readFileSync(resolve("src/components/tasco-atlas.tsx"), "utf8");

  it("contains no fabricated venue, distance, time, or price literals", () => {
    const found = FORBIDDEN_LITERALS.filter((literal) => source.includes(literal));
    expect(found).toEqual([]);
  });

  it("renders chips from the deterministic session constraints", () => {
    expect(source).toContain("sessionContext?.constraints");
    expect(source).not.toMatch(/stage >= 1\s*\?\s*\[/);
  });

  it("contains no demo chrome or scripted-stage machinery at all", () => {
    expect(source).not.toContain("showDemoRail");
    expect(source).not.toContain("advanceDemo");
    expect(source).not.toContain("Chạy câu mở đầu mẫu");
    expect(source).not.toContain("DemoStage");
  });

  it("derives the revised state from the journey revision, not a stage counter", () => {
    expect(source).toContain('revision.outcome === "cheaper"');
    expect(source).not.toMatch(/\bsetStage\b|\bstage\s*[>=]/);
  });
});
