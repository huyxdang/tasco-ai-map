import type { ChatMessage, Coordinates } from "./types";

// 82 synthetic conversation scenarios expanding the 8-scenario workbook benchmark
// to 90 samples. Every expectation is derived from src/data/dataset.json ground
// truth (POI categories, cities, attributes, coordinates) — never from current
// engine output. Query phrasing patterns follow the hackathon track workbooks
// (Track 1 noisy search, Track 3 conversations, Track 4 abbreviations).

export interface SyntheticExpectation {
  action: "search" | "clarify" | "plan" | "route" | "show";
  intent?: string;
  allCategoryIn?: string[];
  city?: string;
  withinKmOfPoi?: { poiId: string; km: number };
  includesPoiIds?: string[];
  excludesPoiIds?: string[];
  firstPoiId?: string;
  selectedPoiId?: string;
  attrAny?: string[];
  responseIncludes?: string[];
  constraintsInclude?: string[];
  noResults?: boolean;
  minResults?: number;
  minCategories?: number;
}

export interface SyntheticScenario {
  id: string;
  category: string;
  message: string;
  profileId?: string;
  location?: Coordinates;
  history?: ChatMessage[];
  /** Earlier user turns replayed through handleChat with carried sessionContext. */
  chain?: string[];
  notes: string;
  expect: SyntheticExpectation;
}

const CAFE = ["Quán cà phê"];
const RESTAURANT = ["Nhà hàng"];
const HOTEL = ["Khách sạn", "Khách sạn/Resort"];

