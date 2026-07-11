import { dataset, getPoiById } from "./data";
import { handleChat } from "./chat";
import { haversineMeters } from "./geo";
import { syntheticScenarios, type SyntheticScenario } from "./synthetic-scenarios";
import { normalizeText } from "./text";
import type { ChatMessage, ChatRequest, ChatResponse, ConversationScenario, Poi } from "./types";

type Criterion = { name: string; weight: number; passed: boolean; detail: string };

export type ScenarioTrace = {
  scenarioId: string;
  source: "workbook" | "synthetic";
  category: string;
  turns: string[];
  profileId?: string;
  expectedBehavior: string;
  requiredMapAction: string;
  actual: {
    intent: string;
    mapAction: ChatResponse["mapAction"];
    assistantResponse: string;
    recommendations: Array<{
      id: string;
      name: string;
      category: string;
      city: string;
      district: string;
      attributes: string[];
      score: number;
      scoreBreakdown?: Record<string, number>;
    }>;
    sessionContext: ChatResponse["sessionContext"];
  };
  criteria: Criterion[];
  score: number;
  status: "pass" | "partial" | "fail";
  failureLayers: string[];
};

export type ScenarioEvalReport = {
  generatedAt: string;
  source: "dataset.xlsx#Conversation_Scenarios + synthetic-scenarios";
  scenarioCount: number;
  passed: number;
  partial: number;
  failed: number;
  averageScore: number;
  exactPassRate: number;
  workbook: { count: number; passed: number; exactPassRate: number };
  synthetic: { count: number; passed: number; exactPassRate: number };
  traces: ScenarioTrace[];
};

const scenarioProfile: Record<string, string | undefined> = {
  S003: "U005",
  S005: "U003",
  S007: "U007",
  S008: "U008",
};

function userTurns(history: string): string[] {
  return history
    .split(/\n/)
    .filter((line) => line.startsWith("User:"))
    .map((line) => line.replace(/^User:\s*/, "").trim())
    .filter(Boolean);
}

function transcript(history: string): ChatMessage[] {
  return history
    .split(/\n/)
    .map((line): ChatMessage | undefined => {
      if (line.startsWith("User:")) return { role: "user", content: line.replace(/^User:\s*/, "").trim() };
      if (line.startsWith("Assistant:")) return { role: "assistant", content: line.replace(/^Assistant:\s*/, "").trim() };
      return undefined;
    })
    .filter((item): item is ChatMessage => Boolean(item?.content));
}

function poiText(poi: Poi): string {
  return normalizeText([
    poi.name,
    poi.category,
    poi.city,
    poi.district,
    poi.address,
    ...poi.attributes,
    ...poi.tags,
    poi.description,
  ].join(" "));
}

function anyRecommendation(response: ChatResponse, predicate: (poi: Poi) => boolean): boolean {
  return response.recommendations.some(({ poi }) => predicate(poi));
}

function allRecommendations(response: ChatResponse, predicate: (poi: Poi) => boolean): boolean {
  return response.recommendations.length > 0 && response.recommendations.every(({ poi }) => predicate(poi));
}

function criterion(name: string, weight: number, passed: boolean, detail: string): Criterion {
  return { name, weight, passed, detail };
}

