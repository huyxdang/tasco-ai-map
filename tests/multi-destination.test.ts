import { describe, expect, it } from "vitest";

import { handleChat } from "../src/lib/chat";
import { canonicalQueryFrom } from "../src/lib/nlu";

describe("ordered multi-destination conversations", () => {
  it("preserves the translator's ordered enum stops in canonical form", () => {
    expect(
      canonicalQueryFrom({
        stops: [
          { category: "cafe" },
          { category: "restaurant", cuisine: "vietnamese" },
        ],
        area: "Hà Nội",
      }),
    ).toBe("quán cà phê rồi nhà hàng món Việt, ở Hà Nội");
    expect(
      canonicalQueryFrom({
        stops: [
          { category: "cafe" },
          { category: "restaurant", cuisine: "pho" },
        ],
        area: "Quận 1",
      }),
    ).toBe("quán cà phê rồi nhà hàng phở, ở Quận 1");
  });

  it("turns coffee then pho into an ordered cafe-to-restaurant journey in rules mode", () => {
    const response = handleChat({
      message: "I want coffee then phở in Hà Nội.",
    });

    expect(response.journey?.actions.map((action) => action.requestedCategory)).toEqual([
      "cafe",
      "restaurant",
    ]);
    expect(response.journey?.actions.map((action) => action.kind)).toEqual([
      "dining",
      "dining",
    ]);
    expect(response.journey?.actions.map((action) => action.requestedCuisine)).toEqual([
      undefined,
      "pho",
    ]);
    expect(response.recommendations.map(({ poi }) => poi.category)).toEqual([
      "Quán cà phê",
      "Nhà hàng",
    ]);
    expect(response.recommendations[1]?.poi.name).toContain("Phở");
    expect(response.recommendations.map(({ poi }) => poi.id)).toEqual(
      response.journey?.actions.map((action) => action.poiId),
    );
    expect(response.mapAction.type).toBe("plan");
    expect(response.sessionContext?.journey?.requestedCategories).toEqual([
      "cafe",
      "restaurant",
    ]);
    expect(response.sessionContext?.journey?.requestedCuisines).toEqual([
      null,
      "pho",
    ]);
  });

  it("recomposes both ordered recommendations from carried conversational context", () => {
    const first = handleChat({
      message: "Tôi muốn uống cà phê rồi ăn phở ở Hà Nội.",
    });
    const second = handleChat({
      message: "Điểm cà phê đầu tiên phải yên tĩnh hơn.",
      sessionContext: first.sessionContext,
    });

    expect(second.journey?.actions.map((action) => action.requestedCategory)).toEqual([
      "cafe",
      "restaurant",
    ]);
    expect(second.journey?.actions.map((action) => action.requestedCuisine)).toEqual([
      undefined,
      "pho",
    ]);
    expect(second.recommendations.map(({ poi }) => poi.category)).toEqual([
      "Quán cà phê",
      "Nhà hàng",
    ]);
    expect(second.recommendations[0]?.poi.attributes).toContain("yên tĩnh");
    expect(second.recommendations[1]?.poi.name).toContain("Phở");
    expect(second.recommendations.map(({ poi }) => poi.id)).toEqual(
      second.journey?.actions.map((action) => action.poiId),
    );
    expect(second.journey?.actions[0]?.poiId).not.toBe(
      first.journey?.actions[0]?.poiId,
    );
  });

  it("resets the old journey when the user starts an unrelated explicit search", () => {
    const journey = handleChat({
      message: "Coffee then phở in Hà Nội.",
    });
    const cheaperHotel = handleChat({
      message: "Tìm khách sạn rẻ hơn ở Quận 1.",
      sessionContext: journey.sessionContext,
    });

    expect(cheaperHotel.intent).not.toBe("journey_revision");
    expect(cheaperHotel.journey).toBeUndefined();
    expect(
      cheaperHotel.recommendations.every(
        ({ poi }) => poi.category === "Khách sạn",
      ),
    ).toBe(true);

    const hotel = handleChat({
      message: "Tìm khách sạn ở Quận 1.",
      sessionContext: journey.sessionContext,
    });

    expect(hotel.journey).toBeUndefined();
    expect(hotel.sessionContext?.journey).toBeUndefined();
    expect(hotel.sessionContext?.recentQueries).toEqual([
      "Tìm khách sạn ở Quận 1.",
    ]);
    expect(hotel.recommendations.length).toBeGreaterThan(0);
    expect(
      hotel.recommendations.every(({ poi }) => poi.category === "Khách sạn"),
    ).toBe(true);

    const refinement = handleChat({
      message: "Yên tĩnh hơn.",
      sessionContext: hotel.sessionContext,
    });
    expect(refinement.journey).toBeUndefined();
    expect(
      refinement.recommendations.every(
        ({ poi }) => poi.category === "Khách sạn" && poi.city === "TP.HCM",
      ),
    ).toBe(true);
  });

  it("treats an explicit single-category search as a new topic", () => {
    const journey = handleChat({
      message: "Coffee then phở in Hà Nội.",
    });
    const cafe = handleChat({
      message: "Tìm quán cà phê ở Quận 1.",
      sessionContext: journey.sessionContext,
    });

    expect(cafe.journey).toBeUndefined();
    expect(
      cafe.recommendations.every(
        ({ poi }) => poi.category === "Quán cà phê" && poi.city === "TP.HCM",
      ),
    ).toBe(true);

    const bareCafe = handleChat({
      message: "Quán cà phê ở Quận 1.",
      sessionContext: journey.sessionContext,
    });
    expect(bareCafe.journey).toBeUndefined();
    expect(
      bareCafe.recommendations.every(
        ({ poi }) => poi.category === "Quán cà phê" && poi.city === "TP.HCM",
      ),
    ).toBe(true);

    const bareCafeWithoutArea = handleChat({
      message: "Quán cà phê.",
      sessionContext: journey.sessionContext,
    });
    expect(bareCafeWithoutArea.journey).toBeUndefined();
    expect(bareCafeWithoutArea.sessionContext?.journey).toBeUndefined();
  });

  it("clears the old journey before clarifying a new topic", () => {
    const journey = handleChat({
      message: "Coffee then phở in Hà Nội.",
    });
    const hotelQuestion = handleChat({
      message: "Tìm khách sạn.",
      sessionContext: journey.sessionContext,
    });

    expect(hotelQuestion.intent).toBe("clarification_required");
    expect(hotelQuestion.sessionContext?.journey).toBeUndefined();
    expect(hotelQuestion.sessionContext?.recentQueries).toEqual([
      "Tìm khách sạn.",
    ]);

    const hotelAnswer = handleChat({
      message: "Ở Quận 1.",
      sessionContext: hotelQuestion.sessionContext,
    });
    expect(hotelAnswer.journey).toBeUndefined();
    expect(
      hotelAnswer.recommendations.every(
        ({ poi }) => poi.category === "Khách sạn" && poi.city === "TP.HCM",
      ),
    ).toBe(true);
  });

  it("moves every carried stop when the user changes city", () => {
    const journey = handleChat({
      message: "Coffee then phở in Hà Nội.",
    });
    const moved = handleChat({
      message: "Chuyển sang TP.HCM.",
      sessionContext: journey.sessionContext,
    });

    expect(moved.journey?.actions.map((action) => action.requestedCategory)).toEqual([
      "cafe",
      "restaurant",
    ]);
    expect(
      moved.recommendations.every(({ poi }) => poi.city === "TP.HCM"),
    ).toBe(true);
    expect(moved.sessionContext?.journey?.location).toBe("TP.HCM");

    const cheaper = handleChat({
      message: "Rẻ hơn một chút.",
      sessionContext: moved.sessionContext,
    });
    expect(cheaper.intent).toBe("journey_revision");
    expect(
      cheaper.recommendations.map(({ poi }) => [poi.category, poi.city]),
    ).toEqual([
      ["Quán cà phê", "TP.HCM"],
      ["Nhà hàng", "TP.HCM"],
    ]);
  });

  it("does not let assistant history resurrect an ordered journey", () => {
    const response = handleChat({
      message: "Yên tĩnh hơn ở Quận 1.",
      history: [
        {
          role: "assistant",
          content: "Coffee then phở in Hà Nội.",
        },
      ],
    });

    expect(response.journey).toBeUndefined();
  });

  it("uses only the three latest prior user turns from explicit history", () => {
    const newerTurns = [
      "Lượt mới một.",
      "Lượt mới hai.",
      "Lượt mới ba.",
      "Lượt mới bốn.",
      "Lượt mới năm.",
    ];
    const response = handleChat({
      message: "Yên tĩnh hơn ở Quận 1.",
      history: [
        { role: "user", content: "Coffee then phở in Hà Nội." },
        ...newerTurns.map((content) => ({ role: "user" as const, content })),
        {
          role: "assistant",
          content: "Tôi từng nhắc lại coffee then phở, nhưng đây không phải lời người dùng.",
        },
      ],
    });

    expect(response.journey).toBeUndefined();
    expect(response.sessionContext?.recentQueries).toEqual([
      ...newerTurns.slice(-3),
      "Yên tĩnh hơn ở Quận 1.",
    ]);
  });

  it("bounds client-carried recentQueries before interpreting the turn", () => {
    const newerTurns = [
      "Lượt client một.",
      "Lượt client hai.",
      "Lượt client ba.",
      "Lượt client bốn.",
      "Lượt client năm.",
    ];
    const response = handleChat({
      message: "Yên tĩnh hơn ở Quận 1.",
      sessionContext: {
        recentQueries: ["Coffee then phở in Hà Nội.", ...newerTurns],
        lastQuery: newerTurns.at(-1),
      },
    });

    expect(response.journey).toBeUndefined();
    expect(response.sessionContext?.recentQueries).toEqual([
      ...newerTurns.slice(-3),
      "Yên tĩnh hơn ở Quận 1.",
    ]);
  });

  it("uses the current NLU hint to reset an ordered journey to a translated new topic", () => {
    const journey = handleChat({
      message: "Coffee then phở in Hà Nội.",
    });
    const hotel = handleChat({
      message: "1군에서 호텔을 찾아줘.",
      nluHint: "khách sạn ở Quận 1",
      sessionContext: journey.sessionContext,
    });

    expect(hotel.journey).toBeUndefined();
    expect(hotel.sessionContext?.journey).toBeUndefined();
    expect(hotel.sessionContext?.recentQueries).toEqual([
      "1군에서 호텔을 찾아줘.",
    ]);
    expect(
      hotel.recommendations.every(
        ({ poi }) => poi.category === "Khách sạn" && poi.city === "TP.HCM",
      ),
    ).toBe(true);
  });

  it("treats a comparative category phrase as a stop refinement", () => {
    const journey = handleChat({
      message: "Coffee then phở in Hà Nội.",
    });
    const refined = handleChat({
      message: "Quán cà phê yên tĩnh hơn.",
      sessionContext: journey.sessionContext,
    });

    expect(refined.journey?.actions.map((action) => action.requestedCategory)).toEqual([
      "cafe",
      "restaurant",
    ]);
    expect(refined.journey?.actions[1]?.requestedCuisine).toBe("pho");
    expect(refined.recommendations[0]?.poi.attributes).toContain("yên tĩnh");
    expect(refined.recommendations[1]?.poi.name).toContain("Phở");
  });

  it("rebases ordinary search context when the user changes topic", () => {
    const cafe = handleChat({
      message: "Tìm quán cà phê ở Hà Nội.",
    });
    const hotel = handleChat({
      message: "Tìm khách sạn ở Quận 1.",
      sessionContext: cafe.sessionContext,
    });
    const refined = handleChat({
      message: "Yên tĩnh hơn.",
      sessionContext: hotel.sessionContext,
    });

    expect(hotel.sessionContext?.recentQueries).toEqual([
      "Tìm khách sạn ở Quận 1.",
    ]);
    expect(
      refined.recommendations.every(
        ({ poi }) => poi.category === "Khách sạn" && poi.city === "TP.HCM",
      ),
    ).toBe(true);
  });

  it("lets the current explicit topic override an ordered user-history turn", () => {
    const response = handleChat({
      message: "Tìm khách sạn ở Quận 1.",
      history: [
        { role: "user", content: "Coffee then phở in Hà Nội." },
        { role: "assistant", content: "Bạn muốn đổi gì?" },
      ],
    });

    expect(response.journey).toBeUndefined();
    expect(
      response.recommendations.every(
        ({ poi }) => poi.category === "Khách sạn" && poi.city === "TP.HCM",
      ),
    ).toBe(true);
  });

  it("returns no partial plan when one ordered leg cannot be grounded", () => {
    const response = handleChat({
      message: "Coffee then phở in Hội An.",
    });

    expect(response.journey).toBeUndefined();
    expect(response.recommendations).toEqual([]);
    expect(response.mapAction.poiIds).toEqual([]);
    expect(response.assistantResponse).toContain("chưa đủ địa điểm");
    expect(response.assistantResponse).toContain("không bỏ âm thầm chặng nào");
  });

  it("stores current plus three prior user turns and keeps stop categories during revision", () => {
    const messages = [
      "Coffee then phở in Hà Nội.",
      "Yên tĩnh hơn.",
      "Có wifi.",
      "Giá hợp lý.",
      "View đẹp hơn.",
    ];
    let response = handleChat({ message: messages[0] });
    for (const message of messages.slice(1)) {
      response = handleChat({
        message,
        sessionContext: response.sessionContext,
      });
    }

    expect(response.sessionContext?.recentQueries).toEqual(messages.slice(-4));
    expect(response.journey?.actions.map((action) => action.requestedCategory)).toEqual([
      "cafe",
      "restaurant",
    ]);
    expect(response.recommendations.map(({ poi }) => poi.city)).toEqual([
      "Hà Nội",
      "Hà Nội",
    ]);

    const cheaper = handleChat({
      message: "Rẻ hơn một chút.",
      sessionContext: response.sessionContext,
    });
    expect(cheaper.intent).toBe("journey_revision");
    expect(cheaper.journey?.actions.map((action) => action.requestedCategory)).toEqual([
      "cafe",
      "restaurant",
    ]);
    expect(cheaper.journey?.actions.map((action) => action.requestedCuisine)).toEqual([
      undefined,
      "pho",
    ]);
    expect(cheaper.recommendations.map(({ poi }) => poi.category)).toEqual([
      "Quán cà phê",
      "Nhà hàng",
    ]);
  });
});
