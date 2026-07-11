import { getPoiById, getUserProfile, pois } from "./data";
import { buildRoutes } from "./routing";
import {
  composeJourney,
  isCheaperJourneyRequest,
  journeyState,
  reviseJourneyCheaper,
} from "./journey";
import {
  inferCategories,
  rankPois,
  toPlaceResult,
} from "./search";
import { expandAliases, meaningfulTokens, normalizeText } from "./text";
import type {
  ChatRequest,
  ChatResponse,
  Coordinates,
  Poi,
  RankedPoi,
  Recommendation,
  SessionContext,
} from "./types";

interface Ambiguity {
  entity: string;
  candidateIds: string[];
  question: string;
}

const LOCATION_CENTERS: Array<{
  phrases: string[];
  coordinates: Coordinates;
}> = [
  {
    phrases: ["quan 1", "tp hcm", "sai gon", "ho chi minh"],
    coordinates: { lat: 10.7757, lon: 106.7019 },
  },
  {
    phrases: ["hoan kiem", "ho guom"],
    coordinates: { lat: 21.0285, lon: 105.8542 },
  },
  {
    phrases: ["ba dinh", "ha noi"],
    coordinates: { lat: 21.0333, lon: 105.8142 },
  },
  {
    phrases: ["son tra", "da nang"],
    coordinates: { lat: 16.0718, lon: 108.2304 },
  },
  {
    phrases: ["da lat"],
    coordinates: { lat: 11.9404, lon: 108.4583 },
  },
];

const POI_ALIASES: Array<{ phrases: string[]; poiId: string }> = [
  { phrases: ["ho guom", "ho hoan kiem"], poiId: "POI030" },
  { phrases: ["pho thin", "pho thin lo duc"], poiId: "POI018" },
  { phrases: ["cho ben thanh"], poiId: "POI003" },
  { phrases: ["vincom dong khoi"], poiId: "POI007" },
  { phrases: ["galaxy nguyen du"], poiId: "POI008" },
  { phrases: ["galaxy hotel"], poiId: "POI009" },
  { phrases: ["tan son nhat"], poiId: "POI026" },
  { phrases: ["noi bai"], poiId: "POI027" },
  { phrases: ["lotte hotel"], poiId: "POI012" },
  { phrases: ["secret garden"], poiId: "POI021" },
];

function conversationText(request: ChatRequest): string {
  const history = Array.isArray(request.history)
    ? request.history.map(({ role, content }) => `${role}: ${content}`).join("\n")
    : request.history ?? "";
  const previous = request.sessionContext?.lastQuery ?? "";
  return [history, previous, request.message].filter(Boolean).join("\n");
}

function ambiguityFor(message: string): Ambiguity | undefined {
  const normalized = expandAliases(message);
  if (
    normalized.includes("galaxy") &&
    !["galaxy nguyen du", "galaxy hotel", "rap phim", "cinema", "khach san"].some(
      (phrase) => normalized.includes(phrase),
    )
  ) {
    return {
      entity: "Galaxy",
      candidateIds: ["POI008", "POI009"],
      question:
        "Bạn muốn đến Galaxy Nguyễn Du (rạp chiếu phim) hay Galaxy Hotel Đà Nẵng?",
    };
  }
  if (
    normalized.includes("vincom") &&
    !["dong khoi", "ba trieu", "cgv"].some((phrase) =>
      normalized.includes(phrase),
    )
  ) {
    return {
      entity: "Vincom",
      candidateIds: ["POI007", "POI016"],
      question:
        "Bạn đang nói tới Vincom Center Đồng Khởi ở TP.HCM hay CGV Vincom Bà Triệu ở Hà Nội?",
    };
  }
  if (
    normalized.includes("san bay") &&
    !["tan son nhat", "noi bai"].some((phrase) =>
      normalized.includes(phrase),
    )
  ) {
    return {
      entity: "sân bay",
      candidateIds: ["POI026", "POI027"],
      question:
        "Bạn muốn đến Sân bay Tân Sơn Nhất ở TP.HCM hay Sân bay Nội Bài ở Hà Nội?",
    };
  }
  if (normalized.includes("big c") || normalized === "big c") {
    return {
      entity: "Big C/GO!",
      candidateIds: [],
      question:
        "Có nhiều chi nhánh Big C/GO!. Bạn muốn tìm ở thành phố hoặc quận nào?",
    };
  }
  return undefined;
}