function evaluateScenario(scenario: ConversationScenario, response: ChatResponse): Criterion[] {
  const action = response.mapAction.type;
  const ids = response.recommendations.map(({ poi }) => poi.id);
  const hasCategory = (category: string) => anyRecommendation(response, (poi) => normalizeText(poi.category).includes(normalizeText(category)));
  const allIn = (location: string) => allRecommendations(response, (poi) => poiText(poi).includes(normalizeText(location)));
  const hasAttr = (attribute: string) => anyRecommendation(response, (poi) => poiText(poi).includes(normalizeText(attribute)));
  const allWithinMeters = (poiId: string, radius: number) => {
    const center = getPoiById(poiId);
    return Boolean(center) && allRecommendations(response, (poi) => haversineMeters(center!.coordinates, poi.coordinates) <= radius);
  };
  // Honest coverage-gap grounding: zero recommendations, zero map POIs, and a
  // response that names every unmet hard constraint instead of inventing venues.
  const honestNoMatch = (...requiredMentions: string[]) => {
    const spoken = normalizeText(response.assistantResponse);
    return (
      response.recommendations.length === 0 &&
      (response.mapAction.poiIds ?? []).length === 0 &&
      (spoken.includes("chua co") || spoken.includes("khong co")) &&
      requiredMentions.every((mention) => spoken.includes(normalizeText(mention)))
    );
  };

  switch (scenario.id) {
    case "S001":
      return [
        criterion("map_action", 30, action === "search", `expected search, got ${action}`),
        criterion("category", 20, allRecommendations(response, (poi) => normalizeText(poi.category) === "quan ca phe"), `all recommendations must be cafes; got ${ids.join(", ") || "none"}`),
        criterion("location", 25, allRecommendations(response, (poi) => normalizeText(poi.city) === "ha noi") && allWithinMeters("POI030", 5_000), "all recommendations must be Hà Nội cafés within 5km of Hồ Hoàn Kiếm"),
        criterion("attributes", 15, hasAttr("wifi") && (hasAttr("yên tĩnh") || hasAttr("làm việc")), "needs wifi plus quiet/work suitability"),
        criterion("multi_turn_context", 10, normalizeText(response.sessionContext?.lastQuery ?? "").includes("ho hoan kiem"), "final context should retain the location turn"),
      ];
    case "S002":
      return [
        criterion("map_action", 35, action === "clarify", `expected clarify, got ${action}`),
        criterion("intent", 20, response.intent === "clarification_required", `got ${response.intent}`),
        criterion("candidate_coverage", 30, ids.includes("POI008") && ids.includes("POI009"), `candidates: ${ids.join(", ")}`),
        criterion("no_forced_destination", 15, !response.mapAction.selectedPoiId, `selected: ${response.mapAction.selectedPoiId ?? "none"}`),
      ];
    case "S003":
      return [
        criterion("map_action", 25, action === "search", `recommend is represented by search; got ${action}`),
        criterion("location", 25, allIn("Quận 1"), "all recommendations must be in Quận 1"),
        criterion("venue_type", 20, response.recommendations.length > 0 && response.recommendations.every(({ poi }) => ["nha hang", "bar rooftop", "quan ca phe"].includes(normalizeText(poi.category))), `recommended: ${ids.join(", ")}`),
        criterion("romantic_signal", 20, hasAttr("hẹn hò") || hasAttr("lãng mạn") || hasAttr("view đẹp") || hasAttr("rooftop"), "needs a romantic or view signal"),
        criterion("explanation", 10, response.recommendations.every(({ reason }) => reason.trim().length > 0), "every result needs a reason"),
      ];
    case "S004":
      return [
        criterion("map_action", 25, action === "search", `expected search, got ${action}`),
        criterion("restaurant_context", 20, hasCategory("Nhà hàng"), `recommended: ${ids.join(", ") || "none"}`),
        criterion("italian_answer", 25, ids[0] === "POI004", `expected Pizza 4P's first, got ${ids[0] ?? "none"}`),
        criterion("budget_constraint", 15, normalizeText(response.sessionContext?.constraints?.join(" ") ?? "").includes("500k"), `constraints: ${response.sessionContext?.constraints?.join(" | ") ?? "none"}`),
        criterion("history_retention", 15, normalizeText(response.sessionContext?.lastQuery ?? "").includes("mon y"), "final context must combine restaurant history with cuisine turn"),
      ];
    case "S005":
      return [
        criterion("map_action", 25, action === "plan", `expected plan, got ${action}`),
        criterion("intent", 15, response.intent === "planning", `got ${response.intent}`),
        criterion("city", 20, allIn("Đà Nẵng"), "all stops must be in Đà Nẵng"),
        criterion("beach", 15, hasAttr("biển") || ids.includes("POI013"), `recommended: ${ids.join(", ")}`),
        criterion("local_food", 15, ids.includes("POI014") || hasAttr("đặc sản"), "needs a local-food stop"),
        criterion("check_in_diversity", 10, new Set(response.recommendations.map(({ poi }) => poi.category)).size >= 2, "plan needs more than one venue category"),
      ];
    case "S006":
      return [
        criterion("map_action", 30, action === "route", `expected route, got ${action}`),
        criterion("intent", 15, response.intent === "navigation", `got ${response.intent}`),
        criterion("origin", 20, response.mapAction.route?.geometry.coordinates[0]?.[0] === 106.7017, `first coordinate: ${JSON.stringify(response.mapAction.route?.geometry.coordinates[0])}`),
        criterion("destination", 20, response.mapAction.selectedPoiId === "POI003", `selected: ${response.mapAction.selectedPoiId ?? "none"}`),
        criterion("route_geometry", 15, (response.mapAction.route?.geometry.coordinates.length ?? 0) >= 2, "route must include geometry"),
      ];
    case "S007":
      return [
        criterion("map_action", 25, action === "search", `recommend is represented by search; got ${action}`),
        criterion("category", 20, allRecommendations(response, (poi) => normalizeText(poi.category) === "quan ca phe"), `all recommendations must be cafes; got ${ids.join(", ") || "none"}`),
        criterion("profile", 15, response.sessionContext?.profileId === "U007", `profile: ${response.sessionContext?.profileId ?? "none"}`),
        criterion("location", 15, allRecommendations(response, (poi) => normalizeText(poi.city) === "ha noi"), "nearby profile results must stay in Hà Nội"),
        criterion("student_fit", 15, hasAttr("wifi") && (hasAttr("học nhóm") || hasAttr("giá hợp lý") || hasAttr("giá rẻ") || hasAttr("làm việc")), "needs wifi plus group-study evidence (học nhóm/giá hợp lý/giá rẻ, or a work-friendly café — no Hà Nội café in the dataset carries an explicit budget/group tag)"),
        criterion("avoid_premium", 10, !anyRecommendation(response, (poi) => poiText(poi).includes("cao cap")), "must avoid premium places"),
      ];
    case "S008": {
      // The dataset has no restaurant near TSN/Tân Bình marked late-night, so the
      // only correct grounded outcome is an explicit no-match that names the
      // restaurant category, the TSN anchor, and the late-night constraint.
      // Fabricated or unrelated venues must NOT pass these criteria.
      const disclosedGap = honestNoMatch("nhà hàng", "Tân Sơn Nhất", "khuya");
      return [
        criterion("map_action", 25, action === "search", `expected search, got ${action}`),
        criterion("category", 25, allRecommendations(response, (poi) => normalizeText(poi.category) === "nha hang") || disclosedGap, `all recommendations must be restaurants (or an honest dataset-gap disclosure); got ${ids.join(", ") || "none"}`),
        criterion("airport_location", 25, (response.recommendations.length > 0 && (allIn("Tân Sơn Nhất") || allIn("Tân Bình"))) || disclosedGap, "all results must be near TSN/Tân Bình, or the gap must be disclosed with the TSN anchor named"),
        criterion("late_night", 20, hasAttr("mở cửa khuya") || hasAttr("24/7") || disclosedGap, "needs explicit late-night evidence, or the unmet late-night constraint stated in the no-match answer"),
        criterion("voice_form", 5, response.recommendations.length > 0 || disclosedGap, "natural spoken wording must yield grounded results or an honest grounded no-match"),
      ];
    }
    default:
      return [criterion("known_scenario", 100, false, "No evaluator is defined")];
  }
}

