import { createHash } from "node:crypto";

import { pois } from "./data";
import { normalizeText } from "./text";
import type {
  Journey,
  JourneyAction,
  JourneyActionKind,
  JourneySessionState,
  JourneyStopCategory,
  JourneyStopCuisine,
  JourneyStopRequest,
  Poi,
  RankedPoi,
  Recommendation,
} from "./types";

const ACTIONS: Record<JourneyActionKind, {
  categories: string[];
  miniApp: string;
  cta: string;
  basePrice: number;
  reason: string;
}> = {
  fuel: { categories: ["Trạm xăng"], miniApp: "VETC Fuel", cta: "Đặt mức đổ xăng", basePrice: 420_000, reason: "Bổ sung nhiên liệu trên hành trình" },
  dining: { categories: ["Nhà hàng", "Quán cà phê"], miniApp: "TASCO Dining", cta: "Giữ chỗ ăn uống", basePrice: 260_000, reason: "Điểm dừng ăn uống phù hợp yêu cầu" },
  parking: { categories: ["Trung tâm thương mại", "Rạp chiếu phim"], miniApp: "VETC Parking", cta: "Giữ chỗ đỗ xe", basePrice: 45_000, reason: "Địa điểm có chỗ đỗ xe phù hợp hành trình" },
};

const ORDERED_STOPS: Record<JourneyStopCategory, {
  categories: string[];
  phrases: RegExp;
}> = {
  cafe: {
    categories: ["Quán cà phê"],
    phrases: /(^|\s)(?:ca phe|cafe|coffee|coffeeshop)(\s|$)/,
  },
  restaurant: {
    categories: ["Nhà hàng"],
    phrases: /(^|\s)(?:pho|nha hang|quan an|restaurant|an toi|an trua|an khuya)(\s|$)/,
  },
};

const ORDER_MARKER = /\b(?:then|roi|sau do|tiep theo)\b/;

const CUISINE_PHRASES: Record<JourneyStopCuisine, RegExp> = {
  pho: /(^|\s)pho(\s|$)/,
  vietnamese: /(^|\s)(?:vietnamese|mon viet|am thuc viet)(\s|$)/,
  italian: /(^|\s)(?:italian|mon y|do y)(\s|$)/,
  japanese: /(^|\s)(?:japanese|mon nhat)(\s|$)/,
  korean: /(^|\s)(?:korean|mon han)(\s|$)/,
};

const CUISINE_LABELS: Record<JourneyStopCuisine, string> = {
  pho: "phở",
  vietnamese: "món Việt",
  italian: "món Ý",
  japanese: "món Nhật",
  korean: "món Hàn",
};

export interface ParsedJourneyStop extends JourneyStopRequest {
  query: string;
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 10);
}

function requestedKinds(query: string): JourneyActionKind[] {
  const value = normalizeText(query);
  const kinds: JourneyActionKind[] = [];
  if (/(do xang|cay xang|tram xang|nhien lieu)/.test(value)) kinds.push("fuel");
  if (/(^|\s)(an|an toi|an trua|an khuya|nha hang|ca phe|cafe)(\s|$)/.test(value)) kinds.push("dining");
  if (/(do xe|bai do|giu xe|parking)/.test(value)) kinds.push("parking");
  return kinds;
}

function categoryForSegment(segment: string): JourneyStopCategory | undefined {
  const normalized = normalizeText(segment);
  return (Object.entries(ORDERED_STOPS) as Array<[
    JourneyStopCategory,
    (typeof ORDERED_STOPS)[JourneyStopCategory],
  ]>).find(([, config]) => config.phrases.test(normalized))?.[0];
}

function cuisineForSegment(segment: string): JourneyStopCuisine | undefined {
  const normalized = normalizeText(segment);
  return (Object.entries(CUISINE_PHRASES) as Array<[
    JourneyStopCuisine,
    RegExp,
  ]>).find(([, phrases]) => phrases.test(normalized))?.[0];
}

function orderedStopsOnLine(value: string): ParsedJourneyStop[] {
  const normalized = normalizeText(value);
  const segments = normalized.split(ORDER_MARKER);
  if (segments.length < 2) return [];
  const stops: ParsedJourneyStop[] = [];
  for (const segment of segments.slice(0, 3)) {
    const category = categoryForSegment(segment);
    if (!category) return [];
    const cuisine = cuisineForSegment(segment);
    stops.push({
      category,
      ...(cuisine ? { cuisine } : {}),
      query: segment.trim(),
    });
  }
  return stops;
}

/** Pure rules parser used by evals and as the deterministic layer below NLU. */
export function requestedJourneyStops(query: string): ParsedJourneyStop[] {
  const lines = query.split(/\r?\n/);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const stops = orderedStopsOnLine(lines[index]);
    if (stops.length >= 2) return stops;
  }
  return orderedStopsOnLine(query);
}

export function requestedJourneyStopCategories(query: string): JourneyStopCategory[] {
  return requestedJourneyStops(query).map(({ category }) => category);
}