function resolvedPendingPoi(request: ChatRequest): Poi | undefined {
  const pending = request.sessionContext?.pendingClarification;
  if (!pending) return undefined;
  const normalized = expandAliases(request.message);
  const candidates = pending.candidateIds
    .map(getPoiById)
    .filter((poi): poi is Poi => Boolean(poi));

  return candidates.find((poi) => {
    const candidateText = expandAliases(
      `${poi.name} ${poi.category} ${poi.city} ${poi.district}`,
    );
    const responseTokens = meaningfulTokens(normalized);
    return (
      normalized.includes(normalizeText(poi.name)) ||
      responseTokens.some(
        (token) => token.length > 3 && candidateText.includes(token),
      )
    );
  });
}

function detectIntent(query: string): string {
  const normalized = expandAliases(query);
  if (/(vi sao|giai thich|tom tat)/.test(normalized)) return "explanation";
  if (
    /(chi duong|dua toi|dan toi|lam the nao de den|tu .+ den |den .+ tu |mat bao lau)/.test(
      normalized,
    )
  ) {
    return "navigation";
  }
  if (/(len lich|lich trinh|1 ngay|2 ngay|cuoi tuan|ke hoach)/.test(normalized)) {
    return "planning";
  }
  if (/(goi y|nen di|phu hop|de xuat)/.test(normalized)) return "recommendation";
  return "search";
}

function resolvePoiReference(value: string): Poi | undefined {
  const normalized = expandAliases(value);
  const alias = POI_ALIASES.find(({ phrases }) =>
    phrases.some((phrase) => normalized.includes(phrase)),
  );
  if (alias) return getPoiById(alias.poiId);

  const exact = pois.find((poi) => {
    const name = normalizeText(poi.name);
    return normalized.includes(name) || name.includes(normalized);
  });
  if (exact) return exact;

  const ranked = rankPois(value, { limit: 1 })[0];
  return ranked?.score >= 0.32 ? ranked.poi : undefined;
}

function routeReferences(query: string): {
  origin?: Poi;
  destination?: Poi;
} {
  const normalized = expandAliases(query);
  const fromThenTo = normalized.match(/(?:tu) (.+?) (?:den|toi) (.+)$/);
  if (fromThenTo) {
    return {
      origin: resolvePoiReference(fromThenTo[1]),
      destination: resolvePoiReference(fromThenTo[2]),
    };
  }
  const toThenFrom = normalized.match(/(?:den|toi) (.+?) tu (.+)$/);
  if (toThenFrom) {
    return {
      origin: resolvePoiReference(toThenFrom[2]),
      destination: resolvePoiReference(toThenFrom[1]),
    };
  }

  const matches = POI_ALIASES.filter(({ phrases }) =>
    phrases.some((phrase) => normalized.includes(phrase)),
  )
    .map(({ poiId }) => getPoiById(poiId))
    .filter((poi): poi is Poi => Boolean(poi));
  return {
    ...(matches.length > 1 ? { origin: matches[0] } : {}),
    ...(matches.length > 0 ? { destination: matches.at(-1) } : {}),
  };
}

function locationCenter(value?: string): Coordinates | undefined {
  if (!value) return undefined;
  const normalized = expandAliases(value);
  return LOCATION_CENTERS.find(({ phrases }) =>
    phrases.some((phrase) => normalized.includes(phrase)),
  )?.coordinates;
}

function describeRecommendation(ranked: RankedPoi): string {
  const attributes = ranked.poi.attributes.slice(0, 3).join(", ");
  const matched = ranked.matchedTerms.slice(0, 3).join(", ");
  const why = matched
    ? `khớp các tiêu chí ${matched}`
    : `có ${attributes}`;
  return `${ranked.poi.name} ${why}; được đánh giá ${ranked.poi.rating.toFixed(1)}/5.`;
}

function toRecommendation(ranked: RankedPoi): Recommendation {
  return {
    poi: ranked.poi,
    score: ranked.score,
    reason: describeRecommendation(ranked),
    scoreBreakdown: ranked.scoreBreakdown,
    rewardPoints: Math.round(20 + ranked.score * 30),
  };
}

function diversified(ranked: RankedPoi[], limit: number): RankedPoi[] {
  const selected: RankedPoi[] = [];
  const categories = new Set<string>();
  for (const candidate of ranked) {
    if (!categories.has(candidate.poi.category)) {
      selected.push(candidate);
      categories.add(candidate.poi.category);
    }
    if (selected.length === limit) return selected;
  }
  for (const candidate of ranked) {
    if (!selected.some(({ poi }) => poi.id === candidate.poi.id)) {
      selected.push(candidate);
    }
    if (selected.length === limit) break;
  }
  return selected;
}

