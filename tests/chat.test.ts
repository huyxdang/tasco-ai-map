import { describe, expect, it } from "vitest";

import { handleChat } from "../src/lib/chat";

describe("deterministic chat", () => {
  it("clarifies Galaxy instead of silently choosing a destination", () => {
    const response = handleChat({ message: "Đưa tôi đến Galaxy." });

    expect(response.intent).toBe("clarification_required");
    expect(response.mapAction.type).toBe("clarify");
    expect(response.recommendations.map(({ poi }) => poi.id)).toEqual([
      "POI008",
      "POI009",
    ]);
    expect(response.assistantResponse).toContain("Galaxy Nguyễn Du");
    expect(response.privacy).toEqual({
      mode: "session-only",
      persisted: false,
    });
  });

  it.each([
    ["Vincom.", ["POI007", "POI016"]],
    ["Dẫn tôi đến sân bay.", ["POI026", "POI027"]],
  ])("clarifies %s", (message, expectedIds) => {
    const response = handleChat({ message });
    expect(response.intent).toBe("clarification_required");
    expect(response.mapAction.poiIds).toEqual(expectedIds);
  });

  it("resolves a clarification on the next client-carried turn", () => {
    const first = handleChat({ message: "Đưa tôi đến Galaxy." });
    const second = handleChat({
      message: "Rạp phim Nguyễn Du nhé",
      location: { lat: 10.775, lon: 106.7 },
      sessionContext: first.sessionContext,
    });

    expect(second.intent).toBe("navigation");
    expect(second.mapAction.type).toBe("route");
    expect(second.mapAction.selectedPoiId).toBe("POI008");
    expect(second.sessionContext?.pendingClarification).toBeUndefined();
  });

  it("retains restaurant context in a multi-turn request", () => {
    const response = handleChat({
      message: "Món Ý, dưới 500k, gần trung tâm.",
      history: [
        { role: "user", content: "Tìm nhà hàng." },
        { role: "assistant", content: "Bạn muốn loại nào?" },
      ],
      profileId: "U005",
    });

    expect(response.recommendations[0].poi.id).toBe("POI004");
    expect(response.recommendations[0].scoreBreakdown).toHaveProperty(
      "categoryMatch",
    );
  });

  it("diversifies a Da Nang beach-and-food plan", () => {
    const response = handleChat({
      message: "Tôi có 1 ngày ở Đà Nẵng, muốn đi biển và ăn đặc sản.",
      profileId: "U003",
    });
    const ids = response.recommendations.map(({ poi }) => poi.id);

    expect(response.intent).toBe("planning");
    expect(ids).toContain("POI013");
    expect(ids).toContain("POI014");
    expect(response.mapAction.type).toBe("plan");
  });
});
