#!/usr/bin/env node

import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const REQUIRED_MODEL = "openai/gpt-oss-120b:nitro";
const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, "scratch/bigset-output");
const OPEN_PACK_PATH = path.join(ROOT, "src/data/packs/open.json");
const ATTEMPTS_DIR = path.join(OUTPUT_DIR, "attempts");
const JOBS_PATH = path.join(OUTPUT_DIR, "jobs.json");
const LOCK_PATH = path.join(OUTPUT_DIR, "complete-batch2.lock");
const EXTERNAL_RESTAURANT_PATH = path.join(OUTPUT_DIR, "restaurant-external-slot.json");
const EXTERNAL_RESTAURANT_BATCH_PATH = path.join(OUTPUT_DIR, "restaurant-external-batch.json");
const EXTERNAL_RESTAURANT_PROJECTED_PATH = path.join(OUTPUT_DIR, "restaurant-external-projected.json");
const EXTERNAL_HOTEL_PATH = path.join(OUTPUT_DIR, "hotel-external-slot.json");
const EXTERNAL_HOTEL_BATCH_PATH = path.join(OUTPUT_DIR, "hotel-external-batch.json");
const EXTERNAL_HOTEL_PROJECTED_PATH = path.join(OUTPUT_DIR, "hotel-external-projected.json");
const EXTERNAL_CAFE_PATH = path.join(OUTPUT_DIR, "cafe-external-slot.json");
const EXTERNAL_CAFE_BATCH_PATH = path.join(OUTPUT_DIR, "cafe-external-batch.json");
const EXTERNAL_CAFE_PROJECTED_PATH = path.join(OUTPUT_DIR, "cafe-external-projected.json");
const BACKEND = process.env.BIGSET_BACKEND_URL ?? "http://127.0.0.1:3501";
const TARGET = 100;
const POLL_MS = 15_000;
const RUN_TIMEOUT_MS = 20 * 60_000;
const ZERO_GROWTH_LIMIT = 3;
const MEMORY_FLOOR_PERCENT = 20;
const MEMORY_LOW_CHECKS = 3;
const MEMORY_RECHECK_MS = 20_000;
const MAX_DIVERSIFICATIONS_PER_CATEGORY = 2;
const TERMINAL_FAILURE_LIMIT = 3;

const execFileAsync = promisify(execFile);
let checkpointQueue = Promise.resolve();
let launchDecisionQueue = Promise.resolve();
let activePopulates = 0;
let launchLimit = 3;
let controllerLockHandle = null;
let controllerLockReleased = false;
let effectiveModelConfig = null;

const categories = [
  {
    slug: "cafes",
    jobKey: "q1-cafes-b2",
    topic: "cafés and coffee shops",
    datasetId: "jd7e8wh2a2k4cwm75yn6f6b2px8aaxej",
    canonical: "q1-cafes-b2.json",
    primaryKey: "cafe_url",
    booleanFields: ["wifi", "quiet", "study_friendly", "power_outlets", "air_conditioned", "outdoor_seating", "open_late", "opens_early", "parking", "takeaway"],
    numberFields: ["rating", "review_count"],
  },
  {
    slug: "restaurants",
    jobKey: "q1-restaurants-b2",
    topic: "restaurants",
    datasetId: "jd77e6g2jh0v6m45c9wkh5pvr98aa31r",
    canonical: "q1-restaurants-b2.json",
    primaryKey: "foody_url",
    booleanFields: ["reservations", "romantic", "family_friendly", "open_late", "outdoor_seating", "parking", "nice_view", "air_conditioned"],
    numberFields: ["rating", "review_count"],
  },
  {
    slug: "hotels",
    jobKey: "q1-hotels-b2",
    topic: "hotels",
    datasetId: "jd7ahqzdg8ft3pdf53vjpcsrhd8aan3d",
    canonical: "q1-hotels-b2.json",
    primaryKey: "hotel_url",
    booleanFields: ["pool", "breakfast", "breakfast_buffet", "family_friendly", "parking", "nice_view", "quiet"],
    numberFields: ["rating", "review_count"],
  },
];

function timestamp() {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

function relative(file) {
  return path.relative(ROOT, file);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replaceAll("đ", "d")
    .replaceAll("Đ", "D")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function canonicalUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    if (!parsed.hostname) return "";
    parsed.hash = "";
    const mapsSearchQuery = /(^|\.)google\.com$/i.test(parsed.hostname)
      && parsed.pathname.replace(/\/+$/, "") === "/maps/search"
      ? parsed.searchParams.get("query")?.trim()
      : null;
    parsed.search = "";
    if (mapsSearchQuery) parsed.searchParams.set("query", mapsSearchQuery);
    parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function parseBoolean(value) {
  if (typeof value === "boolean") return { valid: true, value };
  if (value === null || value === undefined || value === "") return { valid: true, value };
  const normalized = normalizeText(value);
  if (["true", "yes", "y", "1", "co"].includes(normalized)) return { valid: true, value: true };
  if (["false", "no", "n", "0", "khong"].includes(normalized)) return { valid: true, value: false };
  return { valid: false, value };
}

function parseNumber(value, field) {
  if (value === null || value === undefined || value === "") return { valid: true, value };
  const parsed = typeof value === "number"
    ? value
    : Number(String(value).replaceAll(",", "").trim());
  if (!Number.isFinite(parsed)) return { valid: false, value };
  if (field === "rating") {
    const normalized = parsed > 5 && parsed <= 10 ? parsed / 2 : parsed;
    if (normalized < 0 || normalized > 5) return { valid: false, value };
    return { valid: true, value: Number(normalized.toFixed(2)) };
  }
  if (field === "review_count") {
    if (parsed < 0) return { valid: false, value };
    return { valid: true, value: Math.round(parsed) };
  }
  return { valid: true, value: parsed };
}

function canonicalizeRow(row, category) {
  const canonical = {};
  for (const [key, value] of Object.entries(row)) {
    canonical[key] = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : value;
  }
  const validUrl = canonicalUrl(canonical[category.primaryKey]);
  if (validUrl) canonical[category.primaryKey] = validUrl;
  for (const field of category.booleanFields) {
    if (!(field in canonical)) continue;
    const parsed = parseBoolean(canonical[field]);
    if (parsed.valid) canonical[field] = parsed.value;
  }
  for (const field of category.numberFields) {
    if (!(field in canonical)) continue;
    const parsed = parseNumber(canonical[field], field);
    if (parsed.valid) canonical[field] = parsed.value;
  }
  return canonical;
}

function canonicalName(value) {
  const generic = new Set([
    "hotel", "saigon", "ho", "chi", "minh", "premium", "restaurant", "lounge",
    "cafe", "caphe", "coffee", "tra", "ca", "phe", "banh", "dong", "goi", "branch", "sg", "plaza",
  ]);
  const tokens = normalizeText(value)
    .split(" ")
    .filter((token) => token && !/^\d+[a-z]?$/.test(token) && !generic.has(token));
  return tokens.join(" ");
}

function canonicalStreet(value) {
  return normalizeText(value)
    .replace(/\b(?:street|st|road|rd|boulevard|blvd|avenue|ave)\b/g, " ")
    .replace(/\b(?:cong truong lam son|lam son square)\b/g, "lam son")
    .replace(/\s+/g, " ")
    .trim();
}

function streetIdentityKeys(address) {
  const raw = String(address ?? "")
    .replace(/[()]/g, ",")
    .replace(/\s+&\s+/g, ",");
  const segments = raw.split(",");
  const keys = new Set();
  for (const segment of segments) {
    const rangePreserving = String(segment)
      .normalize("NFD")
      .replaceAll("đ", "d")
      .replaceAll("Đ", "D")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9/-]+/g, " ")
      .trim();
    const match = rangePreserving.match(/\b(\d+[a-z]?)(?:\s*-\s*(\d+[a-z]?))?(?:\s*\/\s*(\d+[a-z]?))?\s+(.+)/);
    if (!match) continue;
    const number = match[3] ? `${match[1]}/${match[3]}` : match[1];
    const street = canonicalStreet(match[4])
      .split(/\b(?:phuong|ward|quan|district|thanh pho|city|hcm|tp)\b/)[0]
      .trim();
    if (street) keys.add(`${number}|${street}`);
  }
  return [...keys];
}

function venueIdentityKeys(row) {
  const name = canonicalName(row.name);
  if (!name) return [];
  return streetIdentityKeys(row.street_address ?? row.address).map((street) => `${name}|${street}`);
}

function namesAreCompatible(left, right) {
  const leftTokens = new Set(canonicalName(left).split(" ").filter(Boolean));
  const rightTokens = new Set(canonicalName(right).split(" ").filter(Boolean));
  if (!leftTokens.size || !rightTokens.size) return false;
  let overlap = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) overlap += 1;
  return overlap >= 1 && overlap / Math.min(leftTokens.size, rightTokens.size) >= 0.6;
}

function isEmpty(value) {
  return value === null || value === undefined || value === "";
}

function mergeRow(existing, incoming, category) {
  const merged = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    if (isEmpty(merged[key]) && !isEmpty(value)) {
      merged[key] = value;
      continue;
    }
    if (key === category.primaryKey && !canonicalUrl(merged[key]) && canonicalUrl(value)) {
      merged[key] = value;
    }
  }
  return merged;
}

function uniqueRows(rows, category) {
  const result = [];
  const urlIndex = new Map();
  const identityIndex = new Map();
  const streetIndex = new Map();

  for (const rawRow of rows) {
    if (!rawRow || typeof rawRow !== "object" || Array.isArray(rawRow)) continue;
    const row = canonicalizeRow(rawRow, category);
    const urlKey = canonicalUrl(row[category.primaryKey]);
    const identityKeys = venueIdentityKeys(row);
    if (!urlKey && identityKeys.length === 0) continue;

    let index = urlKey ? urlIndex.get(urlKey) : undefined;
    if (index === undefined) {
      for (const identity of identityKeys) {
        index = identityIndex.get(identity);
        if (index !== undefined) break;
      }
    }
    if (index === undefined) {
      for (const street of streetIdentityKeys(row.street_address ?? row.address)) {
        for (const candidate of streetIndex.get(street) ?? []) {
          if (namesAreCompatible(row.name, result[candidate].name)) {
            index = candidate;
            break;
          }
        }
        if (index !== undefined) break;
      }
    }

    if (index === undefined) {
      index = result.length;
      result.push({ ...row });
    } else {
      result[index] = mergeRow(result[index], row, category);
    }

    const mergedUrl = canonicalUrl(result[index][category.primaryKey]);
    if (mergedUrl) urlIndex.set(mergedUrl, index);
    for (const identity of venueIdentityKeys(result[index])) identityIndex.set(identity, index);
    for (const identity of identityKeys) identityIndex.set(identity, index);
    for (const street of streetIdentityKeys(result[index].street_address ?? result[index].address)) {
      const indices = streetIndex.get(street) ?? new Set();
      indices.add(index);
      streetIndex.set(street, indices);
    }
    for (const street of streetIdentityKeys(row.street_address ?? row.address)) {
      const indices = streetIndex.get(street) ?? new Set();
      indices.add(index);
      streetIndex.set(street, indices);
    }
  }

  return result;
}

function isValidHttpUrl(value) {
  return Boolean(canonicalUrl(value));
}

function isGenericGoogleMapsSearchUrl(value) {
  try {
    const parsed = new URL(String(value ?? "").trim());
    return /(^|\.)google\.com$/i.test(parsed.hostname)
      && parsed.pathname.replace(/\/+$/, "").startsWith("/maps/search");
  } catch {
    return false;
  }
}

function isValidIndividualEvidenceUrl(value) {
  return isValidHttpUrl(value) && !isGenericGoogleMapsSearchUrl(value);
}

function hasHouseNumber(address) {
  return /(?:^|\s)\d+[a-z]?(?:\s*[-/]\s*\d+[a-z]?)?(?=\s|,|$)/i.test(String(address ?? ""));
}

function isGroundedInDistrictOne(address) {
  const normalized = normalizeText(address);
  if (!normalized) return false;
  const otherDistrict = /\b(?:quan|district|q)\s*(?:[2-9]|1[0-2])\b|\b(?:tan binh|binh thanh|phu nhuan|go vap|thu duc|binh tan|tan phu|nha be|hoc mon|cu chi|can gio|binh chanh)\b/;
  if (otherDistrict.test(normalized)) return false;
  if (/\b(?:quan|district|q)\s*1\b/.test(normalized)) return true;
  const districtOneWards = [
    "ben nghe",
    "ben thanh",
    "co giang",
    "cau kho",
    "cau ong lanh",
    "da kao",
    "nguyen cu trinh",
    "nguyen thai binh",
    "pham ngu lao",
    "tan dinh",
    "phuong sai gon",
  ];
  return districtOneWards.some((ward) => normalized.includes(ward));
}

function hasValidTypedFields(row, category) {
  for (const field of category.booleanFields) {
    if (field in row && !parseBoolean(row[field]).valid) return false;
  }
  for (const field of category.numberFields) {
    if (field in row && !parseNumber(row[field], field).valid) return false;
  }
  return true;
}

function isUsableRow(row, category) {
  const address = row.street_address ?? row.address;
  return Boolean(
    normalizeText(row.name)
    && isValidIndividualEvidenceUrl(row[category.primaryKey])
    && hasHouseNumber(address)
    && isGroundedInDistrictOne(address)
    && hasValidTypedFields(row, category),
  );
}

function usableRowCount(rows, category) {
  return rows.filter((row) => isUsableRow(row, category)).length;
}

function validationReasons(row, category) {
  const reasons = [];
  const address = row.street_address ?? row.address;
  if (!normalizeText(row.name)) reasons.push("missing_name");
  if (!isValidHttpUrl(row[category.primaryKey])) reasons.push("invalid_category_url");
  else if (isGenericGoogleMapsSearchUrl(row[category.primaryKey])) reasons.push("generic_maps_search_not_individual_evidence");
  if (!hasHouseNumber(address)) reasons.push("missing_house_number");
  if (!isGroundedInDistrictOne(address)) reasons.push("not_grounded_in_quan_1");
  if (!hasValidTypedFields(row, category)) reasons.push("invalid_typed_field");
  return reasons;
}

function duplicateAudit(inputRows, canonicalRows, category) {
  const indexByUrl = new Map();
  const indexByIdentity = new Map();
  const indicesByStreet = new Map();
  canonicalRows.forEach((row, index) => {
    const url = canonicalUrl(row[category.primaryKey]);
    if (url) indexByUrl.set(url, index);
    for (const identity of venueIdentityKeys(row)) indexByIdentity.set(identity, index);
    for (const street of streetIdentityKeys(row.street_address ?? row.address)) {
      const indices = indicesByStreet.get(street) ?? new Set();
      indices.add(index);
      indicesByStreet.set(street, indices);
    }
  });
  const grouped = new Map();
  for (const rawRow of inputRows) {
    const row = canonicalizeRow(rawRow, category);
    let index = indexByUrl.get(canonicalUrl(row[category.primaryKey]));
    if (index === undefined) {
      for (const identity of venueIdentityKeys(row)) {
        index = indexByIdentity.get(identity);
        if (index !== undefined) break;
      }
    }
    if (index === undefined) {
      for (const street of streetIdentityKeys(row.street_address ?? row.address)) {
        for (const candidate of indicesByStreet.get(street) ?? []) {
          if (namesAreCompatible(row.name, canonicalRows[candidate].name)) {
            index = candidate;
            break;
          }
        }
        if (index !== undefined) break;
      }
    }
    if (index === undefined) continue;
    const group = grouped.get(index) ?? [];
    group.push({
      name: row.name ?? null,
      address: row.street_address ?? row.address ?? null,
      url: row[category.primaryKey] ?? null,
    });
    grouped.set(index, group);
  }
  return [...grouped.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([canonicalIndex, rows]) => ({ canonical_index: canonicalIndex, rows }));
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function readJsonOptional(file) {
  try {
    return await readJson(file);
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return null;
    throw error;
  }
}

async function writeJson(file, value) {
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, file);
}

async function acquireControllerLock({ allowStaleRecovery = true } = {}) {
  try {
    controllerLockHandle = await open(LOCK_PATH, "wx");
  } catch (error) {
    if (error && typeof error === "object" && error.code === "EEXIST") {
      const owner = await readFile(LOCK_PATH, "utf8").catch(() => "unknown owner");
      if (allowStaleRecovery) {
        try {
          const parsed = JSON.parse(owner);
          if (Number.isInteger(parsed.pid)) {
            let alive = true;
            try {
              process.kill(parsed.pid, 0);
            } catch (probeError) {
              if (probeError && typeof probeError === "object" && probeError.code === "ESRCH") alive = false;
            }
            if (!alive) {
              await unlink(LOCK_PATH);
              return acquireControllerLock({ allowStaleRecovery: false });
            }
          }
        } catch {
          // An unreadable lock is treated as active rather than deleted unsafely.
        }
      }
      throw new Error(`Another complete-batch2 controller owns ${relative(LOCK_PATH)}: ${owner.trim()}`);
    }
    throw error;
  }
  await controllerLockHandle.writeFile(`${JSON.stringify({ pid: process.pid, started_at: new Date().toISOString(), workspace: ROOT })}\n`);
  await controllerLockHandle.sync();
}

async function releaseControllerLock() {
  if (controllerLockReleased) return;
  controllerLockReleased = true;
  await controllerLockHandle?.close().catch(() => {});
  controllerLockHandle = null;
  await unlink(LOCK_PATH).catch((error) => {
    if (!error || typeof error !== "object" || error.code !== "ENOENT") throw error;
  });
}

async function api(method, route, requestBody) {
  const response = await fetch(`${BACKEND}${route}`, {
    method,
    headers: requestBody ? { "Content-Type": "application/json" } : undefined,
    body: requestBody ? JSON.stringify(requestBody) : undefined,
  });
  const text = await response.text();
  let responseBody = null;
  if (text) {
    try {
      responseBody = JSON.parse(text);
    } catch {
      responseBody = text;
    }
  }
  if (!response.ok) {
    const detail = responseBody && typeof responseBody === "object" && responseBody.error ? responseBody.error : text;
    throw new Error(`${method} ${route} failed (${response.status}): ${detail || "unknown error"}`);
  }
  return responseBody;
}

async function getDataset(datasetId) {
  const response = await api("GET", `/cli/datasets/${encodeURIComponent(datasetId)}`);
  return response.dataset;
}

async function getRows(datasetId) {
  const response = await api("GET", `/cli/datasets/${encodeURIComponent(datasetId)}/rows`);
  return response.rows.map((row) => row.data);
}

async function verifyEffectiveModels() {
  const response = await api("GET", "/settings/models");
  const config = response?.config ?? {};
  if (config.populateOrchestrator !== REQUIRED_MODEL || config.investigateSubagent !== REQUIRED_MODEL) {
    throw new Error(`BigSet effective model mismatch: populate=${config.populateOrchestrator ?? "unknown"}, investigate=${config.investigateSubagent ?? "unknown"}`);
  }
  effectiveModelConfig = {
    schema_inference: config.schemaInference ?? null,
    populate_orchestrator: config.populateOrchestrator,
    investigate_subagent: config.investigateSubagent,
    verified_at: new Date().toISOString(),
    source: "GET /settings/models",
  };
  return effectiveModelConfig;
}

