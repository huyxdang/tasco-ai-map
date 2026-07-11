#!/usr/bin/env node
// Builds src/data/packs/open.json from an Overture Maps places GeoJSON export.
// Depth-first single-district pack (autoplan decision): Quận 1, TP.HCM only.
//
// Usage:
//   uvx overturemaps download --bbox=106.65,10.74,106.72,10.80 -f geojson --type=place -o hcmc.geojson
//   node scripts/pull-overture.mjs hcmc.geojson
//
// Data license: Overture Maps places, CDLA-Permissive-2.0 (attribution kept in
// the pack header). Ratings/attributes stay empty until BigSet enrichment —
// nothing here is invented.

import { readFileSync, writeFileSync } from "node:fs";

const DISTRICT = "Quận 1";
const CITY = "TP.HCM";
const MIN_CONFIDENCE = 0.7;

// Overture category → TASCO category, with a per-category cap (top by confidence).
const CATEGORY_MAP = new Map([
  ["restaurant", { vi: "Nhà hàng", cap: 350 }],
  ["vietnamese_restaurant", { vi: "Nhà hàng", cap: 350 }],
  ["diner", { vi: "Nhà hàng", cap: 350 }],
  ["coffee_shop", { vi: "Quán cà phê", cap: 350 }],
  ["cafe", { vi: "Quán cà phê", cap: 350 }],
  ["hotel", { vi: "Khách sạn", cap: 150 }],
  ["motel", { vi: "Khách sạn", cap: 150 }],
  ["bar", { vi: "Bar/Rooftop", cap: 60 }],
  ["pub", { vi: "Bar/Rooftop", cap: 60 }],
  ["cocktail_bar", { vi: "Bar/Rooftop", cap: 60 }],
  ["lounge", { vi: "Bar/Rooftop", cap: 60 }],
  ["shopping_mall", { vi: "Trung tâm thương mại", cap: 30 }],
  ["shopping_center", { vi: "Trung tâm thương mại", cap: 30 }],
  ["marketplace", { vi: "Chợ", cap: 15 }],
  ["farmers_market", { vi: "Chợ", cap: 15 }],
  ["flea_market", { vi: "Chợ", cap: 15 }],
  ["night_market", { vi: "Chợ", cap: 15 }],
  ["park", { vi: "Công viên", cap: 20 }],
  ["movie_theater", { vi: "Rạp chiếu phim", cap: 15 }],
  ["cinema", { vi: "Rạp chiếu phim", cap: 15 }],
  ["hospital", { vi: "Bệnh viện", cap: 20 }],
  ["atm", { vi: "ATM", cap: 30 }],
  ["atms", { vi: "ATM", cap: 30 }],
  ["bank", { vi: "ATM", cap: 30 }],
  ["banks", { vi: "ATM", cap: 30 }],
  ["bank_credit_union", { vi: "ATM", cap: 30 }],
  ["gas_station", { vi: "Trạm xăng", cap: 20 }],
  ["landmark_and_historical_building", { vi: "Địa điểm du lịch", cap: 60 }],
  ["tourist_attraction", { vi: "Địa điểm du lịch", cap: 60 }],
  ["monument", { vi: "Địa điểm du lịch", cap: 60 }],
  ["playground", { vi: "Khu vui chơi", cap: 30 }],
  ["amusement_park", { vi: "Khu vui chơi", cap: 30 }],
  ["arcade", { vi: "Khu vui chơi", cap: 30 }],
]);

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: node scripts/pull-overture.mjs <overture-places.geojson>");
  process.exit(1);
}

const collection = JSON.parse(readFileSync(inputPath, "utf8"));

const normalize = (value) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const byCategory = new Map();
const seen = new Set();

for (const feature of collection.features) {
  const props = feature.properties ?? {};
  const name = props.names?.primary?.trim();
  const confidence = props.confidence;
  const address = props.addresses?.[0];
  const locality = address?.locality ?? address?.region;
  if (!name || typeof confidence !== "number" || confidence < MIN_CONFIDENCE) continue;
  if (locality !== DISTRICT) continue;
  // Vietnamese naming convention: a venue literally named "Chợ …" is a market
  // even when Overture files it under generic shopping (e.g. Chợ Bến Thành).
  const mapping = /^chợ\s/i.test(name)
    ? { vi: "Chợ", cap: 15 }
    : CATEGORY_MAP.get(props.categories?.primary);
  if (!mapping) continue;
  const [lon, lat] = feature.geometry?.coordinates ?? [];
  if (typeof lat !== "number" || typeof lon !== "number") continue;

  // Dedupe on normalized name + address (chains keep distinct branches).
  const dedupeKey = `${normalize(name)}|${normalize(address?.freeform ?? "")}`;
  if (seen.has(dedupeKey)) continue;
  seen.add(dedupeKey);

  const poi = {
    id: `OVT-${String(feature.id ?? props.id).toUpperCase()}`,
    name,
    category: mapping.vi,
    brand: "",
    city: CITY,
    district: DISTRICT,
    address: address?.freeform ? `${address.freeform}, ${DISTRICT}` : DISTRICT,
    coordinates: { lat: Number(lat.toFixed(6)), lon: Number(lon.toFixed(6)) },
    rating: 0,
    reviewCount: 0,
    popularityScore: Math.round(confidence * 100),
    attributes: [],
    tags: [props.categories?.primary, ...(props.categories?.alternate ?? [])].filter(Boolean),
    description: `${mapping.vi} tại ${DISTRICT}, ${CITY}. Nguồn: Overture Maps.`,
    datasetTier: "open-skeleton",
  };
  const bucket = byCategory.get(mapping.vi) ?? { cap: mapping.cap, items: [] };
  bucket.items.push(poi);
  byCategory.set(mapping.vi, bucket);
}

const pois = [...byCategory.entries()]
  .flatMap(([, bucket]) =>
    bucket.items
      .sort((a, b) => b.popularityScore - a.popularityScore || a.id.localeCompare(b.id))
      .slice(0, bucket.cap),
  )
  .sort((a, b) => a.id.localeCompare(b.id));

const pack = {
  source: `overture-maps-places (CDLA-Permissive-2.0), district=${DISTRICT}, min_confidence=${MIN_CONFIDENCE}, generated=${new Date().toISOString().slice(0, 10)}`,
  pois,
  userProfiles: [],
  conversationScenarios: [],
  publicEvaluation: [],
};

writeFileSync("src/data/packs/open.json", `${JSON.stringify(pack, null, 2)}\n`);

const counts = {};
for (const poi of pois) counts[poi.category] = (counts[poi.category] ?? 0) + 1;
console.log(`open pack written: ${pois.length} POIs in ${DISTRICT}`);
console.table(counts);