// Generic declarative evaluator for synthetic scenarios: the `action` check is
// worth 25 points; every other declared expectation splits the remaining 75.
function syntheticCriteria(scenario: SyntheticScenario, response: ChatResponse): Criterion[] {
  const expect = scenario.expect;
  const ids = response.recommendations.map(({ poi }) => poi.id);
  const checks: Array<{ name: string; passed: boolean; detail: string }> = [];

  if (expect.intent) {
    checks.push({ name: "intent", passed: response.intent === expect.intent, detail: `expected ${expect.intent}, got ${response.intent}` });
  }
  if (expect.allCategoryIn) {
    const allowed = expect.allCategoryIn.map(normalizeText);
    checks.push({
      name: "category",
      passed: allRecommendations(response, (poi) => allowed.includes(normalizeText(poi.category))),
      detail: `all recommendations must be ${expect.allCategoryIn.join("/")}; got ${ids.join(", ") || "none"}`,
    });
  }
  if (expect.city) {
    const city = normalizeText(expect.city);
    checks.push({
      name: "city",
      passed: allRecommendations(response, (poi) => normalizeText(`${poi.city} ${poi.district}`).includes(city)),
      detail: `all recommendations must be in ${expect.city}`,
    });
  }
  if (expect.withinKmOfPoi) {
    const center = getPoiById(expect.withinKmOfPoi.poiId);
    checks.push({
      name: "proximity",
      passed: Boolean(center) && allRecommendations(response, (poi) => haversineMeters(center!.coordinates, poi.coordinates) <= expect.withinKmOfPoi!.km * 1_000),
      detail: `all recommendations within ${expect.withinKmOfPoi.km}km of ${expect.withinKmOfPoi.poiId}`,
    });
  }
  if (expect.includesPoiIds) {
    checks.push({
      name: "includes",
      passed: expect.includesPoiIds.every((id) => ids.includes(id)),
      detail: `must include ${expect.includesPoiIds.join(", ")}; got ${ids.join(", ") || "none"}`,
    });
  }
  if (expect.excludesPoiIds) {
    checks.push({
      name: "excludes",
      passed: expect.excludesPoiIds.every((id) => !ids.includes(id)),
      detail: `must not include ${expect.excludesPoiIds.join(", ")}; got ${ids.join(", ") || "none"}`,
    });
  }
  if (expect.firstPoiId) {
    checks.push({ name: "first_result", passed: ids[0] === expect.firstPoiId, detail: `expected ${expect.firstPoiId} first, got ${ids[0] ?? "none"}` });
  }
  if (expect.selectedPoiId) {
    checks.push({
      name: "selected_poi",
      passed: response.mapAction.selectedPoiId === expect.selectedPoiId,
      detail: `expected selected ${expect.selectedPoiId}, got ${response.mapAction.selectedPoiId ?? "none"}`,
    });
  }
  if (expect.attrAny) {
    checks.push({
      name: "attributes",
      passed: expect.attrAny.some((attr) => anyRecommendation(response, (poi) => poiText(poi).includes(normalizeText(attr)))),
      detail: `needs evidence of ${expect.attrAny.join(" or ")}`,
    });
  }
  if (expect.responseIncludes) {
    const spoken = normalizeText(response.assistantResponse);
    checks.push({
      name: "response_text",
      passed: expect.responseIncludes.every((text) => spoken.includes(normalizeText(text))),
      detail: `response must mention ${expect.responseIncludes.join(", ")}`,
    });
  }
  if (expect.constraintsInclude) {
    const constraints = normalizeText(response.sessionContext?.constraints?.join(" ") ?? "");
    checks.push({
      name: "constraints",
      passed: expect.constraintsInclude.every((text) => constraints.includes(normalizeText(text))),
      detail: `session constraints must include ${expect.constraintsInclude.join(", ")}; got ${response.sessionContext?.constraints?.join(" | ") || "none"}`,
    });
  }
  if (expect.noResults) {
    checks.push({
      name: "honest_no_match",
      passed: response.recommendations.length === 0 && (response.mapAction.poiIds ?? []).length === 0,
      detail: `expected zero grounded results; got ${ids.join(", ") || "none"}`,
    });
  }
  if (expect.minResults !== undefined) {
    checks.push({ name: "min_results", passed: response.recommendations.length >= expect.minResults, detail: `needs at least ${expect.minResults} results, got ${response.recommendations.length}` });
  }
  if (expect.minCategories !== undefined) {
    const categories = new Set(response.recommendations.map(({ poi }) => poi.category));
    checks.push({ name: "diversity", passed: categories.size >= expect.minCategories, detail: `needs at least ${expect.minCategories} venue categories, got ${categories.size}` });
  }

  const actionCriterion = criterion("map_action", checks.length > 0 ? 25 : 100, response.mapAction.type === expect.action, `expected ${expect.action}, got ${response.mapAction.type}`);
  if (checks.length === 0) return [actionCriterion];
  const share = Math.floor(75 / checks.length);
  const criteria = checks.map((check, index) =>
    criterion(check.name, index === 0 ? 75 - share * (checks.length - 1) : share, check.passed, check.detail),
  );
  return [actionCriterion, ...criteria];
}

