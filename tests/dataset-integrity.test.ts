import { describe, expect, it } from "vitest";

import { getPack, type PackName } from "../src/lib/data";
import { haversineMeters } from "../src/lib/geo";

// Independent ground truth: a POI whose label says one city while its pin sits in
// another province is corrupt data. This caught 48/50 synthetic POIs plotted up
// to 1,212km from their declared city (the "markers all over Vietnam" bug).
const CITY_CENTERS: Record<string, { lat: number; lon: number }> = {
  "TP.HCM": { lat: 10.7769, lon: 106.7009 },
  "Hà Nội": { lat: 21.0285, lon: 105.8542 },
  "Đà Nẵng": { lat: 16.0544, lon: 108.2022 },
  "Đà Lạt": { lat: 11.9404, lon: 108.4383 },
  "Hội An": { lat: 15.8801, lon: 108.338 },
  "Nha Trang": { lat: 12.2388, lon: 109.1967 },
  "Quảng Nam": { lat: 15.8801, lon: 108.338 },
};

const MAX_KM_FROM_CITY = 25;
const PACKS: PackName[] = ["workbook", "open"];

describe.each(PACKS)("dataset geographic integrity (%s pack)", (packName) => {
  const pack = getPack(packName);

  it("places every POI within its declared city", () => {
    const offenders = pack.pois
      .map((poi) => {
        const center = CITY_CENTERS[poi.city];
        if (!center) return `${poi.id}: unknown city "${poi.city}"`;
        const distanceKm = haversineMeters(center, poi.coordinates) / 1_000;
        return distanceKm > MAX_KM_FROM_CITY
          ? `${poi.id} (${poi.name}): labeled ${poi.city} but ${distanceKm.toFixed(0)}km away at (${poi.coordinates.lat}, ${poi.coordinates.lon})`
          : undefined;
      })
      .filter(Boolean);

    expect(offenders).toEqual([]);
  });

  it("keeps coordinates inside Vietnam's bounding box", () => {
    expect(
      pack.pois.every(
        ({ coordinates }) =>
          coordinates.lat >= 8 && coordinates.lat <= 23.5 &&
          coordinates.lon >= 102 && coordinates.lon <= 110,
      ),
    ).toBe(true);
  });

  it("has unique, well-formed POI records", () => {
    const ids = new Set(pack.pois.map((poi) => poi.id));
    expect(ids.size).toBe(pack.pois.length);
    expect(
      pack.pois.every(
        (poi) =>
          poi.name.trim().length > 0 &&
          poi.category.trim().length > 0 &&
          poi.city.trim().length > 0 &&
          typeof poi.popularityScore === "number" &&
          Number.isFinite(poi.popularityScore) &&
          typeof poi.rating === "number" &&
          Number.isFinite(poi.rating),
      ),
    ).toBe(true);
  });
});

describe("pack namespaces", () => {
  it("keeps workbook POI### and open OVT- id spaces disjoint", () => {
    expect(getPack("workbook").pois.every((poi) => poi.id.startsWith("POI"))).toBe(true);
    expect(getPack("open").pois.every((poi) => poi.id.startsWith("OVT-"))).toBe(true);
  });
});

// Semantic coverage: the open pack is depth-first Quận 1 — a demo query for any
// core category must have real venues to answer with.
describe("open pack semantic coverage (Quận 1 depth)", () => {
  const MINIMUMS: Record<string, number> = {
    "Quán cà phê": 50,
    "Nhà hàng": 50,
    "Khách sạn": 20,
    "Bar/Rooftop": 5,
    "Địa điểm du lịch": 10,
    "Chợ": 1,
    "ATM": 5,
    "Rạp chiếu phim": 3,
  };

  it("meets per-category minimums in the target district", () => {
    const pois = getPack("open").pois;
    const shortfalls = Object.entries(MINIMUMS)
      .map(([category, minimum]) => {
        const count = pois.filter((poi) => poi.category === category).length;
        return count < minimum ? `${category}: ${count} < ${minimum}` : undefined;
      })
      .filter(Boolean);
    expect(shortfalls).toEqual([]);
  });

  it("keeps every open POI inside the district", () => {
    expect(getPack("open").pois.every((poi) => poi.district === "Quận 1" && poi.city === "TP.HCM")).toBe(true);
  });
});
