#!/usr/bin/env node
// Merges BigSet enrichment rows onto the open pack (src/data/packs/open.json).
//
// Match strategy (autoplan AD3/AD13): a BigSet row enriches a skeleton POI when
//   tier 1: exact normalized-name match within 250m, or
//   tier 2: diacritic-stripped token similarity ≥ 0.75 within 250m.
// Rows scoring 0.60–0.75 land in scratch/bigset-output/review-needed.csv for a
// human decision. Unmatched rows are logged and NEVER added as new POIs — the
// Overture skeleton is the existence proof (AD15).
//
// Attributes are written ONLY from the canonical dictionary fieldMap; unknown
// fields/values are ignored. Reruns are idempotent: enrichment replaces the
// attribute set derived from enrichment (skeleton has none), never appends.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const DICTIONARY = JSON.parse(readFileSync("scripts/bigset-jobs/attribute-dictionary.json", "utf8"));
const PACK_PATH = "src/data/packs/open.json";
const MAX_MATCH_METERS = 250;

const inputs = process.argv.slice(2);
if (inputs.length === 0) {
  console.error("Usage: node scripts/merge-enrichment.mjs <bigset-rows.json>...");
  process.exit(1);
}

const pack = JSON.parse(readFileSync(PACK_PATH, "utf8"));

const normalize = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\b(quan|cafe|ca phe|coffee|nha hang|restaurant|khach san|hotel|the|shop)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const tokenSimilarity = (a, b) => {
  const ta = new Set(normalize(a).split(" ").filter(Boolean));
  const tb = new Set(normalize(b).split(" ").filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  const overlap = [...ta].filter((t) => tb.has(t)).length;
  return overlap / Math.max(ta.size, tb.size);
};

const meters = (a, b) => {
  const R = 6371e3;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};

function tokensFor(row) {
  const tokens = new Set();
  for (const [field, valueMap] of Object.entries(DICTIONARY.fieldMap)) {
    const raw = row[field];
    if (raw === undefined || raw === null) continue;
    const key = String(raw).toLowerCase();
    for (const token of valueMap[key] ?? []) tokens.add(token);
  }
  return [...tokens].filter((t) => DICTIONARY.canonicalTokens.includes(t));
}

function validRow(row) {
  const lat = Number(row.latitude ?? row.lat);
  const lon = Number(row.longitude ?? row.lon);
  const rating = row.rating === undefined ? 0 : Number(row.rating);
  return (
    typeof row.name === "string" && row.name.trim().length > 1 &&
    Number.isFinite(lat) && lat > 10.6 && lat < 10.9 &&
    Number.isFinite(lon) && lon > 106.6 && lon < 106.8 &&
    Number.isFinite(rating) && rating >= 0 && rating <= 5
  );
}

const stats = { rows: 0, invalid: 0, matched: 0, review: 0, unmatched: 0 };
const reviewRows = [["source_name", "candidate_id", "candidate_name", "similarity", "distance_m"]];
const enrichedById = new Map();

for (const path of inputs) {
  const rows = JSON.parse(readFileSync(path, "utf8"));
  for (const row of Array.isArray(rows) ? rows : rows.rows ?? []) {
    stats.rows++;
    if (!validRow(row)) { stats.invalid++; continue; }
    const point = { lat: Number(row.latitude ?? row.lat), lon: Number(row.longitude ?? row.lon) };

    let best = null;
    for (const poi of pack.pois) {
      const distance = meters(point, poi.coordinates);
      if (distance > MAX_MATCH_METERS) continue;
      const exact = normalize(poi.name) === normalize(row.name) && normalize(poi.name).length > 0;
      const similarity = exact ? 1 : tokenSimilarity(poi.name, row.name);
      if (!best || similarity > best.similarity || (similarity === best.similarity && distance < best.distance)) {
        best = { poi, similarity, distance };
      }
    }

    if (best && best.similarity >= 0.75) {
      stats.matched++;
      const existing = enrichedById.get(best.poi.id) ?? { tokens: new Set(), rating: 0, reviewCount: 0 };
      for (const token of tokensFor(row)) existing.tokens.add(token);
      existing.rating = Math.max(existing.rating, Number(row.rating ?? 0));
      existing.reviewCount = Math.max(existing.reviewCount, Number(row.review_count ?? row.reviewCount ?? 0) || 0);
      enrichedById.set(best.poi.id, existing);
    } else if (best && best.similarity >= 0.6) {
      stats.review++;
      reviewRows.push([row.name, best.poi.id, best.poi.name, best.similarity.toFixed(2), best.distance.toFixed(0)]);
    } else {
      stats.unmatched++;
    }
  }
}

for (const poi of pack.pois) {
  const enrichment = enrichedById.get(poi.id);
  if (!enrichment) continue;
  poi.attributes = [...enrichment.tokens];
  if (enrichment.rating > 0) poi.rating = Number(enrichment.rating.toFixed(1));
  if (enrichment.reviewCount > 0) {
    poi.reviewCount = enrichment.reviewCount;
    poi.popularityScore = Math.max(poi.popularityScore, Math.min(99, Math.round(Math.log10(enrichment.reviewCount + 1) * 30)));
  }
  poi.datasetTier = "open-enriched";
}

mkdirSync("scratch/bigset-output", { recursive: true });
writeFileSync("scratch/bigset-output/review-needed.csv", reviewRows.map((r) => r.join(",")).join("\n"));
writeFileSync(PACK_PATH, `${JSON.stringify(pack, null, 2)}\n`);

const enrichedCount = pack.pois.filter((poi) => poi.datasetTier === "open-enriched").length;
const coreSkeleton = pack.pois.filter((poi) => ["Quán cà phê", "Nhà hàng"].includes(poi.category));
const coreEnriched = coreSkeleton.filter((poi) => poi.datasetTier === "open-enriched");
const matchRate = coreSkeleton.length ? coreEnriched.length / coreSkeleton.length : 0;

console.log("rows:", stats.rows, "| invalid:", stats.invalid, "| matched:", stats.matched, "| review-band:", stats.review, "| unmatched:", stats.unmatched);
console.log(`enriched POIs: ${enrichedCount}/${pack.pois.length}`);
console.log(`core (café+restaurant) match-rate: ${(matchRate * 100).toFixed(1)}% — demo flip requires ≥60% (AD9)`);