async function refreshDerivedState(jobs, collection) {
  jobs.batch2.rows_actual ??= {};
  jobs.batch2.usable_rows_actual ??= {};
  jobs.batch2.resume_commands = {
    start_backend: `set -a && source .env.local && set +a && BIGSET_LOCAL_WORKSPACE_ID=bigset-local BIGSET_KEYCHAIN_PORT=3599 POPULATE_ORCHESTRATOR_MODEL=${REQUIRED_MODEL} INVESTIGATE_SUBAGENT_MODEL=${REQUIRED_MODEL} npx @adamexu/bigset start`,
    populate_order: "Up to one active run per category, max three total, gated by sustained macOS memory pressure",
    resume_all_lanes: "Run only the exact incomplete category commands below after the Codex automatic approval-reviewer usage gate clears; OpenRouter and Nitro are available, and models must not be substituted",
    local_projection_rebuild: "node scratch/bigset-output/complete-batch2.mjs --rebuild-external-projections cafes restaurants hotels",
    local_final_adoption: "node scratch/bigset-output/complete-batch2.mjs --adopt-external-batches cafes restaurants hotels",
    restaurant_preresolved_leads: "scratch/bigset-output/restaurant-preresolved-leads-phase1b.json",
    categories: {},
  };

  for (const category of categories) {
    const file = path.join(OUTPUT_DIR, category.canonical);
    const canonical = uniqueRows(await readJson(file), category);
    const usable = usableRowCount(canonical, category);
    const state = collection.category_state[category.slug] ?? {};
    state.unique_rows = canonical.length;
    state.usable_unique_rows = usable;
    state.invalid_rows = canonical.length - usable;
    state.primary_key = category.primaryKey;
    state.dataset_id = jobs.batch2.ids?.[category.jobKey] ?? category.datasetId;
    collection.category_state[category.slug] = state;
    jobs.batch2.rows_actual[category.jobKey] = canonical.length;
    jobs.batch2.usable_rows_actual[category.jobKey] = usable;
    const resumeLane = usable >= TARGET
      ? null
      : category.slug === "restaurants"
        ? `set -a && source .env.local && set +a && POPULATE_ORCHESTRATOR_MODEL=${REQUIRED_MODEL} INVESTIGATE_SUBAGENT_MODEL=${REQUIRED_MODEL} node scratch/bigset-output/complete-batch2.mjs --external-preresolved-restaurants scratch/bigset-output/restaurant-preresolved-leads-phase1b.json`
        : `set -a && source .env.local && set +a && POPULATE_ORCHESTRATOR_MODEL=${REQUIRED_MODEL} INVESTIGATE_SUBAGENT_MODEL=${REQUIRED_MODEL} node scratch/bigset-output/complete-batch2.mjs --external-deterministic-${category.slug}`;
    jobs.batch2.resume_commands.categories[category.jobKey] = {
      dataset_id: state.dataset_id,
      resume_lane: resumeLane,
      resume_required: usable < TARGET,
      export_contract: "Runner fetches the local BigSet rows API, atomically saves every raw attempt under scratch/bigset-output/attempts/, then atomically reconciles the canonical JSON union; no unsupported CLI JSON flag is used",
      canonical_json: `scratch/bigset-output/${category.canonical}`,
      attempt_exports: `scratch/bigset-output/attempts/${category.slug}-attempt-*-rows.json`,
      primary_key: category.primaryKey,
      raw_unique_rows: canonical.length,
      strict_usable_rows: usable,
    };
  }

  collection.required_models = {
    populate_orchestrator: REQUIRED_MODEL,
    investigate_subagent: REQUIRED_MODEL,
    mandate_scope: "Exactly the populate orchestrator and investigate subagent roles",
    schema_inference_policy: "Schema inference may remain Anthropic; it is outside the two-role user mandate and is not used to populate or investigate rows",
  };
  collection.backend_launch_proof = {
    ...(collection.backend_launch_proof ?? {}),
    started_at_utc: "2026-07-11T19:28:00Z",
    backend: "http://127.0.0.1:3501",
    app: "http://127.0.0.1:3500",
    convex: "http://127.0.0.1:3210",
    keychain_bridge: "http://127.0.0.1:3599",
    populate_orchestrator_model: REQUIRED_MODEL,
    investigate_subagent_model: REQUIRED_MODEL,
    proof: "Single backend launched by this controller with both explicit model environment overrides; health endpoint returned 200",
    effective_model_metadata: effectiveModelConfig ?? collection.backend_launch_proof?.effective_model_metadata ?? null,
  };
  jobs.runner.model_override_used = `POPULATE_ORCHESTRATOR_MODEL=${REQUIRED_MODEL} and INVESTIGATE_SUBAGENT_MODEL=${REQUIRED_MODEL}`;
  jobs.runner.current_backend_launch_proof = collection.backend_launch_proof;
  jobs.batch2.model = `${REQUIRED_MODEL} for both populate orchestrator and investigate subagent; schema inference is outside this exact two-role mandate`;
  jobs.batch2.resume_contract_version = 2;
  jobs.batch2.superseded_resume_contract = "Legacy direct populate/export/status commands and single-hotel resume prose were removed; resume only through batch2.resume_commands above";
  for (const key of ["populate_order", "exports", "resume_hotels_batch", "next_run_recommendations", "hotels_note", "merge_result_b1_plus_b2", "key_finding", "mechanics_learned"]) {
    delete jobs.batch2[key];
  }
  for (const key of ["start_backend_command", "repopulate_commands", "export_commands", "status_commands"]) {
    delete jobs[key];
  }
}

async function checkpoint(update) {
  const operation = checkpointQueue.then(async () => {
    const jobs = await readJson(JOBS_PATH);
    const collection = jobs.batch2.collection ?? {
      target_per_category: TARGET,
      model: REQUIRED_MODEL,
      attempts: [],
      category_state: {},
    };
    update(collection, jobs);
    jobs.batch2.collection = collection;
    if (collection.status === "collecting") jobs.batch2.status = "collecting";
    collection.active_populates = activePopulates;
    collection.launch_limit = launchLimit;
    collection.last_checkpoint_at = new Date().toISOString();
    await refreshDerivedState(jobs, collection);
    await writeJson(JOBS_PATH, jobs);
  });
  checkpointQueue = operation.catch(() => {});
  return operation;
}

function upsertAttempt(collection, attemptKey, values) {
  collection.attempts ??= [];
  let attempt = collection.attempts.find((candidate) => candidate.attempt_key === attemptKey);
  if (!attempt) {
    attempt = { attempt_key: attemptKey };
    collection.attempts.push(attempt);
  }
  Object.assign(attempt, values);
  return attempt;
}

async function reconcileCanonicalFiles({ apply }) {
  const report = {
    mode: apply ? "apply" : "dry-run",
    generated_at: new Date().toISOString(),
    target_strict_usable_per_category: TARGET,
    invariants: {
      controller_lock: true,
      atomic_json_writes: true,
      model_roles: {
        populate_orchestrator: REQUIRED_MODEL,
        investigate_subagent: REQUIRED_MODEL,
      },
      successful_terminal_status: "live only",
      identity_dedupe: "canonical URL OR canonical venue name plus normalized street/house identity",
    },
    categories: {},
  };
  const invalidAudit = { generated_at: report.generated_at, categories: {} };

  for (const category of categories) {
    const file = path.join(OUTPUT_DIR, category.canonical);
    const inputRows = await readJson(file);
    const canonicalRows = uniqueRows(inputRows, category);
    const invalidRows = canonicalRows
      .map((row, index) => ({ index, row, reasons: validationReasons(row, category) }))
      .filter((entry) => entry.reasons.length > 0);
    const duplicates = duplicateAudit(inputRows, canonicalRows, category);
    const postCanonical = uniqueRows(canonicalRows, category);
    const usable = usableRowCount(canonicalRows, category);
    const invariantErrors = [];
    if (postCanonical.length !== canonicalRows.length) invariantErrors.push("post_reconciliation_duplicates_remain");
    if (canonicalRows.some((row) => isUsableRow(row, category) && validationReasons(row, category).length > 0)) {
      invariantErrors.push("usable_row_failed_validation");
    }

    report.categories[category.slug] = {
      primary_key: category.primaryKey,
      input_rows: inputRows.length,
      canonical_unique_rows: canonicalRows.length,
      strict_usable_rows: usable,
      invalid_rows_preserved: invalidRows.length,
      duplicate_rows_collapsed: inputRows.length - canonicalRows.length,
      duplicate_groups: duplicates,
      post_reconciliation_duplicate_count: postCanonical.length === canonicalRows.length ? 0 : canonicalRows.length - postCanonical.length,
      invariant_errors: invariantErrors,
    };
    invalidAudit.categories[category.slug] = invalidRows.map(({ index, row, reasons }) => ({
      canonical_index: index,
      reasons,
      row,
    }));
    if (apply) await writeJson(file, canonicalRows);
  }

  report.passed = Object.values(report.categories).every((category) => category.invariant_errors.length === 0);
  const reportPath = path.join(OUTPUT_DIR, apply ? "reconciliation-apply-report.json" : "reconciliation-dry-run-report.json");
  await writeJson(reportPath, report);
  await writeJson(path.join(OUTPUT_DIR, "invalid-rows-audit.json"), invalidAudit);
  await checkpoint((collection) => {
    collection.reconciliation = {
      mode: report.mode,
      passed: report.passed,
      report: relative(reportPath),
      invalid_audit: "scratch/bigset-output/invalid-rows-audit.json",
      category_counts: Object.fromEntries(Object.entries(report.categories).map(([slug, value]) => [slug, {
        canonical_unique_rows: value.canonical_unique_rows,
        strict_usable_rows: value.strict_usable_rows,
        invalid_rows_preserved: value.invalid_rows_preserved,
        duplicate_rows_collapsed: value.duplicate_rows_collapsed,
      }])),
      at: report.generated_at,
    };
  });
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 2;
}

async function replaceDatasetsAfterTerminalFailures(slugs) {
  const selected = categories.filter((category) => slugs.includes(category.slug));
  if (!selected.length || selected.length !== slugs.length) {
    throw new Error(`Unknown replacement category. Choose: ${categories.map((category) => category.slug).join(", ")}`);
  }
  for (const category of selected) {
    const canonical = uniqueRows(await readJson(path.join(OUTPUT_DIR, category.canonical)), category);
    const reason = `Causal recovery after systematic zero-row terminal failures: replace long prose exclusions with compact full identity fingerprints and require run_subagent dispatch after at most two searches`;
    await diversifyCategory(category, canonical, reason, { causalTerminalRecovery: true });
  }
  await checkpoint((collection, jobs) => {
    collection.status = "replacement_datasets_ready";
    collection.blocker = undefined;
    jobs.batch2.status = "replacement_datasets_ready";
  });
}

async function repairTerminalFailureHistory() {
  await checkpoint((collection) => {
    const attemptsByCategory = new Map();
    for (const attempt of collection.attempts ?? []) {
      const attempts = attemptsByCategory.get(attempt.category) ?? [];
      attempts.push(attempt);
      attemptsByCategory.set(attempt.category, attempts);
    }

    for (const category of categories) {
      const attempts = (attemptsByCategory.get(category.slug) ?? [])
        .sort((left, right) => Number(left.attempt) - Number(right.attempt));
      const latestResetAt = (collection.dataset_history?.[category.slug] ?? [])
        .filter((change) => change.causal_terminal_recovery)
        .map((change) => Date.parse(change.at ?? ""))
        .filter(Number.isFinite)
        .reduce((latest, value) => Math.max(latest, value), 0);
      let zeroGrowth = 0;
      let terminalFailures = 0;
      let hasPostResetAttempt = false;
      for (const attempt of attempts) {
        const attemptAt = Date.parse(attempt.finished_at ?? attempt.submitted_at ?? attempt.started_at ?? "");
        const isPostResetAttempt = latestResetAt > 0 && Number.isFinite(attemptAt) && attemptAt > latestResetAt;
        if (isPostResetAttempt && !hasPostResetAttempt) {
          zeroGrowth = 0;
          terminalFailures = 0;
          hasPostResetAttempt = true;
        }
        const requiredModels = {
          populate_orchestrator: REQUIRED_MODEL,
          investigate_subagent: REQUIRED_MODEL,
        };
        attempt.required_models = requiredModels;
        if (!attempt.attempt_state || attempt.attempt_state === "legacy") {
          attempt.model_proof = {
            scope: "retrospective_requirement_annotation_unverified_at_run_time",
            required_models: requiredModels,
            current_backend_preflight_only: effectiveModelConfig,
          };
          delete attempt.effective_model_config;
        } else {
          attempt.model_proof = {
            scope: "controller_preflight_verified",
            effective_model_config: attempt.effective_model_config ?? effectiveModelConfig,
          };
        }
        if (attempt.dataset_status === "live") {
          terminalFailures = 0;
          zeroGrowth = Number(attempt.usable_delta ?? attempt.unique_delta ?? 0) === 0 ? zeroGrowth + 1 : 0;
          attempt.terminal_failure = false;
        } else if (attempt.dataset_status && attempt.dataset_status !== "building") {
          terminalFailures += 1;
          attempt.terminal_failure = true;
          attempt.classification_note = "Non-live terminal status; excluded from usable-growth and diversification decisions";
        } else {
          attempt.terminal_failure = null;
          attempt.classification_note = "Unresolved attempt status; startup recovery must finalize or block it before any new submission";
          continue;
        }
        attempt.zero_growth_streak = zeroGrowth;
        attempt.terminal_failure_streak = terminalFailures;
      }
      const state = collection.category_state?.[category.slug];
      if (state) {
        state.zero_growth_streak = latestResetAt > 0 && !hasPostResetAttempt ? 0 : zeroGrowth;
        state.terminal_failure_streak = latestResetAt > 0 && !hasPostResetAttempt ? 0 : terminalFailures;
      }
    }

    for (const history of Object.values(collection.dataset_history ?? {})) {
      for (const change of history) {
        if (/zero-growth attempt (8|9|11)\b/.test(change.reason ?? "")) {
          change.trigger_reclassified_terminal_failure = true;
          change.classification_note = "Strategy change retained for audit; trigger was a failed run, not successful zero growth";
        }
      }
    }
  });
}

async function reconcileUnresolvedAttempts() {
  const jobs = await readJson(JOBS_PATH);
  const attempts = jobs.batch2.collection?.attempts ?? [];
  const unresolved = attempts.filter((attempt) => (
    attempt.attempt_state === "starting"
    || attempt.attempt_state === "running"
    || (!attempt.dataset_status && attempt.attempt_state && attempt.attempt_state !== "completed" && attempt.attempt_state !== "terminal_failure")
  ));

  for (const attempt of unresolved) {
    const category = categories.find((candidate) => candidate.slug === attempt.category);
    if (!category) throw new Error(`Unresolved attempt ${attempt.attempt_key ?? "unknown"} has unknown category ${attempt.category}`);
    if (attempt.dataset_id) category.datasetId = attempt.dataset_id;
    const dataset = await getDataset(category.datasetId);

    if (!attempt.run_id) {
      await checkpoint((collection, currentJobs) => {
        upsertAttempt(collection, attempt.attempt_key, {
          attempt_state: "blocked_unresolved",
          dataset_status_observed: dataset.status ?? "unknown",
          startup_blocker: "Attempt was checkpointed before POST but has no run_id; submission outcome is ambiguous and cannot be overwritten safely",
        });
        collection.category_state[category.slug] = {
          ...(collection.category_state[category.slug] ?? {}),
          status: "blocked_unresolved_attempt",
          blocker: `Ambiguous attempt ${attempt.attempt_key}; observed dataset status ${dataset.status ?? "unknown"}`,
        };
        collection.status = "blocked_unresolved_attempt";
        currentJobs.batch2.status = "blocked_unresolved_attempt";
      });
      throw new Error(`Blocked unsafe resume: ${attempt.attempt_key} has no run_id and dataset ${category.datasetId} is ${dataset.status ?? "unknown"}`);
    }

    if (!attempt.pre_snapshot || !Number.isInteger(Number(attempt.attempt))) {
      await checkpoint((collection, currentJobs) => {
        upsertAttempt(collection, attempt.attempt_key, {
          attempt_state: "blocked_unresolved",
          dataset_status_observed: dataset.status ?? "unknown",
          startup_blocker: "Submitted attempt lacks pre_snapshot or attempt number required for safe finalization",
        });
        collection.status = "blocked_unresolved_attempt";
        currentJobs.batch2.status = "blocked_unresolved_attempt";
      });
      throw new Error(`Blocked unsafe resume: submitted attempt ${attempt.attempt_key} lacks finalization metadata`);
    }

    console.log(`[startup] recovering ${attempt.attempt_key} run=${attempt.run_id} observed_status=${dataset.status ?? "unknown"}`);
    await finalizeExisting(category, Number(attempt.attempt), attempt.run_id, attempt.pre_snapshot);
  }
}

function aggregateCollectionStatus(collection) {
  const states = categories.map((category) => collection.category_state?.[category.slug] ?? {});
  if (states.every((state) => Number(state.usable_unique_rows ?? 0) >= TARGET)) return "complete";
  if (states.some((state) => state.status === "blocked_terminal_failures")) return "blocked_terminal_failures";
  if (states.some((state) => state.status === "blocked_zero_growth")) return "blocked_zero_growth";
  if (states.some((state) => state.status === "blocked_diversification_cap")) return "blocked_diversification_cap";
  if (states.some((state) => state.status === "paused_zero_row_review")) return "paused_zero_row_review";
  if (states.some((state) => state.status === "paused_terminal_failure")) return "paused_terminal_failure_review";
  return "collecting";
}

async function withLaunchDecisionLock(action) {
  let releaseLock;
  const previous = launchDecisionQueue;
  launchDecisionQueue = new Promise((resolve) => {
    releaseLock = resolve;
  });
  await previous;
  try {
    return await action();
  } finally {
    releaseLock();
  }
}

async function memoryFreePercent() {
  const { stdout } = await execFileAsync("memory_pressure", ["-Q"]);
  const match = stdout.match(/free percentage:\s*(\d+)%/i);
  if (!match) throw new Error(`Could not parse memory_pressure -Q output: ${stdout.trim()}`);
  return Number.parseInt(match[1], 10);
}

async function applyMemoryGate() {
  for (let check = 1; check <= MEMORY_LOW_CHECKS; check += 1) {
    const free = await memoryFreePercent();
    console.log(`[memory] free=${free}% floor=${MEMORY_FLOOR_PERCENT}% check=${check}/${MEMORY_LOW_CHECKS} active=${activePopulates} limit=${launchLimit}`);
    if (free >= MEMORY_FLOOR_PERCENT) return;
    if (check < MEMORY_LOW_CHECKS) await sleep(MEMORY_RECHECK_MS);
  }

  const previousLimit = launchLimit;
  launchLimit = Math.max(1, launchLimit - 1);
  console.log(`[memory] stayed below ${MEMORY_FLOOR_PERCENT}%; reduced future launch limit ${previousLimit}->${launchLimit}; in-flight runs remain untouched`);
}

async function acquirePopulateSlot(category) {
  while (true) {
    const release = await withLaunchDecisionLock(async () => {
      if (activePopulates >= launchLimit) return null;
      await applyMemoryGate();
      if (activePopulates >= launchLimit) return null;
      activePopulates += 1;
      let released = false;
      console.log(`[scheduler] acquired category=${category.slug} active=${activePopulates}/${launchLimit}`);
      return () => {
        if (released) return;
        released = true;
        activePopulates -= 1;
        console.log(`[scheduler] released category=${category.slug} active=${activePopulates}/${launchLimit}`);
      };
    });
    if (release) return release;
    await sleep(5_000);
  }
}

