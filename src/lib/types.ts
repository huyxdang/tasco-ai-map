export interface Coordinates {
  lat: number;
  lon: number;
}

export interface Poi {
  id: string;
  name: string;
  category: string;
  brand: string;
  city: string;
  district: string;
  address: string;
  coordinates: Coordinates;
  rating: number;
  reviewCount: number;
  popularityScore: number;
  attributes: string[];
  tags: string[];
  description: string;
  datasetTier: string;
}

export interface UserProfile {
  id: string;
  persona: string;
  currentLocation: string;
  preferences: string[];
  avoid: string[];
  budgetLevel: "low" | "medium" | "high" | string;
  notes: string;
}

export interface ConversationScenario {
  id: string;
  category: string;
  conversationHistory: string;
  expectedAssistantBehavior: string;
  requiredMapAction: string;
}

export interface EvaluationCase {
  id: string;
  conversationCategory: string;
  userProfileId: string;
  conversationTurns: string;
  expectedIntent: string;
  expectedResponseSummary: string;
  expectedRecommendations: string;
  expectedMapAction: string;
  difficulty: string;
  skillsTested: string[];
}

export interface Dataset {
  source: {
    file: string;
    language: string;
    synthetic: boolean;
    generatedAt: string;
  };
  pois: Poi[];
  userProfiles: UserProfile[];
  conversationScenarios: ConversationScenario[];
  publicEvaluation: EvaluationCase[];
}

export interface PlaceResult {
  id: string;
  type: "poi";
  name: string;
  label: string;
  address: string;
  category: string;
  coordinates: Coordinates;
  distanceMeters?: number;
  score?: number;
  source: "tasco-dataset";
  tags?: string[];
}

export interface Recommendation {
  poi: Poi;
  score: number;
  reason: string;
  scoreBreakdown?: Record<string, number>;
  rewardPoints?: number;
}

export type JourneyActionKind = "fuel" | "dining" | "parking";

export interface JourneyAction {
  id: string;
  poiId: string;
  kind: JourneyActionKind;
  miniApp: string;
  cta: string;
  reason: string;
  originalPriceVnd: number;
  discountVnd: number;
  finalPriceVnd: number;
  rewardPoints: number;
  sponsored?: { label: string; disclosure: string };
  status: "ready" | "confirmed";
  simulated: true;
}

export interface Journey {
  id: string;
  title: string;
  actions: JourneyAction[];
  originalTotalVnd: number;
  discountTotalVnd: number;
  totalVnd: number;
  savingsVnd: number;
  rewardPoints: number;
  walletLabel: "Ví VETC";
  simulated: true;
  revision: {
    number: number;
    outcome: "composed" | "cheaper" | "no_cheaper_option";
    changedActionIds: string[];
    message: string;
  };
}

export interface JourneySessionState {
  query: string;
  location: string;
  selectedPoiIds: string[];
  actionKinds: JourneyActionKind[];
  totalVnd: number;
  revision: number;
}

export interface RouteGeometry {
  type: "LineString";
  coordinates: [number, number][];
}

export interface RouteManeuver {
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
  beginShapeIndex: number;
  endShapeIndex: number;
  streetNames: string[];
}

export interface RouteResult {
  routeId: string;
  sourceIndex: number;
  summary: {
    distanceMeters: number;
    durationSeconds: number;
  };
  geometry: RouteGeometry;
  maneuvers: RouteManeuver[];
}

export type MapActionType =
  | "none"
  | "search"
  | "show"
  | "clarify"
  | "route"
  | "plan";

export interface MapAction {
  type: MapActionType;
  query?: string;
  center?: Coordinates;
  zoom?: number;
  poiIds?: string[];
  selectedPoiId?: string;
  candidates?: PlaceResult[];
  route?: RouteResult;
}

export interface SessionContext {
  sessionId?: string;
  profileId?: string;
  lastIntent?: string;
  lastQuery?: string;
  /** Rolling window of the last few user turns for multi-turn context. */
  recentQueries?: string[];
  constraints?: string[];
  pendingClarification?: {
    entity: string;
    candidateIds: string[];
  };
  journey?: JourneySessionState;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  message: string;
  profileId?: string;
  location?: Coordinates;
  history?: ChatMessage[] | string;
  sessionId?: string;
  sessionContext?: SessionContext;
}

export interface GenerationMetadata {
  mode: "openai" | "deterministic";
  model: string;
  responseId?: string;
  fallbackReason?:
    | "not_configured"
    | "authentication"
    | "model_unavailable"
    | "rate_limited"
    | "provider_unavailable"
    | "invalid_output";
}

export interface ChatResponse {
  intent: string;
  assistantResponse: string;
  recommendations: Recommendation[];
  confidence: number;
  /** Tappable answers for a clarification turn; each submits as a normal utterance. */
  quickReplies?: string[];
  mapAction: MapAction;
  sessionContext?: SessionContext;
  privacy?: {
    mode: string;
    persisted: boolean;
  };
  generation?: GenerationMetadata;
  journey?: Journey;
}

export interface RankedPoi {
  poi: Poi;
  score: number;
  scoreBreakdown: Record<string, number>;
  distanceMeters?: number;
  matchedTerms: string[];
}
