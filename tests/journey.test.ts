import { describe, expect, it } from "vitest";

import { handleChat } from "../src/lib/chat";

const GOLDEN = "Tôi lái xe ở TP.HCM, cần đổ xăng, ăn tối và bãi đỗ xe.";

describe("Journey Checkout", () => {
  it("composes a deterministic grounded simulated bundle", () => {
    const first = handleChat({ message: GOLDEN, profileId: "U001" });
    const second = handleChat({ message: GOLDEN, profileId: "U001" });

    expect(first.journey).toEqual(second.journey);
    expect(first.journey?.actions).toHaveLength(3);
    expect(first.journey?.actions.map((item) => item.kind)).toEqual(["fuel", "dining", "parking"]);
    expect(first.journey?.actions.every((item) => item.simulated)).toBe(true);
    expect(first.journey?.totalVnd).toBe(first.journey?.actions.reduce((sum, item) => sum + item.finalPriceVnd, 0));
    expect(first.journey?.originalTotalVnd).toBe((first.journey?.totalVnd ?? 0) + (first.journey?.savingsVnd ?? 0));
    expect(first.recommendations.map(({ poi }) => poi.id)).toEqual(
      first.recommendations
        .slice()
        .sort((a, b) => b.score - a.score || a.poi.id.localeCompare(b.poi.id))
        .map(({ poi }) => poi.id),
    );
    expect(new Set(first.recommendations.map(({ poi }) => poi.id))).toEqual(new Set(first.journey?.actions.map((item) => item.poiId)));
  });

  it("strictly lowers the total or returns the honest grounded no-option outcome", () => {
    const first = handleChat({ message: GOLDEN, profileId: "U001" });
    const revised = handleChat({
      message: "Rẻ hơn một chút",
      profileId: "U001",
      sessionContext: first.sessionContext,
    });

    expect(revised.intent).toBe("journey_revision");
    expect(revised.journey?.actions.map((item) => item.kind)).toEqual(first.journey?.actions.map((item) => item.kind));
    if (revised.journey?.revision.outcome === "cheaper") {
      expect(revised.journey.totalVnd).toBeLessThan(first.journey!.totalVnd);
      expect(revised.journey.actions.map((item) => item.poiId)).not.toEqual(first.journey?.actions.map((item) => item.poiId));
    } else {
      expect(revised.journey?.revision.outcome).toBe("no_cheaper_option");
      expect(revised.journey?.actions).toEqual(first.journey?.actions);
      expect(revised.assistantResponse).toContain("Không có lựa chọn rẻ hơn");
    }
  });

  it("does not create checkout for ordinary search, clarification, or one action", () => {
    expect(handleChat({ message: "Tìm cafe yên tĩnh." }).journey).toBeUndefined();
    expect(handleChat({ message: "Đưa tôi đến Galaxy." }).journey).toBeUndefined();
    expect(handleChat({ message: "Tôi cần đổ xăng." }).journey).toBeUndefined();
  });
});