function schemaSignature(columns) {
  return columns
    .map((column) => `${column.name}:${column.type}:${column.isPrimaryKey ? "pk" : "field"}`)
    .sort();
}

function compactExclusions(canonical, primaryKey) {
  const entries = [];
  for (const row of canonical) {
    const name = canonicalName(row.name) || "unnamed";
    const streets = streetIdentityKeys(row.street_address ?? row.address).join("+") || "no-street";
    const validUrl = canonicalUrl(row[primaryKey]);
    let compactUrl = normalizeText(row[primaryKey]) || "no-url";
    if (validUrl) {
      const parsed = new URL(validUrl);
      compactUrl = `${parsed.hostname}${parsed.pathname}`;
    }
    entries.push(`- ${name}@${streets}|${compactUrl}`);
  }
  return entries.join("\n");
}

async function selectDeterministicOpenPackLeads(
  category,
  canonical,
  usedLeadIds = [],
  usedIdentityGroups = [],
  limit = 16,
) {
  const openCategory = {
    cafes: "Quán cà phê",
    restaurants: "Nhà hàng",
    hotels: "Khách sạn",
  }[category.slug];
  const pack = await readJson(OPEN_PACK_PATH);
  const used = new Set(usedLeadIds);
  const usedGroups = new Set(usedIdentityGroups);
  const hasCategoryEvidence = (poi) => {
    const tags = new Set((poi.tags ?? []).map((tag) => normalizeText(tag).replaceAll(" ", "_")));
    if (category.slug === "cafes") {
      return ["coffee_shop", "cafe", "tea_room", "internet_cafe", "bubble_tea", "smoothie_juice_bar"]
        .some((tag) => tags.has(tag));
    }
    if (category.slug === "restaurants") {
      return [...tags].some((tag) => tag === "restaurant" || tag.endsWith("_restaurant") || tag === "diner");
    }
    return ["hotel", "accommodation", "motel", "hostel", "service_apartments", "bed_and_breakfast"]
      .some((tag) => tags.has(tag));
  };
  const eligiblePool = pack.pois.filter((poi) => (
    poi.category === openCategory
    && poi.district === "Quận 1"
    && hasHouseNumber(poi.address)
    && isGroundedInDistrictOne(poi.address)
    && hasCategoryEvidence(poi)
  ));
  const prefixOneCounts = new Map();
  const prefixTwoCounts = new Map();
  for (const poi of eligiblePool) {
    const base = String(poi.name ?? "").split(/\s[-–—|@]\s/)[0];
    const tokens = canonicalName(base).split(" ").filter(Boolean);
    if (tokens[0]) prefixOneCounts.set(tokens[0], (prefixOneCounts.get(tokens[0]) ?? 0) + 1);
    if (tokens.length >= 2) {
      const prefix = tokens.slice(0, 2).join(" ");
      prefixTwoCounts.set(prefix, (prefixTwoCounts.get(prefix) ?? 0) + 1);
    }
  }
  const genericRoots = new Set(["the", "nha", "quan", "tiem", "cong ty", "co phan", "dich vu", "am thuc"]);
  const chainFamily = (name) => {
    const base = String(name ?? "").split(/\s[-–—|@]\s/)[0];
    const normalized = canonicalName(base);
    const tokens = normalized.split(" ").filter(Boolean);
    const prefixTwo = tokens.slice(0, 2).join(" ");
    if (tokens.length >= 2 && (prefixTwoCounts.get(prefixTwo) ?? 0) >= 2 && !genericRoots.has(prefixTwo)) return prefixTwo;
    if (tokens[0]?.length >= 4 && (prefixOneCounts.get(tokens[0]) ?? 0) >= 3 && !genericRoots.has(tokens[0])) return tokens[0];
    return canonicalName(name);
  };
  const corridorCoverage = new Map();
  for (const row of canonical) {
    for (const streetKey of streetIdentityKeys(row.street_address ?? row.address)) {
      const corridor = streetKey.split("|").slice(1).join("|");
      corridorCoverage.set(corridor, (corridorCoverage.get(corridor) ?? 0) + 1);
    }
  }
  const existingGroups = canonical.map((row) => ({
    name: row.name,
    normalized_name: canonicalName(row.name),
    chain_family: chainFamily(row.name),
    street_keys: streetIdentityKeys(row.street_address ?? row.address),
  }));
  const candidates = eligiblePool
    .filter((poi) => !used.has(poi.id))
    .map((poi) => {
      const streetKeys = streetIdentityKeys(poi.address);
      const normalizedName = canonicalName(poi.name);
      const family = chainFamily(poi.name);
      const identityGroupKeys = streetKeys.flatMap((streetKey) => [
        `${normalizedName}|${streetKey}`,
        `${family}|${streetKey}`,
      ]);
      const relevantTagCount = (poi.tags ?? []).filter((tag) => /cafe|coffee|restaurant|diner|hotel|hostel|motel|accommodation/i.test(tag)).length;
      return {
        open_pack_id: poi.id,
        name: String(poi.name ?? "").trim(),
        address: String(poi.address ?? "").trim(),
        brand: String(poi.brand ?? "").trim(),
        normalized_name: normalizedName,
        chain_family: family,
        street_keys: streetKeys,
        identity_group_keys: identityGroupKeys,
        corridor: streetKeys[0]?.split("|").slice(1).join("|") ?? "",
        corridor_coverage: corridorCoverage.get(streetKeys[0]?.split("|").slice(1).join("|") ?? "") ?? 0,
        quality_score: relevantTagCount,
        popularity_score: Number(poi.popularityScore ?? 0),
        fallback_url: `https://www.google.com/maps/search/${encodeURIComponent(`${poi.name} ${poi.address}`)}`,
      };
    })
    .filter((lead) => lead.name && lead.address && lead.street_keys.length > 0 && lead.chain_family)
    .filter((lead) => !lead.identity_group_keys.some((key) => usedGroups.has(key)))
    .filter((lead) => !existingGroups.some((existing) => {
      const sameAddress = lead.street_keys.some((streetKey) => existing.street_keys.includes(streetKey));
      if (!sameAddress) return false;
      return lead.normalized_name === existing.normalized_name
        || namesAreCompatible(lead.name, existing.name)
        || lead.chain_family === existing.chain_family;
    }))
    .sort((left, right) => left.corridor_coverage - right.corridor_coverage
      || right.quality_score - left.quality_score
      || right.popularity_score - left.popularity_score
      || left.chain_family.localeCompare(right.chain_family)
      || left.open_pack_id.localeCompare(right.open_pack_id));

  const selected = [];
  const familyCounts = new Map();
  const corridorCounts = new Map();
  for (const candidate of candidates) {
    if (selected.length >= limit) break;
    if ((familyCounts.get(candidate.chain_family) ?? 0) >= 1 || (corridorCounts.get(candidate.corridor) ?? 0) >= 1) continue;
    selected.push(candidate);
    familyCounts.set(candidate.chain_family, 1);
    corridorCounts.set(candidate.corridor, 1);
  }
  for (const candidate of candidates) {
    if (selected.length >= limit) break;
    if (selected.some((lead) => lead.open_pack_id === candidate.open_pack_id)) continue;
    if ((familyCounts.get(candidate.chain_family) ?? 0) >= 2 || (corridorCounts.get(candidate.corridor) ?? 0) >= 2) continue;
    selected.push(candidate);
    familyCounts.set(candidate.chain_family, (familyCounts.get(candidate.chain_family) ?? 0) + 1);
    corridorCounts.set(candidate.corridor, (corridorCounts.get(candidate.corridor) ?? 0) + 1);
  }
  return selected.map((lead) => ({
    ...lead,
    identity_group: {
      normalized_name: lead.normalized_name,
      chain_family: lead.chain_family,
      street_keys: lead.street_keys,
      keys: lead.identity_group_keys,
    },
  }));
}

function buildDiversificationPrompt(category, canonical, columns, {
  sourceStreetRecovery = false,
  hotelCorridorRecovery = false,
  cafeCorridorRecovery = false,
  deterministicLeads = [],
} = {}) {
  const fieldContract = columns.map((column) => (
    `- ${column.name} (${column.type})${column.isPrimaryKey ? " [PRIMARY KEY]" : ""}`
  )).join("\n");
  const exclusions = compactExclusions(canonical, category.primaryKey);
  const allLeadsPreResolved = deterministicLeads.length > 0
    && deterministicLeads.every((lead) => isValidIndividualEvidenceUrl(lead.resolved_url));
  const deterministicLeadLines = deterministicLeads.map((lead, index) => (
    `${index + 1}. id=${lead.open_pack_id} | name=${lead.name} | address=${lead.address} | ${lead.resolved_url ? `resolved_url=${lead.resolved_url}` : `fallback_url=${lead.fallback_url}`}`
  )).join("\n");
  const sourceFamilies = {
    cafes: "Foody, Google Maps, Foursquare, Tripadvisor, or a local cafe directory",
    restaurants: "Foody, Google Maps, Tripadvisor, or a local restaurant directory",
    hotels: "Booking, Agoda, Expedia, Google Maps, Tripadvisor, or Traveloka",
  }[category.slug];
  const executionProtocol = allLeadsPreResolved
    ? `Pre-resolved direct-dispatch protocol for this recovery run:
- The exact name/address leads below already have verified individual source URLs. Do not call search_web and do not call fetch_page from the orchestrator.
- For EACH numbered lead, the very next action MUST be run_subagent. Pass its resolved_url exactly as ${category.primaryKey}, and pass the exact name plus address in entity_hint/context.
- The investigate subagent must validate Quận 1, research the remaining fields, and insert only a truthful row. If it rejects one lead, move directly to the next numbered lead.
- Do not finish until every queued lead has received one run_subagent dispatch or ROW_LIMIT_REACHED is returned.

Pre-resolved lead queue:
${deterministicLeadLines}`
    : deterministicLeads.length > 0
    ? `Deterministic lead-queue protocol for this recovery run:
- The exact uncovered name/address leads below come from the existing Quận 1 open pack. They are candidate inputs, not examples and not exclusions. Process them in numbered order; do not perform open-ended discovery.
- For EACH lead, make at most one exact search for its quoted name plus quoted address, using a rotating individual-profile source from ${sourceFamilies}.
- Immediately call run_subagent for that same lead. Use the best individual http(s) result as ${category.primaryKey}. If no individual result is available, use the lead's provided fallback_url as ${category.primaryKey}; never skip dispatch merely because the search snippet lacks a house number.
- Pass the exact lead name and address in entity_hint/context. The subagent, not the orchestrator, must verify Quận 1, discover better source URLs, research all fields, and decide whether insertion is valid.
- Do not call fetch_page from the orchestrator. If a subagent rejects a lead, move directly to the next numbered lead.
- Do not finish until every queued lead has received one run_subagent dispatch or ROW_LIMIT_REACHED is returned.

Uncovered lead queue:
${deterministicLeadLines}`
    : cafeCorridorRecovery
    ? `Execution protocol for this recovery run:
- The orchestrator is a lead router, not the café-page researcher. Its first action MUST be one search_web query combining one under-covered Quận 1 corridor or ward with one café source-domain constraint.
- Do not use broad district landing pages, generic rankings, or "best café" roundups.
- As soon as a search result exposes an individual café/place URL plus a plausible Quận 1 house-number address, immediately call run_subagent. Pass that URL as cafe_url and pass the result snippet as context. The subagent must validate the café, research study/amenity fields, and insert the row.
- The orchestrator may make at most ONE search call before each run_subagent dispatch. Never make back-to-back search/fetch calls, and do not call fetch_page from the orchestrator.
- Rotate both source family and corridor/ward after every dispatch. Prioritize under-covered areas and corridors such as Cầu Kho, Cô Giang, Cầu Ông Lãnh, Nguyễn Cư Trinh, Đa Kao, Tân Định, Cô Bắc, Đề Thám, Phạm Ngũ Lão, Nguyễn Thái Học, Nguyễn Công Trứ, Võ Văn Kiệt, Trần Khắc Chân, and Đặng Dung.
- Rotate among individual café results from Foody, Google Maps, Foursquare, Tripadvisor, and local café directories. Use the stable http(s) individual place URL as cafe_url evidence.
- If a result matches an exclusion fingerprint, change both the source family and corridor before searching again. Do not finish until at least one run_subagent has inserted a row.`
    : hotelCorridorRecovery
    ? `Execution protocol for this recovery run:
- The orchestrator is a lead router, not the property-page researcher. Its first action MUST be one search_web query combining one under-covered Quận 1 corridor or ward with one hotel source-domain constraint.
- Do not use broad district landing pages, generic rankings, or "best hotel" roundups.
- As soon as a search result exposes an individual property URL plus a plausible Quận 1 house-number address, immediately call run_subagent. Pass that URL as hotel_url and pass the result snippet as context. The subagent must validate the property, research amenities, and insert the row.
- The orchestrator may make at most ONE search call before each run_subagent dispatch. Never make back-to-back search/fetch calls, and do not call fetch_page from the orchestrator.
- Rotate both source family and corridor/ward after every dispatch. Prioritize under-covered areas and corridors such as Cầu Kho, Cô Giang, Cầu Ông Lãnh, Nguyễn Cư Trinh, Đa Kao, Tân Định, Cô Bắc, Đề Thám, Bùi Viện, Phạm Ngũ Lão, Nguyễn Thái Học, Trần Hưng Đạo, Nguyễn Trãi, Lê Lai, and Trần Khắc Chân.
- Rotate among individual property results from Booking, Agoda, Expedia, Google Maps, Tripadvisor, and Traveloka. Use the stable http(s) individual property URL as hotel_url evidence.
- If a result matches an exclusion fingerprint, change both the source family and corridor before searching again. Do not finish until at least one run_subagent has inserted a row.`
    : sourceStreetRecovery
    ? `Execution protocol for this recovery run:
- The orchestrator is a lead router, not the page researcher. Its first action MUST be one search_web query that combines one under-covered Quận 1 street or ward with one source-domain constraint.
- Do not use broad category pages, rankings, generic "best restaurant" queries, or repeated searches on the same central-tourist streets.
- As soon as one search result exposes an individual venue/place URL plus a plausible Quận 1 house-number address, immediately call run_subagent. Pass that URL as foody_url and pass the result snippet as context. The subagent must validate the venue, research the page, and insert the row.
- The orchestrator may make at most ONE search call before each run_subagent dispatch. Never make back-to-back search/fetch calls, and do not call fetch_page from the orchestrator.
- Rotate both source family and street/ward after every dispatch. Prioritize under-covered areas and corridors such as Cầu Kho, Cô Giang, Cầu Ông Lãnh, Nguyễn Cư Trinh, Đa Kao, Tân Định, Cô Bắc, Đề Thám, Bùi Viện, Phạm Ngũ Lão, Nguyễn Thái Học, Calmette, Nguyễn Công Trứ, Võ Văn Kiệt, Trần Khắc Chân, and Đặng Dung.
- Rotate among individual venue results from Foody, Google Maps, Tripadvisor, and local restaurant directories. The foody_url primary-key field accepts the stable http(s) individual venue URL used as evidence; it does not require a Foody domain.
- If a result matches an exclusion fingerprint, change both the source family and street before searching again. Do not finish until at least one run_subagent has inserted a row.`
    : `Execution protocol:
- After at most two search/fetch calls without an insertion, dispatch run_subagent on the best non-excluded lead; if that lead fails, immediately search a different Quận 1 street or ward and dispatch again.`;
  const promptStrategy = allLeadsPreResolved
    ? `pre-resolved direct-dispatch queue (${deterministicLeads.length} exact individual URLs); zero orchestrator discovery; mandatory run_subagent per lead`
    : deterministicLeads.length > 0
    ? `deterministic open-pack lead queue (${deterministicLeads.length} exact uncovered name/address candidates); exact search then mandatory run_subagent per lead; fallback URL prevents discovery-only exit`
    : cafeCorridorRecovery
    ? "cafe lead-router recovery: one source-and-corridor search then immediate run_subagent; no orchestrator fetch; rotate cafe source and under-covered corridor"
    : hotelCorridorRecovery
    ? "hotel lead-router recovery: one source-and-corridor search then immediate run_subagent; no orchestrator fetch; rotate property source and under-covered corridor"
    : sourceStreetRecovery
    ? "restaurant lead-router recovery: one source-and-street search then immediate run_subagent; no orchestrator fetch; rotate source family and under-covered corridor"
    : "compact full identity fingerprints; dispatch run_subagent after at most two searches; never finish zero";
  const prompt = `Build an offline, precomputed research dataset of real ${category.topic} located strictly in Quận 1 (District 1), Ho Chi Minh City, Vietnam.

This is a continuation batch. Find venues on UNSEEN Quận 1 streets and wards, using deeper listing/search-result pages and exact house-number addresses. Do not repeat a collected venue. The forbidden list below is only an exclusion list, never a source of examples or leads.

Required exact schema (do not rename, add, or remove fields):
${fieldContract}

Quality requirements:
- Every row must have a non-empty name, ${category.primaryKey}, and street_address/address with an exact house number.
- Normalize ratings to the 0-5 scale.
- Continue researching until the dataset reaches 100 rows or no verifiable Quận 1 candidates remain.
- A successful run MUST insert at least one row. Never finish with zero rows.
- Do not invent or infer unverifiable values.

${executionProtocol}

Forbidden canonical identity fingerprints (every collected venue is covered; these are exclusions only):
${exclusions}`;
  return { prompt, promptStrategy };
}

async function diversifyCategory(category, canonical, reason, {
  causalTerminalRecovery = false,
  sourceStreetRecovery = false,
} = {}) {
  const jobsBefore = await readJson(JOBS_PATH);
  const priorDiversifications = (jobsBefore.batch2.collection?.dataset_history?.[category.slug] ?? [])
    .filter((change) => !change.trigger_reclassified_terminal_failure);
  if (priorDiversifications.length >= MAX_DIVERSIFICATIONS_PER_CATEGORY) {
    await checkpoint((collection) => {
      collection.category_state[category.slug] = {
        ...(collection.category_state[category.slug] ?? {}),
        status: "blocked_diversification_cap",
        blocker: `Reached ${MAX_DIVERSIFICATIONS_PER_CATEGORY} diversified dataset experiments; inspect run evidence before changing the prompt again`,
      };
    });
    throw new Error(`[${category.slug}] diversification experiment cap reached; lane paused for evidence review`);
  }
  const currentDataset = await getDataset(category.datasetId);
  const columns = currentDataset.columns;
  const { prompt, promptStrategy } = buildDiversificationPrompt(
    category,
    canonical,
    columns,
    { sourceStreetRecovery },
  );

  await withLaunchDecisionLock(async () => {
    await applyMemoryGate();
  });
  const created = await api("POST", "/cli/datasets", {
    prompt,
    maxRowCount: TARGET,
    refreshCadence: "manual",
  });
  const newDataset = created.dataset;
  const expected = schemaSignature(columns);
  const actual = schemaSignature(newDataset.columns);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    await checkpoint((collection) => {
      collection.diversification_failures ??= [];
      collection.diversification_failures.push({
        category: category.slug,
        old_dataset_id: category.datasetId,
        rejected_dataset_id: newDataset._id,
        reason,
        failure: "schema_mismatch",
        expected,
        actual,
        at: new Date().toISOString(),
      });
    });
    throw new Error(`[${category.slug}] diversified dataset ${newDataset._id} schema did not match the existing contract`);
  }

  const oldDatasetId = category.datasetId;
  category.datasetId = newDataset._id;
  await checkpoint((collection, jobs) => {
    collection.dataset_history ??= {};
    collection.dataset_history[category.slug] ??= [];
    collection.dataset_history[category.slug].push({
      old_dataset_id: oldDatasetId,
      new_dataset_id: category.datasetId,
      reason,
      excluded_rows: canonical.length,
      exclusion_contract: "all canonical name/address/URL identities",
      causal_terminal_recovery: causalTerminalRecovery,
      source_street_recovery: sourceStreetRecovery,
      prompt_strategy: promptStrategy,
      schema_verified: true,
      at: new Date().toISOString(),
    });
    jobs.batch2.ids[category.jobKey] = category.datasetId;
    collection.category_state[category.slug] = {
      ...(collection.category_state[category.slug] ?? {}),
      dataset_id: category.datasetId,
      diversified_from: oldDatasetId,
      ...(causalTerminalRecovery ? {
        status: "replacement_ready",
        terminal_failure_streak: 0,
        zero_growth_streak: 0,
        terminal_streak_reset_reason: reason,
      } : {}),
    };
  });
  console.log(`[${category.slug}] diversified dataset ${oldDatasetId}->${category.datasetId} reason=${reason}`);
}

