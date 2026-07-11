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

// `hard: true` marks phrases where the user explicitly named a venue type, so the
// category becomes a hard filter. Vibe phrases (hẹn hò, trẻ em, du lịch…) stay soft
// to preserve broad discovery. "cho" can never be hard: "chỗ" normalizes to "cho".
const CATEGORY_HINTS: Array<{ phrases: string[]; categories: string[]; hard?: boolean }> = [
  {
    phrases: ["hen ho", "lang man", "ban gai", "date"],
    categories: ["Nhà hàng", "Bar/Rooftop", "Quán cà phê"],
  },
  {
    phrases: ["rooftop", "skybar", "bar"],
    categories: ["Bar/Rooftop"],
    hard: true,
  },
  {
    phrases: ["cafe", "ca phe", "coffee", "hoc nhom"],
    categories: ["Quán cà phê"],
    hard: true,
  },
  {
    phrases: ["lam viec", "gap doi tac"],
    categories: ["Quán cà phê"],
  },
  {
    phrases: ["ban be", "nhom ban", "di choi", "may dua ban"],
    categories: ["Quán cà phê", "Nhà hàng", "Công viên"],
  },
  {
    phrases: ["nha hang", "quan an", "an toi", "an trua", "an khuya", "do y", "mon y"],
    categories: ["Nhà hàng"],
    hard: true,
  },
  {
    phrases: ["pho", "bun cha", "dac san", "tiep khach"],
    categories: ["Nhà hàng"],
  },
  {
    phrases: ["khach san", "hotel", "resort"],
    categories: ["Khách sạn", "Khách sạn/Resort"],
    hard: true,
  },
  {
    phrases: ["cong tac"],
    categories: ["Khách sạn", "Khách sạn/Resort"],
  },
  {
    phrases: ["tram xang", "cay xang", "do xang", "petrolimex"],
    categories: ["Trạm xăng"],
    hard: true,
  },
  {
    phrases: ["san bay", "airport"],
    categories: ["Sân bay"],
    hard: true,
  },
  {
    phrases: ["rap phim", "rap chieu phim", "cinema", "cgv"],
    categories: ["Rạp chiếu phim"],
    hard: true,
  },
  {
    phrases: ["galaxy"],
    categories: ["Rạp chiếu phim"],
  },
  {
    phrases: ["khu vui choi", "kidzone"],
    categories: ["Khu vui chơi"],
    hard: true,
  },
  {
    phrases: ["tre em"],
    categories: ["Khu vui chơi", "Công viên", "Trung tâm thương mại"],
  },
  {
    phrases: ["trung tam thuong mai", "aeon"],
    categories: ["Trung tâm thương mại"],
    hard: true,
  },
  {
    phrases: ["mua sam", "vincom"],
    categories: ["Trung tâm thương mại"],
  },
  {
    phrases: ["benh vien", "cap cuu"],
    categories: ["Bệnh viện"],
    hard: true,
  },
  {
    phrases: ["cong vien"],
    categories: ["Công viên"],
    hard: true,
  },
  {
    phrases: ["di bo", "ngoai troi"],
    categories: ["Công viên"],
  },
  {
    phrases: ["atm", "rut tien"],
    categories: ["ATM"],
    hard: true,
  },
  {
    // "chợ" normalizes to "cho", colliding with "chỗ" (place) — so the bare word
    // can never be a category hint; named markets resolve via POI aliases instead.
    phrases: ["market", "cho dem", "cho phien"],
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

// Defense in depth against mislabeled data: a POI whose pin contradicts its
// declared city by more than this distance can never be recommended, even if a
// future dataset regression reintroduces corrupt coordinates.
const CITY_CENTERS: Record<string, Coordinates> = {
  "tp hcm": { lat: 10.7769, lon: 106.7009 },
  "ha noi": { lat: 21.0285, lon: 105.8542 },
  "da nang": { lat: 16.0544, lon: 108.2022 },
  "da lat": { lat: 11.9404, lon: 108.4383 },
  "hoi an": { lat: 15.8801, lon: 108.338 },
  "nha trang": { lat: 12.2388, lon: 109.1967 },
  "quang nam": { lat: 15.8801, lon: 108.338 },
};
const MAX_METERS_FROM_DECLARED_CITY = 30_000;

export function hasCoherentCoordinates(poi: Poi): boolean {
  const center = CITY_CENTERS[normalizeText(poi.city)];
  if (!center) return true;
  return haversineMeters(center, poi.coordinates) <= MAX_METERS_FROM_DECLARED_CITY;
}

const CITY_ALIASES: Array<{ phrases: string[]; city: string }> = [
  {
    phrases: ["tp hcm", "tphcm", "sai gon", "ho chi minh", "hcmc"],
    city: "tp hcm",
  },
  { phrases: ["ha noi"], city: "ha noi" },
  { phrases: ["da nang"], city: "da nang" },
  { phrases: ["da lat"], city: "da lat" },
  { phrases: ["hoi an"], city: "hoi an" },
  { phrases: ["nha trang"], city: "nha trang" },
];

// Each district belongs to a canonical city, so a district mention never admits a
// POI whose synthetic district shares the name but sits in another city.
const DISTRICT_ALIASES: Array<{ phrases: string[]; district: string; city: string }> = [
  { phrases: ["quan 1", "q1"], district: "quan 1", city: "tp hcm" },
  { phrases: ["hoan kiem", "ho guom"], district: "hoan kiem", city: "ha noi" },
  { phrases: ["son tra"], district: "son tra", city: "da nang" },
  { phrases: ["ba dinh"], district: "ba dinh", city: "ha noi" },
  { phrases: ["dong da"], district: "dong da", city: "ha noi" },
  { phrases: ["hai ba trung"], district: "hai ba trung", city: "ha noi" },
  { phrases: ["tay ho"], district: "tay ho", city: "ha noi" },
  { phrases: ["hai chau"], district: "hai chau", city: "da nang" },
];

export interface LocationConstraint {
  cities: string[];
  districts: Array<{ district: string; city: string }>;
}

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

function phraseInText(normalized: string, phrase: string): boolean {
  return new RegExp(`(^|\\s)${phrase}(\\s|$)`).test(normalized);
}

function matchedCategoryHints(query: string) {
  const normalized = expandAliases(query);
  return CATEGORY_HINTS.filter(({ phrases }) =>
    phrases.some((phrase) => phraseInText(normalized, phrase)),
  );
}

function categoriesForQuery(query: string): string[] {
  return [...new Set(matchedCategoryHints(query).flatMap(({ categories }) => categories))];
}

export function inferCategories(query: string): string[] {
  return categoriesForQuery(query);
}

export interface CategoryConstraint {
  categories: string[];
  hard: boolean;
}

export function inferCategoryConstraint(query: string): CategoryConstraint {
  const matched = matchedCategoryHints(query);
  const hardHints = matched.filter(({ hard }) => hard);
  if (hardHints.length > 0) {
    return {
      categories: [...new Set(hardHints.flatMap(({ categories }) => categories))],
      hard: true,
    };
  }
  return { categories: [...new Set(matched.flatMap(({ categories }) => categories))], hard: false };
}

// Purpose/vibe phrases (soft hints) count as intent qualifiers: a query carrying
// one is specific enough to answer even without an explicit venue type. Very
// short phrases (pho, cho) are homograph-prone and never count on their own.
export function hasIntentQualifier(query: string): boolean {
  const normalized = expandAliases(query);
  return CATEGORY_HINTS.some(
    ({ hard, phrases }) =>
      !hard && phrases.some((phrase) => phrase.length > 3 && phraseInText(normalized, phrase)),
  );
}

export function queryLocationSignal(query: string): boolean {
  const constraint = locationConstraintFor(query);
  return hasLocationConstraint(constraint) || /\b(gan toi|gan day|near me)\b/.test(expandAliases(query));
}

const LOCATION_LABELS: Record<string, string> = {
  "tp hcm": "TP.HCM",
  "ha noi": "Hà Nội",
  "da nang": "Đà Nẵng",
  "da lat": "Đà Lạt",
  "hoi an": "Hội An",
  "nha trang": "Nha Trang",
  "quan 1": "Quận 1",
  "hoan kiem": "Hoàn Kiếm",
  "son tra": "Sơn Trà",
  "ba dinh": "Ba Đình",
  "dong da": "Đống Đa",
  "hai ba trung": "Hai Bà Trưng",
  "tay ho": "Tây Hồ",
  "hai chau": "Hải Châu",
};

export function locationLabelFor(text: string): string | undefined {
  const constraint = locationConstraintFor(text);
  const target = constraint.districts[0]?.district ?? constraint.cities[0];
  return target ? LOCATION_LABELS[target] : undefined;
}

function locationConstraintFor(text: string): LocationConstraint {
  const normalized = expandAliases(text);
  const cities = [
    ...new Set(
      CITY_ALIASES.filter(({ phrases }) =>
        phrases.some((phrase) => normalized.includes(phrase)),
      ).map(({ city }) => city),
    ),
  ];
  const districts = DISTRICT_ALIASES.filter(({ phrases }) =>
    phrases.some((phrase) => normalized.includes(phrase)),
  ).map(({ district, city }) => ({ district, city }));
  return { cities, districts };
}

function hasLocationConstraint(constraint: LocationConstraint): boolean {
  return constraint.cities.length > 0 || constraint.districts.length > 0;
}

// City and district compose: an explicit city is the hard boundary (a district in
// the same string only refines within it); a district-only mention requires both
// the district text and its canonical city. City matching also checks the district
// field so towns recorded under a province (Hội An in Quảng Nam) still qualify.
function matchesLocation(poi: Poi, constraint: LocationConstraint): boolean {
  const cityText = expandAliases(`${poi.city} ${poi.district}`);
  if (constraint.cities.length > 0) {
    return constraint.cities.some((city) => cityText.includes(city));
  }
  const text = poiText(poi);
  return constraint.districts.some(
    ({ district, city }) => text.includes(district) && cityText.includes(city),
  );
}

export function isAvoidedByProfile(poi: Poi, profile?: UserProfile): boolean {
  if (!profile) return false;
  const haystack = poiText(poi);
  return profile.avoid
    .map(normalizeText)
    .some((phrase) => phrase.length > 0 && haystack.includes(phrase));
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
  const queryConstraint = locationConstraintFor(query);
  const profileConstraint = locationConstraintFor(options.locationText ?? "");
  const profileLocation = normalizeText(options.profile?.currentLocation ?? "");
  const nearMe = /\b(gan toi|gan day|near me)\b/.test(expandAliases(query));
  const activeConstraint = hasLocationConstraint(queryConstraint)
    ? queryConstraint
    : profileConstraint;
  const hardConstraint = hasLocationConstraint(queryConstraint)
    ? queryConstraint
    : nearMe
      ? profileConstraint
      : { cities: [], districts: [] };
  const candidates = pois.filter((poi) => {
    if (!hasCoherentCoordinates(poi)) return false;

    if (
      options.hardCategory &&
      requestedCategories.length > 0 &&
      !categoryMatches(poi, requestedCategories)
    ) {
      return false;
    }

    if (
      options.hardLocation !== false &&
      hasLocationConstraint(hardConstraint) &&
      !matchesLocation(poi, hardConstraint)
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
    const locationMatch = hasLocationConstraint(activeConstraint)
      ? matchesLocation(poi, activeConstraint)
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
    // Pack-agnostic named-place signal: the user typed this venue's exact name.
    const normalizedName = normalizeText(poi.name);
    const nameMatch =
      normalizedName.length >= 8 && normalizedName.includes(" ") && expandAliases(query).includes(normalizedName)
        ? 0.3
        : 0;
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
      special +
      nameMatch;

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
        nameMatch: roundScore(nameMatch),
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