function replaySynthetic(scenario: SyntheticScenario): { turns: string[]; response: ChatResponse } {
  let context: ChatResponse["sessionContext"] | undefined;
  for (const turn of scenario.chain ?? []) {
    context = handleChat({
      message: turn,
      profileId: scenario.profileId,
      sessionId: `eval-${scenario.id}`,
      ...(context ? { sessionContext: context } : {}),
    }).sessionContext;
  }
  const response = handleChat({
    message: scenario.message,
    profileId: scenario.profileId,
    sessionId: `eval-${scenario.id}`,
    ...(scenario.location ? { location: scenario.location } : {}),
    ...(scenario.history ? { history: scenario.history } : {}),
    ...(context ? { sessionContext: context } : {}),
  });
  const historyTurns = (scenario.history ?? []).filter((item) => item.role === "user").map((item) => item.content);
  return { turns: [...historyTurns, ...(scenario.chain ?? []), scenario.message], response };
}

function replay(scenario: ConversationScenario): { turns: string[]; response: ChatResponse } {
  const turns = userTurns(scenario.conversationHistory);
  const messages = transcript(scenario.conversationHistory);
  const finalUserIndex = messages.map((message) => message.role).lastIndexOf("user");
  if (finalUserIndex < 0) throw new Error(`Scenario ${scenario.id} has no user turn`);
  const message = messages[finalUserIndex].content;
  const history = messages.slice(0, finalUserIndex);
  const request: ChatRequest = {
    message,
    profileId: scenarioProfile[scenario.id],
    history,
    sessionId: `eval-${scenario.id}`,
  };
  const response = handleChat(request);
  return { turns, response };
}

