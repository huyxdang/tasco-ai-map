import { describe, expect, it } from "vitest";

import { getPack } from "../src/lib/data";
import {
  buildSubmissionDemoFlow,
  classifySubmissionDemoVoice,
  resolveSubmissionDemoOrigin,
  SUBMISSION_DEMO_CONFIRMATION_ANSWER,
  SUBMISSION_DEMO_CUISINE_ANSWER,
  SUBMISSION_DEMO_FALLBACK_ORIGIN,
  SUBMISSION_DEMO_POI_IDS,
  SUBMISSION_DEMO_REQUEST,
  SUBMISSION_DEMO_TIME_ANSWER,
} from "../src/lib/submission-demo";

describe("locked submission voice contract", () => {
  it("advances the exact and colloquial Vietnamese request to cuisine", () => {
    const variants = [
      SUBMISSION_DEMO_REQUEST,
      "Ờm, ăn tối ở Quận một cho ba người chúng mình, ăn xong đi cà phê yên tĩnh làm việc.",
      "Nhóm 3 ở Q1 muốn ăn tối, sau đó uống coffee và làm việc.",
    ];

    for (const text of variants) {
      expect(classifySubmissionDemoVoice("request", text)).toEqual({
        accepted: true,
        stage: "request",
        nextStage: "cuisine",
      });
    }
  });

  it("requires all four request facts and rejects arbitrary destinations", () => {
    const rejected = [
      "Ba người ăn tối ở Quận 1.",
      "Ăn tối ở Quận 1 rồi đi cà phê.",
      "Ba người ăn tối rồi đi cà phê.",
      "Ba người ở Quận 1 đi cà phê làm việc.",
      "Ba người ở Quận 1 ăn tối rồi ra cà phê trước khi đi sân bay.",
      "Đưa tôi đến sân bay Tân Sơn Nhất.",
      "Tìm khách sạn gần đây.",
    ];

    for (const text of rejected) {
      expect(classifySubmissionDemoVoice("request", text)).toEqual({
        accepted: false,
        stage: "request",
        nextStage: "request",
      });
    }
  });

  it("accepts only Italian, món Ý, or pizza variants at the cuisine stage", () => {
    const accepted = ["Món Ý.", "Tôi chọn đồ Ý nhé", "Italian", "Italia", "Pizza 4P's", "Ý"];

    for (const text of accepted) {
      expect(classifySubmissionDemoVoice("cuisine", text)).toEqual({
        accepted: true,
        stage: "cuisine",
        nextStage: "time",
      });
    }
  });

  it("accepts only the hard-coded 19:00 dinner time", () => {
    const accepted = [
      SUBMISSION_DEMO_TIME_ANSWER,
      "7:00 PM",
      "7 PM",
      "7 giờ tối",
      "Bảy giờ tối nhé",
      "19:00",
      "19 giờ",
      "Mười chín giờ",
    ];

    for (const text of accepted) {
      expect(classifySubmissionDemoVoice("time", text)).toEqual({
        accepted: true,
        stage: "time",
        nextStage: "confirmation",
      });
    }
  });

  it("rejects other or ambiguous reservation times", () => {
    const rejected = ["7 giờ sáng", "7:00 AM", "8 PM", "20:00", "Ngày mai", "Gì cũng được", ""];

    for (const text of rejected) {
      expect(classifySubmissionDemoVoice("time", text)).toEqual({
        accepted: false,
        stage: "time",
        nextStage: "time",
      });
    }
  });

  it("rejects Japanese, airport, random, and negated Italian choices", () => {
    const rejected = [
      "Món Nhật",
      "Đưa tôi ra sân bay",
      "Gì cũng được",
      "Không ăn pizza, chọn món Nhật",
      "Không chọn món Ý",
      "",
    ];

    for (const text of rejected) {
      expect(classifySubmissionDemoVoice("cuisine", text)).toEqual({
        accepted: false,
        stage: "cuisine",
        nextStage: "cuisine",
      });
    }
  });

  it("accepts broad Vietnamese and English confirmation phrases", () => {
    const accepted = [
      "Chốt đi",
      "Chốt",
      "Được",
      "Ổn đó",
      "ok",
      "Okay nhé",
      "Đồng ý",
      "yes",
      "yep",
      "Yeah, that's cool",
      "Sounds good",
      "Sure",
      "Let's do it",
      "Chuẩn, chính xác",
      "Triển",
      "Làm đi",
    ];

    for (const text of accepted) {
      expect(classifySubmissionDemoVoice("confirmation", text)).toEqual({
        accepted: true,
        stage: "confirmation",
        nextStage: "complete",
      });
    }
  });

  it("keeps confirmation locked for negatives, changes, and random speech", () => {
    const rejected = [
      "Không",
      "No",
      "Chưa",
      "Đổi đi",
      "Không, chốt đi",
      "No, okay",
      "Cho tôi xem lựa chọn khác",
      "",
    ];

    for (const text of rejected) {
      expect(classifySubmissionDemoVoice("confirmation", text)).toEqual({
        accepted: false,
        stage: "confirmation",
        nextStage: "confirmation",
      });
    }
  });

  it("never skips a stage or advances after completion", () => {
    expect(classifySubmissionDemoVoice("request", "Món Ý")).toEqual({
      accepted: false,
      stage: "request",
      nextStage: "request",
    });
    expect(classifySubmissionDemoVoice("cuisine", "Chốt đi")).toEqual({
      accepted: false,
      stage: "cuisine",
      nextStage: "cuisine",
    });
    expect(classifySubmissionDemoVoice("time", "Món Ý")).toEqual({
      accepted: false,
      stage: "time",
      nextStage: "time",
    });
    expect(classifySubmissionDemoVoice("confirmation", "7:00 PM")).toEqual({
      accepted: false,
      stage: "confirmation",
      nextStage: "confirmation",
    });
    expect(classifySubmissionDemoVoice("confirmation", "Món Ý")).toEqual({
      accepted: false,
      stage: "confirmation",
      nextStage: "confirmation",
    });
    expect(classifySubmissionDemoVoice("complete", SUBMISSION_DEMO_REQUEST)).toEqual({
      accepted: false,
      stage: "complete",
      nextStage: "complete",
    });
    expect(classifySubmissionDemoVoice("complete", "Món Ý")).toEqual({
      accepted: false,
      stage: "complete",
      nextStage: "complete",
    });
  });
});

