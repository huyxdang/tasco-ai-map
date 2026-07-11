import { describe, expect, it } from "vitest";

import { dataset } from "../src/lib/data";
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

describe("dataset geographic integrity", () => {
  it("places every POI within its declared city", () => {
    const offenders = dataset.pois
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
      dataset.pois.every(
        ({ coordinates }) =>
          coordinates.lat >= 8 && coordinates.lat <= 23.5 &&
          coordinates.lon >= 102 && coordinates.lon <= 110,
      ),
    ).toBe(true);
  });
});
