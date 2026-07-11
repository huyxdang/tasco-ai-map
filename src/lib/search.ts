import { pois } from "./data";
import { haversineMeters } from "./geo";
import { expandAliases, meaningfulTokens, normalizeText } from "./text";
import type {
  Coordinates,
  PlaceResult,
  Poi,
  RankedPoi,
  UserProfile,
} from "./types";

export interface RankOptions {
  profile?: UserProfile;
  origin?: Coordinates;
  locationText?: string;
  category?: string | string[];
  hardCategory?: boolean;
  hardLocation?: boolean;
  radiusMeters?: number;
  limit?: number;
}

const CATEGORY_HINTS: Array<{ phrases: string[]; categories: string[] }> = [
  {
    phrases: ["hen ho", "lang man", "rooftop", "ban gai", "date"],
    categories: ["Nhà hàng", "Bar/Rooftop", "Quán cà phê"],
  },
  {
    phrases: ["cafe", "ca phe", "coffee", "hoc nhom", "lam viec"],
    categories: ["Quán cà phê"],
  },
  {
    phrases: ["nha hang", "quan an", "an toi", "an khuya", "pho", "bun cha", "dac san", "do y", "mon y", "tiep khach"],
    categories: ["Nhà hàng"],
  },
  {
    phrases: ["khach san", "hotel", "resort", "cong tac"],
    categories: ["Khách sạn", "Khách sạn/Resort"],
  },
  {
    phrases: ["tram xang", "cay xang", "do xang", "petrolimex"],
    categories: ["Trạm xăng"],
  },
  {
    phrases: ["san bay", "airport"],
    categories: ["Sân bay"],
  },
  {
    phrases: ["rap phim", "cinema", "galaxy", "cgv"],
    categories: ["Rạp chiếu phim"],
  },
  {
    phrases: ["tre em", "khu vui choi", "kidzone"],
    categories: ["Khu vui chơi", "Công viên", "Trung tâm thương mại"],
  },
  {
    phrases: ["mua sam", "trung tam thuong mai", "vincom", "aeon"],
    categories: ["Trung tâm thương mại"],
  },
  {
    phrases: ["benh vien", "cap cuu"],
    categories: ["Bệnh viện"],
  },
  {
    phrases: ["cong vien", "di bo", "ngoai troi"],
    categories: ["Công viên"],
  },
  {
    phrases: ["atm", "rut tien"],
    categories: ["ATM"],
  },
  {
    phrases: ["cho", "market"],
    categories: ["Chợ"],
  },
  {
    phrases: ["check in", "chup hinh", "du lich", "tham quan"],
    categories: [
      "Địa điểm du lịch",
      "Địa điểm văn hóa",
      "Quán cà phê",
    ],
  },
];

const LOCATION_ALIASES: Array<{ phrases: string[]; targets: string[] }> = [
  {
    phrases: ["tp hcm", "tphcm", "sai gon", "ho chi minh", "hcmc"],
    targets: ["tp hcm"],
  },
  { phrases: ["ha noi"], targets: ["ha noi"] },
  { phrases: ["da nang"], targets: ["da nang"] },
  { phrases: ["da lat"], targets: ["da lat"] },
  { phrases: ["hoi an"], targets: ["hoi an", "quang nam"] },
  { phrases: ["nha trang"], targets: ["nha trang"] },
  { phrases: ["quan 1", "q1"], targets: ["quan 1"] },
  { phrases: ["hoan kiem", "ho guom"], targets: ["hoan kiem"] },
  { phrases: ["son tra"], targets: ["son tra"] },
  { phrases: ["ba dinh"], targets: ["ba dinh"] },
  { phrases: ["dong da"], targets: ["dong da"] },
  { phrases: ["hai ba trung"], targets: ["hai ba trung"] },
  { phrases: ["tay ho"], targets: ["tay ho"] },
  { phrases: ["hai chau"], targets: ["hai chau"] },
];

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function roundScore(value: number): number {
  return Number(value.toFixed(4));
}

function poiText(poi: Poi): string {
  return expandAliases(
    [
      poi.name,
      poi.category,
      poi.brand,
      poi.city,
      poi.district,
      poi.address,
      poi.attributes.join(" "),
      poi.tags.join(" "),
      poi.description,
    ].join(" "),
  );
}

function categoriesForQuery(query: string): string[] {
  const normalized = expandAliases(query);
  const categories = CATEGORY_HINTS.filter(({ phrases }) =>
    phrases.some((phrase) => normalized.includes(phrase)),
  ).flatMap(({ categories: matches }) => matches);

  return [...new Set(categories)];
}

export function inferCategories(query: string): string[] {
  return categoriesForQuery(query);
}

