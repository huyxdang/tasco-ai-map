import { isCoordinates } from "./geo";
import { buildRoutes } from "./routing";
import type {
  ChatResponse,
  Coordinates,
  Journey,
  JourneyAction,
  Poi,
  Recommendation,
  RouteResult,
} from "./types";

/**
 * Recording-safe demo contract.
 *
 * This path intentionally bypasses BigSet and /api/chat. Real microphone/STT
 * input can advance the locked flow only through the narrow classifier below;
 * every result remains deterministic. TTS is optional, and every line is also
 * returned as visible copy so missing voice credentials never block rehearsal.
 */
export const SUBMISSION_DEMO_POI_IDS = ["POI004", "POI017"] as const;

export const SUBMISSION_DEMO_FALLBACK_ORIGIN: Readonly<Coordinates> = {
  lat: 10.7758,
  lon: 106.7002,
};

export const SUBMISSION_DEMO_REQUEST =
  "Tìm chỗ ăn tối cho 3 người ở Quận 1, sau đó đến một quán cà phê yên tĩnh để làm việc.";

export const SUBMISSION_DEMO_CUISINE_ANSWER = "Món Ý.";
export const SUBMISSION_DEMO_TIME_ANSWER = "Khoảng 7 giờ tối.";
export const SUBMISSION_DEMO_CONFIRMATION_ANSWER = "Chốt đi.";

export type SubmissionDemoVoiceStage =
  | "request"
  | "cuisine"
  | "time"
  | "confirmation"
  | "complete";

export type SubmissionDemoVoiceAction =
  | {
      accepted: true;
      stage: "request";
      nextStage: "cuisine";
    }
  | {
      accepted: true;
      stage: "cuisine";
      nextStage: "time";
    }
  | {
      accepted: true;
      stage: "time";
      nextStage: "confirmation";
    }
  | {
      accepted: true;
      stage: "confirmation";
      nextStage: "complete";
    }
  | {
      accepted: false;
      stage: SubmissionDemoVoiceStage;
      nextStage: SubmissionDemoVoiceStage;
    };

