import { getPoiById, getUserProfile, pois } from "./data";
import { buildRoutes } from "./routing";
import {
  composeJourney,
  isCheaperJourneyRequest,
  isJourneyIntent,
  journeyStopLabel,
  journeyState,
  journeyStopsFromState,
  poiCategoriesForJourneyStop,
  poiMatchesJourneyStop,
  requestedJourneyStops,
  reviseJourneyCheaper,
} from "./journey";
import {
  hasIntentQualifier,
  inferCategoryConstraint,
  isAvoidedByProfile,
  locationLabelFor,
  queryLocationSignal,
  rankPois,
  toPlaceResult,
} from "./search";
import { expandAliases, meaningfulTokens, normalizeText } from "./text";
import type {
  ChatRequest,
  ChatResponse,
  Coordinates,
  JourneyStopRequest,
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

const RECENT_USER_TURN_WINDOW = 4; // current turn + the three prior user turns
const PRIOR_USER_TURN_WINDOW = RECENT_USER_TURN_WINDOW - 1;

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
  { phrases: ["cho ben thanh", "ben thanh market"], poiId: "POI003" },
  { phrases: ["vincom dong khoi"], poiId: "POI007" },
  { phrases: ["galaxy nguyen du"], poiId: "POI008" },
  { phrases: ["galaxy hotel"], poiId: "POI009" },
  { phrases: ["tan son nhat", "tsn"], poiId: "POI026" },
  { phrases: ["noi bai"], poiId: "POI027" },
  { phrases: ["lotte hotel"], poiId: "POI012" },
  { phrases: ["secret garden"], poiId: "POI021" },
];

// "gần <named POI>" turns the named place into a proximity anchor: it supplies the
// search center and radius but is never itself a recommendable result, and its
// name must not leak into category inference (e.g. an airport near-food request).
const NEAR_ANCHOR_RADIUS_METERS = 5_000;

interface LocationAnchor {
  poi: Poi;
  phrases: string[];
}

function locationAnchorFor(text: string): LocationAnchor | undefined {
  const normalized = expandAliases(text);
  for (const { phrases, poiId } of POI_ALIASES) {
    for (const phrase of phrases) {
      const index = normalized.indexOf(phrase);
      if (index < 0) continue;
      const before = normalized.slice(Math.max(0, index - 24), index);
      if (/(^|\s)gan(\s|$)/.test(`${before} `)) {
        const poi = getPoiById(poiId);
        if (poi) return { poi, phrases };
      }
    }
  }
  return undefined;
}

function withoutAnchorPhrases(text: string, anchor: LocationAnchor): string {
  const phrases = [...anchor.phrases, normalizeText(anchor.poi.name)].sort(
    (left, right) => right.length - left.length,
  );
  let result = expandAliases(text);
  for (const phrase of phrases) {
    result = result.split(phrase).join(" ");
  }
  return result.replace(/\s+/g, " ").trim();
}

function historyUserTurns(request: ChatRequest): string[] {
  if (Array.isArray(request.history)) {
    return request.history
      .filter(({ role }) => role === "user")
      .map(({ content }) => content)
      .filter(Boolean);
  }
  if (!request.history) return [];
  return request.history
    .split(/\r?\n/)
    .flatMap((line) => {
      const match = line.match(/^\s*(?:user|người dùng|nguoi dung)\s*:\s*(.+)$/i);
      return match?.[1] ? [match[1]] : [];
    });
}

export function priorUserTurns(request: ChatRequest): string[] {
  const recent = request.sessionContext?.recentQueries ?? [];
  const previous = request.sessionContext?.lastQuery;
  const turns = [
    ...historyUserTurns(request),
    ...recent,
    ...(previous && !recent.includes(previous) ? [previous] : []),
  ].filter((turn): turn is string => Boolean(turn));
  return turns.slice(-PRIOR_USER_TURN_WINDOW);
}