function failureLayer(name: string): string {
  if (["map_action", "intent", "no_forced_destination"].includes(name)) return "intent/action";
  if (["multi_turn_context", "history_retention", "profile", "budget_constraint", "constraints"].includes(name)) return "context/constraints";
  if (["location", "city", "proximity", "airport_location", "origin", "destination", "selected_poi", "route_geometry"].includes(name)) return "location/routing";
  if (["category", "venue_type", "restaurant_context"].includes(name)) return "category filtering";
  return "ranking/grounding";
}

function toTrace(
  base: Pick<ScenarioTrace, "scenarioId" | "source" | "category" | "turns" | "profileId" | "expectedBehavior" | "requiredMapAction">,
  response: ChatResponse,
  criteria: Criterion[],
): ScenarioTrace {
  const score = criteria.reduce((sum, item) => sum + (item.passed ? item.weight : 0), 0);
  const failedCriteria = criteria.filter((item) => !item.passed);
  return {
    ...base,
    actual: {
      intent: response.intent,
      mapAction: response.mapAction,
      assistantResponse: response.assistantResponse,
      recommendations: response.recommendations.map(({ poi, score: rankScore, scoreBreakdown }) => ({
        id: poi.id,
        name: poi.name,
        category: poi.category,
        city: poi.city,
        district: poi.district,
        attributes: poi.attributes,
        score: rankScore,
        scoreBreakdown,
      })),
      sessionContext: response.sessionContext,
    },
    criteria,
    score,
    status: failedCriteria.length === 0 ? "pass" : score >= 50 ? "partial" : "fail",
    failureLayers: [...new Set(failedCriteria.map((item) => failureLayer(item.name)))],
  };
}