async function waitForCompletion(category, runId) {
  const started = Date.now();
  let lastReport = "";
  while (Date.now() - started < RUN_TIMEOUT_MS) {
    const dataset = await getDataset(category.datasetId);
    const report = `${dataset.status ?? "unknown"}:${dataset.rowCount ?? 0}`;
    if (report !== lastReport) {
      console.log(`[${category.slug}] run=${runId} status=${dataset.status ?? "unknown"} live_rows=${dataset.rowCount ?? 0}`);
      lastReport = report;
    }
    if (dataset.status !== "building") return dataset;
    await sleep(POLL_MS);
  }
  throw new Error(`[${category.slug}] run=${runId} exceeded ${RUN_TIMEOUT_MS / 60_000} minute timeout`);
}

async function runCategory(category) {
  const canonicalPath = path.join(OUTPUT_DIR, category.canonical);
  let canonical = uniqueRows(await readJson(canonicalPath), category);
  let usable = usableRowCount(canonical, category);
  const jobsAtStart = await readJson(JOBS_PATH);
  const existingAttempts = jobsAtStart.batch2.collection?.attempts?.filter((attempt) => attempt.category === category.slug) ?? [];
  let zeroGrowth = jobsAtStart.batch2.collection?.category_state?.[category.slug]?.zero_growth_streak ?? 0;
  let terminalFailures = jobsAtStart.batch2.collection?.category_state?.[category.slug]?.terminal_failure_streak ?? 0;
  let attemptNumber = existingAttempts.reduce((maximum, attempt) => Math.max(maximum, Number(attempt.attempt) || 0), 0);
  const failFastZeroRows = process.env.FAIL_FAST_ZERO_ROWS === "1";

  await checkpoint((collection) => {
    collection.status = "collecting";
    collection.category_state[category.slug] = {
      status: usable >= TARGET ? "complete" : "collecting",
      unique_rows: canonical.length,
      usable_unique_rows: usable,
      invalid_rows: canonical.length - usable,
      zero_growth_streak: zeroGrowth,
      terminal_failure_streak: terminalFailures,
    };
  });

  while (usable < TARGET && zeroGrowth < ZERO_GROWTH_LIMIT && terminalFailures < TERMINAL_FAILURE_LIMIT) {
    attemptNumber += 1;
    const stamp = timestamp();
    const attemptKey = `${category.slug}-${String(attemptNumber).padStart(3, "0")}-${stamp}`;
    const prePath = path.join(ATTEMPTS_DIR, `${category.slug}-attempt-${String(attemptNumber).padStart(3, "0")}-${stamp}-pre.json`);
    await writeJson(prePath, canonical);
    console.log(`[${category.slug}] attempt=${attemptNumber} snapshot=${relative(prePath)} raw_before=${canonical.length} usable_before=${usable}`);

    const startedAt = new Date().toISOString();
    await checkpoint((collection) => {
      upsertAttempt(collection, attemptKey, {
        category: category.slug,
        attempt: attemptNumber,
        attempt_state: "starting",
        run_id: null,
        dataset_id: category.datasetId,
        started_at: startedAt,
        pre_snapshot: relative(prePath),
        required_models: {
          populate_orchestrator: REQUIRED_MODEL,
          investigate_subagent: REQUIRED_MODEL,
        },
        effective_model_config: effectiveModelConfig,
      });
    });

    const releaseSlot = await acquirePopulateSlot(category);
    let runId;
    let dataset;
    let attemptRows;
    try {
      const populate = await api("POST", `/cli/datasets/${encodeURIComponent(category.datasetId)}/populate`);
      runId = populate.runId;
      await checkpoint((collection) => {
        upsertAttempt(collection, attemptKey, {
          attempt_state: "running",
          run_id: runId,
          submitted_at: new Date().toISOString(),
        });
      });
      console.log(`[${category.slug}] attempt=${attemptNumber} started run=${runId}`);
      dataset = await waitForCompletion(category, runId);
      attemptRows = await getRows(category.datasetId);
    } finally {
      releaseSlot();
    }
    const attemptPath = path.join(ATTEMPTS_DIR, `${category.slug}-attempt-${String(attemptNumber).padStart(3, "0")}-${stamp}-rows.json`);
    await writeJson(attemptPath, attemptRows);

    if (dataset.status !== "live") {
      terminalFailures += 1;
      const pauseForZeroRows = failFastZeroRows && attemptRows.length === 0;
      await checkpoint((collection, jobs) => {
        upsertAttempt(collection, attemptKey, {
          category: category.slug,
          attempt: attemptNumber,
          run_id: runId,
          attempt_state: "terminal_failure",
          started_at: startedAt,
          finished_at: new Date().toISOString(),
          dataset_status: dataset.status ?? "unknown",
          terminal_failure: true,
          terminal_failure_streak: terminalFailures,
          status_error: dataset.lastStatusError ?? null,
          rows_exported: attemptRows.length,
          unique_before: canonical.length,
          unique_after: canonical.length,
          unique_delta: 0,
          usable_before: usable,
          usable_after: usable,
          usable_delta: 0,
          dataset_id: category.datasetId,
          zero_growth_streak: zeroGrowth,
          pre_snapshot: relative(prePath),
          export: relative(attemptPath),
          fail_fast_zero_rows: pauseForZeroRows,
        });
        collection.category_state[category.slug] = {
          status: pauseForZeroRows
            ? "paused_zero_row_review"
            : terminalFailures >= TERMINAL_FAILURE_LIMIT
              ? "blocked_terminal_failures"
              : "retrying_terminal_failure",
          unique_rows: canonical.length,
          usable_unique_rows: usable,
          invalid_rows: canonical.length - usable,
          zero_growth_streak: zeroGrowth,
          terminal_failure_streak: terminalFailures,
          last_run_id: runId,
          last_export: relative(attemptPath),
          last_status_error: dataset.lastStatusError ?? null,
          dataset_id: category.datasetId,
        };
        if (pauseForZeroRows) {
          collection.status = "paused_zero_row_review";
          jobs.batch2.status = "paused_zero_row_review";
        }
      });
      console.log(`[${category.slug}] attempt=${attemptNumber} terminal_status=${dataset.status ?? "unknown"} rows_for_audit=${attemptRows.length} terminal_failures=${terminalFailures}/${TERMINAL_FAILURE_LIMIT}; retrying_same_dataset=${!pauseForZeroRows && terminalFailures < TERMINAL_FAILURE_LIMIT}`);
      if (pauseForZeroRows) {
        return {
          category: category.slug,
          rawUniqueRows: canonical.length,
          usableUniqueRows: usable,
          blocked: true,
          blockedReason: "zero_row_fail_fast",
        };
      }
      continue;
    }

    terminalFailures = 0;

    const rawBefore = canonical.length;
    const usableBefore = usable;
    canonical = uniqueRows([...canonical, ...attemptRows], category);
    usable = usableRowCount(canonical, category);
    const rawDelta = canonical.length - rawBefore;
    const usableDelta = usable - usableBefore;
    const duplicateRate = attemptRows.length > 0 ? 1 - rawDelta / attemptRows.length : 1;
    zeroGrowth = usableDelta === 0 ? zeroGrowth + 1 : 0;
    const pauseForZeroRows = failFastZeroRows && attemptRows.length === 0;
    await writeJson(canonicalPath, canonical);

    await checkpoint((collection, jobs) => {
      upsertAttempt(collection, attemptKey, {
        category: category.slug,
        attempt: attemptNumber,
        run_id: runId,
        attempt_state: "completed",
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        dataset_status: dataset.status ?? "unknown",
        terminal_failure: false,
        terminal_failure_streak: 0,
        rows_exported: attemptRows.length,
        unique_before: rawBefore,
        unique_after: canonical.length,
        unique_delta: rawDelta,
        usable_before: usableBefore,
        usable_after: usable,
        usable_delta: usableDelta,
        duplicate_rate: Number(duplicateRate.toFixed(4)),
        dataset_id: category.datasetId,
        zero_growth_streak: zeroGrowth,
        terminal_failure_streak: 0,
        pre_snapshot: relative(prePath),
        export: relative(attemptPath),
        fail_fast_zero_rows: pauseForZeroRows,
      });
      collection.category_state[category.slug] = {
        status: usable >= TARGET
          ? "complete"
          : pauseForZeroRows
            ? "paused_zero_row_review"
            : zeroGrowth >= ZERO_GROWTH_LIMIT
              ? "blocked_zero_growth"
              : "collecting",
        unique_rows: canonical.length,
        usable_unique_rows: usable,
        invalid_rows: canonical.length - usable,
        zero_growth_streak: zeroGrowth,
        last_run_id: runId,
        last_export: relative(attemptPath),
      };
      if (pauseForZeroRows) {
        collection.status = "paused_zero_row_review";
        jobs.batch2.status = "paused_zero_row_review";
      }
    });

    console.log(`[${category.slug}] attempt=${attemptNumber} exported=${attemptRows.length} raw_delta=${rawDelta} raw_total=${canonical.length} usable_delta=${usableDelta} usable_total=${usable}/${TARGET} zero_growth=${zeroGrowth}/${ZERO_GROWTH_LIMIT}`);

    if (pauseForZeroRows) {
      return {
        category: category.slug,
        rawUniqueRows: canonical.length,
        usableUniqueRows: usable,
        blocked: true,
        blockedReason: "zero_row_fail_fast",
      };
    }

    if (usable < TARGET && (usableDelta === 0 || duplicateRate > 0.8)) {
      const reason = usableDelta === 0
        ? `first usable-zero-growth attempt ${attemptNumber}`
        : `attempt ${attemptNumber} duplicate rate ${(duplicateRate * 100).toFixed(1)}%`;
      await diversifyCategory(category, canonical, reason);
    }
  }

  const blockedReason = terminalFailures >= TERMINAL_FAILURE_LIMIT
    ? "terminal_failures"
    : zeroGrowth >= ZERO_GROWTH_LIMIT
      ? "zero_growth"
      : null;
  return { category: category.slug, rawUniqueRows: canonical.length, usableUniqueRows: usable, blocked: usable < TARGET, blockedReason };
}

async function finalizeExisting(category, attemptNumber, runId, preSnapshot) {
  const canonicalPath = path.join(OUTPUT_DIR, category.canonical);
  let canonical = uniqueRows(await readJson(canonicalPath), category);
  let usable = usableRowCount(canonical, category);
  const jobsBefore = await readJson(JOBS_PATH);
  const previousState = jobsBefore.batch2.collection?.category_state?.[category.slug];
  const previousZeroGrowth = previousState?.zero_growth_streak ?? 0;
  const previousTerminalFailures = previousState?.terminal_failure_streak ?? 0;
  const dataset = await waitForCompletion(category, runId);
  const attemptRows = await getRows(category.datasetId);
  const stamp = timestamp();
  const attemptPath = path.join(ATTEMPTS_DIR, `${category.slug}-attempt-${String(attemptNumber).padStart(3, "0")}-${stamp}-rows.json`);
  await writeJson(attemptPath, attemptRows);
  const existingAttempt = jobsBefore.batch2.collection?.attempts?.find((attempt) => attempt.run_id === runId);
  const finalizeAttemptKey = existingAttempt?.attempt_key ?? `${category.slug}-${String(attemptNumber).padStart(3, "0")}-finalized-${runId}`;

  if (dataset.status !== "live") {
    const terminalFailures = previousTerminalFailures + 1;
    await checkpoint((collection, jobs) => {
      upsertAttempt(collection, finalizeAttemptKey, {
          category: category.slug,
          attempt: attemptNumber,
          run_id: runId,
          attempt_state: "terminal_failure",
          finished_at: new Date().toISOString(),
          dataset_status: dataset.status ?? "unknown",
          terminal_failure: true,
          terminal_failure_streak: terminalFailures,
          status_error: dataset.lastStatusError ?? null,
          rows_exported: attemptRows.length,
          unique_before: canonical.length,
          unique_after: canonical.length,
          unique_delta: 0,
          usable_before: usable,
          usable_after: usable,
          usable_delta: 0,
          zero_growth_streak: previousZeroGrowth,
          pre_snapshot: preSnapshot,
          export: relative(attemptPath),
          finalized_after_pause: true,
          required_models: {
            populate_orchestrator: REQUIRED_MODEL,
            investigate_subagent: REQUIRED_MODEL,
          },
          effective_model_config: effectiveModelConfig,
        });
      collection.status = "paused_terminal_failure_review";
      collection.category_state[category.slug] = {
        status: terminalFailures >= TERMINAL_FAILURE_LIMIT ? "blocked_terminal_failures" : "paused_terminal_failure",
        unique_rows: canonical.length,
        usable_unique_rows: usable,
        invalid_rows: canonical.length - usable,
        zero_growth_streak: previousZeroGrowth,
        terminal_failure_streak: terminalFailures,
        last_run_id: runId,
        last_export: relative(attemptPath),
        last_status_error: dataset.lastStatusError ?? null,
        dataset_id: category.datasetId,
      };
      jobs.batch2.status = "paused_terminal_failure_review";
    });
    console.log(`[${category.slug}] finalized terminal attempt=${attemptNumber} status=${dataset.status ?? "unknown"} rows_for_audit=${attemptRows.length} terminal_failures=${terminalFailures}/${TERMINAL_FAILURE_LIMIT}`);
    return;
  }

  const rawBefore = canonical.length;
  const usableBefore = usable;
  canonical = uniqueRows([...canonical, ...attemptRows], category);
  usable = usableRowCount(canonical, category);
  const rawDelta = canonical.length - rawBefore;
  const usableDelta = usable - usableBefore;
  const zeroGrowth = usableDelta === 0 ? previousZeroGrowth + 1 : 0;
  await writeJson(canonicalPath, canonical);

  await checkpoint((collection, jobs) => {
    upsertAttempt(collection, finalizeAttemptKey, {
        category: category.slug,
        attempt: attemptNumber,
        run_id: runId,
        attempt_state: "completed",
        finished_at: new Date().toISOString(),
        dataset_status: dataset.status ?? "unknown",
        terminal_failure: false,
        terminal_failure_streak: 0,
        rows_exported: attemptRows.length,
        unique_before: rawBefore,
        unique_after: canonical.length,
        unique_delta: rawDelta,
        usable_before: usableBefore,
        usable_after: usable,
        usable_delta: usableDelta,
        zero_growth_streak: zeroGrowth,
        pre_snapshot: preSnapshot,
        export: relative(attemptPath),
        finalized_after_pause: true,
        required_models: {
          populate_orchestrator: REQUIRED_MODEL,
          investigate_subagent: REQUIRED_MODEL,
        },
        effective_model_config: effectiveModelConfig,
      });
    collection.status = "paused_for_concurrency_change";
    collection.category_state[category.slug] = {
      status: usable >= TARGET ? "complete" : "paused",
      unique_rows: canonical.length,
      usable_unique_rows: usable,
      invalid_rows: canonical.length - usable,
      zero_growth_streak: zeroGrowth,
      terminal_failure_streak: 0,
      last_run_id: runId,
      last_export: relative(attemptPath),
    };
    jobs.batch2.status = "paused_for_concurrency_change";
  });

  console.log(`[${category.slug}] finalized paused attempt=${attemptNumber} exported=${attemptRows.length} raw_delta=${rawDelta} raw_total=${canonical.length} usable_delta=${usableDelta} usable_total=${usable}/${TARGET}`);
}