function constraintsFor(query: string): string[] {
  const normalized = expandAliases(query);
  const known = [
    "wifi",
    "yen tinh",
    "lam viec",
    "gia hop ly",
    "gia re",
    "gia dinh",
    "tre em",
    "view dep",
    "gan bien",
    "mo khuya",
    "toilet",
    "ho boi",
    "bai do xe",
  ];
  return known.filter((constraint) => normalized.includes(constraint));
}

function sessionContext(
  request: ChatRequest,
  intent: string,
  pendingClarification?: Ambiguity,
  journey?: SessionContext["journey"],
): SessionContext {
  const previousConstraints = request.sessionContext?.constraints ?? [];
  return {
    sessionId:
      request.sessionId ??
      request.sessionContext?.sessionId ??
      "tasco-local-session",
    ...(request.profileId || request.sessionContext?.profileId
      ? { profileId: request.profileId ?? request.sessionContext?.profileId }
      : {}),
    lastIntent: intent,
    lastQuery: request.message,
    constraints: [
      ...new Set([...previousConstraints, ...constraintsFor(request.message)]),
    ],
    ...(pendingClarification
      ? {
          pendingClarification: {
            entity: pendingClarification.entity,
            candidateIds: pendingClarification.candidateIds,
          },
        }
      : {}),
    ...(journey ? { journey } : {}),
  };
}

const privacy = { mode: "session-only", persisted: false } as const;