export const syntheticScenarios: SyntheticScenario[] = [
  // A. Clarification-first: bare or empty requests get a question, not a guess.
  {
    id: "SYN001", category: "Clarification Dialog",
    message: "Tìm nhà hàng.",
    notes: "Bare category, no area, no criteria — ask instead of recommending.",
    expect: { action: "clarify", intent: "clarification_required", responseIncludes: ["khu vuc"] },
  },
  {
    id: "SYN002", category: "Clarification Dialog",
    message: "Tôi cần đổ xăng.",
    notes: "Bare gas-station request without any area — ask for the area.",
    expect: { action: "clarify", intent: "clarification_required", responseIncludes: ["khu vuc"] },
  },
  {
    id: "SYN003", category: "Clarification Dialog",
    message: "Tìm quán cà phê.",
    notes: "Bare café request — ask for area/criteria.",
    expect: { action: "clarify", intent: "clarification_required", responseIncludes: ["quan ca phe", "khu vuc"] },
  },
  {
    id: "SYN004", category: "Clarification Dialog",
    message: "Tìm khách sạn.",
    notes: "Bare hotel request — ask for area/criteria.",
    expect: { action: "clarify", intent: "clarification_required", responseIncludes: ["khu vuc"] },
  },
  {
    id: "SYN005", category: "Clarification Dialog",
    message: "Có gì hay không?",
    notes: "No category, no location — ask for both.",
    expect: { action: "clarify", intent: "clarification_required", responseIncludes: ["loai dia diem"] },
  },
  {
    id: "SYN006", category: "Clarification Dialog",
    message: "Ở Quận 1 có gì?",
    notes: "Location without category — ask what type of place.",
    expect: { action: "clarify", intent: "clarification_required", responseIncludes: ["loai dia diem"] },
  },
  {
    id: "SYN007", category: "Clarification Dialog",
    message: "Gợi ý giúp mình với.",
    notes: "Empty recommendation ask — clarify, never dump venues.",
    expect: { action: "clarify", intent: "clarification_required" },
  },
  {
    id: "SYN008", category: "Clarification Dialog",
    message: "Tìm chỗ ăn.",
    notes: "Vague 'somewhere to eat' — clarify; 'chỗ' must not be parsed as 'chợ'.",
    expect: { action: "clarify", intent: "clarification_required" },
  },
  {
    id: "SYN009", category: "Clarification Dialog",
    message: "Ở Quận 1, cho gia đình.",
    history: [
      { role: "user", content: "Tìm nhà hàng." },
      { role: "assistant", content: "Bạn muốn tìm nhà hàng ở khu vực nào, và có tiêu chí gì thêm không?" },
    ],
    notes: "Answering the clarifying question yields grounded family restaurants in Q1.",
    expect: { action: "search", allCategoryIn: RESTAURANT, city: "TP.HCM", attrAny: ["gia đình"], minResults: 1 },
  },
  {
    id: "SYN010", category: "Clarification Dialog",
    chain: ["Tìm quán cà phê."],
    message: "Gần Hồ Gươm, yên tĩnh.",
    notes: "Clarify → answer flow: cafés within 5km of Hồ Hoàn Kiếm only.",
    expect: { action: "search", allCategoryIn: CAFE, withinKmOfPoi: { poiId: "POI030", km: 5 }, includesPoiIds: ["POI010"], minResults: 1 },
  },

  // B. Entity ambiguity (existing behavior, now regression-locked at scale).
  {
    id: "SYN011", category: "Clarification Dialog",
    message: "Đưa tôi đến Galaxy.",
    notes: "Ambiguous brand — offer cinema vs hotel, do not pick.",
    expect: { action: "clarify", intent: "clarification_required", includesPoiIds: ["POI008", "POI009"] },
  },
  {
    id: "SYN012", category: "Clarification Dialog",
    message: "Vincom.",
    notes: "Ambiguous Vincom — Đồng Khởi vs Bà Triệu.",
    expect: { action: "clarify", intent: "clarification_required", includesPoiIds: ["POI007", "POI016"] },
  },
  {
    id: "SYN013", category: "Clarification Dialog",
    message: "Dẫn tôi đến sân bay.",
    notes: "Which airport — TSN or Nội Bài.",
    expect: { action: "clarify", intent: "clarification_required", includesPoiIds: ["POI026", "POI027"] },
  },
  {
    id: "SYN014", category: "Clarification Dialog",
    message: "Big C gần tôi.",
    notes: "Chain with many branches and no dataset entry — ask for the area.",
    expect: { action: "clarify", intent: "clarification_required", responseIncludes: ["thanh pho"] },
  },
  {
    id: "SYN015", category: "Clarification Dialog",
    chain: ["Đưa tôi đến Galaxy."],
    message: "Rạp phim Nguyễn Du nhé",
    location: { lat: 10.775, lon: 106.7 },
    notes: "Clarification resolution routes to the chosen cinema.",
    expect: { action: "route", intent: "navigation", selectedPoiId: "POI008" },
  },

  // C. Category + location search across the dataset's cities.
  {
    id: "SYN016", category: "Conversational Search",
    message: "Quán cà phê yên tĩnh ở Hội An",
    notes: "Cafés in Hội An with quiet evidence (POI036/POI055).",
    expect: { action: "search", allCategoryIn: CAFE, includesPoiIds: ["POI036"], attrAny: ["yên tĩnh"], minResults: 1 },
  },
  {
    id: "SYN017", category: "Conversational Search",
    message: "Quán cà phê view đẹp ở Đà Lạt",
    notes: "Đà Lạt cafés only.",
    expect: { action: "search", allCategoryIn: CAFE, city: "Đà Lạt", attrAny: ["view đẹp"], minResults: 1 },
  },
  {
    id: "SYN018", category: "Conversational Search",
    message: "Cà phê để làm việc ở Quận 1",
    notes: "Work cafés in Q1 — The Workshop and Trung Nguyên.",
    expect: { action: "search", allCategoryIn: CAFE, city: "TP.HCM", includesPoiIds: ["POI001", "POI017"], minResults: 2 },
  },
  {
    id: "SYN019", category: "Conversational Search",
    message: "Nhà hàng cho gia đình ở Quận 1",
    notes: "Family restaurants in Q1.",
    expect: { action: "search", allCategoryIn: RESTAURANT, city: "TP.HCM", attrAny: ["gia đình"], minResults: 1 },
  },
  {
    id: "SYN020", category: "Conversational Search",
    message: "Khách sạn gần biển có hồ bơi ở Đà Nẵng",
    notes: "Beach hotels in Đà Nẵng; Sala has the pool.",
    expect: { action: "search", allCategoryIn: HOTEL, city: "Đà Nẵng", includesPoiIds: ["POI013"], attrAny: ["hồ bơi"], minResults: 1 },
  },
  {
    id: "SYN021", category: "Conversational Search",
    message: "Khách sạn 5 sao có hồ bơi ở Hà Nội",
    notes: "Lotte is the 5-star pool hotel in Hà Nội.",
    expect: { action: "search", allCategoryIn: HOTEL, city: "Hà Nội", includesPoiIds: ["POI012"], minResults: 1 },
  },
  {
    id: "SYN022", category: "Conversational Search",
    message: "Công viên cho trẻ em ở Đà Nẵng",
    notes: "Đà Nẵng parks; 29/3 park has the kids evidence.",
    expect: { action: "search", allCategoryIn: ["Công viên"], city: "Đà Nẵng", includesPoiIds: ["POI028"], attrAny: ["trẻ em"], minResults: 1 },
  },
  {
    id: "SYN023", category: "Conversational Search",
    message: "Rạp chiếu phim ở Hà Nội",
    notes: "Only CGV Vincom Bà Triệu exists in Hà Nội.",
    expect: { action: "search", allCategoryIn: ["Rạp chiếu phim"], city: "Hà Nội", includesPoiIds: ["POI016"], minResults: 1 },
  },
  {
    id: "SYN024", category: "Conversational Search",
    message: "Trung tâm thương mại có bãi đỗ xe ở Quận 1",
    notes: "Vincom Đồng Khởi is the Q1 mall with parking.",
    expect: { action: "search", allCategoryIn: ["Trung tâm thương mại"], includesPoiIds: ["POI007"], attrAny: ["bãi đỗ xe"], minResults: 1 },
  },
  {
    id: "SYN025", category: "Conversational Search",
    message: "Bệnh viện cấp cứu ở Đống Đa, Hà Nội",
    notes: "Composite district+city: Bạch Mai only; no Đà Nẵng Minh Tâm leakage.",
    expect: { action: "search", allCategoryIn: ["Bệnh viện"], city: "Hà Nội", includesPoiIds: ["POI006"], minResults: 1 },
  },
  {
    id: "SYN026", category: "Conversational Search",
    message: "ATM gần Chợ Bến Thành",
    notes: "Anchor query: ATMs near the market; the market itself is not a result.",
    expect: { action: "search", allCategoryIn: ["ATM"], includesPoiIds: ["POI025"], excludesPoiIds: ["POI003"], minResults: 1 },
  },
  {
    id: "SYN027", category: "Conversational Search",
    message: "Chợ Bến Thành có gì hay?",
    notes: "Named landmark lookup stays grounded on the POI.",
    expect: { action: "search", includesPoiIds: ["POI003"], minResults: 1 },
  },
  {
    id: "SYN028", category: "Conversational Search",
    message: "Quán cà phê mở cửa khuya ở Sài Gòn",
    notes: "Late-night café in TP.HCM exists (Cafe Mộc 69) — no false no-match.",
    expect: { action: "search", allCategoryIn: CAFE, city: "TP.HCM", includesPoiIds: ["POI069"], constraintsInclude: ["khuya"], minResults: 1 },
  },

  // D. Personalized search per user profile.
  {
    id: "SYN029", category: "Personalized Search",
    profileId: "U001",
    message: "Tìm chỗ yên tĩnh để làm việc chiều nay",
    notes: "Office worker gets the work cafés.",
    expect: { action: "search", includesPoiIds: ["POI001"], attrAny: ["làm việc"], minResults: 1 },
  },
  {
    id: "SYN030", category: "Personalized Search",
    profileId: "U002",
    message: "Khu vui chơi cho trẻ em gần đây",
    notes: "Hà Nội family profile: the only Hà Nội KidZone, city composed correctly.",
    expect: { action: "search", allCategoryIn: ["Khu vui chơi"], city: "Hà Nội", includesPoiIds: ["POI058"], minResults: 1 },
  },
  {
    id: "SYN031", category: "Personalized Search",
    profileId: "U003",
    message: "Khách sạn gần biển gần đây",
    notes: "Đà Nẵng tourist gets beach hotels in Đà Nẵng.",
    expect: { action: "search", allCategoryIn: HOTEL, city: "Đà Nẵng", includesPoiIds: ["POI013"], attrAny: ["gần biển"], minResults: 1 },
  },
  {
    id: "SYN032", category: "Personalized Search",
    profileId: "U005",
    message: "Tối nay hẹn hò ở đâu được?",
    notes: "Couple profile: date venues with romantic evidence.",
    expect: { action: "search", includesPoiIds: ["POI005"], attrAny: ["hẹn hò"], minResults: 2 },
  },
  {
    id: "SYN033", category: "Personalized Search",
    profileId: "U007",
    message: "Quán cà phê giá rẻ có wifi gần đây",
    notes: "Student stays in Hà Nội; premium Cafe Mộc 60 excluded by avoid list.",
    expect: { action: "search", allCategoryIn: CAFE, city: "Hà Nội", includesPoiIds: ["POI010"], excludesPoiIds: ["POI060"], minResults: 1 },
  },
  {
    id: "SYN034", category: "Personalized Search",
    profileId: "U008",
    message: "Cây xăng có toilet gần đây",
    notes: "Driver in TP.HCM gets the Petrolimex station.",
    expect: { action: "search", allCategoryIn: ["Trạm xăng"], includesPoiIds: ["POI024"], attrAny: ["toilet"], minResults: 1 },
  },
  {
    id: "SYN035", category: "Personalized Search",
    profileId: "U004",
    message: "Khách sạn business gần đây",
    notes: "Business traveller in Hà Nội gets Lotte.",
    expect: { action: "search", allCategoryIn: HOTEL, city: "Hà Nội", includesPoiIds: ["POI012"], minResults: 1 },
  },
  {
    id: "SYN036", category: "Personalized Search",
    profileId: "U005",
    message: "Rooftop có view đẹp tối nay",
    notes: "Explicit rooftop request: Bar/Rooftop only — Chill Skybar.",
    expect: { action: "search", allCategoryIn: ["Bar/Rooftop"], includesPoiIds: ["POI005"], minResults: 1 },
  },

  // E. Multi-turn context and constraint persistence.
  {
    id: "SYN037", category: "Multi-turn Search",
    chain: ["Tìm khách sạn."],
    message: "Ở Đà Nẵng, gần biển.",
    notes: "Hotel context + beach filter after clarification.",
    expect: { action: "search", allCategoryIn: HOTEL, city: "Đà Nẵng", attrAny: ["gần biển"], minResults: 1 },
  },
  {
    id: "SYN038", category: "Multi-turn Search",
    chain: ["Tìm quán cà phê."],
    message: "Ở Đà Lạt, giá hợp lý.",
    notes: "Café context + city + budget attribute persists.",
    expect: { action: "search", allCategoryIn: CAFE, city: "Đà Lạt", constraintsInclude: ["gia hop ly"], minResults: 1 },
  },
  {
    id: "SYN039", category: "Multi-turn Search",
    chain: ["Tìm nhà hàng."],
    message: "Món Ý, dưới 500k, gần trung tâm.",
    notes: "The workbook S004 flow with the clarify turn actually executed.",
    expect: { action: "search", firstPoiId: "POI004", allCategoryIn: RESTAURANT, constraintsInclude: ["500k"], minResults: 1 },
  },
  {
    id: "SYN040", category: "Multi-turn Search",
    chain: ["Quán cà phê yên tĩnh ở Hà Nội"],
    message: "Chỗ nào gần Hồ Gươm hơn?",
    notes: "Follow-up narrows to the lake anchor; quiet constraint retained.",
    expect: { action: "search", allCategoryIn: CAFE, withinKmOfPoi: { poiId: "POI030", km: 5 }, includesPoiIds: ["POI010"], constraintsInclude: ["yen tinh"], minResults: 1 },
  },
  {
    id: "SYN041", category: "Multi-turn Search",
    chain: ["Tìm nhà hàng ở Hà Nội."],
    message: "Có món phở nổi tiếng không?",
    notes: "Cuisine refinement lands on Phở Thìn first.",
    expect: { action: "search", firstPoiId: "POI018", allCategoryIn: RESTAURANT, city: "Hà Nội", minResults: 1 },
  },
  {
    id: "SYN042", category: "Multi-turn Search",
    chain: ["Nhà hàng dưới 500k ở Quận 1"],
    message: "Chỗ nào phù hợp hẹn hò hơn?",
    notes: "Budget survives a preference-refinement turn.",
    expect: { action: "search", allCategoryIn: RESTAURANT, constraintsInclude: ["500k"], attrAny: ["hẹn hò"], minResults: 1 },
  },
  {
    id: "SYN043", category: "Multi-turn Search",
    message: "Khách sạn khoảng một triệu ở Nha Trang",
    notes: "Word-number budget is captured; Nha Trang hotels only.",
    expect: { action: "search", allCategoryIn: HOTEL, city: "Nha Trang", constraintsInclude: ["mot trieu"], minResults: 1 },
  },
  {
    id: "SYN044", category: "Multi-turn Search",
    chain: ["Có gì hay không?"],
    message: "Quán cà phê ở Hội An.",
    notes: "Vague start → clarify → concrete answer works.",
    expect: { action: "search", allCategoryIn: CAFE, includesPoiIds: ["POI036"], minResults: 1 },
  },

  // F. Navigation: destination requests plan and start navigation (demo capability 1).
  {
    id: "SYN045", category: "Navigation Assistance",
    message: "Đưa tôi đến Chợ Bến Thành.",
    location: { lat: 10.775, lon: 106.7 },
    notes: "Destination + GPS → immediate route.",
    expect: { action: "route", intent: "navigation", selectedPoiId: "POI003" },
  },
  {
    id: "SYN046", category: "Navigation Assistance",
    message: "Chỉ đường đến Phở Thìn từ Hồ Gươm.",
    notes: "Named origin and destination route.",
    expect: { action: "route", intent: "navigation", selectedPoiId: "POI018" },
  },
  {
    id: "SYN047", category: "Navigation Assistance",
    message: "Từ Hồ Gươm đến Bún Chả Hương Liên đi thế nào?",
    notes: "from→to phrasing resolves by POI name.",
    expect: { action: "route", intent: "navigation", selectedPoiId: "POI019" },
  },
  {
    id: "SYN048", category: "Navigation Assistance",
    message: "Take me to Ben Thanh Market.",
    location: { lat: 10.775, lon: 106.7 },
    notes: "English destination request still routes (demo behavior).",
    expect: { action: "route", intent: "navigation", selectedPoiId: "POI003" },
  },
  {
    id: "SYN049", category: "Navigation Assistance",
    message: "Đưa tôi đến Sân bay Tân Sơn Nhất.",
    location: { lat: 10.776, lon: 106.7 },
    notes: "Airport as explicit destination is allowed (it is not a food result).",
    expect: { action: "route", intent: "navigation", selectedPoiId: "POI026" },
  },
  {
    id: "SYN050", category: "Navigation Assistance",
    message: "Đưa tôi đến Chợ Bến Thành.",
    notes: "Destination without GPS: show the place and ask for a start point.",
    expect: { action: "show", intent: "navigation", selectedPoiId: "POI003", responseIncludes: ["vi tri"] },
  },
  {
    id: "SYN051", category: "Navigation Assistance",
    message: "Đến Lotte Hotel từ Hồ Gươm mất bao lâu?",
    notes: "Duration question is a navigation request.",
    expect: { action: "route", intent: "navigation", selectedPoiId: "POI012" },
  },
  {
    id: "SYN052", category: "Navigation Assistance",
    message: "Chỉ đường tới Bệnh viện Bạch Mai",
    location: { lat: 21.0285, lon: 105.8542 },
    notes: "Non-alias POI destination resolves by name.",
    expect: { action: "route", intent: "navigation", selectedPoiId: "POI006" },
  },

  // G. Honest no-match: coverage gaps are disclosed, never papered over.
  {
    id: "SYN053", category: "Honest No-match",
    message: "Nhà hàng ở Đà Lạt",
    notes: "Dataset has no Đà Lạt restaurants.",
    expect: { action: "search", noResults: true, responseIncludes: ["chua co", "nha hang", "da lat"] },
  },
  {
    id: "SYN054", category: "Honest No-match",
    message: "Rooftop bar ở Hà Nội",
    notes: "The only rooftop bar is in TP.HCM.",
    expect: { action: "search", noResults: true, responseIncludes: ["chua co", "ha noi"] },
  },
  {
    id: "SYN055", category: "Honest No-match",
    message: "Trạm xăng ở Hà Nội",
    notes: "Only gas station is in TP.HCM.",
    expect: { action: "search", noResults: true, responseIncludes: ["chua co", "tram xang", "ha noi"] },
  },
  {
    id: "SYN056", category: "Honest No-match",
    message: "Rạp chiếu phim ở Đà Nẵng",
    notes: "No cinema in Đà Nẵng.",
    expect: { action: "search", noResults: true, responseIncludes: ["chua co", "da nang"] },
  },
  {
    id: "SYN057", category: "Honest No-match",
    message: "ATM ở Hà Nội",
    notes: "No Hà Nội ATM in the dataset.",
    expect: { action: "search", noResults: true, responseIncludes: ["chua co", "atm", "ha noi"] },
  },
  {
    id: "SYN058", category: "Honest No-match",
    message: "Quán ăn khuya gần sân bay tân sơn nhất",
    notes: "S008 twin without a profile: same honest gap.",
    expect: { action: "search", noResults: true, responseIncludes: ["chua co", "nha hang", "tan son nhat", "khuya"] },
  },
  {
    id: "SYN059", category: "Honest No-match",
    message: "Nhà hàng ở Hội An",
    notes: "No Hội An restaurants.",
    expect: { action: "search", noResults: true, responseIncludes: ["chua co", "nha hang", "hoi an"] },
  },
  {
    id: "SYN060", category: "Honest No-match",
    message: "Khách sạn ở Đà Lạt",
    notes: "No Đà Lạt hotels in the dataset.",
    expect: { action: "search", noResults: true, responseIncludes: ["chua co", "da lat"] },
  },

  // H. Voice-like and messy input (Track 1/4 patterns).
  {
    id: "SYN061", category: "Voice-like Query",
    message: "kiem quan ca phe yen tinh gan ho guom",
    notes: "No diacritics, spoken form: cafés near the lake.",
    expect: { action: "search", allCategoryIn: CAFE, withinKmOfPoi: { poiId: "POI030", km: 5 }, includesPoiIds: ["POI010"], minResults: 1 },
  },
  {
    id: "SYN062", category: "Voice-like Query",
    message: "quan an re o ha noi cho sinh vien",
    notes: "Cheap eats in Hà Nội, accentless.",
    expect: { action: "search", allCategoryIn: RESTAURANT, city: "Hà Nội", minResults: 1 },
  },
  {
    id: "SYN063", category: "Voice-like Query",
    message: "ks gan bien o da nang",
    notes: "Abbreviation 'ks' expands to khách sạn (Track 4 dictionary).",
    expect: { action: "search", allCategoryIn: HOTEL, city: "Đà Nẵng", includesPoiIds: ["POI013"], attrAny: ["gần biển"], minResults: 1 },
  },
  {
    id: "SYN064", category: "Voice-like Query",
    message: "coffee gan ben thanh market",
    notes: "Mixed English near a named landmark: cafés around Bến Thành.",
    expect: { action: "search", allCategoryIn: CAFE, includesPoiIds: ["POI001"], excludesPoiIds: ["POI003"], city: "TP.HCM", minResults: 1 },
  },
  {
    id: "SYN065", category: "Voice-like Query",
    message: "tim ks o q1",
    notes: "Double abbreviation: hotels in Quận 1.",
    expect: { action: "search", allCategoryIn: HOTEL, includesPoiIds: ["POI071"], city: "TP.HCM", minResults: 1 },
  },
  {
    id: "SYN066", category: "Voice-like Query",
    message: "quan cafe lam viec co wifi gan tsn",
    notes: "No café within 5km of TSN — honest gap, anchor named.",
    expect: { action: "search", noResults: true, responseIncludes: ["chua co", "tan son nhat"] },
  },
  {
    id: "SYN067", category: "Voice-like Query",
    message: "an toi o dau ngon o quan 1",
    notes: "Spoken dinner query: Q1 restaurants only.",
    expect: { action: "search", allCategoryIn: RESTAURANT, city: "TP.HCM", minResults: 1 },
  },
  {
    id: "SYN068", category: "Voice-like Query",
    message: "cho nao chup hinh dep o da nang",
    notes: "Photo-spot discovery in Đà Nẵng includes the Panorama viewpoint.",
    expect: { action: "search", city: "Đà Nẵng", includesPoiIds: ["POI044"], minResults: 1 },
  },

  // I. Planning and multi-hop synthesis (demo capability 2).
  {
    id: "SYN069", category: "Planning Assistance",
    message: "I'm in Da Nang with a few friends. Where should we go?",
    notes: "English group-outing synthesis: grounded Đà Nẵng suggestions.",
    expect: { action: "search", city: "Đà Nẵng", minResults: 2 },
  },
  {
    id: "SYN070", category: "Planning Assistance",
    message: "Tôi có 1 ngày ở Đà Lạt, nên đi đâu?",
    notes: "Day plan stays inside Đà Lạt with venue diversity.",
    expect: { action: "plan", intent: "planning", city: "Đà Lạt", minResults: 2, minCategories: 2 },
  },
  {
    id: "SYN071", category: "Planning Assistance",
    message: "Cuối tuần này ở Hà Nội nên làm gì?",
    notes: "Weekend plan bound to Hà Nội.",
    expect: { action: "plan", intent: "planning", city: "Hà Nội", minResults: 2, minCategories: 2 },
  },
  {
    id: "SYN072", category: "Planning Assistance",
    message: "Lên lịch trình 1 ngày ở Hội An giúp mình.",
    notes: "Hội An plan includes the Quảng Nam resort via town matching.",
    expect: { action: "plan", intent: "planning", minResults: 2, minCategories: 2 },
  },
  {
    id: "SYN073", category: "Planning Assistance",
    message: "Tôi có 2 ngày ở Nha Trang, đi đâu?",
    notes: "Nha Trang plan uses only Nha Trang POIs.",
    expect: { action: "plan", intent: "planning", city: "Nha Trang", minResults: 2, minCategories: 2 },
  },
  {
    id: "SYN074", category: "Planning Assistance",
    message: "Đi chơi với bạn bè ở Sài Gòn thì đi đâu?",
    notes: "Group outing in TP.HCM: qualified enough to answer directly.",
    expect: { action: "search", city: "TP.HCM", minResults: 2 },
  },

  // J. Attribute and budget constraints.
  {
    id: "SYN075", category: "Conversational Search",
    message: "Quán cà phê có wifi và ổ cắm ở Quận 1",
    notes: "Amenity search hits The Workshop.",
    expect: { action: "search", allCategoryIn: CAFE, includesPoiIds: ["POI001"], constraintsInclude: ["wifi"], minResults: 1 },
  },
  {
    id: "SYN076", category: "Conversational Search",
    message: "Nhà hàng đặt bàn được ở Quận 1",
    notes: "Bookable Q1 restaurant: Pizza 4P's has đặt bàn.",
    expect: { action: "search", allCategoryIn: RESTAURANT, includesPoiIds: ["POI004"], attrAny: ["đặt bàn"], minResults: 1 },
  },
  {
    id: "SYN077", category: "Conversational Search",
    message: "Khách sạn cho gia đình có buffet sáng ở Đà Nẵng",
    notes: "Sala matches family + breakfast buffet.",
    expect: { action: "search", allCategoryIn: HOTEL, city: "Đà Nẵng", includesPoiIds: ["POI013"], minResults: 1 },
  },
  {
    id: "SYN078", category: "Conversational Search",
    message: "Chỗ nào yên tĩnh đọc sách ở Quận 1?",
    notes: "Book street is the quiet reading answer.",
    expect: { action: "search", includesPoiIds: ["POI022"], attrAny: ["yên tĩnh"], minResults: 1 },
  },
  {
    id: "SYN079", category: "Conversational Search",
    message: "Phở ngon ở Hà Nội dưới 100k",
    notes: "Dish query with numeric budget captured.",
    expect: { action: "search", includesPoiIds: ["POI018"], constraintsInclude: ["100k"], city: "Hà Nội", minResults: 1 },
  },
  {
    id: "SYN080", category: "Conversational Search",
    message: "Bún chả nổi tiếng ở Hà Nội",
    notes: "Bún Chả Hương Liên is the grounded answer.",
    expect: { action: "search", includesPoiIds: ["POI019"], city: "Hà Nội", minResults: 1 },
  },
  {
    id: "SYN081", category: "Conversational Search",
    message: "Khu vui chơi giá hợp lý cho trẻ em ở Đà Nẵng",
    notes: "Budget-friendly Đà Nẵng KidZone.",
    expect: { action: "search", allCategoryIn: ["Khu vui chơi"], city: "Đà Nẵng", includesPoiIds: ["POI047"], attrAny: ["giá hợp lý"], minResults: 1 },
  },
  {
    id: "SYN082", category: "Conversational Search",
    message: "Khách sạn giá hợp lý ở Hà Nội",
    notes: "Sao Việt 34 carries the budget attribute in Hà Nội.",
    expect: { action: "search", allCategoryIn: HOTEL, city: "Hà Nội", includesPoiIds: ["POI034"], attrAny: ["giá hợp lý"], minResults: 1 },
  },
];