async function runExternalRestaurantSlot() {
  if (process.env.POPULATE_ORCHESTRATOR_MODEL !== REQUIRED_MODEL) {
    throw new Error(`POPULATE_ORCHESTRATOR_MODEL must equal ${REQUIRED_MODEL}`);
  }
  if (process.env.INVESTIGATE_SUBAGENT_MODEL !== REQUIRED_MODEL) {
    throw new Error(`INVESTIGATE_SUBAGENT_MODEL must equal ${REQUIRED_MODEL}`);
  }

  await mkdir(ATTEMPTS_DIR, { recursive: true });
  await api("GET", "/health");
  await verifyEffectiveModels();
  await applyMemoryGate();

  const jobs = await readJson(JOBS_PATH);
  const existingLedger = await readJsonOptional(EXTERNAL_RESTAURANT_PATH);
  if (existingLedger && (existingLedger.status === "starting" || existingLedger.status === "running")) {
    throw new Error(`External restaurant attempt ${existingLedger.attempt_key ?? "unknown"} is unresolved; do not submit another run`);
  }
  const batch = await readJsonOptional(EXTERNAL_RESTAURANT_BATCH_PATH) ?? {
    status: "collecting_external",
    category: "restaurants",
    attempts: [],
    replacements: [],
    created_at: new Date().toISOString(),
    required_models: {
      populate_orchestrator: REQUIRED_MODEL,
      investigate_subagent: REQUIRED_MODEL,
    },
  };
  for (const priorAttempt of batch.attempts ?? []) {
    if (priorAttempt.dataset_id && !batch.replacements.some((replacement) => replacement.new_dataset_id === priorAttempt.dataset_id)) {
      batch.replacements.push({
        old_dataset_id: priorAttempt.old_dataset_id,
        new_dataset_id: priorAttempt.dataset_id,
        reason: priorAttempt.reason,
        prompt_strategy: priorAttempt.prompt_strategy,
        source_street_recovery: true,
        causal_terminal_recovery: true,
        schema_verified: priorAttempt.schema_verified === true,
        at: priorAttempt.created_at,
      });
    }
  }
  const category = {
    ...categories.find((candidate) => candidate.slug === "restaurants"),
    datasetId: batch.current_dataset_id ?? jobs.batch2.ids?.["q1-restaurants-b2"],
  };
  if (!category.datasetId) throw new Error("Restaurant dataset id is missing from jobs.json");
  let canonical = uniqueRows(await readJson(path.join(OUTPUT_DIR, category.canonical)), category);
  const projected = await readJsonOptional(EXTERNAL_RESTAURANT_PROJECTED_PATH);
  if (projected) canonical = uniqueRows([...canonical, ...projected], category);
  if (existingLedger?.adoption_ready && existingLedger.export
      && !batch.attempts.some((attempt) => attempt.attempt_key === existingLedger.attempt_key)) {
    const priorRows = await readJson(path.join(ROOT, existingLedger.export));
    const rawBefore = canonical.length;
    const usableBefore = usableRowCount(canonical, category);
    canonical = uniqueRows([...canonical, ...priorRows], category);
    const adoptedLedger = {
      ...existingLedger,
      unique_before: rawBefore,
      unique_after: canonical.length,
      unique_delta: canonical.length - rawBefore,
      usable_before: usableBefore,
      usable_after: usableRowCount(canonical, category),
      usable_delta: usableRowCount(canonical, category) - usableBefore,
    };
    batch.attempts.push(adoptedLedger);
    if (!batch.replacements.some((replacement) => replacement.new_dataset_id === existingLedger.dataset_id)) {
      batch.replacements.push({
        old_dataset_id: existingLedger.old_dataset_id,
        new_dataset_id: existingLedger.dataset_id,
        reason: existingLedger.reason,
        prompt_strategy: existingLedger.prompt_strategy,
        source_street_recovery: true,
        causal_terminal_recovery: true,
        schema_verified: existingLedger.schema_verified === true,
        at: existingLedger.created_at,
      });
    }
    batch.current_dataset_id = existingLedger.dataset_id;
    await writeJson(EXTERNAL_RESTAURANT_PROJECTED_PATH, canonical);
    await writeJson(EXTERNAL_RESTAURANT_BATCH_PATH, batch);
  }
  category.datasetId = batch.current_dataset_id ?? category.datasetId;
  const currentDataset = await getDataset(category.datasetId);
  const { prompt, promptStrategy } = buildDiversificationPrompt(
    category,
    canonical,
    currentDataset.columns,
    { sourceStreetRecovery: true },
  );
  const reason = "Causal recovery after replacement attempt 16 made repeated broad search/fetch calls, dispatched zero run_subagent calls, and inserted zero rows; route one source-and-street lead directly to each subagent";
  const created = await api("POST", "/cli/datasets", {
    prompt,
    maxRowCount: TARGET,
    refreshCadence: "manual",
  });
  const expectedSchema = schemaSignature(currentDataset.columns);
  const actualSchema = schemaSignature(created.dataset.columns);
  const createdAt = new Date().toISOString();
  if (JSON.stringify(actualSchema) !== JSON.stringify(expectedSchema)) {
    await writeJson(EXTERNAL_RESTAURANT_PATH, {
      status: "schema_mismatch",
      rejected_dataset_id: created.dataset._id,
      expected_schema: expectedSchema,
      actual_schema: actualSchema,
      created_at: createdAt,
    });
    throw new Error(`[restaurants] external replacement ${created.dataset._id} schema mismatch`);
  }

  const previousAttempts = jobs.batch2.collection?.attempts?.filter((attempt) => attempt.category === "restaurants") ?? [];
  const allAttemptNumbers = [
    ...previousAttempts.map((attempt) => Number(attempt.attempt) || 0),
    ...batch.attempts.map((attempt) => Number(attempt.attempt) || 0),
  ];
  const attemptNumber = allAttemptNumbers.reduce((maximum, attempt) => Math.max(maximum, attempt), 0) + 1;
  const stamp = timestamp();
  const attemptKey = `restaurants-${String(attemptNumber).padStart(3, "0")}-${stamp}-external-slot`;
  const prePath = path.join(ATTEMPTS_DIR, `restaurants-attempt-${String(attemptNumber).padStart(3, "0")}-${stamp}-pre.json`);
  await writeJson(prePath, canonical);
  category.datasetId = created.dataset._id;
  const ledger = {
    status: "starting",
    category: "restaurants",
    attempt: attemptNumber,
    attempt_key: attemptKey,
    old_dataset_id: currentDataset._id,
    dataset_id: category.datasetId,
    schema_verified: true,
    schema_signature: actualSchema,
    reason,
    prompt_strategy: promptStrategy,
    source_street_recovery: true,
    causal_terminal_recovery: true,
    created_at: createdAt,
    started_at: new Date().toISOString(),
    pre_snapshot: relative(prePath),
    required_models: {
      populate_orchestrator: REQUIRED_MODEL,
      investigate_subagent: REQUIRED_MODEL,
    },
    effective_model_config: effectiveModelConfig,
    fail_fast_zero_rows: true,
    unique_before: canonical.length,
    usable_before: usableRowCount(canonical, category),
  };
  batch.replacements.push({
    old_dataset_id: currentDataset._id,
    new_dataset_id: category.datasetId,
    reason,
    prompt_strategy: promptStrategy,
    source_street_recovery: true,
    causal_terminal_recovery: true,
    schema_verified: true,
    at: createdAt,
  });
  batch.current_dataset_id = category.datasetId;
  await writeJson(EXTERNAL_RESTAURANT_BATCH_PATH, batch);
  await writeJson(EXTERNAL_RESTAURANT_PATH, ledger);

  try {
    const populate = await api("POST", `/cli/datasets/${encodeURIComponent(category.datasetId)}/populate`);
    ledger.status = "running";
    ledger.run_id = populate.runId;
    ledger.submitted_at = new Date().toISOString();
    await writeJson(EXTERNAL_RESTAURANT_PATH, ledger);
    console.log(`[restaurants-external] dataset=${category.datasetId} schema=verified run=${ledger.run_id}`);

    const dataset = await waitForCompletion(category, ledger.run_id);
    const attemptRows = await getRows(category.datasetId);
    const attemptPath = path.join(ATTEMPTS_DIR, `restaurants-attempt-${String(attemptNumber).padStart(3, "0")}-${stamp}-rows.json`);
    await writeJson(attemptPath, attemptRows);
    const rawBefore = canonical.length;
    const usableBefore = usableRowCount(canonical, category);
    canonical = uniqueRows([...canonical, ...attemptRows], category);
    const usableAfter = usableRowCount(canonical, category);
    Object.assign(ledger, {
      status: dataset.status === "live" && attemptRows.length > 0 ? "completed_external_unadopted" : "paused_zero_row_review",
      dataset_status: dataset.status ?? "unknown",
      status_error: dataset.lastStatusError ?? null,
      rows_exported: attemptRows.length,
      export: relative(attemptPath),
      finished_at: new Date().toISOString(),
      adoption_ready: true,
      unique_before: rawBefore,
      unique_after: canonical.length,
      unique_delta: canonical.length - rawBefore,
      usable_before: usableBefore,
      usable_after: usableAfter,
      usable_delta: usableAfter - usableBefore,
    });
    await writeJson(EXTERNAL_RESTAURANT_PATH, ledger);
    if (!batch.attempts.some((attempt) => attempt.attempt_key === ledger.attempt_key)) {
      batch.attempts.push(ledger);
    }
    batch.status = attemptRows.length === 0
      ? "paused_zero_row_review"
      : usableAfter >= TARGET
        ? "complete_external_unadopted"
        : "collecting_external";
    batch.projected_unique_rows = canonical.length;
    batch.projected_usable_rows = usableAfter;
    batch.updated_at = new Date().toISOString();
    await writeJson(EXTERNAL_RESTAURANT_PROJECTED_PATH, canonical);
    await writeJson(EXTERNAL_RESTAURANT_BATCH_PATH, batch);
    console.log(JSON.stringify({
      status: ledger.status,
      dataset_id: ledger.dataset_id,
      run_id: ledger.run_id,
      rows_exported: ledger.rows_exported,
      projected_usable_rows: usableAfter,
      schema_verified: true,
      fail_fast_zero_rows: true,
    }));
    if (attemptRows.length === 0) process.exitCode = 2;
  } catch (error) {
    ledger.status = "external_controller_error";
    ledger.controller_error = error instanceof Error ? error.message : String(error);
    ledger.finished_at = new Date().toISOString();
    await writeJson(EXTERNAL_RESTAURANT_PATH, ledger);
    throw error;
  }
}

async function runExternalRestaurantLoop() {
  for (let run = 1; run <= 30; run += 1) {
    const before = await readJsonOptional(EXTERNAL_RESTAURANT_BATCH_PATH);
    if (Number(before?.projected_usable_rows ?? 0) >= TARGET) return;
    if (before?.status === "paused_zero_row_review") return;
    await runExternalRestaurantSlot();
    const after = await readJsonOptional(EXTERNAL_RESTAURANT_BATCH_PATH);
    console.log(`[restaurants-external-loop] cycle=${run} projected_usable=${after?.projected_usable_rows ?? "unknown"}/${TARGET} status=${after?.status ?? "unknown"}`);
    if (Number(after?.projected_usable_rows ?? 0) >= TARGET || after?.status === "paused_zero_row_review") return;
  }
  throw new Error("Restaurant external loop reached 30 paid attempts without reaching the strict usable target");
}

async function runExternalHotelSlot() {
  if (process.env.POPULATE_ORCHESTRATOR_MODEL !== REQUIRED_MODEL) {
    throw new Error(`POPULATE_ORCHESTRATOR_MODEL must equal ${REQUIRED_MODEL}`);
  }
  if (process.env.INVESTIGATE_SUBAGENT_MODEL !== REQUIRED_MODEL) {
    throw new Error(`INVESTIGATE_SUBAGENT_MODEL must equal ${REQUIRED_MODEL}`);
  }

  await mkdir(ATTEMPTS_DIR, { recursive: true });
  await api("GET", "/health");
  await verifyEffectiveModels();
  await applyMemoryGate();

  const jobs = await readJson(JOBS_PATH);
  const existingLedger = await readJsonOptional(EXTERNAL_HOTEL_PATH);
  if (existingLedger && (existingLedger.status === "starting" || existingLedger.status === "running")) {
    throw new Error(`External hotel attempt ${existingLedger.attempt_key ?? "unknown"} is unresolved; do not submit another run`);
  }
  const batch = await readJsonOptional(EXTERNAL_HOTEL_BATCH_PATH) ?? {
    status: "collecting_external",
    category: "hotels",
    attempts: [],
    replacements: [],
    created_at: new Date().toISOString(),
    required_models: {
      populate_orchestrator: REQUIRED_MODEL,
      investigate_subagent: REQUIRED_MODEL,
    },
  };
  for (const priorAttempt of batch.attempts ?? []) {
    if (priorAttempt.dataset_id && !batch.replacements.some((replacement) => replacement.new_dataset_id === priorAttempt.dataset_id)) {
      batch.replacements.push({
        old_dataset_id: priorAttempt.old_dataset_id,
        new_dataset_id: priorAttempt.dataset_id,
        reason: priorAttempt.reason,
        prompt_strategy: priorAttempt.prompt_strategy,
        hotel_corridor_recovery: true,
        causal_terminal_recovery: true,
        schema_verified: priorAttempt.schema_verified === true,
        at: priorAttempt.created_at,
      });
    }
  }
  const category = {
    ...categories.find((candidate) => candidate.slug === "hotels"),
    datasetId: batch.current_dataset_id ?? jobs.batch2.ids?.["q1-hotels-b2"],
  };
  if (!category.datasetId) throw new Error("Hotel dataset id is missing from jobs.json");
  let canonical = uniqueRows(await readJson(path.join(OUTPUT_DIR, category.canonical)), category);
  const projected = await readJsonOptional(EXTERNAL_HOTEL_PROJECTED_PATH);
  if (projected) canonical = uniqueRows([...canonical, ...projected], category);
  if (existingLedger?.adoption_ready && existingLedger.export
      && !batch.attempts.some((attempt) => attempt.attempt_key === existingLedger.attempt_key)) {
    const priorRows = await readJson(path.join(ROOT, existingLedger.export));
    const rawBefore = canonical.length;
    const usableBefore = usableRowCount(canonical, category);
    canonical = uniqueRows([...canonical, ...priorRows], category);
    const usableAfter = usableRowCount(canonical, category);
    const adoptedLedger = {
      ...existingLedger,
      unique_before: rawBefore,
      unique_after: canonical.length,
      unique_delta: canonical.length - rawBefore,
      usable_before: usableBefore,
      usable_after: usableAfter,
      usable_delta: usableAfter - usableBefore,
    };
    batch.attempts.push(adoptedLedger);
    if (!batch.replacements.some((replacement) => replacement.new_dataset_id === existingLedger.dataset_id)) {
      batch.replacements.push({
        old_dataset_id: existingLedger.old_dataset_id,
        new_dataset_id: existingLedger.dataset_id,
        reason: existingLedger.reason,
        prompt_strategy: existingLedger.prompt_strategy,
        hotel_corridor_recovery: true,
        causal_terminal_recovery: true,
        schema_verified: existingLedger.schema_verified === true,
        at: existingLedger.created_at,
      });
    }
    batch.current_dataset_id = existingLedger.dataset_id;
    await writeJson(EXTERNAL_HOTEL_PROJECTED_PATH, canonical);
    await writeJson(EXTERNAL_HOTEL_BATCH_PATH, batch);
  }
  category.datasetId = batch.current_dataset_id ?? category.datasetId;
  const currentDataset = await getDataset(category.datasetId);
  const { prompt, promptStrategy } = buildDiversificationPrompt(
    category,
    canonical,
    currentDataset.columns,
    { hotelCorridorRecovery: true },
  );
  const reason = "Causal recovery after replacement hotel attempt 10 made a zero-row terminal run; route one hotel-source-and-corridor lead directly to each subagent";
  const created = await api("POST", "/cli/datasets", {
    prompt,
    maxRowCount: TARGET,
    refreshCadence: "manual",
  });
  const expectedSchema = schemaSignature(currentDataset.columns);
  const actualSchema = schemaSignature(created.dataset.columns);
  const createdAt = new Date().toISOString();
  if (JSON.stringify(actualSchema) !== JSON.stringify(expectedSchema)) {
    await writeJson(EXTERNAL_HOTEL_PATH, {
      status: "schema_mismatch",
      rejected_dataset_id: created.dataset._id,
      expected_schema: expectedSchema,
      actual_schema: actualSchema,
      created_at: createdAt,
    });
    throw new Error(`[hotels] external replacement ${created.dataset._id} schema mismatch`);
  }

  const previousAttempts = jobs.batch2.collection?.attempts?.filter((attempt) => attempt.category === "hotels") ?? [];
  const allAttemptNumbers = [
    ...previousAttempts.map((attempt) => Number(attempt.attempt) || 0),
    ...batch.attempts.map((attempt) => Number(attempt.attempt) || 0),
  ];
  const attemptNumber = allAttemptNumbers.reduce((maximum, attempt) => Math.max(maximum, attempt), 0) + 1;
  const stamp = timestamp();
  const attemptKey = `hotels-${String(attemptNumber).padStart(3, "0")}-${stamp}-external-slot`;
  const prePath = path.join(ATTEMPTS_DIR, `hotels-attempt-${String(attemptNumber).padStart(3, "0")}-${stamp}-pre.json`);
  await writeJson(prePath, canonical);
  category.datasetId = created.dataset._id;
  const ledger = {
    status: "starting",
    category: "hotels",
    attempt: attemptNumber,
    attempt_key: attemptKey,
    old_dataset_id: currentDataset._id,
    dataset_id: category.datasetId,
    schema_verified: true,
    schema_signature: actualSchema,
    reason,
    prompt_strategy: promptStrategy,
    hotel_corridor_recovery: true,
    causal_terminal_recovery: true,
    created_at: createdAt,
    started_at: new Date().toISOString(),
    pre_snapshot: relative(prePath),
    required_models: {
      populate_orchestrator: REQUIRED_MODEL,
      investigate_subagent: REQUIRED_MODEL,
    },
    effective_model_config: effectiveModelConfig,
    fail_fast_zero_rows: true,
    unique_before: canonical.length,
    usable_before: usableRowCount(canonical, category),
  };
  batch.replacements.push({
    old_dataset_id: currentDataset._id,
    new_dataset_id: category.datasetId,
    reason,
    prompt_strategy: promptStrategy,
    hotel_corridor_recovery: true,
    causal_terminal_recovery: true,
    schema_verified: true,
    at: createdAt,
  });
  batch.current_dataset_id = category.datasetId;
  await writeJson(EXTERNAL_HOTEL_BATCH_PATH, batch);
  await writeJson(EXTERNAL_HOTEL_PATH, ledger);

  try {
    const populate = await api("POST", `/cli/datasets/${encodeURIComponent(category.datasetId)}/populate`);
    ledger.status = "running";
    ledger.run_id = populate.runId;
    ledger.submitted_at = new Date().toISOString();
    await writeJson(EXTERNAL_HOTEL_PATH, ledger);
    console.log(`[hotels-external] dataset=${category.datasetId} schema=verified run=${ledger.run_id}`);

    const dataset = await waitForCompletion(category, ledger.run_id);
    const attemptRows = await getRows(category.datasetId);
    const attemptPath = path.join(ATTEMPTS_DIR, `hotels-attempt-${String(attemptNumber).padStart(3, "0")}-${stamp}-rows.json`);
    await writeJson(attemptPath, attemptRows);
    const rawBefore = canonical.length;
    const usableBefore = usableRowCount(canonical, category);
    canonical = uniqueRows([...canonical, ...attemptRows], category);
    const usableAfter = usableRowCount(canonical, category);
    Object.assign(ledger, {
      status: dataset.status === "live" && attemptRows.length > 0 ? "completed_external_unadopted" : "paused_zero_row_review",
      dataset_status: dataset.status ?? "unknown",
      status_error: dataset.lastStatusError ?? null,
      rows_exported: attemptRows.length,
      export: relative(attemptPath),
      finished_at: new Date().toISOString(),
      adoption_ready: true,
      unique_before: rawBefore,
      unique_after: canonical.length,
      unique_delta: canonical.length - rawBefore,
      usable_before: usableBefore,
      usable_after: usableAfter,
      usable_delta: usableAfter - usableBefore,
    });
    await writeJson(EXTERNAL_HOTEL_PATH, ledger);
    if (!batch.attempts.some((attempt) => attempt.attempt_key === ledger.attempt_key)) batch.attempts.push(ledger);
    batch.status = attemptRows.length === 0
      ? "paused_zero_row_review"
      : usableAfter >= TARGET
        ? "complete_external_unadopted"
        : "collecting_external";
    batch.projected_unique_rows = canonical.length;
    batch.projected_usable_rows = usableAfter;
    batch.updated_at = new Date().toISOString();
    await writeJson(EXTERNAL_HOTEL_PROJECTED_PATH, canonical);
    await writeJson(EXTERNAL_HOTEL_BATCH_PATH, batch);
    console.log(JSON.stringify({
      status: ledger.status,
      dataset_id: ledger.dataset_id,
      run_id: ledger.run_id,
      rows_exported: ledger.rows_exported,
      projected_usable_rows: usableAfter,
      schema_verified: true,
      fail_fast_zero_rows: true,
    }));
    if (attemptRows.length === 0) process.exitCode = 2;
  } catch (error) {
    ledger.status = "external_controller_error";
    ledger.controller_error = error instanceof Error ? error.message : String(error);
    ledger.finished_at = new Date().toISOString();
    await writeJson(EXTERNAL_HOTEL_PATH, ledger);
    throw error;
  }
}