function locationTargets(query: string, explicitLocation?: string): string[] {
  const normalized = expandAliases(`${query} ${explicitLocation ?? ""}`);
  return [
    ...new Set(
      LOCATION_ALIASES.filter(({ phrases }) =>
        phrases.some((phrase) => normalized.includes(phrase)),
      ).flatMap(({ targets }) => targets),
    ),
  ];
}

function overlapRatio(needles: string[], haystack: Set<string>): number {
  if (needles.length === 0) return 0;
  const matches = needles.filter((needle) => haystack.has(needle)).length;
  return matches / needles.length;
}

function profileScore(poi: Poi, profile?: UserProfile): number {
  if (!profile) return 0;
  const haystack = poiText(poi);
  const preferences = profile.preferences.map(normalizeText);
  const phraseMatches = preferences.filter((preference) =>
    haystack.includes(preference),
  ).length;
  const preferenceTokens = meaningfulTokens(profile.preferences.join(" "));
  const tokenMatch = overlapRatio(
    preferenceTokens,
    new Set(meaningfulTokens(haystack)),
  );
  return clamp(phraseMatches / Math.max(2, preferences.length) + tokenMatch * 0.5);
}

function avoidPenalty(poi: Poi, profile?: UserProfile): number {
  if (!profile) return 0;
  const haystack = poiText(poi);
  const avoidPhrases = profile.avoid.map(normalizeText);
  const phraseMatch = avoidPhrases.some((item) => haystack.includes(item));
  const avoidTokens = meaningfulTokens(profile.avoid.join(" "));
  const tokenOverlap = overlapRatio(
    avoidTokens,
    new Set(meaningfulTokens(haystack)),
  );
  return phraseMatch ? -0.24 : -0.15 * tokenOverlap;
}

function budgetScore(poi: Poi, profile?: UserProfile): number {
  if (!profile) return 0;
  const haystack = poiText(poi);
  if (profile.budgetLevel === "low") {
    if (haystack.includes("gia hop ly") || haystack.includes("gia re")) return 1;
    if (haystack.includes("cao cap") || haystack.includes("5 sao")) return -1;
  }
  if (profile.budgetLevel === "high" && haystack.includes("cao cap")) return 0.6;
  return 0;
}

function specialBoost(query: string, poi: Poi): number {
  const normalized = expandAliases(query);
  const haystack = poiText(poi);
  let boost = 0;

  const addFor = (phrases: string[], poiIds: string[], value: number): void => {
    if (
      phrases.some((phrase) => normalized.includes(phrase)) &&
      poiIds.includes(poi.id)
    ) {
      boost += value;
    }
  };

  addFor(
    ["lam viec", "gap doi tac", "tiep khach", "khong dong", "yen tinh"],
    ["POI001", "POI017"],
    0.2,
  );
  addFor(
    ["hen ho", "lang man", "ban gai", "rooftop", "view dep"],
    ["POI004", "POI005", "POI021"],
    0.22,
  );
  addFor(["cong tac", "business"], ["POI012"], 0.25);
  addFor(["tre em", "gia dinh"], ["POI015", "POI020", "POI028"], 0.18);
  addFor(["pho", "bun cha", "mon dia phuong"], ["POI018", "POI019"], 0.22);
  addFor(["bien", "gan bien"], ["POI009", "POI013"], 0.2);
  addFor(["dac san", "mi quang"], ["POI014"], 0.24);
  addFor(["xang", "toilet"], ["POI024"], 0.3);
  addFor(["galaxy"], ["POI008", "POI009"], 0.3);
  addFor(["vincom"], ["POI007", "POI016"], 0.3);
  addFor(["san bay tan son nhat"], ["POI026"], 0.35);
  addFor(["san bay noi bai"], ["POI027"], 0.35);
  addFor(["ho guom", "ho hoan kiem", "di bo"], ["POI030"], 0.25);
  addFor(["lotte hotel"], ["POI012"], 0.35);
  addFor(["secret garden"], ["POI021"], 0.35);

  if (normalized.includes("wifi") && haystack.includes("wifi")) boost += 0.08;
  if (normalized.includes("mo khuya") && haystack.includes("mo cua khuya")) {
    boost += 0.12;
  }
  return clamp(boost, 0, 0.45);
}

function categoryMatches(poi: Poi, categories: string[]): boolean {
  const normalizedCategory = normalizeText(poi.category);
  return categories.some((category) => {
    const expected = normalizeText(category);
    return (
      normalizedCategory === expected ||
      normalizedCategory.includes(expected) ||
      expected.includes(normalizedCategory)
    );
  });
}

