import { createOpenAI } from "@ai-sdk/openai";
import { generateObject, jsonSchema } from "ai";

// LLM as TRANSLATOR, never as DECIDER. This layer converts arbitrary human
// phrasing (any language, messy transcripts) into a STRICT schema of enum
// fields, which is then assembled — deterministically, from a fixed vocabulary —
// into canonical Vietnamese the rules engine already understands. The LLM can
// never name a venue, invent a fact, or touch ranking: it only fills out a form.
//
// The live app uses this as the primary ear; tests and evals run the pure rules
// path (no key / TASCO_NLU=rules), keeping the benchmark deterministic.

interface ParsedIntent {
  category?: string;
  cuisine?: string;
  area?: string;
  budgetVndMax?: number;
  partySize?: number;
  attributes?: string[];
}

const CATEGORY_VI: Record<string, string> = {
  cafe: "quán cà phê",
  restaurant: "nhà hàng",
  hotel: "khách sạn",
  bar: "rooftop bar",
  park: "công viên",
  cinema: "rạp chiếu phim",
  hospital: "bệnh viện",
  atm: "ATM",
  gas_station: "trạm xăng",
  mall: "trung tâm thương mại",
  market: "chợ đêm",
  playground: "khu vui chơi",
  attraction: "địa điểm du lịch",
};

const CUISINE_VI: Record<string, string> = {
  vietnamese: "món Việt",
  italian: "món Ý",
  japanese: "món Nhật",
  korean: "món Hàn",
};

const ATTRIBUTE_VI: Record<string, string> = {
  quiet: "yên tĩnh",
  wifi: "có wifi",
  work: "làm việc",
  study: "học nhóm",
  cheap: "giá rẻ",
  premium: "cao cấp",
  family: "gia đình",
  kids: "trẻ em",
  view: "view đẹp",
  romantic: "hẹn hò",
  late_night: "mở cửa khuya",
  outdoor: "ngoài trời",
  parking: "bãi đỗ xe",
  reservation: "đặt bàn",
  pool: "hồ bơi",
  breakfast: "ăn sáng",
  near_beach: "gần biển",
};

const PARSE_SCHEMA = jsonSchema<ParsedIntent>({
  type: "object",
  additionalProperties: false,
  properties: {
    category: { type: "string", enum: Object.keys(CATEGORY_VI) },
    cuisine: { type: "string", enum: Object.keys(CUISINE_VI) },
    area: { type: "string", description: "Named place, district, or city mentioned (verbatim), if any." },
    budgetVndMax: { type: "number", description: "Maximum budget in VND if stated." },
    partySize: { type: "number" },
    attributes: { type: "array", items: { type: "string", enum: Object.keys(ATTRIBUTE_VI) } },
  },
  required: [],
});

const PARSE_INSTRUCTIONS = [
  "You translate a user's request to a map assistant into a strict form.",
  "The user may speak Vietnamese, English, or a mix, possibly with transcription errors.",
  "Fill ONLY fields the user actually expressed (this turn or clearly carried from the recent turns provided).",
  "Never guess venues, never add preferences the user did not state, leave unknown fields absent.",
].join("\n");

/** Deterministic assembly: enum fields → canonical Vietnamese the engine parses. */
export function canonicalQueryFrom(parsed: ParsedIntent): string {
  const parts: string[] = [];
  if (parsed.category && CATEGORY_VI[parsed.category]) parts.push(CATEGORY_VI[parsed.category]);
  if (parsed.cuisine && CUISINE_VI[parsed.cuisine]) parts.push(CUISINE_VI[parsed.cuisine]);
  for (const attribute of parsed.attributes ?? []) {
    if (ATTRIBUTE_VI[attribute]) parts.push(ATTRIBUTE_VI[attribute]);
  }
  if (typeof parsed.partySize === "number" && parsed.partySize > 1 && parsed.partySize < 100) {
    parts.push(`${Math.round(parsed.partySize)} người`);
  }
  if (typeof parsed.budgetVndMax === "number" && parsed.budgetVndMax >= 10_000) {
    parts.push(`dưới ${Math.round(parsed.budgetVndMax).toLocaleString("vi-VN")} đồng`);
  }
  if (parsed.area && parsed.area.trim().length > 1 && parsed.area.length < 60) {
    parts.push(`ở ${parsed.area.trim()}`);
  }
  return parts.join(", ");
}

/**
 * Returns a canonical Vietnamese hint for the utterance, or undefined when the
 * translator is disabled, unavailable, times out, or adds nothing.
 */
export async function translateUtterance(
  message: string,
  recentQueries: string[],
): Promise<string | undefined> {
  if (process.env.TASCO_NLU === "rules") return undefined;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return undefined;
  try {
    const provider = createOpenAI({ apiKey });
    const result = await generateObject({
      model: provider(process.env.OPENAI_NLU_MODEL?.trim() || "gpt-5.6-luna"),
      schema: PARSE_SCHEMA,
      system: PARSE_INSTRUCTIONS,
      prompt: JSON.stringify({ message, recentTurns: recentQueries.slice(-3) }),
      maxOutputTokens: 200,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(2_500),
      providerOptions: { openai: { reasoningEffort: "low", store: false } },
    });
    const canonical = canonicalQueryFrom(result.object);
    return canonical.length > 0 ? canonical : undefined;
  } catch {
    // Translator is best-effort; the rules parser always remains underneath.
    return undefined;
  }
}