async function runExternalHotelLoop() {
  for (let run = 1; run <= 30; run += 1) {
    const before = await readJsonOptional(EXTERNAL_HOTEL_BATCH_PATH);
    if (Number(before?.projected_usable_rows ?? 0) >= TARGET) return;
    if (before?.status === "paused_zero_row_review") return;
    await runExternalHotelSlot();
    const after = await readJsonOptional(EXTERNAL_HOTEL_BATCH_PATH);
    console.log(`[hotels-external-loop] cycle=${run} projected_usable=${after?.projected_usable_rows ?? "unknown"}/${TARGET} status=${after?.status ?? "unknown"}`);
    if (Number(after?.projected_usable_rows ?? 0) >= TARGET || after?.status === "paused_zero_row_review") return;
  }
  throw new Error("Hotel external loop reached 30 paid attempts without reaching the strict usable target");
}

async function runExternalCafeSlot() {
  if (process.env.POPULATE_ORCHESTRATOR_MODEL !== REQUIRED_MODEL) throw new Error(`POPULATE_ORCHESTRATOR_MODEL must equal ${REQUIRED_MODEL}`);
  if (process.env.INVESTIGATE_SUBAGENT_MODEL !== REQUIRED_MODEL) throw new Error(`INVESTIGATE_SUBAGENT_MODEL must equal ${REQUIRED_MODEL}`);

  await mkdir(ATTEMPTS_DIR, { recursive: true });
  await api("GET", "/health");
  await verifyEffectiveModels();
  await applyMemoryGate();

  const jobs = await readJson(JOBS_PATH);
  const existingLedger = await readJsonOptional(EXTERNAL_CAFE_PATH);
  if (existingLedger && (existingLedger.status === "starting" || existingLedger.status === "running")) {
    throw new Error(`External cafe attempt ${existingLedger.attempt_key ?? "unknown"} is unresolved; do not submit another run`);
  }
  const batch = await readJsonOptional(EXTERNAL_CAFE_BATCH_PATH) ?? {
    status: "collecting_external",
    category: "cafes",
    attempts: [],
    replacements: [],
    created_at: new Date().toISOString(),
    required_models: {
      populate_orchestrator: REQUIRED_MODEL,
      investigate_subagent: REQUIRED_MODEL,
    },
  };
  for (const priorAttempt of batch.attempts ?? []) {
    if (priorAttempt.dataset_id && !batch.replacements.some((replacement) => replacement.new_dataset_id === priorAttempt.dataset_id)) {
      batch.replacements.push({
        old_dataset_id: priorAttempt.old_dataset_id,
        new_dataset_id: priorAttempt.dataset_id,
        reason: priorAttempt.reason,
        prompt_strategy: priorAttempt.prompt_strategy,
        cafe_corridor_recovery: true,
        causal_terminal_recovery: true,
        schema_verified: priorAttempt.schema_verified === true,
        at: priorAttempt.created_at,
      });
    }
  }
  const category = {
    ...categories.find((candidate) => candidate.slug === "cafes"),
    datasetId: batch.current_dataset_id ?? jobs.batch2.ids?.["q1-cafes-b2"],
  };
  if (!category.datasetId) throw new Error("Cafe dataset id is missing from jobs.json");
  let canonical = uniqueRows(await readJson(path.join(OUTPUT_DIR, category.canonical)), category);
  const projected = await readJsonOptional(EXTERNAL_CAFE_PROJECTED_PATH);
  if (projected) canonical = uniqueRows([...canonical, ...projected], category);
  if (existingLedger?.adoption_ready && existingLedger.export
      && !batch.attempts.some((attempt) => attempt.attempt_key === existingLedger.attempt_key)) {
    const priorRows = await readJson(path.join(ROOT, existingLedger.export));
    const rawBefore = canonical.length;
    const usableBefore = usableRowCount(canonical, category);
    canonical = uniqueRows([...canonical, ...priorRows], category);
    const usableAfter = usableRowCount(canonical, category);
    const adoptedLedger = {
      ...existingLedger,
      unique_before: rawBefore,
      unique_after: canonical.length,
      unique_delta: canonical.length - rawBefore,
      usable_before: usableBefore,
      usable_after: usableAfter,
      usable_delta: usableAfter - usableBefore,
    };
    batch.attempts.push(adoptedLedger);
    if (!batch.replacements.some((replacement) => replacement.new_dataset_id === existingLedger.dataset_id)) {
      batch.replacements.push({
        old_dataset_id: existingLedger.old_dataset_id,
        new_dataset_id: existingLedger.dataset_id,
        reason: existingLedger.reason,
        prompt_strategy: existingLedger.prompt_strategy,
        cafe_corridor_recovery: true,
        causal_terminal_recovery: true,
        schema_verified: existingLedger.schema_verified === true,
        at: existingLedger.created_at,
      });
    }
    batch.current_dataset_id = existingLedger.dataset_id;
    await writeJson(EXTERNAL_CAFE_PROJECTED_PATH, canonical);
    await writeJson(EXTERNAL_CAFE_BATCH_PATH, batch);
  }
  category.datasetId = batch.current_dataset_id ?? category.datasetId;
  const currentDataset = await getDataset(category.datasetId);
  const { prompt, promptStrategy } = buildDiversificationPrompt(
    category,
    canonical,
    currentDataset.columns,
    { cafeCorridorRecovery: true },
  );
  const reason = "Causal recovery after replacement cafe attempt 21 made a zero-row terminal run; route one cafe-source-and-corridor lead directly to each subagent";
  const created = await api("POST", "/cli/datasets", { prompt, maxRowCount: TARGET, refreshCadence: "manual" });
  const expectedSchema = schemaSignature(currentDataset.columns);
  const actualSchema = schemaSignature(created.dataset.columns);
  const createdAt = new Date().toISOString();
  if (JSON.stringify(actualSchema) !== JSON.stringify(expectedSchema)) {
    await writeJson(EXTERNAL_CAFE_PATH, {
      status: "schema_mismatch",
      rejected_dataset_id: created.dataset._id,
      expected_schema: expectedSchema,
      actual_schema: actualSchema,
      created_at: createdAt,
    });
    throw new Error(`[cafes] external replacement ${created.dataset._id} schema mismatch`);
  }

  const previousAttempts = jobs.batch2.collection?.attempts?.filter((attempt) => attempt.category === "cafes") ?? [];
  const allAttemptNumbers = [
    ...previousAttempts.map((attempt) => Number(attempt.attempt) || 0),
    ...batch.attempts.map((attempt) => Number(attempt.attempt) || 0),
  ];
  const attemptNumber = allAttemptNumbers.reduce((maximum, attempt) => Math.max(maximum, attempt), 0) + 1;
  const stamp = timestamp();
  const attemptKey = `cafes-${String(attemptNumber).padStart(3, "0")}-${stamp}-external-slot`;
  const prePath = path.join(ATTEMPTS_DIR, `cafes-attempt-${String(attemptNumber).padStart(3, "0")}-${stamp}-pre.json`);
  await writeJson(prePath, canonical);
  category.datasetId = created.dataset._id;
  const ledger = {
    status: "starting",
    category: "cafes",
    attempt: attemptNumber,
    attempt_key: attemptKey,
    old_dataset_id: currentDataset._id,
    dataset_id: category.datasetId,
    schema_verified: true,
    schema_signature: actualSchema,
    reason,
    prompt_strategy: promptStrategy,
    cafe_corridor_recovery: true,
    causal_terminal_recovery: true,
    created_at: createdAt,
    started_at: new Date().toISOString(),
    pre_snapshot: relative(prePath),
    required_models: { populate_orchestrator: REQUIRED_MODEL, investigate_subagent: REQUIRED_MODEL },
    effective_model_config: effectiveModelConfig,
    fail_fast_zero_rows: true,
    unique_before: canonical.length,
    usable_before: usableRowCount(canonical, category),
  };
  batch.replacements.push({
    old_dataset_id: currentDataset._id,
    new_dataset_id: category.datasetId,
    reason,
    prompt_strategy: promptStrategy,
    cafe_corridor_recovery: true,
    causal_terminal_recovery: true,
    schema_verified: true,
    at: createdAt,
  });
  batch.current_dataset_id = category.datasetId;
  await writeJson(EXTERNAL_CAFE_BATCH_PATH, batch);
  await writeJson(EXTERNAL_CAFE_PATH, ledger);

  try {
    const populate = await api("POST", `/cli/datasets/${encodeURIComponent(category.datasetId)}/populate`);
    ledger.status = "running";
    ledger.run_id = populate.runId;
    ledger.submitted_at = new Date().toISOString();
    await writeJson(EXTERNAL_CAFE_PATH, ledger);
    console.log(`[cafes-external] dataset=${category.datasetId} schema=verified run=${ledger.run_id}`);
    const dataset = await waitForCompletion(category, ledger.run_id);
    const attemptRows = await getRows(category.datasetId);
    const attemptPath = path.join(ATTEMPTS_DIR, `cafes-attempt-${String(attemptNumber).padStart(3, "0")}-${stamp}-rows.json`);
    await writeJson(attemptPath, attemptRows);
    const rawBefore = canonical.length;
    const usableBefore = usableRowCount(canonical, category);
    canonical = uniqueRows([...canonical, ...attemptRows], category);
    const usableAfter = usableRowCount(canonical, category);
    Object.assign(ledger, {
      status: dataset.status === "live" && attemptRows.length > 0 ? "completed_external_unadopted" : "paused_zero_row_review",
      dataset_status: dataset.status ?? "unknown",
      status_error: dataset.lastStatusError ?? null,
      rows_exported: attemptRows.length,
      export: relative(attemptPath),
      finished_at: new Date().toISOString(),
      adoption_ready: true,
      unique_before: rawBefore,
      unique_after: canonical.length,
      unique_delta: canonical.length - rawBefore,
      usable_before: usableBefore,
      usable_after: usableAfter,
      usable_delta: usableAfter - usableBefore,
    });
    await writeJson(EXTERNAL_CAFE_PATH, ledger);
    if (!batch.attempts.some((attempt) => attempt.attempt_key === ledger.attempt_key)) batch.attempts.push(ledger);
    batch.status = attemptRows.length === 0 ? "paused_zero_row_review" : usableAfter >= TARGET ? "complete_external_unadopted" : "collecting_external";
    batch.projected_unique_rows = canonical.length;
    batch.projected_usable_rows = usableAfter;
    batch.updated_at = new Date().toISOString();
    await writeJson(EXTERNAL_CAFE_PROJECTED_PATH, canonical);
    await writeJson(EXTERNAL_CAFE_BATCH_PATH, batch);
    console.log(JSON.stringify({
      status: ledger.status,
      dataset_id: ledger.dataset_id,
      run_id: ledger.run_id,
      rows_exported: ledger.rows_exported,
      projected_usable_rows: usableAfter,
      schema_verified: true,
      fail_fast_zero_rows: true,
    }));
    if (attemptRows.length === 0) process.exitCode = 2;
  } catch (error) {
    ledger.status = "external_controller_error";
    ledger.controller_error = error instanceof Error ? error.message : String(error);
    ledger.finished_at = new Date().toISOString();
    await writeJson(EXTERNAL_CAFE_PATH, ledger);
    throw error;
  }
}

async function runExternalCafeLoop() {
  for (let run = 1; run <= 30; run += 1) {
    const before = await readJsonOptional(EXTERNAL_CAFE_BATCH_PATH);
    if (Number(before?.projected_usable_rows ?? 0) >= TARGET) return;
    if (before?.status === "paused_zero_row_review") return;
    await runExternalCafeSlot();
    const after = await readJsonOptional(EXTERNAL_CAFE_BATCH_PATH);
    console.log(`[cafes-external-loop] cycle=${run} projected_usable=${after?.projected_usable_rows ?? "unknown"}/${TARGET} status=${after?.status ?? "unknown"}`);
    if (Number(after?.projected_usable_rows ?? 0) >= TARGET || after?.status === "paused_zero_row_review") return;
  }
  throw new Error("Cafe external loop reached 30 paid attempts without reaching the strict usable target");
}

function externalArtifacts(categorySlug) {
  return {
    cafes: {
      ledgerPath: EXTERNAL_CAFE_PATH,
      batchPath: EXTERNAL_CAFE_BATCH_PATH,
      projectedPath: EXTERNAL_CAFE_PROJECTED_PATH,
    },
    restaurants: {
      ledgerPath: EXTERNAL_RESTAURANT_PATH,
      batchPath: EXTERNAL_RESTAURANT_BATCH_PATH,
      projectedPath: EXTERNAL_RESTAURANT_PROJECTED_PATH,
    },
    hotels: {
      ledgerPath: EXTERNAL_HOTEL_PATH,
      batchPath: EXTERNAL_HOTEL_BATCH_PATH,
      projectedPath: EXTERNAL_HOTEL_PROJECTED_PATH,
    },
  }[categorySlug];
}

async function runExternalDeterministicSlot(categorySlug, { providedLeads = null, causalReason = null } = {}) {
  if (process.env.POPULATE_ORCHESTRATOR_MODEL !== REQUIRED_MODEL) throw new Error(`POPULATE_ORCHESTRATOR_MODEL must equal ${REQUIRED_MODEL}`);
  if (process.env.INVESTIGATE_SUBAGENT_MODEL !== REQUIRED_MODEL) throw new Error(`INVESTIGATE_SUBAGENT_MODEL must equal ${REQUIRED_MODEL}`);
  const artifacts = externalArtifacts(categorySlug);
  const categoryTemplate = categories.find((candidate) => candidate.slug === categorySlug);
  if (!artifacts || !categoryTemplate) throw new Error(`Unknown deterministic category ${categorySlug}`);

  await mkdir(ATTEMPTS_DIR, { recursive: true });
  await api("GET", "/health");
  await verifyEffectiveModels();
  await applyMemoryGate();
  const jobs = await readJson(JOBS_PATH);
  const existingLedger = await readJsonOptional(artifacts.ledgerPath);
  if (existingLedger && (existingLedger.status === "starting" || existingLedger.status === "running")) {
    throw new Error(`External ${categorySlug} attempt ${existingLedger.attempt_key ?? "unknown"} is unresolved; do not submit another run`);
  }
  const batch = await readJsonOptional(artifacts.batchPath) ?? {
    status: "collecting_external",
    category: categorySlug,
    attempts: [],
    replacements: [],
    used_lead_ids: [],
    used_identity_groups: [],
    created_at: new Date().toISOString(),
    required_models: { populate_orchestrator: REQUIRED_MODEL, investigate_subagent: REQUIRED_MODEL },
  };
  batch.attempts ??= [];
  batch.replacements ??= [];
  batch.used_lead_ids ??= [];
  batch.used_identity_groups ??= [];
  const category = {
    ...categoryTemplate,
    datasetId: batch.current_dataset_id ?? jobs.batch2.ids?.[categoryTemplate.jobKey],
  };
  if (!category.datasetId) throw new Error(`${categorySlug} dataset id is missing from jobs.json`);
  let canonical = uniqueRows(await readJson(path.join(OUTPUT_DIR, category.canonical)), category);
  const projected = await readJsonOptional(artifacts.projectedPath);
  if (projected) canonical = uniqueRows([...canonical, ...projected], category);
  if (existingLedger?.adoption_ready && existingLedger.export
      && !batch.attempts.some((attempt) => attempt.attempt_key === existingLedger.attempt_key)) {
    const priorRows = await readJson(path.join(ROOT, existingLedger.export));
    const rawBefore = canonical.length;
    const usableBefore = usableRowCount(canonical, category);
    canonical = uniqueRows([...canonical, ...priorRows], category);
    const usableAfter = usableRowCount(canonical, category);
    batch.attempts.push({
      ...existingLedger,
      unique_before: rawBefore,
      unique_after: canonical.length,
      unique_delta: canonical.length - rawBefore,
      usable_before: usableBefore,
      usable_after: usableAfter,
      usable_delta: usableAfter - usableBefore,
    });
    batch.current_dataset_id = existingLedger.dataset_id;
  }
  category.datasetId = batch.current_dataset_id ?? category.datasetId;
  const leads = providedLeads
    ? providedLeads
      .map((lead) => {
        const streetKeys = streetIdentityKeys(lead.address);
        const normalizedName = canonicalName(lead.name);
        const chainFamily = normalizedName;
        return {
          ...lead,
          normalized_name: normalizedName,
          chain_family: chainFamily,
          street_keys: streetKeys,
          identity_group_keys: streetKeys.flatMap((streetKey) => [
            `${normalizedName}|${streetKey}`,
            `${chainFamily}|${streetKey}`,
          ]),
          corridor: streetKeys[0]?.split("|").slice(1).join("|") ?? "",
          identity_group: {
            normalized_name: normalizedName,
            chain_family: chainFamily,
            street_keys: streetKeys,
            keys: streetKeys.flatMap((streetKey) => [`${normalizedName}|${streetKey}`, `${chainFamily}|${streetKey}`]),
          },
        };
      })
      .filter((lead) => isValidIndividualEvidenceUrl(lead.resolved_url) && lead.street_keys.length > 0)
      .filter((lead) => !canonical.some((row) => {
        const sameAddress = lead.street_keys.some((streetKey) => streetIdentityKeys(row.street_address ?? row.address).includes(streetKey));
        return sameAddress && namesAreCompatible(lead.name, row.name);
      }))
    : await selectDeterministicOpenPackLeads(
      category,
      canonical,
      batch.used_lead_ids,
      batch.used_identity_groups,
      16,
    );
  if (!leads.length) throw new Error(`[${categorySlug}] deterministic open-pack queue exhausted before strict target`);
  const currentDataset = await getDataset(category.datasetId);
  const { prompt, promptStrategy } = buildDiversificationPrompt(
    category,
    canonical,
    currentDataset.columns,
    { deterministicLeads: leads },
  );
  const reason = causalReason ?? batch.deterministic_causal_reason
    ?? `Causal recovery from open-ended discovery exits: route exact uncovered open-pack name/address leads directly through run_subagent`;
  const created = await api("POST", "/cli/datasets", { prompt, maxRowCount: TARGET, refreshCadence: "manual" });
  const expectedSchema = schemaSignature(currentDataset.columns);
  const actualSchema = schemaSignature(created.dataset.columns);
  const createdAt = new Date().toISOString();
  if (JSON.stringify(actualSchema) !== JSON.stringify(expectedSchema)) {
    await writeJson(artifacts.ledgerPath, {
      status: "schema_mismatch",
      rejected_dataset_id: created.dataset._id,
      expected_schema: expectedSchema,
      actual_schema: actualSchema,
      lead_queue: leads,
      created_at: createdAt,
    });
    throw new Error(`[${categorySlug}] deterministic replacement ${created.dataset._id} schema mismatch`);
  }

  const previousAttempts = jobs.batch2.collection?.attempts?.filter((attempt) => attempt.category === categorySlug) ?? [];
  const attemptNumber = [
    ...previousAttempts.map((attempt) => Number(attempt.attempt) || 0),
    ...batch.attempts.map((attempt) => Number(attempt.attempt) || 0),
  ].reduce((maximum, attempt) => Math.max(maximum, attempt), 0) + 1;
  const stamp = timestamp();
  const attemptKey = `${categorySlug}-${String(attemptNumber).padStart(3, "0")}-${stamp}-open-pack-queue`;
  const prePath = path.join(ATTEMPTS_DIR, `${categorySlug}-attempt-${String(attemptNumber).padStart(3, "0")}-${stamp}-pre.json`);
  await writeJson(prePath, canonical);
  category.datasetId = created.dataset._id;
  const ledger = {
    status: "starting",
    category: categorySlug,
    attempt: attemptNumber,
    attempt_key: attemptKey,
    old_dataset_id: currentDataset._id,
    dataset_id: category.datasetId,
    schema_verified: true,
    schema_signature: actualSchema,
    reason,
    prompt_strategy: promptStrategy,
    deterministic_open_pack_recovery: true,
    pre_resolved_direct_dispatch: Boolean(providedLeads),
    lead_queue: leads,
    lead_ids: leads.map((lead) => lead.open_pack_id),
    created_at: createdAt,
    started_at: new Date().toISOString(),
    pre_snapshot: relative(prePath),
    required_models: { populate_orchestrator: REQUIRED_MODEL, investigate_subagent: REQUIRED_MODEL },
    effective_model_config: effectiveModelConfig,
    fail_fast_zero_rows: true,
    unique_before: canonical.length,
    usable_before: usableRowCount(canonical, category),
  };
  batch.replacements.push({
    old_dataset_id: currentDataset._id,
    new_dataset_id: category.datasetId,
    reason,
    prompt_strategy: promptStrategy,
    deterministic_open_pack_recovery: true,
    pre_resolved_direct_dispatch: Boolean(providedLeads),
    lead_ids: ledger.lead_ids,
    schema_verified: true,
    at: createdAt,
  });
  batch.used_lead_ids = [...new Set([...batch.used_lead_ids, ...ledger.lead_ids])];
  batch.used_identity_groups = [...new Set([
    ...batch.used_identity_groups,
    ...leads.flatMap((lead) => lead.identity_group?.keys ?? []),
  ])];
  batch.current_dataset_id = category.datasetId;
  batch.strategy_phase = providedLeads ? "pre_resolved_direct_dispatch" : "deterministic_open_pack_queue";
  await writeJson(artifacts.batchPath, batch);
  await writeJson(artifacts.ledgerPath, ledger);

  try {
    const populate = await api("POST", `/cli/datasets/${encodeURIComponent(category.datasetId)}/populate`);
    ledger.status = "running";
    ledger.run_id = populate.runId;
    ledger.submitted_at = new Date().toISOString();
    await writeJson(artifacts.ledgerPath, ledger);
    console.log(`[${categorySlug}-deterministic] dataset=${category.datasetId} schema=verified leads=${leads.length} run=${ledger.run_id}`);
    const dataset = await waitForCompletion(category, ledger.run_id);
    const attemptRows = await getRows(category.datasetId);
    const attemptPath = path.join(ATTEMPTS_DIR, `${categorySlug}-attempt-${String(attemptNumber).padStart(3, "0")}-${stamp}-rows.json`);
    await writeJson(attemptPath, attemptRows);
    const rawBefore = canonical.length;
    const usableBefore = usableRowCount(canonical, category);
    canonical = uniqueRows([...canonical, ...attemptRows], category);
    const usableAfter = usableRowCount(canonical, category);
    Object.assign(ledger, {
      status: dataset.status === "live" && attemptRows.length > 0 ? "completed_external_unadopted" : "paused_zero_row_review",
      dataset_status: dataset.status ?? "unknown",
      status_error: dataset.lastStatusError ?? null,
      rows_exported: attemptRows.length,
      export: relative(attemptPath),
      finished_at: new Date().toISOString(),
      adoption_ready: true,
      unique_before: rawBefore,
      unique_after: canonical.length,
      unique_delta: canonical.length - rawBefore,
      usable_before: usableBefore,
      usable_after: usableAfter,
      usable_delta: usableAfter - usableBefore,
    });
    await writeJson(artifacts.ledgerPath, ledger);
    if (!batch.attempts.some((attempt) => attempt.attempt_key === ledger.attempt_key)) batch.attempts.push(ledger);
    batch.status = attemptRows.length === 0 ? "paused_zero_row_review" : usableAfter >= TARGET ? "complete_external_unadopted" : "collecting_external";
    batch.projected_unique_rows = canonical.length;
    batch.projected_usable_rows = usableAfter;
    batch.updated_at = new Date().toISOString();
    await writeJson(artifacts.projectedPath, canonical);
    await writeJson(artifacts.batchPath, batch);
    console.log(JSON.stringify({
      status: ledger.status,
      category: categorySlug,
      dataset_id: ledger.dataset_id,
      run_id: ledger.run_id,
      leads_attempted: leads.length,
      rows_exported: ledger.rows_exported,
      projected_usable_rows: usableAfter,
      schema_verified: true,
      fail_fast_zero_rows: true,
    }));
    if (attemptRows.length === 0) process.exitCode = 2;
  } catch (error) {
    ledger.status = "external_controller_error";
    ledger.controller_error = error instanceof Error ? error.message : String(error);
    ledger.finished_at = new Date().toISOString();
    await writeJson(artifacts.ledgerPath, ledger);
    throw error;
  }
}