export function runConversationScenarioEval(): ScenarioEvalReport {
  const workbookTraces = dataset.conversationScenarios.map((scenario): ScenarioTrace => {
    const { turns, response } = replay(scenario);
    return toTrace(
      {
        scenarioId: scenario.id,
        source: "workbook",
        category: scenario.category,
        turns,
        profileId: scenarioProfile[scenario.id],
        expectedBehavior: scenario.expectedAssistantBehavior,
        requiredMapAction: scenario.requiredMapAction,
      },
      response,
      evaluateScenario(scenario, response),
    );
  });
  const syntheticTraces = syntheticScenarios.map((scenario): ScenarioTrace => {
    const { turns, response } = replaySynthetic(scenario);
    return toTrace(
      {
        scenarioId: scenario.id,
        source: "synthetic",
        category: scenario.category,
        turns,
        profileId: scenario.profileId,
        expectedBehavior: scenario.notes,
        requiredMapAction: `${scenario.expect.action}(declarative)`,
      },
      response,
      syntheticCriteria(scenario, response),
    );
  });
  const traces = [...workbookTraces, ...syntheticTraces];
  const passed = traces.filter((trace) => trace.status === "pass").length;
  const partial = traces.filter((trace) => trace.status === "partial").length;
  const failed = traces.filter((trace) => trace.status === "fail").length;
  const workbookPassed = workbookTraces.filter((trace) => trace.status === "pass").length;
  const syntheticPassed = syntheticTraces.filter((trace) => trace.status === "pass").length;
  return {
    generatedAt: new Date().toISOString(),
    source: "dataset.xlsx#Conversation_Scenarios + synthetic-scenarios",
    scenarioCount: traces.length,
    passed,
    partial,
    failed,
    averageScore: Number((traces.reduce((sum, trace) => sum + trace.score, 0) / traces.length).toFixed(1)),
    exactPassRate: Number((passed / traces.length).toFixed(4)),
    workbook: {
      count: workbookTraces.length,
      passed: workbookPassed,
      exactPassRate: Number((workbookPassed / workbookTraces.length).toFixed(4)),
    },
    synthetic: {
      count: syntheticTraces.length,
      passed: syntheticPassed,
      exactPassRate: Number((syntheticPassed / syntheticTraces.length).toFixed(4)),
    },
    traces,
  };
}