export function rankPois(query: string, options: RankOptions = {}): RankedPoi[] {
  const queryTokens = meaningfulTokens(query);
  const inferred = categoriesForQuery(query);
  const requestedCategories = options.category
    ? Array.isArray(options.category)
      ? options.category
      : [options.category]
    : inferred;
  const queryTargets = locationTargets(query);
  const profileTargets = locationTargets("", options.locationText);
  const profileLocation = normalizeText(options.profile?.currentLocation ?? "");
  const nearMe = /\b(gan toi|gan day|near me)\b/.test(expandAliases(query));
  const targets = queryTargets.length > 0 ? queryTargets : profileTargets;
  const hardTargets =
    queryTargets.length > 0 ? queryTargets : nearMe ? profileTargets : [];
  const candidates = pois.filter((poi) => {
    if (
      options.hardCategory &&
      requestedCategories.length > 0 &&
      !categoryMatches(poi, requestedCategories)
    ) {
      return false;
    }

    if (
      options.hardLocation !== false &&
      hardTargets.length > 0 &&
      !hardTargets.some((target) => poiText(poi).includes(target))
    ) {
      return false;
    }

    if (options.origin && options.radiusMeters !== undefined) {
      return (
        haversineMeters(options.origin, poi.coordinates) <= options.radiusMeters
      );
    }
    return true;
  });

  const ranked = candidates.map((poi): RankedPoi => {
    const haystack = poiText(poi);
    const haystackTokens = new Set(meaningfulTokens(haystack));
    const matchedTerms = queryTokens.filter((token) => haystackTokens.has(token));
    const textMatch = overlapRatio(queryTokens, haystackTokens);
    const categoryMatch =
      requestedCategories.length > 0 && categoryMatches(poi, requestedCategories)
        ? 1
        : 0;
    const locationMatch =
      targets.length > 0
        ? targets.some((target) => haystack.includes(target))
          ? 1
          : 0
        : nearMe && profileLocation
          ? meaningfulTokens(profileLocation).some((token) =>
              haystackTokens.has(token),
            )
            ? 1
            : 0
          : 0;
    const attributePhrases = [...poi.attributes, ...poi.tags]
      .map(normalizeText)
      .filter((attribute) => expandAliases(query).includes(attribute));
    const attributeMatch = clamp(attributePhrases.length / 3);
    const preferenceMatch = profileScore(poi, options.profile);
    const avoidance = avoidPenalty(poi, options.profile);
    const budget = budgetScore(poi, options.profile);
    const quality = clamp(
      (poi.rating / 5) * 0.55 + (poi.popularityScore / 100) * 0.45,
    );
    const distanceMeters = options.origin
      ? haversineMeters(options.origin, poi.coordinates)
      : undefined;
    const distance =
      distanceMeters === undefined
        ? 0
        : clamp(1 - distanceMeters / Math.max(options.radiusMeters ?? 20_000, 1));
    const featured = poi.datasetTier === "featured" ? 1 : 0;
    const special = specialBoost(query, poi);
    const rawScore =
      0.04 +
      textMatch * 0.27 +
      categoryMatch * 0.2 +
      locationMatch * 0.13 +
      attributeMatch * 0.1 +
      preferenceMatch * 0.11 +
      quality * 0.07 +
      distance * 0.07 +
      featured * 0.025 +
      budget * 0.08 +
      avoidance +
      special;

    return {
      poi,
      score: roundScore(clamp(rawScore)),
      scoreBreakdown: {
        textMatch: roundScore(textMatch * 0.27),
        categoryMatch: roundScore(categoryMatch * 0.2),
        locationMatch: roundScore(locationMatch * 0.13),
        attributeMatch: roundScore(attributeMatch * 0.1),
        preferenceMatch: roundScore(preferenceMatch * 0.11),
        quality: roundScore(quality * 0.07),
        distance: roundScore(distance * 0.07),
        featured: roundScore(featured * 0.025),
        budget: roundScore(budget * 0.08),
        avoidPenalty: roundScore(avoidance),
        intentBoost: roundScore(special),
      },
      distanceMeters,
      matchedTerms,
    };
  });

  return ranked
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.poi.popularityScore - left.poi.popularityScore ||
        left.poi.id.localeCompare(right.poi.id),
    )
    .slice(0, options.limit ?? 10);
}

export function toPlaceResult(
  poi: Poi,
  details: { distanceMeters?: number; score?: number } = {},
): PlaceResult {
  return {
    id: poi.id,
    type: "poi",
    name: poi.name,
    label: `${poi.name} · ${poi.district}, ${poi.city}`,
    address: poi.address,
    category: poi.category,
    coordinates: poi.coordinates,
    ...(details.distanceMeters === undefined
      ? {}
      : { distanceMeters: details.distanceMeters }),
    ...(details.score === undefined ? {} : { score: details.score }),
    source: "tasco-dataset",
    tags: [...poi.tags],
  };
}

export function searchPlaces(
  query: string,
  options: RankOptions = {},
): PlaceResult[] {
  return rankPois(query, options).map((ranked) =>
    toPlaceResult(ranked.poi, {
      distanceMeters: ranked.distanceMeters,
      score: ranked.score,
    }),
  );
}