export function journeyStopLabel(stop: JourneyStopRequest): string {
  const category = ORDERED_STOPS[stop.category].categories[0].toLowerCase();
  return stop.cuisine
    ? `${category} ${CUISINE_LABELS[stop.cuisine]}`
    : category;
}

export function journeyStopsFromState(state: JourneySessionState): ParsedJourneyStop[] {
  const parsed = requestedJourneyStops(state.query);
  if (!state.requestedCategories?.length) return parsed;
  return state.requestedCategories.map((category, index) => {
    const parsedStop = parsed[index]?.category === category ? parsed[index] : undefined;
    const cuisine = state.requestedCuisines?.[index] ?? parsedStop?.cuisine;
    const stop: JourneyStopRequest = {
      category,
      ...(cuisine ? { cuisine } : {}),
    };
    return {
      ...stop,
      query: parsedStop?.query ?? journeyStopLabel(stop),
    };
  });
}

export function poiCategoriesForJourneyStop(category: JourneyStopCategory): string[] {
  return ORDERED_STOPS[category].categories;
}

export function poiMatchesJourneyStop(poi: Poi, stop: JourneyStopRequest): boolean {
  if (!ORDERED_STOPS[stop.category].categories.includes(poi.category)) return false;
  if (!stop.cuisine) return true;
  const text = normalizeText(
    [
      poi.name,
      ...poi.tags,
      ...poi.attributes,
      poi.description,
    ].join(" "),
  );
  return CUISINE_PHRASES[stop.cuisine].test(text);
}

export function isCheaperJourneyRequest(query: string) {
  return /(re hon|tiet kiem hon|giam gia)/.test(normalizeText(query));
}

export function isJourneyIntent(query: string) {
  const value = normalizeText(query);
  if (requestedJourneyStopCategories(query).length >= 2) return true;
  return requestedKinds(query).length >= 2 && /(lai xe|hanh trinh|lo trinh|tren duong|can |muon )/.test(value);
}

function supports(
  kind: JourneyActionKind,
  ranked: RankedPoi,
  requestedStop?: JourneyStopRequest,
) {
  if (requestedStop && !poiMatchesJourneyStop(ranked.poi, requestedStop)) {
    return false;
  }
  const config = ACTIONS[kind];
  if (!config.categories.includes(ranked.poi.category)) return false;
  return kind !== "parking" || ranked.poi.attributes.some((value) => normalizeText(value).includes("bai do xe"));
}

function price(kind: JourneyActionKind, ranked: RankedPoi) {
  const config = ACTIONS[kind];
  const popularityPremium = Math.floor(ranked.poi.popularityScore / 10) * 5_000;
  const originalPriceVnd = config.basePrice + popularityPremium;
  const discountVnd = Math.floor((10 + Number.parseInt(hash(ranked.poi.id + kind).slice(0, 2), 16) % 6) * originalPriceVnd / 100 / 1_000) * 1_000;
  return { originalPriceVnd, discountVnd, finalPriceVnd: originalPriceVnd - discountVnd };
}

function action(
  kind: JourneyActionKind,
  ranked: RankedPoi,
  rewardPoints: number,
  requestedStop?: JourneyStopRequest,
): JourneyAction {
  const config = ACTIONS[kind];
  const pricing = price(kind, ranked);
  return {
    id: `act_${hash(`${kind}:${ranked.poi.id}`)}`,
    poiId: ranked.poi.id,
    kind,
    ...(requestedStop
      ? {
          requestedCategory: requestedStop.category,
          ...(requestedStop.cuisine
            ? { requestedCuisine: requestedStop.cuisine }
            : {}),
        }
      : {}),
    miniApp: config.miniApp,
    cta: config.cta,
    reason: config.reason,
    ...pricing,
    rewardPoints,
    ...(ranked.poi.id === "POI024" ? { sponsored: { label: "Ưu đãi VETC", disclosure: "Gắn sau xếp hạng hữu cơ; không ảnh hưởng thứ tự POI." } } : {}),
    status: "ready",
    simulated: true,
  };
}

function buildJourney(actions: JourneyAction[], state?: JourneySessionState, outcome: Journey["revision"]["outcome"] = "composed", changedActionIds: string[] = []): Journey {
  const originalTotalVnd = actions.reduce((sum, item) => sum + item.originalPriceVnd, 0);
  const discountTotalVnd = actions.reduce((sum, item) => sum + item.discountVnd, 0);
  const totalVnd = actions.reduce((sum, item) => sum + item.finalPriceVnd, 0);
  const revision = (state?.revision ?? -1) + 1;
  return {
    id: `jny_${hash(actions.map((item) => item.id).join(":"))}`,
    title: "Hành trình TASCO một chạm",
    actions,
    originalTotalVnd,
    discountTotalVnd,
    totalVnd,
    savingsVnd: discountTotalVnd,
    rewardPoints: actions.reduce((sum, item) => sum + item.rewardPoints, 0),
    walletLabel: "Ví VETC",
    simulated: true,
    revision: {
      number: revision,
      outcome,
      changedActionIds,
      message: outcome === "cheaper" ? `Đã giảm tổng chi phí ${Math.max(0, (state?.totalVnd ?? totalVnd) - totalVnd).toLocaleString("vi-VN")} ₫ mà vẫn giữ loại dịch vụ và khu vực.` : outcome === "no_cheaper_option" ? "Không có lựa chọn rẻ hơn đủ điều kiện trong danh sách hiện có; hành trình hiện tại được giữ nguyên." : "Đã ghép các dịch vụ từ những địa điểm phù hợp nhất.",
    },
  };
}