async function runExternalDeterministicLoop(categorySlug) {
  const artifacts = externalArtifacts(categorySlug);
  const batch = await readJsonOptional(artifacts.batchPath);
  if (batch) {
    batch.status = "collecting_external";
    batch.strategy_phase = "deterministic_open_pack_queue";
    batch.strategy_changes ??= [];
    const causalMetrics = categorySlug === "restaurants"
      ? { run_id: "0e0e323d-ff9c-4221-9e92-f8ce510e16b2", search_calls: 1, fetch_calls: 0, investigate_calls: 0, rows_inserted: 0 }
      : categorySlug === "hotels"
        ? { run_id: "a39c67f7-c797-4150-a323-6e2117904ff7", search_calls: 2, fetch_calls: 0, investigate_calls: 0, rows_inserted: 0 }
        : { prior_strategy: "open-ended source/corridor discovery", evidence: "non-deterministic lead discovery remained the limiting step" };
    batch.deterministic_causal_reason = `Deterministic open-pack pivot after discovery-stage evidence ${JSON.stringify(causalMetrics)}; exact uncovered names and house-number addresses remove the lead-discovery exit`;
    batch.strategy_changes.push({
      strategy: "deterministic_open_pack_queue",
      causal_metrics: causalMetrics,
      at: new Date().toISOString(),
    });
    await writeJson(artifacts.batchPath, batch);
  }
  for (let run = 1; run <= 30; run += 1) {
    const before = await readJsonOptional(artifacts.batchPath);
    if (Number(before?.projected_usable_rows ?? 0) >= TARGET) return;
    if (before?.status === "paused_zero_row_review") return;
    await runExternalDeterministicSlot(categorySlug);
    const after = await readJsonOptional(artifacts.batchPath);
    console.log(`[${categorySlug}-deterministic-loop] cycle=${run} projected_usable=${after?.projected_usable_rows ?? "unknown"}/${TARGET} status=${after?.status ?? "unknown"}`);
    if (Number(after?.projected_usable_rows ?? 0) >= TARGET || after?.status === "paused_zero_row_review") return;
  }
  throw new Error(`${categorySlug} deterministic loop reached 30 paid attempts without reaching the strict usable target`);
}

async function runPreResolvedRestaurantAttempt(leadsFile) {
  const leads = await readJson(path.resolve(ROOT, leadsFile));
  if (!Array.isArray(leads) || leads.length < 4 || leads.length > 8) {
    throw new Error("Pre-resolved restaurant retry requires 4-8 leads");
  }
  if (leads.some((lead) => !lead.open_pack_id || !lead.name || !lead.address || !isValidIndividualEvidenceUrl(lead.resolved_url))) {
    throw new Error("Every pre-resolved lead needs id, name, exact address, and an individual non-search URL");
  }
  const batch = await readJson(EXTERNAL_RESTAURANT_BATCH_PATH);
  batch.status = "collecting_external";
  batch.strategy_phase = "pre_resolved_direct_dispatch";
  batch.strategy_changes ??= [];
  const causalMetrics = {
    run_id: "03209cbc-a467-4ff3-9c00-1a4b278e515e",
    search_calls: 27,
    fetch_calls: 0,
    investigate_calls: 0,
    rows_inserted: 0,
    orchestrator_steps: 30,
  };
  const causalReason = `Pre-resolved direct-dispatch pivot after exact queue runStats ${JSON.stringify(causalMetrics)}; individual URLs remove all remaining orchestrator discovery decisions`;
  batch.strategy_changes.push({
    strategy: "pre_resolved_direct_dispatch",
    causal_metrics: causalMetrics,
    leads_file: relative(path.resolve(ROOT, leadsFile)),
    lead_ids: leads.map((lead) => lead.open_pack_id),
    at: new Date().toISOString(),
  });
  await writeJson(EXTERNAL_RESTAURANT_BATCH_PATH, batch);
  await runExternalDeterministicSlot("restaurants", { providedLeads: leads, causalReason });
}

async function rebuildExternalProjections(categorySlugs) {
  for (const categorySlug of categorySlugs) {
    const artifacts = externalArtifacts(categorySlug);
    const category = categories.find((candidate) => candidate.slug === categorySlug);
    if (!artifacts || !category) throw new Error(`Unknown projection category ${categorySlug}`);
    const batch = await readJsonOptional(artifacts.batchPath);
    if (!batch) continue;
    let canonical = uniqueRows(await readJson(path.join(OUTPUT_DIR, category.canonical)), category);
    const replayed = [];
    const attempts = [...(batch.attempts ?? [])];
    const currentLedger = await readJsonOptional(artifacts.ledgerPath);
    if (currentLedger?.adoption_ready
        && !attempts.some((attempt) => attempt.attempt_key === currentLedger.attempt_key)) {
      attempts.push(currentLedger);
    }
    attempts.sort((left, right) => Number(left.attempt) - Number(right.attempt));
    for (const attempt of attempts) {
      if (!attempt.export) continue;
      const rows = await readJson(path.join(ROOT, attempt.export));
      canonical = uniqueRows([...canonical, ...rows], category);
      replayed.push({
        attempt_key: attempt.attempt_key,
        export: attempt.export,
        raw_rows: rows.length,
      });
    }
    const usable = usableRowCount(canonical, category);
    batch.projected_unique_rows = canonical.length;
    batch.projected_usable_rows = usable;
    batch.projection_reconciliation = {
      rebuilt_at: new Date().toISOString(),
      canonical_url_policy: "Google Maps query-form search URLs preserve query identity; future fallbacks use unique encoded path form",
      trusted_after_url_identity_rebuild: true,
      replayed_exports: replayed,
      projected_unique_rows: canonical.length,
      projected_usable_rows: usable,
    };
    await writeJson(artifacts.projectedPath, canonical);
    await writeJson(artifacts.batchPath, batch);
    console.log(`[${categorySlug}] rebuilt external projection raw=${canonical.length} usable=${usable}/${TARGET} exports=${replayed.length}`);
  }
}

async function recoverExternalCurrent(categorySlug) {
  const artifacts = externalArtifacts(categorySlug);
  const category = categories.find((candidate) => candidate.slug === categorySlug);
  if (!artifacts || !category) throw new Error(`Unknown recovery category ${categorySlug}`);
  const ledger = await readJson(artifacts.ledgerPath);
  if (!ledger.dataset_id || !ledger.run_id || !ledger.attempt_key) throw new Error(`[${categorySlug}] external ledger lacks recovery metadata`);
  const dataset = await getDataset(ledger.dataset_id);
  if (dataset.status === "building") throw new Error(`[${categorySlug}] run ${ledger.run_id} is still building; recovery must wait for terminal status`);
  const attemptRows = await getRows(ledger.dataset_id);
  const attemptPath = path.join(
    ATTEMPTS_DIR,
    `${categorySlug}-attempt-${String(ledger.attempt).padStart(3, "0")}-${timestamp()}-recovered-rows.json`,
  );
  await writeJson(attemptPath, attemptRows);
  let canonical = uniqueRows(await readJson(path.join(OUTPUT_DIR, category.canonical)), category);
  const projected = await readJsonOptional(artifacts.projectedPath);
  if (projected) canonical = uniqueRows([...canonical, ...projected], category);
  const rawBefore = canonical.length;
  const usableBefore = usableRowCount(canonical, category);
  canonical = uniqueRows([...canonical, ...attemptRows], category);
  const usableAfter = usableRowCount(canonical, category);
  Object.assign(ledger, {
    status: dataset.status === "live" && attemptRows.length > 0 ? "completed_external_unadopted" : "paused_zero_row_review",
    dataset_status: dataset.status ?? "unknown",
    status_error: dataset.lastStatusError ?? null,
    rows_exported: attemptRows.length,
    export: relative(attemptPath),
    finished_at: new Date().toISOString(),
    adoption_ready: true,
    recovered_after_controller_stop: true,
    unique_before: rawBefore,
    unique_after: canonical.length,
    unique_delta: canonical.length - rawBefore,
    usable_before: usableBefore,
    usable_after: usableAfter,
    usable_delta: usableAfter - usableBefore,
  });
  const batch = await readJson(artifacts.batchPath);
  const existingIndex = batch.attempts.findIndex((attempt) => attempt.attempt_key === ledger.attempt_key);
  if (existingIndex >= 0) batch.attempts[existingIndex] = ledger;
  else batch.attempts.push(ledger);
  batch.status = attemptRows.length === 0 ? "paused_zero_row_review" : usableAfter >= TARGET ? "complete_external_unadopted" : "collecting_external";
  batch.projected_unique_rows = canonical.length;
  batch.projected_usable_rows = usableAfter;
  batch.updated_at = new Date().toISOString();
  await writeJson(artifacts.ledgerPath, ledger);
  await writeJson(artifacts.projectedPath, canonical);
  await writeJson(artifacts.batchPath, batch);
  console.log(`[${categorySlug}] recovered stopped controller run=${ledger.run_id} rows=${attemptRows.length} raw=${canonical.length} usable=${usableAfter}/${TARGET}`);
}

function parseExternalAdoptionArguments(args) {
  const allowIncomplete = args.includes("--allow-incomplete");
  return {
    categorySlugs: args.filter((argument) => argument !== "--allow-incomplete"),
    requireTarget: !allowIncomplete,
    pausedReason: allowIncomplete
      ? "Only the Codex automatic approval-reviewer usage gate rejected new launches; OpenRouter and the mandated Nitro model remain available and are not blocked"
      : null,
  };
}

async function adoptExternalBatches(categorySlugs, { requireTarget = true, pausedReason = null } = {}) {
  const uniqueSlugs = [...new Set(categorySlugs)];
  if (!uniqueSlugs.length || uniqueSlugs.some((slug) => !categories.some((category) => category.slug === slug))) {
    throw new Error("Usage: --adopt-external-batches <cafes|restaurants|hotels> [...]");
  }

  // Preflight every lane before writing any canonical file. This keeps a partial
  // collection from being published just because another lane is already ready.
  const plans = [];
  for (const categorySlug of uniqueSlugs) {
    const artifacts = externalArtifacts(categorySlug);
    const category = categories.find((candidate) => candidate.slug === categorySlug);
    const batch = await readJson(artifacts.batchPath);
    const projected = await readJson(artifacts.projectedPath);
    const canonical = uniqueRows(projected, category);
    const usable = usableRowCount(canonical, category);
    if (!batch.attempts?.length || !batch.current_dataset_id) {
      throw new Error(`External ${categorySlug} batch has no adoptable attempts`);
    }
    if (requireTarget && usable < TARGET) {
      throw new Error(`Refusing incomplete ${categorySlug} adoption: strict usable ${usable}/${TARGET}`);
    }
    const statusBeforeAdoption = String(batch.status ?? "collecting_external").startsWith("adopted_")
      ? batch.status_before_adoption ?? "collecting_external"
      : batch.status ?? "collecting_external";
    plans.push({ categorySlug, artifacts, category, batch, canonical, usable, statusBeforeAdoption });
  }

  for (const plan of plans) {
    await writeJson(path.join(OUTPUT_DIR, plan.category.canonical), plan.canonical);
  }

  const adoptedAt = new Date().toISOString();
  await checkpoint((collection, jobs) => {
    jobs.batch2.ids ??= {};
    collection.dataset_history ??= {};
    for (const { categorySlug, artifacts, category, batch, canonical, usable, statusBeforeAdoption } of plans) {
      const externalBatchPath = relative(artifacts.batchPath);
      jobs.batch2.ids[category.jobKey] = batch.current_dataset_id;
      collection.dataset_history[categorySlug] ??= [];
      for (const replacement of batch.replacements ?? []) {
        if (!collection.dataset_history[categorySlug].some((entry) => entry.new_dataset_id === replacement.new_dataset_id)) {
          collection.dataset_history[categorySlug].push({
            ...replacement,
            excluded_rows: null,
            exclusion_contract: "all projected canonical name/address/URL identities",
            external_slot_batch: externalBatchPath,
          });
        }
      }
      for (const attempt of batch.attempts) {
        const terminalFailure = attempt.dataset_status !== "live";
        upsertAttempt(collection, attempt.attempt_key, {
          category: categorySlug,
          attempt: attempt.attempt,
          attempt_state: terminalFailure ? "terminal_failure" : "completed",
          run_id: attempt.run_id,
          dataset_id: attempt.dataset_id,
          started_at: attempt.started_at,
          submitted_at: attempt.submitted_at,
          finished_at: attempt.finished_at,
          dataset_status: attempt.dataset_status,
          status_error: attempt.status_error ?? null,
          terminal_failure: terminalFailure,
          rows_exported: attempt.rows_exported,
          unique_before: attempt.unique_before,
          unique_after: attempt.unique_after,
          unique_delta: attempt.unique_delta,
          usable_before: attempt.usable_before,
          usable_after: attempt.usable_after,
          usable_delta: attempt.usable_delta,
          pre_snapshot: attempt.pre_snapshot,
          export: attempt.export,
          required_models: attempt.required_models,
          effective_model_config: attempt.effective_model_config,
          external_slot: true,
          external_slot_batch: externalBatchPath,
          fail_fast_zero_rows: true,
        });
      }
      const statusBeforeApprovalUsageGate = usable >= TARGET
        ? "complete"
        : statusBeforeAdoption === "paused_zero_row_review"
          ? "paused_zero_row_review"
          : "collecting";
      const latestExternalAttempt = batch.attempts.at(-1) ?? null;
      const lastZeroRowAttempt = [...(batch.attempts ?? [])]
        .reverse()
        .find((attempt) => Number(attempt.rows_exported ?? -1) === 0);
      const previousState = collection.category_state[categorySlug] ?? {};
      const previousRunWasController = Boolean(
        latestExternalAttempt?.run_id
        && previousState.last_run_id
        && previousState.last_run_id !== latestExternalAttempt.run_id,
      );
      const nextState = {
        ...previousState,
        status: usable >= TARGET ? "complete" : requireTarget ? statusBeforeApprovalUsageGate : "paused_approval_usage_gate",
        status_before_approval_usage_gate: requireTarget || usable >= TARGET ? undefined : statusBeforeApprovalUsageGate,
        dataset_id: batch.current_dataset_id,
        unique_rows: canonical.length,
        usable_unique_rows: usable,
        invalid_rows: canonical.length - usable,
        zero_growth_streak: 0,
        terminal_failure_streak: statusBeforeAdoption === "paused_zero_row_review" ? 1 : 0,
        external_slot_batch: externalBatchPath,
        adopted_at: adoptedAt,
        last_controller_run_id: previousState.last_controller_run_id
          ?? (previousRunWasController ? previousState.last_run_id : undefined),
        last_controller_export: previousState.last_controller_export
          ?? (previousRunWasController ? previousState.last_export : undefined),
        last_controller_status_error: previousState.last_controller_status_error
          ?? (previousRunWasController ? previousState.last_status_error ?? null : undefined),
        last_attempt_key: latestExternalAttempt?.attempt_key ?? previousState.last_attempt_key,
        last_run_id: latestExternalAttempt?.run_id ?? previousState.last_run_id,
        last_export: latestExternalAttempt?.export ?? previousState.last_export,
        last_status_error: latestExternalAttempt ? latestExternalAttempt.status_error ?? null : previousState.last_status_error,
        last_attempt_source: latestExternalAttempt ? "latest_adopted_external_attempt" : previousState.last_attempt_source,
        last_zero_row_evidence: lastZeroRowAttempt ? {
          attempt_key: lastZeroRowAttempt.attempt_key,
          run_id: lastZeroRowAttempt.run_id,
          dataset_id: lastZeroRowAttempt.dataset_id,
          dataset_status: lastZeroRowAttempt.dataset_status,
          status_error: lastZeroRowAttempt.status_error ?? null,
          rows_exported: lastZeroRowAttempt.rows_exported,
          export: lastZeroRowAttempt.export,
          finished_at: lastZeroRowAttempt.finished_at,
        } : null,
      };
      collection.category_state[categorySlug] = nextState;
    }
    collection.status = requireTarget ? aggregateCollectionStatus(collection) : "paused_approval_usage_gate";
    if (collection.status === "complete") collection.finished_at = adoptedAt;
    if (!requireTarget) {
      collection.finished_at = undefined;
      collection.current_blocker = {
        type: "CODEX_AUTOMATIC_APPROVAL_REVIEWER_USAGE_GATE",
        detail: pausedReason ?? "Only the Codex automatic approval-reviewer usage gate rejected new launches; OpenRouter and the mandated Nitro model remain available and are not blocked",
        scope: "new external launches only",
        openrouter_blocked: false,
        nitro_model_blocked: false,
        active: true,
      };
      delete collection.blocker;
      collection.resume_required = true;
    } else {
      collection.current_blocker = null;
    }
    collection.external_batch_adoption = {
      categories: plans.map(({ categorySlug }) => categorySlug),
      require_target: requireTarget,
      strict_counts: Object.fromEntries(plans.map(({ categorySlug, usable }) => [categorySlug, usable])),
      approval_usage_gate_reason: requireTarget ? null : collection.current_blocker.detail,
      adopted_at: adoptedAt,
    };
    if (jobs.blocker && !jobs.historical_resolved_blocker) jobs.historical_resolved_blocker = jobs.blocker;
    delete jobs.blocker;
    jobs.current_blocker = requireTarget ? null : {
      ...collection.current_blocker,
      strict_counts: collection.external_batch_adoption.strict_counts,
      resume_commands_path: "batch2.resume_commands.categories",
    };
    jobs.batch2.status = collection.status;
  });

  for (const { artifacts, batch, canonical, usable, statusBeforeAdoption, category } of plans) {
    batch.status_before_adoption = statusBeforeAdoption;
    batch.status = usable >= TARGET ? "adopted_complete" : "adopted_partial";
    batch.adopted_at = adoptedAt;
    batch.adopted_canonical = relative(path.join(OUTPUT_DIR, category.canonical));
    batch.adopted_unique_rows = canonical.length;
    batch.adopted_usable_rows = usable;
    await writeJson(artifacts.batchPath, batch);
  }

  for (const { categorySlug, batch, canonical, usable } of plans) {
    console.log(`[${categorySlug}] adopted external batch attempts=${batch.attempts.length} raw=${canonical.length} usable=${usable}/${TARGET}`);
  }
}