describe("submission-critical deterministic demo", () => {
  const workbookPois = getPack("workbook").pois;

  it("locks the judged recording path to Pizza 4P's then Trung Nguyên", () => {
    const flow = buildSubmissionDemoFlow(workbookPois);

    expect(flow.stops.map((poi) => poi.id)).toEqual([...SUBMISSION_DEMO_POI_IDS]);
    expect(flow.stops.map((poi) => poi.name)).toEqual([
      "Pizza 4P's Hai Bà Trưng",
      "Trung Nguyên Legend Café Lý Tự Trọng",
    ]);
    expect(flow.route.maneuvers).toHaveLength(2);
    expect(flow.route.geometry.coordinates[0]).toEqual([
      SUBMISSION_DEMO_FALLBACK_ORIGIN.lon,
      SUBMISSION_DEMO_FALLBACK_ORIGIN.lat,
    ]);
    expect(flow.route.geometry.coordinates.at(-1)).toEqual([
      flow.stops[1].coordinates.lon,
      flow.stops[1].coordinates.lat,
    ]);
    expect(flow.narration.plan).toContain("sau đó Trung Nguyên");
  });

  it("asks one cuisine clarification before fixing the Italian restaurant", () => {
    const flow = buildSubmissionDemoFlow(workbookPois);

    expect(flow.turns.slice(0, 3)).toEqual([
      { stage: "request", role: "user", text: SUBMISSION_DEMO_REQUEST },
      {
        stage: "clarification",
        role: "assistant",
        text: "Ba người ăn tối ở Quận 1. Mọi người muốn ăn món gì?",
      },
      { stage: "cuisine", role: "user", text: SUBMISSION_DEMO_CUISINE_ANSWER },
    ]);
    expect(flow.clarificationResponse).toMatchObject({
      intent: "clarification_required",
      quickReplies: ["Món Ý", "Món Việt", "Món Nhật"],
      recommendations: [],
      mapAction: { type: "clarify" },
    });
    expect(flow.response.recommendations.map(({ poi }) => poi.id)).toEqual([
      "POI004",
      "POI017",
    ]);
  });

  it("asks for 19:00, then confirms July 12 before the booking sequence", () => {
    const flow = buildSubmissionDemoFlow(workbookPois);

    expect(flow.timePrompt).toBe(
      "Mình đề xuất Pizza 4P's Hai Bà Trưng cho bữa tối, sau đó đến Trung Nguyên Legend Café Lý Tự Trọng để làm việc. Bạn muốn đặt bàn Pizza 4P's lúc mấy giờ?",
    );
    expect(flow.confirmationPrompt).toBe(
      "Được. Mình sẽ đặt bàn cho 3 người tại Pizza 4P's Hai Bà Trưng lúc 19:00 ngày 12 tháng 7. Trung Nguyên Legend Café Lý Tự Trọng dự kiến khá thoáng vào giờ này nên bạn không cần đặt chỗ trước. Bạn xác nhận đúng ngày 12 tháng 7 lúc 19:00 nhé?",
    );
    expect(flow.turns.slice(3)).toEqual([
      { stage: "time", role: "assistant", text: flow.timePrompt },
      { stage: "time", role: "user", text: SUBMISSION_DEMO_TIME_ANSWER },
      { stage: "confirmation", role: "assistant", text: flow.confirmationPrompt },
      { stage: "confirmation", role: "user", text: SUBMISSION_DEMO_CONFIRMATION_ANSWER },
      { stage: "booking", role: "assistant", text: flow.bookingStartedResponse },
      { stage: "confirmed", role: "assistant", text: flow.bookingConfirmedResponse },
    ]);
    expect(flow.bookingStartedResponse).toBe(
      "Được, mình đang đặt bàn Pizza 4P's Hai Bà Trưng lúc 19:00 ngày 12 tháng 7 và hoàn tất hành trình.",
    );
    expect(flow.bookingConfirmedResponse).toContain("Mọi thứ đã được xác nhận");
    expect(flow.bookingConfirmedResponse).toContain("19:00 ngày 12 tháng 7");
    expect(flow.bookingConfirmedResponse).toContain("không cần đặt trước");
    expect(flow.bookingConfirmedResponse).toContain("VETC đang chờ bạn thanh toán");
    expect(flow.response.assistantResponse).toBe(flow.bookingConfirmedResponse);
    expect(flow.response.sessionContext?.constraints).toEqual(expect.arrayContaining(["19:00", "12 tháng 7"]));
  });

  it("returns a checkout-ready journey with one duplicate POI service but only two route destinations", () => {
    const flow = buildSubmissionDemoFlow(workbookPois);
    const journey = flow.response.journey!;

    expect(journey.actions.map(({ poiId, kind }) => [poiId, kind])).toEqual([
      ["POI004", "dining"],
      ["POI004", "parking"],
      ["POI017", "dining"],
    ]);
    expect(flow.response.mapAction.poiIds).toEqual(["POI004", "POI017"]);
    expect(new Set(flow.response.mapAction.poiIds).size).toBe(2);
    expect(flow.route.maneuvers).toHaveLength(2);
  });

  it("auto-confirms only the simulated table for 3 and leaves one parking payment ready", () => {
    const journey = buildSubmissionDemoFlow(workbookPois).response.journey!;
    const [table, parking, coffee] = journey.actions;

    expect(table).toMatchObject({
      poiId: "POI004",
      kind: "dining",
      status: "confirmed",
      simulated: true,
      requestedCategory: "restaurant",
      requestedCuisine: "italian",
    });
    expect(table.reason).toContain("3 người");
    expect(table.cta).toBe("Đã giữ bàn cho 3 người · 19:00 ngày 12/7");
    expect(table.reason).toContain("19:00 ngày 12 tháng 7");
    expect(parking).toMatchObject({
      poiId: "POI004",
      kind: "parking",
      status: "ready",
      simulated: true,
      originalPriceVnd: 60_000,
      discountVnd: 15_000,
      finalPriceVnd: 45_000,
    });
    expect(parking.reason).toContain("ưu đãi VETC");
    expect(coffee).toMatchObject({ poiId: "POI017", status: "ready", simulated: true });
    expect(coffee.reason).toContain("không cần đặt chỗ trước");
    expect(journey.walletLabel).toBe("Ví VETC");
  });

  it("keeps totals internally consistent for the simulated receipt", () => {
    const journey = buildSubmissionDemoFlow(workbookPois).response.journey!;
    const sum = (key: "originalPriceVnd" | "discountVnd" | "finalPriceVnd") =>
      journey.actions.reduce((total, action) => total + action[key], 0);

    expect(journey.originalTotalVnd).toBe(sum("originalPriceVnd"));
    expect(journey.discountTotalVnd).toBe(sum("discountVnd"));
    expect(journey.totalVnd).toBe(sum("finalPriceVnd"));
    expect(journey.savingsVnd).toBe(15_000);
    expect(journey.simulated).toBe(true);
    expect(flowText(journey.actions.map((action) => `${action.cta} ${action.reason}`))).not.toMatch(
      /https?:\/\/|booking\.|đặt bàn thật|giao dịch thật/i,
    );
  });

  it("uses a visible, stable Quận 1 fallback when GPS is absent or invalid", () => {
    const missing = resolveSubmissionDemoOrigin();
    const invalid = resolveSubmissionDemoOrigin({ lat: Number.NaN, lon: 106.7 });

    expect(missing).toEqual(invalid);
    expect(missing).toMatchObject({
      source: "simulated",
      coordinates: SUBMISSION_DEMO_FALLBACK_ORIGIN,
    });
    expect(missing.disclosure).toBe("Điểm xuất phát mặc định tại Quận 1.");
  });

  it("uses valid device coordinates without changing stop order", () => {
    const currentLocation = { lat: 10.7739, lon: 106.7008 };
    const flow = buildSubmissionDemoFlow(workbookPois, currentLocation);

    expect(flow.origin).toMatchObject({ source: "device", coordinates: currentLocation });
    expect(flow.stops.map((poi) => poi.id)).toEqual([...SUBMISSION_DEMO_POI_IDS]);
    expect(flow.route.geometry.coordinates[0]).toEqual([
      currentLocation.lon,
      currentLocation.lat,
    ]);
  });

  it("fails loudly at startup instead of recording a partial or wrong route", () => {
    const withoutCoffee = workbookPois.filter((poi) => poi.id !== "POI017");

    expect(() => buildSubmissionDemoFlow(withoutCoffee)).toThrow(
      "Submission demo is missing required POIs: POI017",
    );
  });
});

function flowText(parts: string[]): string {
  return parts.join(" ");
}