function conversationText(request: ChatRequest): string {
  // Deterministic interpretation sees only the current turn and three prior
  // USER turns. Assistant prose and older client history never enter ranking.
  return [...priorUserTurns(request), request.message, request.nluHint]
    .filter(Boolean)
    .join("\n");
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
  // Alias IDs are workbook-bound; under another pack fall through to name matching.
  const aliasPoi = alias ? getPoiById(alias.poiId) : undefined;
  if (aliasPoi) return aliasPoi;

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
  // Plain normalization only: expandAliases APPENDS expansions to the end of the
  // string, which would leak into the destination capture group below.
  const normalized = normalizeText(query);
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
  if (matches.length > 0) {
    return {
      ...(matches.length > 1 ? { origin: matches[0] } : {}),
      destination: matches.at(-1),
    };
  }

  // No alias hit: take the text after the navigation verb as the destination, so
  // "chỉ đường tới Bệnh viện Bạch Mai" resolves any dataset POI by name.
  const spoken = normalized.match(
    /(?:chi duong|dua toi|dan toi|lam the nao de den|den|toi)\s+(?:den |toi )?(.+)$/,
  );
  if (spoken) {
    return { destination: resolvePoiReference(spoken[1]) };
  }
  return {};
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

const KNOWN_CONSTRAINTS: Array<{ match: string; label: string }> = [
  { match: "wifi", label: "wifi" },
  { match: "yen tinh", label: "yên tĩnh" },
  { match: "khong qua on", label: "yên tĩnh" },
  { match: "khong on ao", label: "yên tĩnh" },
  { match: "lam viec", label: "làm việc" },
  { match: "hoc nhom", label: "học nhóm" },
  { match: "gia hop ly", label: "giá hợp lý" },
  { match: "gia re", label: "giá rẻ" },
  { match: "gia dinh", label: "gia đình" },
  { match: "tre em", label: "trẻ em" },
  { match: "view dep", label: "view đẹp" },
  { match: "gan bien", label: "gần biển" },
  { match: "mo khuya", label: "mở cửa khuya" },
  { match: "mo cua khuya", label: "mở cửa khuya" },
  { match: "an khuya", label: "mở cửa khuya" },
  { match: "toilet", label: "toilet" },
  { match: "ho boi", label: "hồ bơi" },
  { match: "bai do xe", label: "bãi đỗ xe" },
  { match: "de do xe", label: "dễ đỗ xe" },
  { match: "mon viet", label: "món Việt" },
  { match: "am thuc viet", label: "món Việt" },
  { match: "mon y", label: "món Ý" },
  { match: "do y", label: "món Ý" },
  { match: "gan trung tam", label: "gần trung tâm" },
];

// Mutually exclusive constraint families: asserting a new member REPLACES the
// old one instead of coexisting with it ("món Việt" must evict a stale "món Ý";
// a new budget must evict the previous budget).
const EXCLUSIVE_GROUPS: string[][] = [
  ["món Việt", "món Ý"],
  ["giá rẻ", "cao cấp"],
];

function isBudgetConstraint(label: string): boolean {
  return /^(dưới|khoảng|tối đa|trên|hơn)\s/.test(label);
}

function resolveConstraintConflicts(previous: string[], incoming: string[]): string[] {
  let kept = [...previous];
  for (const group of EXCLUSIVE_GROUPS) {
    if (incoming.some((item) => group.includes(item))) {
      kept = kept.filter((item) => !group.includes(item));
    }
  }
  if (incoming.some(isBudgetConstraint)) {
    kept = kept.filter((item) => !isBudgetConstraint(item));
  }
  return [...new Set([...kept, ...incoming])];
}

const PARTY_WORD_DIGITS: Record<string, string> = {
  hai: "2", ba: "3", bon: "4", nam: "5", sau: "6", bay: "7", tam: "8", chin: "9", muoi: "10",
};

function partySizeConstraint(normalized: string): string | undefined {
  const match = normalized.match(/(^|\s)(\d{1,2}|hai|ba|bon|nam|sau|bay|tam|chin|muoi)\s+nguoi(\s|$)/);
  if (!match) return undefined;
  return `${PARTY_WORD_DIGITS[match[2]] ?? match[2]} người`;
}

const BUDGET_PREFIX_LABELS: Record<string, string> = {
  duoi: "dưới",
  khoang: "khoảng",
  "toi da": "tối đa",
  tren: "trên",
  hon: "hơn",
};

const NUMBER_WORD_LABELS: Record<string, string> = {
  mot: "một",
  hai: "hai",
  ba: "ba",
  bon: "bốn",
  nam: "năm",
  sau: "sáu",
  bay: "bảy",
  tam: "tám",
  chin: "chín",
  muoi: "mười",
};

const UNIT_LABELS: Record<string, string> = {
  k: "k",
  nghin: "nghìn",
  ngan: "ngàn",
  trieu: "triệu",
  dong: "đồng",
  vnd: "VND",
};

// Deterministic numeric-budget extraction: "dưới 500k", "dưới 500.000",
// "khoảng một triệu". Returned labels keep the amount verbatim so downstream
// context checks (e.g. "500k") match exactly.
function budgetConstraintsFor(normalized: string): string[] {
  const constraints: string[] = [];
  const numeric =
    /(^|\s)(duoi|khoang|toi da|tren|hon)\s+(\d+(?:[\s.]\d+)*\s*(?:k|nghin|ngan|trieu|dong|vnd)?)(?=\s|$)/g;
  for (const match of normalized.matchAll(numeric)) {
    constraints.push(`${BUDGET_PREFIX_LABELS[match[2]]} ${match[3].trim()}`);
  }
  const wordNumbers = Object.keys(NUMBER_WORD_LABELS).join("|");
  const worded = new RegExp(
    `(^|\\s)(duoi|khoang|toi da|tren|hon)\\s+((?:(?:${wordNumbers})\\s+)*(?:${wordNumbers}))\\s+(trieu|nghin|ngan)(?=\\s|$)`,
    "g",
  );
  for (const match of normalized.matchAll(worded)) {
    const amount = match[3]
      .split(/\s+/)
      .map((word) => NUMBER_WORD_LABELS[word] ?? word)
      .join(" ");
    constraints.push(
      `${BUDGET_PREFIX_LABELS[match[2]]} ${amount} ${UNIT_LABELS[match[4]]}`,
    );
  }
  return constraints;
}

// "Bỏ tiêu chí X" removes a previously understood constraint — the chip × in the
// UI sends exactly this phrase, and removal must recompute, not merely hide.
function constraintRemovalTarget(message: string): string | undefined {
  const match = expandAliases(message).match(
    /(?:^|\s)(?:bo|xoa|huy)\s+(?:tieu chi\s+|dieu kien\s+|rang buoc\s+)(.+)$/,
  );
  return match?.[1]?.trim() || undefined;
}

function constraintsFor(query: string): string[] {
  const normalized = expandAliases(query);
  const known = KNOWN_CONSTRAINTS.filter(({ match }) =>
    normalized.includes(match),
  ).map(({ label }) => label);
  const party = partySizeConstraint(normalized);
  return [...new Set([...known, ...(party ? [party] : []), ...budgetConstraintsFor(normalized)])];
}

function sessionContext(
  request: ChatRequest,
  intent: string,
  pendingClarification?: Ambiguity,
  journey?: SessionContext["journey"],
  resetConversation = false,
): SessionContext {
  const previousConstraints = resetConversation
    ? []
    : request.sessionContext?.constraints ?? [];
  const removalTarget = constraintRemovalTarget(request.message);
  const priorTurns = priorUserTurns(request);
  return {
    sessionId:
      request.sessionId ??
      request.sessionContext?.sessionId ??
      "tasco-local-session",
    ...(request.profileId || request.sessionContext?.profileId
      ? { profileId: request.profileId ?? request.sessionContext?.profileId }
      : {}),
    lastIntent: intent,
    // A removal turn keeps the prior query as context — "Bỏ tiêu chí giá rẻ" is
    // an edit to the request, not a new request.
    lastQuery:
      removalTarget && request.sessionContext?.lastQuery
        ? request.sessionContext.lastQuery
        : request.message,
    constraints: removalTarget
      ? previousConstraints.filter((item) => {
          const normalized = normalizeText(item);
          return !normalized.includes(removalTarget) && !removalTarget.includes(normalized);
        })
      : resolveConstraintConflicts(
          previousConstraints,
          constraintsFor([request.message, request.nluHint].filter(Boolean).join("\n")),
        ),
    recentQueries: resetConversation
      ? [request.message]
      : removalTarget
        ? priorTurns
        : [...priorTurns, request.message].slice(
            -RECENT_USER_TURN_WINDOW,
          ),
    ...(pendingClarification
      ? {
          pendingClarification: {
            entity: pendingClarification.entity,
            candidateIds: pendingClarification.candidateIds,
          },
        }
      : {}),
    // A refinement turn that composes no new journey must not wipe the active
    // one — otherwise the next "rẻ hơn" falls to raw search instead of the
    // journey revision path.
    ...(journey
      ? { journey }
      : !resetConversation && request.sessionContext?.journey
        ? { journey: request.sessionContext.journey }
        : {}),
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
      quickReplies: rankedCandidates.map(({ poi }) => poi.name),
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

  // A constraint-removal turn re-runs the PREVIOUS request minus the constraint;
  // the removal phrase itself must not leak into ranking text.
  const removalTarget = constraintRemovalTarget(request.message);
  const combined = removalTarget
    ? conversationText({ ...request, message: "" })
    : conversationText(request);
  const currentText = [request.message, request.nluHint].filter(Boolean).join("\n");
  const carriedStops = request.sessionContext?.journey
    ? journeyStopsFromState(request.sessionContext.journey)
    : [];
  const carriedStopCategories = carriedStops.map(({ category }) => category);
  const currentStops = requestedJourneyStops(currentText);
  const currentStopCategories = currentStops.map(({ category }) => category);
  const currentCategoryConstraint = inferCategoryConstraint(currentText);
  const carriedPoiCategories = new Set(
    (carriedStopCategories ?? []).flatMap(poiCategoriesForJourneyStop),
  );
  const normalizedCurrent = normalizeText(request.message);
  const namesExistingStop = /(?:chang|diem dung|diem dau|dau tien|thu hai|first stop|second stop|leg)/.test(
    normalizedCurrent,
  );
  const startsFreshSearch = /(?:^|\s)(?:tim|kiem|goi y|de xuat|find|search|show|recommend)(?:\s|$)/.test(
    normalizedCurrent,
  );
  const hasRefinementCue = /(?:^|\s)(?:hon|them|bot|doi|thay|phai|giu|uu tien|make|quieter|cheaper|closer|more|less)(?:\s|$)/.test(
    normalizedCurrent,
  );
  const targetsCarriedStop =
    currentCategoryConstraint.categories.length > 0 &&
    currentCategoryConstraint.categories.every((category) =>
      carriedPoiCategories.has(category),
    );
  const refinesExistingStop = Boolean(
    carriedStops.length &&
      currentStopCategories.length < 2 &&
      targetsCarriedStop &&
      !startsFreshSearch &&
      (namesExistingStop || hasRefinementCue),
  );
  const changesCategory =
    currentCategoryConstraint.hard &&
    currentCategoryConstraint.categories.some(
      (category) => !carriedPoiCategories.has(category),
    );
  const startsStandaloneCategoryRequest =
    !refinesExistingStop &&
    !namesExistingStop &&
    currentStopCategories.length < 2 &&
    currentCategoryConstraint.hard &&
    currentCategoryConstraint.categories.length === 1;
  const resetsOrderedJourney = Boolean(
    carriedStopCategories?.length &&
      (changesCategory || startsStandaloneCategoryRequest),
  );
  const explicitCurrentTopic = Boolean(
    !resolved &&
      !carriedStopCategories?.length &&
      currentStopCategories.length < 2 &&
      currentCategoryConstraint.hard,
  );
  const conversation = resetsOrderedJourney || explicitCurrentTopic
    ? currentText
    : combined;
  const intent =
    resolved && request.sessionContext?.lastIntent === "navigation"
      ? "navigation"
      : detectIntent(conversation);
  const origin = request.location ?? locationCenter(profile?.currentLocation);
  const explicitLocation = profile?.currentLocation;
  const rankOrderedStops = (
    stops: JourneyStopRequest[],
    options: {
      location?: string;
      constraints?: string[];
      origin?: Coordinates;
      radiusMeters?: number;
      limit?: number;
    } = {},
  ): RankedPoi[] =>
    stops
      .flatMap((stop) => {
        const segment = "query" in stop && typeof stop.query === "string"
          ? stop.query
          : journeyStopLabel(stop);
        const query = [
          segment,
          ...(options.constraints ?? []),
          options.location,
        ]
          .filter(Boolean)
          .join("\n");
        return rankPois(query, {
          profile,
          origin: options.origin,
          ...(options.radiusMeters !== undefined
            ? { radiusMeters: options.radiusMeters }
            : {}),
          locationText: options.location || explicitLocation,
          category: poiCategoriesForJourneyStop(stop.category),
          hardCategory: true,
          limit: options.limit ?? 80,
        }).filter((candidate) => poiMatchesJourneyStop(candidate.poi, stop));
      })
      .filter(
        (candidate, index, all) =>
          all.findIndex((item) => item.poi.id === candidate.poi.id) === index,
      );

  if (
    !resetsOrderedJourney &&
    isCheaperJourneyRequest(request.message) &&
    request.sessionContext?.journey
  ) {
    const prior = request.sessionContext.journey;
    const revisionStops = journeyStopsFromState(prior);
    const revisionLocation = locationLabelFor(prior.query) || prior.location;
    const revisionRanked = revisionStops.length >= 2
      ? rankOrderedStops(revisionStops, {
          location: revisionLocation || explicitLocation,
          constraints: request.sessionContext.constraints,
          origin: request.location,
          // The prior selections must remain present even if a large open pack
          // has more than 80 candidates for one stop.
          limit: pois.length,
        })
      : rankPois(prior.query, {
          profile,
          origin: request.location,
          locationText: prior.location || explicitLocation,
          limit: 80,
        });
    const journey = reviseJourneyCheaper(prior, revisionRanked);
    if (journey) {
      const recommendations = journey.actions.flatMap((action) => {
        const ranked = revisionRanked.find((item) => item.poi.id === action.poiId);
        return ranked ? [toRecommendation(ranked)] : [];
      });
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
    const references = routeReferences(conversation);
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
        assistantResponse: `Đã tạo tuyến đến ${destination.name}: khoảng ${(
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
    const poi = resolvePoiReference(conversation);
    if (poi) {
      const ranked = rankPois(conversation, { profile, limit: 1 }).find(
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

  const anchor = locationAnchorFor(conversation);
  const searchText = anchor ? withoutAnchorPhrases(conversation, anchor) : conversation;
  const categoryConstraint = inferCategoryConstraint(searchText);
  // Explicit request.history can seed a journey. Once client-carried state
  // exists, only that typed state may carry it; old text must not resurrect a
  // journey after the user switches to a new topic.
  const contextualStops =
    request.sessionContext ||
    currentStopCategories.length > 0 ||
    currentCategoryConstraint.categories.length > 0
      ? []
      : requestedJourneyStops(priorUserTurns(request).join("\n"));
  const orderedStops: JourneyStopRequest[] =
    resetsOrderedJourney
      ? []
      : currentStops.length >= 2
        ? currentStops
        : carriedStops.length
          ? carriedStops
          : contextualStops;
  const hasOrderedJourney = orderedStops.length >= 2;
  const currentLocation = locationLabelFor(currentText);
  const carriedLocation = request.sessionContext?.journey
    ? locationLabelFor(request.sessionContext.journey.query) ||
      request.sessionContext.journey.location
    : undefined;
  const orderedLocation = currentLocation || carriedLocation || explicitLocation;
  const orderedConstraints = resolveConstraintConflicts(
    request.sessionContext?.constraints ?? [],
    constraintsFor(currentText),
  );
  const rankingText = searchText;

  // Clarification-first: a bare or empty request gets a question, not a guess.
  // Qualifiers (attributes, budgets, purpose phrases), an explicit area, a named
  // place, GPS, or an in-flight clarification all count as enough information.
  const slotQuestion =
    intent === "search" || intent === "recommendation"
      ? clarificationQuestionFor(
          request,
          conversation,
          searchText,
          Boolean(anchor),
          categoryConstraint.categories,
          hasOrderedJourney,
        )
      : undefined;
  if (slotQuestion) {
    return {
      intent: "clarification_required",
      assistantResponse: slotQuestion.question,
      recommendations: [],
      quickReplies: slotQuestion.quickReplies,
      confidence: 0.9,
      mapAction: { type: "clarify", query: request.message, poiIds: [] },
      sessionContext: sessionContext(
        request,
        "clarification_required",
        undefined,
        undefined,
        resetsOrderedJourney || explicitCurrentTopic,
      ),
      privacy,
    };
  }
  // Plans and multi-service journeys need a cross-category pool; everything else
  // with an explicit venue type gets a hard category filter.
  const hardCategory =
    categoryConstraint.hard &&
    intent !== "planning" &&
    !isJourneyIntent(conversation) &&
    !hasOrderedJourney;
  const rankForCategories = (categories: string[], enforceCategory: boolean) =>
    rankPois(rankingText, {
      profile,
      origin: anchor?.poi.coordinates ?? request.location,
      ...(anchor ? { radiusMeters: NEAR_ANCHOR_RADIUS_METERS } : {}),
      locationText: currentLocation || explicitLocation,
      category: categories,
      hardCategory: enforceCategory,
      limit: 80,
    });
  const ranked = hasOrderedJourney
    ? rankOrderedStops(orderedStops, {
        location: orderedLocation,
        constraints: orderedConstraints,
        origin: anchor?.poi.coordinates ?? request.location,
        ...(anchor ? { radiusMeters: NEAR_ANCHOR_RADIUS_METERS } : {}),
      })
    : rankForCategories(categoryConstraint.categories, hardCategory);
  const pool = ranked.filter(
    (item) =>
      item.poi.id !== anchor?.poi.id && !isAvoidedByProfile(item.poi, profile),
  );
  let selected =
    intent === "planning" ? diversified(pool, 4) : pool.slice(0, 3);
  let recommendations = selected.map(toRecommendation);
  const journeyQuery = hasOrderedJourney
    ? [
        orderedStops.map(journeyStopLabel).join(" rồi "),
        ...orderedConstraints,
        orderedLocation,
      ]
        .filter(Boolean)
        .join("\n")
    : request.message;
  const journey = composeJourney(
    journeyQuery,
    pool,
    recommendations,
    orderedStops,
  );
  const incompleteOrderedJourney = hasOrderedJourney && !journey;
  if (journey) {
    selected = journey.actions.flatMap((action) => {
      const ranked = pool.find((item) => item.poi.id === action.poiId);
      return ranked ? [ranked] : [];
    });
    recommendations = selected.map(toRecommendation);
  } else if (incompleteOrderedJourney) {
    selected = [];
    recommendations = [];
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
        ? `Tôi đã ghép một hành trình gồm ${journey.actions.length} dịch vụ: ${names}. Hãy xem từng khoản trước khi xác nhận.`
      : `Tôi tìm được ${recommendations.length} lựa chọn phù hợp nhất: ${names}. Mỗi gợi ý kèm lý do và điểm thành phần để bạn kiểm tra.`
    : incompleteOrderedJourney
      ? incompleteOrderedJourneyResponse(orderedStops, pool)
      : noMatchResponse(categoryConstraint.categories, anchor, constraintsFor(request.message), locationLabelFor(searchText));

  return {
    intent,
    assistantResponse,
    recommendations,
    confidence,
    mapAction: {
      type: intent === "planning" || hasOrderedJourney ? "plan" : "search",
      query: request.message,
      poiIds: recommendations.map(({ poi }) => poi.id),
      ...(anchor
        ? { center: anchor.poi.coordinates, zoom: 13 }
        : recommendations[0]
          ? { center: recommendations[0].poi.coordinates, zoom: 13 }
          : {}),
    },
    sessionContext: sessionContext(
      request,
      intent,
      undefined,
      journey ? journeyState(journeyQuery, journey) : undefined,
      resetsOrderedJourney || explicitCurrentTopic || incompleteOrderedJourney,
    ),
    ...(journey ? { journey } : {}),
    privacy,
  };
}

function incompleteOrderedJourneyResponse(
  stops: JourneyStopRequest[],
  pool: RankedPoi[],
): string {
  const remaining = [...pool];
  const missing: JourneyStopRequest[] = [];
  for (const stop of stops) {
    const index = remaining.findIndex((item) =>
      poiMatchesJourneyStop(item.poi, stop),
    );
    if (index < 0) missing.push(stop);
    else remaining.splice(index, 1);
  }
  const orderedLabels = stops
    .map(journeyStopLabel)
    .join(" → ");
  const missingLabels = [...new Set(missing.map(journeyStopLabel))]
    .join(", ");
  return `Trong bộ dữ liệu TASCO hiện chưa đủ địa điểm để tạo trọn hành trình ${orderedLabels}${missingLabels ? `; còn thiếu ${missingLabels}` : ""}. Tôi không bỏ âm thầm chặng nào; bạn có thể đổi khu vực hoặc loại điểm dừng.`;
}

function mentionsKnownPoi(text: string): boolean {
  const normalized = expandAliases(text);
  if (POI_ALIASES.some(({ phrases }) => phrases.some((phrase) => normalized.includes(phrase)))) {
    return true;
  }
  // Only multi-word, reasonably long names count — a venue named "Nhà Hàng" must
  // not make every generic restaurant request look like a named-place lookup.
  return pois.some((poi) => {
    const name = normalizeText(poi.name);
    return name.length >= 8 && name.includes(" ") && normalized.includes(name);
  });
}

function clarificationQuestionFor(
  request: ChatRequest,
  combined: string,
  searchText: string,
  hasAnchor: boolean,
  categories: string[],
  hasOrderedJourney: boolean,
): { question: string; quickReplies: string[] } | undefined {
  if (request.sessionContext?.lastIntent === "clarification_required") return undefined;
  if (hasOrderedJourney || isJourneyIntent(combined)) return undefined;
  if (mentionsKnownPoi(combined)) return undefined;
  const hasLocation = hasAnchor || Boolean(request.location) || queryLocationSignal(searchText);
  const hasQualifier =
    hasIntentQualifier(searchText) || constraintsFor(combined).length > 0;
  if (hasQualifier) return undefined;
  const categoryLabel = categories.length
    ? categories.join("/").toLowerCase()
    : undefined;
  if (!hasLocation && categoryLabel) {
    return {
      question: `Bạn muốn tìm ${categoryLabel} ở khu vực nào, và có tiêu chí gì thêm không (ví dụ: yên tĩnh, giá rẻ, cho nhóm)?`,
      quickReplies: ["Ở Quận 1", "Gần tôi", "Yên tĩnh, có wifi", "Giá rẻ"],
    };
  }
  if (!hasLocation && !categoryLabel) {
    return {
      question: "Bạn muốn tìm loại địa điểm nào (quán cà phê, nhà hàng, khách sạn…), và ở khu vực nào?",
      quickReplies: ["Quán cà phê ở Quận 1", "Nhà hàng gần tôi", "Khách sạn ở Đà Nẵng"],
    };
  }
  if (!categoryLabel) {
    return {
      question: "Bạn muốn tìm loại địa điểm nào ở khu vực đó — quán cà phê, nhà hàng, hay chỗ vui chơi?",
      quickReplies: ["Quán cà phê", "Nhà hàng", "Chỗ vui chơi"],
    };
  }
  return undefined;
}

// Honest coverage-gap answer: never relax hard constraints silently; name the
// constraint the dataset cannot satisfy instead of returning unrelated venues.
function noMatchResponse(
  categories: string[],
  anchor: LocationAnchor | undefined,
  constraints: string[],
  locationLabel?: string,
): string {
  const what = categories.length
    ? categories.join("/").toLowerCase()
    : "địa điểm phù hợp";
  const where = anchor
    ? ` gần ${anchor.poi.name}`
    : locationLabel
      ? ` ở ${locationLabel}`
      : "";
  const wants = constraints.length
    ? ` đáp ứng yêu cầu ${constraints.join(", ")}`
    : "";
  return `Trong bộ dữ liệu TASCO hiện chưa có ${what} nào${where}${wants}. Tôi không gợi ý địa điểm ngoài phạm vi yêu cầu; bạn có thể mở rộng khu vực hoặc bỏ bớt điều kiện để tôi tìm lại.`;
}