export function composeJourney(
  query: string,
  ranked: RankedPoi[],
  recommendations: Recommendation[],
  carriedStops?: JourneyStopRequest[],
): Journey | undefined {
  const requestedStops = requestedJourneyStops(query);
  const orderedStops = requestedStops.length >= 2
    ? requestedStops
    : carriedStops ?? [];
  if (orderedStops.length >= 2) {
    const selectedPoiIds = new Set<string>();
    const actions = orderedStops.flatMap((requestedStop) => {
      const candidate = ranked.find(
        (item) =>
          !selectedPoiIds.has(item.poi.id) &&
          supports("dining", item, requestedStop),
      );
      if (!candidate) return [];
      selectedPoiIds.add(candidate.poi.id);
      const reward = recommendations.find((item) => item.poi.id === candidate.poi.id)?.rewardPoints
        ?? Math.round(20 + candidate.score * 30);
      return [action("dining", candidate, reward, requestedStop)];
    });
    // Never silently drop a requested leg from a sequential journey.
    return actions.length === orderedStops.length
      ? buildJourney(actions)
      : undefined;
  }
  if (!isJourneyIntent(query)) return undefined;
  const actions = requestedKinds(query).slice(0, 3).flatMap((kind) => {
    const candidate = ranked.find((item) => supports(kind, item));
    if (!candidate) return [];
    const reward = recommendations.find((item) => item.poi.id === candidate.poi.id)?.rewardPoints ?? Math.round(20 + candidate.score * 30);
    return [action(kind, candidate, reward)];
  });
  return actions.length >= 2 ? buildJourney(actions) : undefined;
}

export function reviseJourneyCheaper(state: JourneySessionState, ranked: RankedPoi[]): Journey | undefined {
  const requestedStops = journeyStopsFromState(state);
  const previousActions = state.actionKinds.flatMap((kind, index) => {
    const poiId = state.selectedPoiIds[index];
    const candidate = ranked.find((item) => item.poi.id === poiId);
    const requestedStop = requestedStops[index];
    return candidate
      ? [action(
          kind,
          candidate,
          Math.round(20 + candidate.score * 30),
          requestedStop,
        )]
      : [];
  });
  if (previousActions.length !== state.actionKinds.length) return undefined;

  let next = [...previousActions];
  for (let index = 0; index < next.length; index += 1) {
    const current = ranked.find((item) => item.poi.id === next[index].poiId)!;
    const requestedStop = requestedStops[index];
    const replacement = ranked
      .filter((item) => supports(next[index].kind, item, requestedStop) && item.poi.id !== current.poi.id)
      .filter((item) => item.poi.city === current.poi.city && item.score >= current.score - 0.15)
      .map((item) => action(
        next[index].kind,
        item,
        Math.round(20 + item.score * 30),
        requestedStop,
      ))
      .filter((item) => item.finalPriceVnd < next[index].finalPriceVnd)
      .sort((a, b) => a.finalPriceVnd - b.finalPriceVnd || a.poiId.localeCompare(b.poiId))[0];
    if (replacement) {
      const proposal = next.map((item, itemIndex) => itemIndex === index ? replacement : item);
      const proposalTotal = proposal.reduce((sum, item) => sum + item.finalPriceVnd, 0);
      if (proposalTotal < state.totalVnd) {
        next = proposal;
        return buildJourney(next, state, "cheaper", [next[index].id]);
      }
    }
  }
  return buildJourney(previousActions, { ...state, totalVnd: previousActions.reduce((sum, item) => sum + item.finalPriceVnd, 0) }, "no_cheaper_option");
}

export function journeyState(query: string, journey: Journey): JourneySessionState {
  const firstPoi = pois.find((poi) => poi.id === journey.actions[0]?.poiId);
  const requestedCategories = journey.actions.flatMap((item) =>
    item.requestedCategory ? [item.requestedCategory] : [],
  );
  const requestedCuisines = journey.actions.map(
    (item) => item.requestedCuisine ?? null,
  );
  return {
    query,
    location: firstPoi?.city ?? "",
    selectedPoiIds: journey.actions.map((item) => item.poiId),
    actionKinds: journey.actions.map((item) => item.kind),
    ...(requestedCategories.length === journey.actions.length
      ? {
          requestedCategories,
          ...(requestedCuisines.some(Boolean) ? { requestedCuisines } : {}),
        }
      : {}),
    totalVnd: journey.totalVnd,
    revision: journey.revision.number,
  };
}
