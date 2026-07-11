import { describe, expect, it } from "vitest";

import { handleChat } from "../src/lib/chat";

function ids(message: string, profileId?: string): string[] {
  return handleChat({ message, profileId }).recommendations.map(
    ({ poi }) => poi.id,
  );
}

describe("public evaluation behaviors", () => {
  it("P004 recommends the two featured date options", () => {
    const recommendations = ids(
      "Gợi ý nơi hẹn hò lãng mạn tối nay ở Quận 1.",
      "U005",
    );
    expect(recommendations).toContain("POI005");
    expect(recommendations).toContain("POI021");
  });

  it("P008 prioritizes the Petrolimex toilet stop", () => {
    expect(
      ids("Tìm cây xăng có toilet trên đường đi Hạ Long.", "U008")[0],
    ).toBe("POI024");
  });

  it("P012 selects the business hotel", () => {
    expect(
      ids("Tôi cần khách sạn phù hợp đi công tác ở Hà Nội.", "U004")[0],
    ).toBe("POI012");
  });

  it("P014 includes featured family places", () => {
    const recommendations = ids(
      "Có chỗ nào cuối tuần cho trẻ em chơi không?",
      "U002",
    );
    expect(recommendations).toContain("POI015");
    expect(recommendations).toContain("POI028");
  });

  it("P016 selects the two quiet meeting cafes", () => {
    const recommendations = ids(
      "Tôi muốn chỗ gặp đối tác, không quá ồn.",
      "U001",
    );
    expect(recommendations).toContain("POI001");
    expect(recommendations).toContain("POI017");
  });

  it("P018 selects Sala for beach, pool and Da Nang", () => {
    expect(
      ids("Khách sạn gần biển ở Đà Nẵng, có hồ bơi.", "U003")[0],
    ).toBe("POI013");
  });

  it("P021 selects Chill Skybar for a District 1 rooftop", () => {
    expect(
      ids("Tối nay muốn đi rooftop nhưng không quá xa Quận 1.", "U005")[0],
    ).toBe("POI005");
  });

  it("P022 keeps both local-food answers", () => {
    const recommendations = ids(
      "Tìm quán ăn rẻ: phở hoặc bún chả gần trường đại học.",
      "U007",
    );
    expect(recommendations).toContain("POI018");
    expect(recommendations).toContain("POI019");
  });

  it("P026 keeps both featured family beach hotels", () => {
    const recommendations = ids(
      "Khách sạn gần biển mà hợp cho gia đình có trẻ nhỏ ở Đà Nẵng.",
      "U003",
    );
    expect(recommendations).toContain("POI013");
    expect(recommendations).toContain("POI009");
  });

  it("P027 explains Secret Garden with POI attributes", () => {
    const response = handleChat({
      message: "Vì sao bạn gợi ý Secret Garden cho hẹn hò?",
      profileId: "U005",
    });
    expect(response.intent).toBe("explanation");
    expect(response.recommendations[0].poi.id).toBe("POI021");
    expect(response.assistantResponse).toContain("ẩm thực Việt");
  });

  it("P030 keeps both central business-dining options", () => {
    const recommendations = ids(
      "Tôi cần nơi tiếp khách nước ngoài ở trung tâm Sài Gòn.",
      "U004",
    );
    expect(recommendations).toContain("POI021");
    expect(recommendations).toContain("POI004");
  });

  it("S006 builds a route from Vincom Đồng Khởi to Chợ Bến Thành", () => {
    const response = handleChat({
      message:
        "Làm thế nào để đến Chợ Bến Thành từ Vincom Center Đồng Khởi?",
    });
    expect(response.intent).toBe("navigation");
    expect(response.mapAction.type).toBe("route");
    expect(response.mapAction.selectedPoiId).toBe("POI003");
    expect(response.mapAction.route?.geometry.coordinates[0]).toEqual([
      106.7017,
      10.7781,
    ]);
  });
});
