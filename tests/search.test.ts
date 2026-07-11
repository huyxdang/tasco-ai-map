import { describe, expect, it } from "vitest";

import { getUserProfile } from "../src/lib/data";
import { rankPois, searchPlaces } from "../src/lib/search";

describe("deterministic POI ranking", () => {
  it("ranks work-friendly coffee for the office-worker profile", () => {
    const results = rankPois("quán cà phê yên tĩnh để làm việc gần tôi", {
      profile: getUserProfile("U001"),
      limit: 3,
    });

    expect(results.map(({ poi }) => poi.id)).toContain("POI001");
    expect(results.map(({ poi }) => poi.id)).toContain("POI017");
    expect(results[0].scoreBreakdown.preferenceMatch).toBeGreaterThan(0);
  });

  it("uses profile budget without hiding score explainability", () => {
    const results = rankPois("cafe có wifi để học nhóm, giá không quá cao", {
      profile: getUserProfile("U007"),
      limit: 5,
    });

    expect(
      results.some(({ poi }) =>
        poi.attributes.some((attribute) => attribute === "giá hợp lý"),
      ),
    ).toBe(true);
    expect(results.every(({ score }) => score >= 0 && score <= 1)).toBe(true);
    expect(results[0].scoreBreakdown).toHaveProperty("budget");
    expect(results[0].scoreBreakdown).toHaveProperty("avoidPenalty");
  });

  it("returns stable DOCX PlaceResult fields and WGS84 coordinates", () => {
    const [result] = searchPlaces("Chợ Bến Thành", { limit: 1 });

    expect(result.id).toBe("POI003");
    expect(result.type).toBe("poi");
    expect(result.source).toBe("tasco-dataset");
    expect(result.coordinates.lat).toBeGreaterThan(-90);
    expect(result.coordinates.lat).toBeLessThan(90);
    expect(result.coordinates.lon).toBeGreaterThan(-180);
    expect(result.coordinates.lon).toBeLessThan(180);
  });

  it("treats an explicit district as a hard boundary", () => {
    const results = rankPois("quán cà phê yên tĩnh ở Quận 1", {
      profile: getUserProfile("U001"),
      limit: 5,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(
      results.every(
        ({ poi }) => poi.district === "Quận 1" || poi.city === "TP.HCM",
      ),
    ).toBe(true);
    expect(results.some(({ poi }) => poi.city === "Hà Nội")).toBe(false);
  });

  it("lets the query location override the profile location", () => {
    const results = rankPois("khách sạn công tác ở Hà Nội", {
      profile: getUserProfile("U005"),
      limit: 5,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results.every(({ poi }) => poi.city === "Hà Nội")).toBe(true);
  });
});
