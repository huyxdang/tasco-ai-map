import { describe, expect, it } from "vitest";

import { handleChat } from "../src/lib/chat";
import { activePackName, getPack } from "../src/lib/data";

// Hand-verified holdout for the open (Quận 1) pack — autoplan AD4.
// Expectations are REAL-WORLD facts about District 1 (famous venues that exist
// on the ground), not values derived from the pack or the engine — so this
// suite cannot rubber-stamp itself. Runs only under TASCO_DATASET_PACK=open
// (`pnpm test:eval:open`); it skips in the default workbook-pack suite.
const openActive = activePackName === "open";
const pack = getPack("open");
const enrichmentLanded = pack.pois.some((poi) => poi.datasetTier === "open-enriched");

describe.skipIf(!openActive)("open pack holdout — engine behavior", () => {
  const ids = (message: string) => handleChat({ message }).recommendations.map(({ poi }) => poi);

  it("H1: cafés in Quận 1 returns real cafés only", () => {
    const pois = ids("Quán cà phê ở Quận 1");
    expect(pois.length).toBeGreaterThanOrEqual(3);
    expect(pois.every((poi) => poi.category === "Quán cà phê")).toBe(true);
  });

  it("H2: restaurants in Quận 1 returns restaurants only", () => {
    const pois = ids("Nhà hàng ở Quận 1");
    expect(pois.length).toBeGreaterThanOrEqual(3);
    expect(pois.every((poi) => poi.category === "Nhà hàng")).toBe(true);
  });

  it("H3: hotels in Quận 1 returns hotels only", () => {
    const pois = ids("Khách sạn ở Quận 1");
    expect(pois.length).toBeGreaterThanOrEqual(3);
    expect(pois.every((poi) => poi.category === "Khách sạn")).toBe(true);
  });

  it("H4: rooftop bars exist in Quận 1 (unlike the workbook's single POI005)", () => {
    const pois = ids("Rooftop bar ở Quận 1");
    expect(pois.length).toBeGreaterThanOrEqual(3);
    expect(pois.every((poi) => poi.category === "Bar/Rooftop")).toBe(true);
  });

  it("H5: cinemas exist in Quận 1", () => {
    const pois = ids("Rạp chiếu phim ở Quận 1");
    expect(pois.length).toBeGreaterThanOrEqual(1);
    expect(pois.every((poi) => poi.category === "Rạp chiếu phim")).toBe(true);
  });

  it("H6: ATMs exist in Quận 1", () => {
    const pois = ids("ATM ở Quận 1");
    expect(pois.length).toBeGreaterThanOrEqual(3);
    expect(pois.every((poi) => poi.category === "ATM")).toBe(true);
  });

  it("H7: Chợ Bến Thành resolves as a named landmark", () => {
    const response = handleChat({ message: "Chợ Bến Thành có gì hay?" });
    expect(response.recommendations.some(({ poi }) => /bến thành/i.test(poi.name) && poi.category === "Chợ")).toBe(true);
  });

  it("H8: navigation to Chợ Bến Thành routes to the real market", () => {
    const response = handleChat({ message: "Đưa tôi đến Chợ Bến Thành.", location: { lat: 10.776, lon: 106.7 } });
    expect(response.mapAction.type).toBe("route");
    const selected = pack.pois.find((poi) => poi.id === response.mapAction.selectedPoiId);
    expect(selected && /bến thành/i.test(selected.name)).toBe(true);
  });

  it("H9: honest no-match for cities outside the district pack", () => {
    const response = handleChat({ message: "Khách sạn ở Đà Nẵng" });
    expect(response.recommendations).toEqual([]);
    expect(response.assistantResponse).toContain("chưa có");
  });

  it("H10: bare requests still clarify instead of guessing", () => {
    const response = handleChat({ message: "Tìm nhà hàng." });
    expect(response.intent).toBe("clarification_required");
  });

  it.skipIf(!enrichmentLanded)("H11 (post-enrichment): wifi cafés carry real attribute evidence", () => {
    const response = handleChat({ message: "Quán cà phê có wifi ở Quận 1" });
    expect(response.recommendations.some(({ poi }) => poi.attributes.includes("wifi"))).toBe(true);
  });
});

describe.skipIf(!openActive)("open pack holdout — real-world existence facts", () => {
  const names = pack.pois.map((poi) => poi.name.toLowerCase());
  const has = (needle: string) => names.some((name) => name.includes(needle));

  it("H12: major café chains have District 1 branches", () => {
    expect(pack.pois.filter((poi) => /highlands/i.test(poi.name) && poi.category === "Quán cà phê").length).toBeGreaterThanOrEqual(5);
    expect(has("phuc long") || has("phúc long")).toBe(true);
    expect(has("katinat")).toBe(true);
  });

  it("H13: the historic Đồng Khởi hotels exist", () => {
    expect(has("caravelle") || has("majestic") || has("continental")).toBe(true);
  });

  it("H14: The Workshop Coffee (the real specialty café) exists", () => {
    expect(has("the workshop")).toBe(true);
  });

  it("H15: Chợ Bến Thành exists as a market", () => {
    expect(pack.pois.some((poi) => /bến thành/i.test(poi.name) && poi.category === "Chợ")).toBe(true);
  });
});
