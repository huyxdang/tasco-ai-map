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

  it("contains none of the old fake click-through demo machinery", () => {
    expect(source).not.toContain("showDemoRail");
    expect(source).not.toContain("advanceDemo");
    expect(source).not.toContain("Chạy câu mở đầu mẫu");
    expect(source).not.toContain("chooseSubmissionCuisine");
  });

  it("derives the revised state from the journey revision, not a stage counter", () => {
    expect(source).toContain('revision.outcome === "cheaper"');
    expect(source).not.toMatch(/\bstage\s*(?:>=|<=|>|<)\s*\d/);
  });

  it("renders every grounded recommendation in the live sheet", () => {
    expect(source).toContain("response.recommendations.map((recommendation, index)");
    expect(source).not.toContain("const recommendation = response.recommendations[0]");
  });

  it("does not advertise unsupported dragging on the live sheet", () => {
    expect(source).not.toMatch(/<section className="atlas-live-sheet">\s*<div className="sheet-handle"/);
  });

  it("wires real microphone turns through the locked classifier and checkout", () => {
    expect(source).toContain("Bắt đầu bằng giọng nói");
    expect(source).toContain("await startRealtime()");
    expect(source).toContain("classifySubmissionDemoVoice(stage, message)");
    expect(source).toContain("setLatestResponse(flow.clarificationResponse)");
    expect(source).toContain("setLatestResponse(flow.response)");
    expect(source).toContain("flow.timePrompt");
    expect(source).toContain("flow.confirmationPrompt");
    expect(source).toContain("flow.bookingStartedResponse");
    expect(source).toContain("flow.bookingConfirmedResponse");
    expect(source).toContain("}, 4_000)");
    expect(source).toContain("submissionConversation");
    expect(source).not.toContain("không cần mic");
    expect(source).not.toContain("disabled={Boolean(submissionDemo)}");
    expect(source).toContain("<JourneyCheckout response={latestResponse}");
    expect(source).toContain("4 BƯỚC BẰNG GIỌNG NÓI");
    expect(source).toContain("Khoảng 7 giờ tối");
    expect(source).toContain("12 tháng 7");
  });

  it("keeps speech providers internal instead of exposing vendor selectors", () => {
    expect(source).not.toContain("voice-provider-picker");
    expect(source).not.toContain("setSttProvider");
    expect(source).not.toContain("setTtsProvider");
    expect(source).not.toContain("<strong>Valsea</strong>");
    expect(source).not.toContain("<strong>ElevenLabs</strong>");
    expect(source).toContain('const DEFAULT_STT_PROVIDER: SttProvider = "valsea"');
    expect(source).toContain('const DEFAULT_TTS_PROVIDER: SttProvider = "elevenlabs"');
  });

  it("does not reveal the scripted or simulated implementation in visible copy", () => {
    const forbiddenVisibleCopy = [
      'aria-label="Mô phỏng xe',
      "Dữ liệu &amp; tuyến mô phỏng",
      "KỊCH BẢN KHÓA",
      "Bắt đầu demo bằng giọng nói",
      "lộ trình khóa sẵn",
      "HÀNH TRÌNH MÔ PHỎNG",
      "BIÊN NHẬN VETC — MÔ PHỎNG",
      "ĐÃ THANH TOÁN MÔ PHỎNG",
      "MÔ PHỎNG TĂNG TỐC",
    ];

    expect(forbiddenVisibleCopy.filter((copy) => source.includes(copy))).toEqual([]);
  });

  it("branches locked transcripts before the unrestricted chat endpoint", () => {
    const handler = source.slice(source.indexOf("async function handleUtterance"));
    expect(handler.indexOf("if (submissionDemoRef.current)")).toBeGreaterThanOrEqual(0);
    expect(handler.indexOf("if (submissionDemoRef.current)")).toBeLessThan(handler.indexOf("queryDeterministic(message)"));
  });

  it("keeps Pizza services deduplicated into one route stop", () => {
    expect(source).toContain("const seen = new Set<string>()");
    expect(source).toContain("if (!poi || seen.has(poi.id)) return false");
    expect(source).toContain("if (!poi || seen.has(poi.id)) return []");
  });

  it("uses the supplied driving video as a silent inline loop with a poster fallback", () => {
    expect(source).toContain('<source src="/assets/tasco-driving-loop.mp4" type="video/mp4" />');
    expect(source).toContain("autoPlay");
    expect(source).toContain("muted");
    expect(source).toContain("loop");
    expect(source).toContain("playsInline");
    expect(source).toContain('poster="/assets/tasco-driving-car-scene.png"');
    expect(source).toContain("video.pause()");
    expect(source).toContain("video.play()");
  });
});