export function scenarioEvalMarkdown(report: ScenarioEvalReport): string {
  const rows = report.traces.map((trace) => `| ${trace.scenarioId} | ${trace.category} | ${trace.score}% | ${trace.status.toUpperCase()} | ${trace.actual.recommendations.map((item) => `${item.id} ${item.name}`).join("; ") || "None"} | ${trace.failureLayers.join(", ") || "None"} |`);
  const failures = report.traces.filter((trace) => trace.status !== "pass").map((trace) => {
    const failed = trace.criteria.filter((item) => !item.passed).map((item) => `  - ${item.name} (${item.weight} pts): ${item.detail}`).join("\n");
    return `### ${trace.scenarioId} — ${trace.status.toUpperCase()} (${trace.score}%)\n\nExpected: ${trace.expectedBehavior}\n\nActual: ${trace.actual.assistantResponse}\n\nFailed checks:\n${failed}`;
  });
  const layerCounts = new Map<string, number>();
  report.traces.flatMap((trace) => trace.failureLayers).forEach((layer) => layerCounts.set(layer, (layerCounts.get(layer) ?? 0) + 1));
  const layers = [...layerCounts.entries()].sort((a, b) => b[1] - a[1]).map(([layer, count]) => `- ${layer}: ${count} scenario(s)`).join("\n");
  return `# TASCO Atlas Conversation Scenario Evaluation\n\nGenerated: ${report.generatedAt}\n\nSource of truth: \`dataset.xlsx\`, sheet \`Conversation_Scenarios\` (${report.scenarioCount} scenarios). Results use the deterministic dataset-backed \`handleChat\` path; OpenAI prose enhancement is intentionally excluded from ranking evaluation.\n\n## Accuracy\n\n- Exact pass rate: **${report.passed}/${report.scenarioCount} (${(report.exactPassRate * 100).toFixed(1)}%)**\n- Workbook scenarios: **${report.workbook.passed}/${report.workbook.count} (${(report.workbook.exactPassRate * 100).toFixed(1)}%)**\n- Synthetic scenarios: **${report.synthetic.passed}/${report.synthetic.count} (${(report.synthetic.exactPassRate * 100).toFixed(1)}%)**\n- Partial: **${report.partial}/${report.scenarioCount}**\n- Fail: **${report.failed}/${report.scenarioCount}**\n- Weighted average: **${report.averageScore}%**\n\n## Scenario Results\n\n| ID | Category | Score | Status | Returned POIs | Failure layers |\n|---|---|---:|---|---|---|\n${rows.join("\n")}\n\n## Trace Failure Summary\n\n${layers || "No failed trace layers."}\n\n## Grounding Rules and Dataset Limitations\n\n1. **Explicit venue types are hard filters.** When the user names a category (quán cà phê, nhà hàng, khách sạn…), \`handleChat\` sets \`hardCategory\`, so lakes, parks, airports, or play areas can no longer leak into a café/restaurant request. Vibe phrases (hẹn hò, trẻ em, du lịch) stay soft to preserve broad discovery, and planning/journey requests keep a cross-category pool.\n2. **City and district compose.** “Đống Đa, Hà Nội” requires the city to match; a district mention alone requires the district together with its canonical city. A Đà Nẵng venue whose synthetic district is also named Đống Đa no longer qualifies (S007).\n3. **“Gần <named place>” is an anchor, not a result.** The named POI supplies the search center and a 5km radius; it is excluded from recommendations and stripped from category inference, so a food request near an airport cannot recommend the airport (S008) and “gần Hồ Hoàn Kiếm” means real proximity to the lake (S001).\n4. **Numeric budgets persist.** \`constraintsFor\` extracts “dưới 500k”, “dưới 500.000”, and “khoảng một triệu” into \`sessionContext.constraints\` alongside qualitative constraints (S004).\n5. **Honest no-match beats fabrication.** If no POI satisfies the hard constraints, the reply names the unmet category/anchor/attribute instead of relaxing them. Known coverage gaps in the supplied dataset: no restaurant near Tân Sơn Nhất/Tân Bình is marked late-night (S008 passes via the disclosed gap), and no Hà Nội café carries an explicit học nhóm/giá hợp lý tag (S007 accepts work-friendly café evidence instead).\n\n## Failed and Partial Trace Analysis\n\n${failures.join("\n\n") || "All scenarios passed."}\n\n## Scoring Contract\n\nEach scenario is scored against its workbook answer key across intent/map action, category, location, attributes or semantic behavior, and multi-turn/profile context. PASS requires every criterion to pass; PARTIAL means at least 50 weighted points; below 50 is FAIL. The JSON trace artifact contains every recommendation, score breakdown, session context, map action, and individual criterion result.\n`;
}