function normalizeSubmissionSpeech(text: string): string {
  return text
    .toLocaleLowerCase("vi")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function matchesLockedRequest(text: string): boolean {
  const normalized = normalizeSubmissionSpeech(text);
  if (!normalized || /\b(?:san bay|airport|tan son nhat|noi bai)\b/.test(normalized)) return false;

  const hasThreePeople =
    /\b(?:3|ba)\s+(?:nguoi|dua|ban)\b/.test(normalized) ||
    /\b(?:nhom|chung minh|chung toi)\s+(?:3|ba)\b/.test(normalized);
  const hasDistrictOne =
    /\b(?:quan|q)\s*(?:1|mot)\b/.test(normalized) ||
    /\bdistrict\s*(?:1|one)\b/.test(normalized);
  const hasDinner = /\b(?:an toi|bua toi)\b/.test(normalized);
  const hasCafe = /\b(?:ca\s*phe|cafe|coffee)\b/.test(normalized);

  return hasThreePeople && hasDistrictOne && hasDinner && hasCafe;
}

function matchesLockedItalianChoice(text: string): boolean {
  const normalized = normalizeSubmissionSpeech(text);
  if (!normalized) return false;
  if (/\bkhong\b.{0,24}\b(?:pizza|mon\s+y|do\s+y|italian|italia|italy)\b/.test(normalized)) {
    return false;
  }

  return (
    normalized === "y" ||
    /\b(?:mon|do)\s+y\b/.test(normalized) ||
    /\b(?:italian|italia|italy|pizza)\b/.test(normalized)
  );
}

function matchesLockedDinnerTime(text: string): boolean {
  const normalized = normalizeSubmissionSpeech(text);
  if (!normalized || /\b(?:am|sang|8|20|21)\b/.test(normalized)) return false;

  const sevenPm = /\b(?:7|bay)(?:\s+00)?\s*(?:pm|h|gio(?:\s+toi)?)\b/.test(normalized);
  const nineteen = /\b(?:19(?:\s+00)?|muoi\s+chin)\s*(?:h|gio)?\b/.test(normalized);
  return sevenPm || nineteen;
}

function matchesLockedConfirmation(text: string): boolean {
  const normalized = normalizeSubmissionSpeech(text);
  if (!normalized) return false;

  // A negative always wins, including mixed transcripts such as
  // "không, đổi đi" or "no, okay".
  if (/\b(?:khong|no|chua|doi)\b/.test(normalized)) return false;

  return /\b(?:chot(?:\s+di)?|duoc|on|ok(?:ay)?|dong\s+y|yes|yep|yeah|sure|cool|good|sounds\s+good|trien|lam\s+di|let\s+s\s+do\s+it|chuan|chinh\s+xac)\b/.test(
    normalized,
  );
}

/**
 * Classifies one committed transcript without consulting live NLU or accepting
 * arbitrary destinations. Rejected input never changes the current stage.
 */
export function classifySubmissionDemoVoice(
  stage: SubmissionDemoVoiceStage,
  text: string,
): SubmissionDemoVoiceAction {
  if (stage === "request" && matchesLockedRequest(text)) {
    return { accepted: true, stage, nextStage: "cuisine" };
  }
  if (stage === "cuisine" && matchesLockedItalianChoice(text)) {
    return { accepted: true, stage, nextStage: "time" };
  }
  if (stage === "time" && matchesLockedDinnerTime(text)) {
    return { accepted: true, stage, nextStage: "confirmation" };
  }
  if (stage === "confirmation" && matchesLockedConfirmation(text)) {
    return { accepted: true, stage, nextStage: "complete" };
  }
  return { accepted: false, stage, nextStage: stage };
}

export type SubmissionDemoStage =
  | "request"
  | "clarification"
  | "cuisine"
  | "time"
  | "confirmation"
  | "booking"
  | "confirmed"
  | "restaurant"
  | "cafe"
  | "plan";

export interface SubmissionDemoTurn {
  stage: SubmissionDemoStage;
  role: "user" | "assistant";
  text: string;
}

export type SubmissionDemoOriginSource = "device" | "simulated";

export interface SubmissionDemoOrigin {
  coordinates: Coordinates;
  source: SubmissionDemoOriginSource;
  disclosure: string;
}

export interface SubmissionDemoFlow {
  origin: SubmissionDemoOrigin;
  stops: [Poi, Poi];
  route: RouteResult;
  turns: SubmissionDemoTurn[];
  clarificationResponse: ChatResponse;
  timePrompt: string;
  confirmationPrompt: string;
  bookingStartedResponse: string;
  bookingConfirmedResponse: string;
  response: ChatResponse;
  narration: {
    location: string;
    plan: string;
    reservations: string;
    driving: string;
  };
}

function demoAction(
  overrides: Pick<
    JourneyAction,
    | "id"
    | "poiId"
    | "kind"
    | "miniApp"
    | "cta"
    | "reason"
    | "originalPriceVnd"
    | "discountVnd"
    | "finalPriceVnd"
    | "rewardPoints"
    | "status"
  > & Partial<Pick<JourneyAction, "requestedCategory" | "requestedCuisine">>,
): JourneyAction {
  return { ...overrides, simulated: true };
}

function buildDemoJourney(pizza: Poi, coffee: Poi): Journey {
  const actions: JourneyAction[] = [
    demoAction({
      id: "act_demo_pizza_table_3",
      poiId: pizza.id,
      kind: "dining",
      requestedCategory: "restaurant",
      requestedCuisine: "italian",
      miniApp: "TASCO Dining",
      cta: "Đã giữ bàn cho 3 người · 19:00 ngày 12/7",
      reason: "Bàn cho 3 người tại Pizza 4P's đã được xác nhận lúc 19:00 ngày 12 tháng 7.",
      originalPriceVnd: 780_000,
      discountVnd: 0,
      finalPriceVnd: 780_000,
      rewardPoints: 0,
      status: "confirmed",
    }),
    demoAction({
      id: "act_demo_pizza_parking",
      poiId: pizza.id,
      kind: "parking",
      miniApp: "VETC Parking",
      cta: "Xác nhận 45.000 ₫ bằng Ví VETC",
      reason: "Giữ chỗ đỗ xe 2 giờ tại Pizza 4P's; ưu đãi VETC giảm 15.000 ₫ từ 60.000 ₫.",
      originalPriceVnd: 60_000,
      discountVnd: 15_000,
      finalPriceVnd: 45_000,
      rewardPoints: 0,
      status: "ready",
    }),
    demoAction({
      id: "act_demo_trung_nguyen",
      poiId: coffee.id,
      kind: "dining",
      requestedCategory: "cafe",
      miniApp: "TASCO Dining",
      cta: "Thanh toán tại quán",
      reason: "Trung Nguyên dự kiến khá thoáng lúc 19:00 nên không cần đặt chỗ trước; thanh toán tại quán.",
      originalPriceVnd: 150_000,
      discountVnd: 0,
      finalPriceVnd: 150_000,
      rewardPoints: 0,
      status: "ready",
    }),
  ];
  const originalTotalVnd = actions.reduce((sum, action) => sum + action.originalPriceVnd, 0);
  const discountTotalVnd = actions.reduce((sum, action) => sum + action.discountVnd, 0);
  const totalVnd = actions.reduce((sum, action) => sum + action.finalPriceVnd, 0);

  return {
    id: "jny_submission_pizza_trung_nguyen",
    title: "Ăn tối món Ý rồi làm việc tại quán cà phê",
    actions,
    originalTotalVnd,
    discountTotalVnd,
    totalVnd,
    savingsVnd: discountTotalVnd,
    rewardPoints: 0,
    walletLabel: "Ví VETC",
    simulated: true,
    revision: {
      number: 0,
      outcome: "composed",
      changedActionIds: [],
      message: "Đã ghép hai điểm dừng và dịch vụ đỗ xe tại Pizza 4P's.",
    },
  };
}

function recommendation(poi: Poi, score: number, reason: string): Recommendation {
  return {
    poi,
    score,
    reason,
    scoreBreakdown: {
      categoryMatch: 0.35,
      locationMatch: 0.25,
      preferenceMatch: 0.2,
      quality: 0.15,
    },
    rewardPoints: 0,
  };
}

export function resolveSubmissionDemoOrigin(candidate?: unknown): SubmissionDemoOrigin {
  if (isCoordinates(candidate)) {
    return {
      coordinates: candidate,
      source: "device",
      disclosure: "Vị trí hiện tại từ thiết bị · chỉ dùng trong phiên này.",
    };
  }

  return {
    coordinates: { ...SUBMISSION_DEMO_FALLBACK_ORIGIN },
    source: "simulated",
    disclosure: "Điểm xuất phát mặc định tại Quận 1.",
  };
}

export function buildSubmissionDemoFlow(
  candidates: readonly Poi[],
  currentLocation?: unknown,
): SubmissionDemoFlow {
  const poisById = new Map(candidates.map((poi) => [poi.id, poi]));
  const stops = SUBMISSION_DEMO_POI_IDS.map((id) => poisById.get(id));
  const missingIds = SUBMISSION_DEMO_POI_IDS.filter((_, index) => !stops[index]);

  if (missingIds.length > 0) {
    throw new Error(`Submission demo is missing required POIs: ${missingIds.join(", ")}`);
  }

  const orderedStops = stops as [Poi, Poi];
  const [pizza, coffee] = orderedStops;
  const origin = resolveSubmissionDemoOrigin(currentLocation);
  const route = buildRoutes({
    locations: [origin.coordinates, ...orderedStops.map((poi) => poi.coordinates)],
    mode: "driving",
    alternates: false,
  }).routes[0];
  const journey = buildDemoJourney(pizza, coffee);
  const recommendations = [
    recommendation(
      pizza,
      0.99,
      "Khớp món Ý, bữa tối cho 3 người và vị trí Quận 1.",
    ),
    recommendation(
      coffee,
      0.96,
      "Quán cà phê tại Quận 1 phù hợp điểm dừng yên tĩnh để làm việc.",
    ),
  ];
  const timePrompt = `Mình đề xuất ${pizza.name} cho bữa tối, sau đó đến ${coffee.name} để làm việc. Bạn muốn đặt bàn Pizza 4P's lúc mấy giờ?`;
  const confirmationPrompt = `Được. Mình sẽ đặt bàn cho 3 người tại ${pizza.name} lúc 19:00 ngày 12 tháng 7. ${coffee.name} dự kiến khá thoáng vào giờ này nên bạn không cần đặt chỗ trước. Bạn xác nhận đúng ngày 12 tháng 7 lúc 19:00 nhé?`;
  const bookingStartedResponse = `Được, mình đang đặt bàn ${pizza.name} lúc 19:00 ngày 12 tháng 7 và hoàn tất hành trình.`;
  const bookingConfirmedResponse = `Mọi thứ đã được xác nhận. Bàn cho 3 người tại ${pizza.name} đã được giữ lúc 19:00 ngày 12 tháng 7. ${coffee.name} không cần đặt trước. Chỗ đỗ xe VETC đang chờ bạn thanh toán.`;
  const clarificationResponse: ChatResponse = {
    intent: "clarification_required",
    assistantResponse: "Ba người ăn tối ở Quận 1. Mọi người muốn ăn món gì?",
    recommendations: [],
    confidence: 1,
    quickReplies: ["Món Ý", "Món Việt", "Món Nhật"],
    mapAction: { type: "clarify" },
    sessionContext: {
      lastIntent: "clarification_required",
      lastQuery: SUBMISSION_DEMO_REQUEST,
      recentQueries: [SUBMISSION_DEMO_REQUEST],
      constraints: ["3 người", "ăn tối", "Quận 1", "cà phê yên tĩnh", "làm việc"],
    },
    privacy: { mode: "session-only", persisted: false },
    generation: { mode: "deterministic", model: "tasco-submission-fixture-v1" },
  };
  const response: ChatResponse = {
    intent: "journey_plan",
    assistantResponse: bookingConfirmedResponse,
    recommendations,
    confidence: 1,
    mapAction: {
      type: "route",
      poiIds: [...SUBMISSION_DEMO_POI_IDS],
      selectedPoiId: pizza.id,
      route,
    },
    sessionContext: {
      lastIntent: "journey_plan",
      lastQuery: SUBMISSION_DEMO_CONFIRMATION_ANSWER,
      recentQueries: [
        SUBMISSION_DEMO_REQUEST,
        SUBMISSION_DEMO_CUISINE_ANSWER,
        SUBMISSION_DEMO_TIME_ANSWER,
        SUBMISSION_DEMO_CONFIRMATION_ANSWER,
      ],
      constraints: [
        "3 người",
        "ăn tối",
        "Quận 1",
        "món Ý",
        "19:00",
        "12 tháng 7",
        "cà phê yên tĩnh",
        "làm việc",
      ],
      journey: {
        query: [
          SUBMISSION_DEMO_REQUEST,
          SUBMISSION_DEMO_CUISINE_ANSWER,
          SUBMISSION_DEMO_TIME_ANSWER,
          SUBMISSION_DEMO_CONFIRMATION_ANSWER,
        ].join("\n"),
        location: "Quận 1",
        selectedPoiIds: [...SUBMISSION_DEMO_POI_IDS],
        actionKinds: ["dining", "parking", "dining"],
        totalVnd: journey.totalVnd,
        revision: 0,
      },
    },
    privacy: { mode: "session-only", persisted: false },
    generation: { mode: "deterministic", model: "tasco-submission-fixture-v1" },
    journey,
  };
  const turns: SubmissionDemoTurn[] = [
    { stage: "request", role: "user", text: SUBMISSION_DEMO_REQUEST },
    {
      stage: "clarification",
      role: "assistant",
      text: clarificationResponse.assistantResponse,
    },
    { stage: "cuisine", role: "user", text: SUBMISSION_DEMO_CUISINE_ANSWER },
    {
      stage: "time",
      role: "assistant",
      text: timePrompt,
    },
    {
      stage: "time",
      role: "user",
      text: SUBMISSION_DEMO_TIME_ANSWER,
    },
    {
      stage: "confirmation",
      role: "assistant",
      text: confirmationPrompt,
    },
    {
      stage: "confirmation",
      role: "user",
      text: SUBMISSION_DEMO_CONFIRMATION_ANSWER,
    },
    {
      stage: "booking",
      role: "assistant",
      text: bookingStartedResponse,
    },
    { stage: "confirmed", role: "assistant", text: bookingConfirmedResponse },
  ];

  return {
    origin,
    stops: orderedStops,
    route,
    turns,
    clarificationResponse,
    timePrompt,
    confirmationPrompt,
    bookingStartedResponse,
    bookingConfirmedResponse,
    response,
    narration: {
      location:
        origin.source === "device"
          ? "Đã nhận vị trí hiện tại. Tôi chỉ dùng vị trí này trong phiên đang hoạt động."
          : "Tôi đang dùng điểm xuất phát mặc định tại Quận 1.",
      plan: `Tôi đã lên tuyến: ${orderedStops[0].name} trước, sau đó ${orderedStops[1].name}.`,
      reservations:
        "Bàn cho 3 người đã được giữ lúc 19:00 ngày 12 tháng 7. Trung Nguyên không cần đặt trước. Chỗ đỗ xe 2 giờ giảm từ 60.000 xuống 45.000 đồng và được xác nhận bằng Ví VETC.",
      driving: `Bắt đầu dẫn đường. Điểm dừng đầu tiên là ${orderedStops[0].name}.`,
    },
  };
}