async function runController() {
  if (process.env.POPULATE_ORCHESTRATOR_MODEL !== REQUIRED_MODEL) {
    throw new Error(`POPULATE_ORCHESTRATOR_MODEL must equal ${REQUIRED_MODEL}`);
  }
  if (process.env.INVESTIGATE_SUBAGENT_MODEL !== REQUIRED_MODEL) {
    throw new Error(`INVESTIGATE_SUBAGENT_MODEL must equal ${REQUIRED_MODEL}`);
  }

  await mkdir(ATTEMPTS_DIR, { recursive: true });
  await api("GET", "/health");
  await verifyEffectiveModels();
  const currentJobs = await readJson(JOBS_PATH);
  for (const category of categories) {
    const recordedId = currentJobs.batch2.ids?.[category.jobKey];
    if (typeof recordedId === "string" && recordedId.trim() && !recordedId.includes(" ")) {
      category.datasetId = recordedId;
    }
  }
  await reconcileUnresolvedAttempts();
  await repairTerminalFailureHistory();

  const requested = process.argv.slice(2);
  if (requested[0] === "--preview-open-pack-leads") {
    const slug = requested[1];
    const limit = Number.parseInt(requested[2] ?? "6", 10);
    const category = categories.find((candidate) => candidate.slug === slug);
    const artifacts = externalArtifacts(slug);
    if (!category || !artifacts || !Number.isInteger(limit) || limit < 1) {
      throw new Error("Usage: --preview-open-pack-leads <cafes|restaurants|hotels> [limit]");
    }
    const batch = await readJsonOptional(artifacts.batchPath) ?? {};
    let canonical = uniqueRows(await readJson(path.join(OUTPUT_DIR, category.canonical)), category);
    const projected = await readJsonOptional(artifacts.projectedPath);
    if (projected) canonical = uniqueRows([...canonical, ...projected], category);
    const leads = await selectDeterministicOpenPackLeads(
      category,
      canonical,
      batch.used_lead_ids ?? [],
      batch.used_identity_groups ?? [],
      limit,
    );
    console.log(JSON.stringify({ category: slug, canonical: canonical.length, usable: usableRowCount(canonical, category), leads }, null, 2));
    return;
  }
  if (requested[0] === "--recover-external-current") {
    const slug = requested[1];
    if (!categories.some((category) => category.slug === slug)) {
      throw new Error("Usage: --recover-external-current <cafes|restaurants|hotels>");
    }
    await recoverExternalCurrent(slug);
    return;
  }
  if (requested[0] === "--rebuild-external-projections") {
    const slugs = requested.slice(1);
    if (!slugs.length || slugs.some((slug) => !categories.some((category) => category.slug === slug))) {
      throw new Error("Usage: --rebuild-external-projections <cafes|restaurants|hotels> [...]");
    }
    await rebuildExternalProjections(slugs);
    return;
  }
  if (requested[0] === "--adopt-external-batches") {
    const adoption = parseExternalAdoptionArguments(requested.slice(1));
    await adoptExternalBatches(adoption.categorySlugs, adoption);
    return;
  }
  if (requested[0] === "--adopt-external-restaurant-batch") {
    const batch = await readJson(EXTERNAL_RESTAURANT_BATCH_PATH);
    const projected = await readJson(EXTERNAL_RESTAURANT_PROJECTED_PATH);
    const category = categories.find((candidate) => candidate.slug === "restaurants");
    const canonical = uniqueRows(projected, category);
    const usable = usableRowCount(canonical, category);
    if (!batch.attempts?.length || !batch.current_dataset_id) {
      throw new Error("External restaurant batch has no adoptable attempts");
    }
    await writeJson(path.join(OUTPUT_DIR, category.canonical), canonical);
    await checkpoint((collection, jobs) => {
      jobs.batch2.ids[category.jobKey] = batch.current_dataset_id;
      collection.dataset_history ??= {};
      collection.dataset_history.restaurants ??= [];
      for (const replacement of batch.replacements ?? []) {
        if (!collection.dataset_history.restaurants.some((entry) => entry.new_dataset_id === replacement.new_dataset_id)) {
          collection.dataset_history.restaurants.push({
            ...replacement,
            excluded_rows: null,
            exclusion_contract: "all projected canonical name/address/URL identities",
            external_slot_batch: relative(EXTERNAL_RESTAURANT_BATCH_PATH),
          });
        }
      }
      for (const attempt of batch.attempts) {
        const terminalFailure = attempt.dataset_status !== "live";
        upsertAttempt(collection, attempt.attempt_key, {
          category: "restaurants",
          attempt: attempt.attempt,
          attempt_state: terminalFailure ? "terminal_failure" : "completed",
          run_id: attempt.run_id,
          dataset_id: attempt.dataset_id,
          started_at: attempt.started_at,
          submitted_at: attempt.submitted_at,
          finished_at: attempt.finished_at,
          dataset_status: attempt.dataset_status,
          status_error: attempt.status_error ?? null,
          terminal_failure: terminalFailure,
          rows_exported: attempt.rows_exported,
          unique_before: attempt.unique_before,
          unique_after: attempt.unique_after,
          unique_delta: attempt.unique_delta,
          usable_before: attempt.usable_before,
          usable_after: attempt.usable_after,
          usable_delta: attempt.usable_delta,
          pre_snapshot: attempt.pre_snapshot,
          export: attempt.export,
          required_models: attempt.required_models,
          effective_model_config: attempt.effective_model_config,
          external_slot: true,
          external_slot_batch: relative(EXTERNAL_RESTAURANT_BATCH_PATH),
          fail_fast_zero_rows: true,
        });
      }
      const pausedZero = batch.status === "paused_zero_row_review";
      collection.category_state.restaurants = {
        ...(collection.category_state.restaurants ?? {}),
        status: usable >= TARGET ? "complete" : pausedZero ? "paused_zero_row_review" : "collecting",
        dataset_id: batch.current_dataset_id,
        unique_rows: canonical.length,
        usable_unique_rows: usable,
        invalid_rows: canonical.length - usable,
        zero_growth_streak: 0,
        terminal_failure_streak: pausedZero ? 1 : 0,
        external_slot_batch: relative(EXTERNAL_RESTAURANT_BATCH_PATH),
      };
      collection.status = usable >= TARGET ? aggregateCollectionStatus(collection) : pausedZero ? "paused_zero_row_review" : "collecting";
      jobs.batch2.status = collection.status;
    });
    console.log(`[restaurants] adopted external batch attempts=${batch.attempts.length} raw=${canonical.length} usable=${usable}/${TARGET}`);
    return;
  }
  if (requested[0] === "--adopt-external-restaurant") {
    const ledger = await readJson(EXTERNAL_RESTAURANT_PATH);
    if (!ledger.adoption_ready || !ledger.dataset_id || !ledger.run_id || !ledger.attempt_key) {
      throw new Error("External restaurant ledger is not complete and adoption-ready");
    }
    await checkpoint((collection, jobs) => {
      jobs.batch2.ids["q1-restaurants-b2"] = ledger.dataset_id;
      collection.dataset_history ??= {};
      collection.dataset_history.restaurants ??= [];
      if (!collection.dataset_history.restaurants.some((entry) => entry.new_dataset_id === ledger.dataset_id)) {
        collection.dataset_history.restaurants.push({
          old_dataset_id: ledger.old_dataset_id,
          new_dataset_id: ledger.dataset_id,
          reason: ledger.reason,
          excluded_rows: ledger.unique_before ?? null,
          exclusion_contract: "all canonical name/address/URL identities",
          causal_terminal_recovery: true,
          source_street_recovery: true,
          prompt_strategy: ledger.prompt_strategy,
          schema_verified: true,
          external_slot_ledger: relative(EXTERNAL_RESTAURANT_PATH),
          at: ledger.created_at,
        });
      }
      upsertAttempt(collection, ledger.attempt_key, {
        category: "restaurants",
        attempt: ledger.attempt,
        attempt_state: "running",
        run_id: ledger.run_id,
        dataset_id: ledger.dataset_id,
        started_at: ledger.started_at,
        submitted_at: ledger.submitted_at,
        pre_snapshot: ledger.pre_snapshot,
        required_models: ledger.required_models,
        effective_model_config: ledger.effective_model_config,
        external_slot: true,
        external_slot_ledger: relative(EXTERNAL_RESTAURANT_PATH),
        external_observed_dataset_status: ledger.dataset_status,
        external_observed_rows: ledger.rows_exported,
        external_export: ledger.export,
        fail_fast_zero_rows: true,
      });
      collection.category_state.restaurants = {
        ...(collection.category_state.restaurants ?? {}),
        status: "replacement_ready",
        dataset_id: ledger.dataset_id,
        diversified_from: ledger.old_dataset_id,
        zero_growth_streak: 0,
        terminal_failure_streak: 0,
        external_slot_ledger: relative(EXTERNAL_RESTAURANT_PATH),
      };
      collection.status = "external_restaurant_adopted_pending_finalization";
      jobs.batch2.status = "external_restaurant_adopted_pending_finalization";
    });
    console.log(`[restaurants] adopted external dataset=${ledger.dataset_id} run=${ledger.run_id}; rerun controller once to finalize`);
    return;
  }
  if (requested[0] === "--reconcile-dry-run" || requested[0] === "--reconcile-apply") {
    await reconcileCanonicalFiles({ apply: requested[0] === "--reconcile-apply" });
    return;
  }
  if (requested[0] === "--replace-restaurant-source-streets") {
    const category = categories.find((candidate) => candidate.slug === "restaurants");
    const canonical = uniqueRows(await readJson(path.join(OUTPUT_DIR, category.canonical)), category);
    const reason = "Causal recovery after replacement attempt 16 made repeated broad search/fetch calls, dispatched zero run_subagent calls, and inserted zero rows; route one source-and-street lead directly to each subagent";
    await diversifyCategory(category, canonical, reason, {
      causalTerminalRecovery: true,
      sourceStreetRecovery: true,
    });
    await checkpoint((collection, jobs) => {
      collection.status = "restaurant_source_street_replacement_ready";
      collection.blocker = undefined;
      jobs.batch2.status = "restaurant_source_street_replacement_ready";
    });
    return;
  }
  if (requested[0] === "--replace-after-terminal") {
    const slugs = requested.slice(1);
    if (!slugs.length) throw new Error("Usage: --replace-after-terminal <category> [...]");
    await replaceDatasetsAfterTerminalFailures(slugs);
    return;
  }
  if (requested[0] === "--finalize-existing") {
    const [, slug, attemptRaw, runId, preSnapshot] = requested;
    const category = categories.find((candidate) => candidate.slug === slug);
    const attemptNumber = Number.parseInt(attemptRaw, 10);
    if (!category || !Number.isInteger(attemptNumber) || !runId || !preSnapshot) {
      throw new Error("Usage: --finalize-existing <category> <attempt-number> <run-id> <pre-snapshot>");
    }
    await finalizeExisting(category, attemptNumber, runId, preSnapshot);
    return;
  }
  if (requested[0] === "--finalize-batch") {
    const fields = requested.slice(1);
    if (!fields.length || fields.length % 4 !== 0) {
      throw new Error("Usage: --finalize-batch <category> <attempt-number> <run-id> <pre-snapshot> [...]");
    }
    const finalizations = [];
    for (let index = 0; index < fields.length; index += 4) {
      const [slug, attemptRaw, runId, preSnapshot] = fields.slice(index, index + 4);
      const category = categories.find((candidate) => candidate.slug === slug);
      const attemptNumber = Number.parseInt(attemptRaw, 10);
      if (!category || !Number.isInteger(attemptNumber) || !runId || !preSnapshot) {
        throw new Error(`Invalid finalize batch entry at offset ${index}`);
      }
      finalizations.push(finalizeExisting(category, attemptNumber, runId, preSnapshot));
    }
    await Promise.all(finalizations);
    return;
  }
  const selected = requested.length ? categories.filter((category) => requested.includes(category.slug)) : categories;
  if (!selected.length) throw new Error(`Unknown category. Choose: ${categories.map((category) => category.slug).join(", ")}`);

  const results = [];
  try {
    const concurrentResults = await Promise.all(selected.map(async (category) => {
      try {
        return { ok: true, result: await runCategory(category) };
      } catch (error) {
        return {
          ok: false,
          category: category.slug,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }));
    const failures = concurrentResults.filter((entry) => !entry.ok);
    results.push(...concurrentResults.filter((entry) => entry.ok).map((entry) => entry.result));
    if (failures.length) {
      throw new Error(`Concurrent collection failures: ${JSON.stringify(failures)}`);
    }
    let finalStatus;
    await checkpoint((collection, jobs) => {
      finalStatus = aggregateCollectionStatus(collection);
      collection.status = finalStatus;
      collection.finished_at = finalStatus === "complete" ? new Date().toISOString() : undefined;
      jobs.batch2.status = finalStatus;
    });
    console.log(JSON.stringify({ status: finalStatus, results }));
    if (finalStatus.startsWith("blocked_")) process.exitCode = 2;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await checkpoint((collection, jobs) => {
      const aggregate = aggregateCollectionStatus(collection);
      collection.status = aggregate === "collecting" ? "blocked_external" : aggregate;
      collection.blocker = message;
      jobs.batch2.status = collection.status;
    });
    throw error;
  }
}

async function runLocalMaintenanceCommand(requested) {
  if (requested[0] === "--rebuild-external-projections") {
    const slugs = requested.slice(1);
    if (!slugs.length || slugs.some((slug) => !categories.some((category) => category.slug === slug))) {
      throw new Error("Usage: --rebuild-external-projections <cafes|restaurants|hotels> [...]");
    }
    await rebuildExternalProjections(slugs);
    return true;
  }
  if (requested[0] === "--adopt-external-batches") {
    const adoption = parseExternalAdoptionArguments(requested.slice(1));
    await adoptExternalBatches(adoption.categorySlugs, adoption);
    return true;
  }
  if (requested[0] === "--reconcile-dry-run" || requested[0] === "--reconcile-apply") {
    await reconcileCanonicalFiles({ apply: requested[0] === "--reconcile-apply" });
    return true;
  }
  return false;
}

async function main() {
  if (process.argv[2] === "--external-preresolved-restaurants") {
    const leadsFile = process.argv[3];
    if (!leadsFile) throw new Error("Usage: --external-preresolved-restaurants <leads-json>");
    return await runPreResolvedRestaurantAttempt(leadsFile);
  }
  if (process.argv[2] === "--external-deterministic-cafes") {
    return await runExternalDeterministicLoop("cafes");
  }
  if (process.argv[2] === "--external-deterministic-restaurants") {
    return await runExternalDeterministicLoop("restaurants");
  }
  if (process.argv[2] === "--external-deterministic-hotels") {
    return await runExternalDeterministicLoop("hotels");
  }
  if (process.argv[2] === "--external-cafe-loop") {
    return await runExternalCafeLoop();
  }
  if (process.argv[2] === "--external-hotel-loop") {
    return await runExternalHotelLoop();
  }
  if (process.argv[2] === "--external-restaurant-loop") {
    return await runExternalRestaurantLoop();
  }
  if (process.argv[2] === "--external-restaurant-slot") {
    return await runExternalRestaurantSlot();
  }
  await acquireControllerLock();
  const stop = (signal) => {
    releaseControllerLock()
      .finally(() => process.exit(signal === "SIGINT" ? 130 : 143));
  };
  const onSigint = () => stop("SIGINT");
  const onSigterm = () => stop("SIGTERM");
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);
  try {
    if (await runLocalMaintenanceCommand(process.argv.slice(2))) return;
    return await runController();
  } finally {
    process.removeListener("SIGINT", onSigint);
    process.removeListener("SIGTERM", onSigterm);
    await releaseControllerLock();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