export function handleChat(request: ChatRequest): ChatResponse {
  const profileId = request.profileId ?? request.sessionContext?.profileId;
  const profile = getUserProfile(profileId);
  const resolved = resolvedPendingPoi(request);
  const ambiguity = resolved ? undefined : ambiguityFor(request.message);

  if (ambiguity) {
    const rankedCandidates = ambiguity.candidateIds
      .map(getPoiById)
      .filter((poi): poi is Poi => Boolean(poi))
      .map((poi): Recommendation => ({
        poi,
        score: 0.5,
        reason: `Một cách hiểu có thể có của “${ambiguity.entity}”.`,
        scoreBreakdown: { ambiguityCandidate: 0.5 },
        rewardPoints: 20,
      }));
    return {
      intent: "clarification_required",
      assistantResponse: ambiguity.question,
      recommendations: rankedCandidates,
      confidence: 0.99,
      mapAction: {
        type: "clarify",
        query: ambiguity.entity,
        poiIds: ambiguity.candidateIds,
        candidates: rankedCandidates.map(({ poi }) => toPlaceResult(poi)),
      },
      sessionContext: sessionContext(
        request,
        "clarification_required",
        ambiguity,
      ),
      privacy,
    };
  }

  const combined = conversationText(request);
  const intent =
    resolved && request.sessionContext?.lastIntent === "navigation"
      ? "navigation"
      : detectIntent(combined);
  const origin = request.location ?? locationCenter(profile?.currentLocation);
  const explicitLocation = profile?.currentLocation;

  if (isCheaperJourneyRequest(request.message) && request.sessionContext?.journey) {
    const prior = request.sessionContext.journey;
    const revisionRanked = rankPois(prior.query, {
      profile,
      origin: request.location,
      locationText: prior.location || explicitLocation,
      limit: 80,
    });
    const journey = reviseJourneyCheaper(prior, revisionRanked);
    if (journey) {
      const actionIds = new Set(journey.actions.map((item) => item.poiId));
      const recommendations = revisionRanked
        .filter((item) => actionIds.has(item.poi.id))
        .map(toRecommendation);
      return {
        intent: "journey_revision",
        assistantResponse: journey.revision.message,
        recommendations,
        confidence: 0.96,
        mapAction: {
          type: "plan",
          query: prior.query,
          poiIds: recommendations.map(({ poi }) => poi.id),
          ...(recommendations[0] ? { center: recommendations[0].poi.coordinates, zoom: 13 } : {}),
        },
        sessionContext: sessionContext(request, "journey_revision", undefined, journeyState(prior.query, journey)),
        journey,
        privacy,
      };
    }
  }

  if (intent === "navigation") {
    const references = routeReferences(combined);
    const destination = resolved ?? references.destination;
    const routeOrigin = references.origin?.coordinates ?? origin;
    if (destination && routeOrigin) {
      const route = buildRoutes({
        locations: [routeOrigin, destination.coordinates],
        mode: "driving",
      }).routes[0];
      const ranked = rankPois(destination.name, { profile, limit: 1 })[0];
      return {
        intent,
        assistantResponse: `Đã tạo tuyến mô phỏng đến ${destination.name}: khoảng ${(
          route.summary.distanceMeters / 1_000
        ).toFixed(1)} km, ${Math.max(
          1,
          Math.round(route.summary.durationSeconds / 60),
        )} phút. Hãy kiểm tra giao thông thực tế trước khi đi.`,
        recommendations: ranked ? [toRecommendation(ranked)] : [],
        confidence: references.origin || request.location ? 0.95 : 0.82,
        mapAction: {
          type: "route",
          selectedPoiId: destination.id,
          poiIds: [destination.id],
          route,
        },
        sessionContext: sessionContext(request, intent),
        privacy,
      };
    }
    if (destination) {
      return {
        intent,
        assistantResponse: `Tôi đã xác định ${destination.name}. Hãy cho phép dùng vị trí hiện tại hoặc cho biết điểm xuất phát để tạo tuyến.`,
        recommendations: [
          {
            poi: destination,
            score: 0.9,
            reason: "Khớp điểm đến được yêu cầu.",
            scoreBreakdown: { destinationMatch: 0.9 },
            rewardPoints: 30,
          },
        ],
        confidence: 0.8,
        mapAction: {
          type: "show",
          selectedPoiId: destination.id,
          poiIds: [destination.id],
          center: destination.coordinates,
          zoom: 15,
        },
        sessionContext: sessionContext(request, intent),
        privacy,
      };
    }
  }

  if (intent === "explanation") {
    const poi = resolvePoiReference(combined);
    if (poi) {
      const ranked = rankPois(combined, { profile, limit: 1 }).find(
        (candidate) => candidate.poi.id === poi.id,
      );
      const fallback: RankedPoi = {
        poi,
        score: 0.9,
        scoreBreakdown: { exactPoiMatch: 0.9 },
        matchedTerms: [],
      };
      const recommendation = toRecommendation(ranked ?? fallback);
      return {
        intent,
        assistantResponse: `${poi.name} phù hợp vì ${poi.description} Các điểm nổi bật: ${poi.attributes
          .slice(0, 4)
          .join(", ")}.`,
        recommendations: [recommendation],
        confidence: 0.96,
        mapAction: {
          type: "show",
          selectedPoiId: poi.id,
          poiIds: [poi.id],
          center: poi.coordinates,
          zoom: 15,
        },
        sessionContext: sessionContext(request, intent),
        privacy,
      };
    }
  }

  const ranked = rankPois(combined, {
    profile,
    origin: request.location,
    locationText: explicitLocation,
    category: inferCategories(combined),
    limit: 80,
  });
  let selected =
    intent === "planning" ? diversified(ranked, 4) : ranked.slice(0, 3);
  let recommendations = selected.map(toRecommendation);
  const journey = composeJourney(request.message, ranked, recommendations);
  if (journey) {
    const actionIds = new Set(journey.actions.map((item) => item.poiId));
    selected = ranked.filter((item) => actionIds.has(item.poi.id));
    recommendations = selected.map(toRecommendation);
  }
  const topScore = recommendations[0]?.score ?? 0;
  const confidence = Number(
    Math.min(0.97, Math.max(0.4, 0.55 + topScore * 0.4)).toFixed(2),
  );
  const names = recommendations.map(({ poi }) => poi.name).join(", ");
  const assistantResponse = recommendations.length
    ? intent === "planning"
      ? `Gợi ý lịch trình gọn: ${names}. Tôi đã đa dạng loại địa điểm và xếp hạng theo tiêu chí của bạn.`
      : journey
        ? `Tôi đã ghép một hành trình mô phỏng gồm ${journey.actions.length} dịch vụ từ các POI phù hợp: ${names}. Hãy xem từng khoản trước khi xác nhận.`
      : `Tôi tìm được ${recommendations.length} lựa chọn phù hợp nhất: ${names}. Mỗi gợi ý kèm lý do và điểm thành phần để bạn kiểm tra.`
    : "Tôi chưa tìm thấy địa điểm phù hợp trong bộ dữ liệu mẫu. Hãy thử nêu rõ thành phố hoặc loại địa điểm.";

  return {
    intent,
    assistantResponse,
    recommendations,
    confidence,
    mapAction: {
      type: intent === "planning" ? "plan" : "search",
      query: request.message,
      poiIds: recommendations.map(({ poi }) => poi.id),
      ...(recommendations[0]
        ? { center: recommendations[0].poi.coordinates, zoom: 13 }
        : {}),
    },
    sessionContext: sessionContext(request, intent, undefined, journey ? journeyState(request.message, journey) : undefined),
    ...(journey ? { journey } : {}),
    privacy,
  };
}
