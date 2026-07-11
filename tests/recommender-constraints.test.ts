import { describe, expect, it } from "vitest";

import { handleChat } from "../src/lib/chat";
import { getPoiById } from "../src/lib/data";
import { rankPois } from "../src/lib/search";
import { normalizeText } from "../src/lib/text";

describe("hard category constraints", () => {
  it("returns cafés only near Hồ Hoàn Kiếm, never the lake or a park", () => {
    const response = handleChat({
      message: "Gần Hồ Hoàn Kiếm.",
      history: [
        { role: "user", content: "Tôi muốn tìm một quán cà phê yên tĩnh." },
        { role: "assistant", content: "Bạn muốn tìm khu vực nào?" },
      ],
    });
    const ids = response.recommendations.map(({ poi }) => poi.id);

    expect(response.recommendations.length).toBeGreaterThan(0);
    expect(
      response.recommendations.every(({ poi }) => poi.category === "Quán cà phê"),
    ).toBe(true);
    expect(
      response.recommendations.every(({ poi }) => poi.city === "Hà Nội"),
    ).toBe(true);
    expect(ids).toContain("POI010");
    expect(ids).not.toContain("POI030");
    expect(ids).not.toContain("POI070");
  });

  it("keeps broad discovery for vibe queries without an explicit venue type", () => {
    const response = handleChat({
      message: "Tôi có 1 ngày ở Đà Nẵng, nên đi đâu?",
      profileId: "U003",
    });
    const categories = new Set(
      response.recommendations.map(({ poi }) => poi.category),
    );

    expect(response.intent).toBe("planning");
    expect(categories.size).toBeGreaterThan(1);
  });
});

describe("numeric budget constraints", () => {
  it("extracts dưới 500k and persists it across session turns", () => {
    const first = handleChat({
      message: "món Ý, dưới 500k, gần trung tâm.",
      history: [
        { role: "user", content: "Tìm nhà hàng." },
        { role: "assistant", content: "Bạn muốn loại nào?" },
      ],
      sessionId: "budget-session",
    });

    expect(first.recommendations[0]?.poi.id).toBe("POI004");
    expect(first.sessionContext?.constraints).toContain("dưới 500k");

    const second = handleChat({
      message: "Có chỗ nào lãng mạn hơn không?",
      sessionContext: first.sessionContext,
    });
    expect(second.sessionContext?.constraints).toContain("dưới 500k");
  });

  it.each([
    ["nhà hàng dưới 500.000 cho nhóm bạn", "dưới 500 000"],
    ["khách sạn khoảng một triệu ở Đà Nẵng", "khoảng một triệu"],
  ])("parses %s", (message, expected) => {
    const response = handleChat({ message });
    expect(
      response.sessionContext?.constraints?.some(
        (constraint) => normalizeText(constraint) === normalizeText(expected),
      ),
    ).toBe(true);
  });
});

describe("composite city plus district location semantics", () => {
  it("keeps a Đống Đa, Hà Nội profile inside Hà Nội for nearby requests", () => {
    const response = handleChat({
      message: "Có quán nào để học nhóm gần đây không?",
      profileId: "U007",
    });

    expect(response.recommendations.length).toBeGreaterThan(0);
    expect(
      response.recommendations.every(({ poi }) => poi.city === "Hà Nội"),
    ).toBe(true);
    expect(
      response.recommendations.every(({ poi }) => poi.category === "Quán cà phê"),
    ).toBe(true);
    // U007 avoids premium venues, so cao cấp cafés must not be suggested.
    expect(
      response.recommendations.some(({ poi }) =>
        poi.attributes.map(normalizeText).includes("cao cap"),
      ),
    ).toBe(false);
  });

  it("binds a district mention to its canonical city", () => {
    const results = rankPois("quán cà phê ở Sơn Trà", { limit: 10 });

    expect(results.length).toBeGreaterThan(0);
    expect(results.every(({ poi }) => poi.city === "Đà Nẵng")).toBe(true);
  });
});

describe("named landmarks act as location anchors", () => {
  it("never recommends an airport for a late-night food request near TSN", () => {
    const response = handleChat({
      message: "kiếm giúp quán ăn khuya gần sân bay tân sơn nhất với",
      profileId: "U008",
    });
    const ids = response.recommendations.map(({ poi }) => poi.id);

    expect(ids).not.toContain("POI026");
    expect(ids).not.toContain("POI027");
    expect(
      response.recommendations.every(({ poi }) => poi.category === "Nhà hàng"),
    ).toBe(true);
    expect(response.mapAction.center).toEqual(getPoiById("POI026")?.coordinates);
  });

  it("excludes the anchor POI itself from café results near it", () => {
    const response = handleChat({ message: "quán cà phê gần Hồ Gươm" });
    const ids = response.recommendations.map(({ poi }) => poi.id);

    expect(ids).not.toContain("POI030");
    expect(
      response.recommendations.every(({ poi }) => poi.category === "Quán cà phê"),
    ).toBe(true);
  });
});

describe("interactive refinement", () => {
  it("removes a constraint deterministically when the chip is dismissed", () => {
    const first = handleChat({ message: "Nhà hàng món Việt gần trung tâm ở Quận 1" });
    expect(first.sessionContext?.constraints).toContain("món Việt");
    expect(first.sessionContext?.constraints).toContain("gần trung tâm");

    const second = handleChat({ message: "Bỏ tiêu chí món Việt", sessionContext: first.sessionContext });
    expect(second.sessionContext?.constraints).not.toContain("món Việt");
    expect(second.sessionContext?.constraints).toContain("gần trung tâm");
    // Context survives: the removal turn is an edit, not a new request.
    expect(second.sessionContext?.lastQuery).toBe("Nhà hàng món Việt gần trung tâm ở Quận 1");
    expect(second.recommendations.length).toBeGreaterThan(0);
  });

  it("offers tappable quick replies on clarification turns", () => {
    const bare = handleChat({ message: "Tìm nhà hàng." });
    expect(bare.intent).toBe("clarification_required");
    expect(bare.quickReplies?.length).toBeGreaterThanOrEqual(2);

    const ambiguous = handleChat({ message: "Đưa tôi đến Galaxy." });
    expect(ambiguous.quickReplies).toContain("Galaxy Nguyễn Du");
    expect(ambiguous.quickReplies).toContain("Galaxy Hotel Đà Nẵng");
  });
});

describe("honest no-match behavior", () => {
  it("states the unmet constraints when the dataset has no qualifying POI", () => {
    const response = handleChat({
      message: "kiếm giúp quán ăn khuya gần sân bay tân sơn nhất với",
      profileId: "U008",
    });

    expect(response.recommendations).toEqual([]);
    expect(response.mapAction.poiIds).toEqual([]);
    expect(response.assistantResponse).toContain("chưa có nhà hàng");
    expect(response.assistantResponse).toContain("Sân bay Tân Sơn Nhất");
    expect(response.assistantResponse).toContain("mở cửa khuya");
  });

  it("returns zero recommendations instead of wrong-city venues", () => {
    const response = handleChat({ message: "quán cà phê ở Nha Trang" });

    expect(response.recommendations).toEqual([]);
    expect(response.assistantResponse).toContain("chưa có quán cà phê");
  });
});
