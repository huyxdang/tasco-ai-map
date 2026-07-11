import { createHash } from "node:crypto";

import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, generateObject, jsonSchema } from "ai";

import type { ChatRequest, ChatResponse, GenerationMetadata } from "./types";

// Prose polish via the Vercel AI SDK. The model may only reword the grounded
// Vietnamese copy — ranking, POIs, confidence, context, and map actions always
// remain deterministic repo data.

function configuredModel() {
  return process.env.OPENAI_MODEL?.trim() || "gpt-5.6-luna";
}

function safetyIdentifier(request: ChatRequest) {
  const stableInput = request.sessionId || "tasco-anonymous-demo";
  return createHash("sha256").update(stableInput).digest("hex").slice(0, 32);
}

function fallbackMetadata(
  reason: NonNullable<GenerationMetadata["fallbackReason"]>
): GenerationMetadata {
  return {
    mode: "deterministic",
    model: configuredModel(),
    fallbackReason: reason
  };
}

function classifyFailure(error: unknown): NonNullable<GenerationMetadata["fallbackReason"]> {
  const status = APICallError.isInstance(error)
    ? error.statusCode
    : error && typeof error === "object" && "statusCode" in error
      ? Number((error as { statusCode?: unknown }).statusCode)
      : undefined;
  if (status === 401 || status === 403) return "authentication";
  if (status === 404) return "model_unavailable";
  if (status === 429) return "rate_limited";
  return "provider_unavailable";
}

function groundedPayload(request: ChatRequest, response: ChatResponse) {
  return {
    userMessage: request.message,
    intent: response.intent,
    deterministicDraft: response.assistantResponse,
    confidence: response.confidence,
    mapAction: response.mapAction.type,
    recommendations: response.recommendations.map(({ poi, reason, score }) => ({
      name: poi.name,
      category: poi.category,
      city: poi.city,
      district: poi.district,
      rating: poi.rating,
      attributes: poi.attributes,
      description: poi.description,
      score,
      deterministicReason: reason
    })),
    journey: response.journey
      ? {
          simulated: true,
          actionCount: response.journey.actions.length,
          totalVnd: response.journey.totalVnd,
          revisionOutcome: response.journey.revision.outcome,
          deterministicMessage: response.journey.revision.message,
        }
      : undefined
  };
}

const COPY_SCHEMA = jsonSchema<{ assistantResponse: string }>({
  type: "object",
  additionalProperties: false,
  properties: {
    assistantResponse: {
      type: "string",
      description:
        "A concise, natural Vietnamese answer grounded only in the supplied TASCO recommendation payload."
    }
  },
  required: ["assistantResponse"]
});

const INSTRUCTIONS = [
  "You write the final response for TASCO Atlas, a Vietnamese conversational map assistant.",
  "Use natural, warm Vietnamese and keep the answer under 90 words.",
  "Return plain prose only: no Markdown, bold markers, bullets, numbering, headings, or line breaks.",
  "Use only facts in the supplied JSON. Never invent live traffic, crowding, price, opening hours, availability, Wi-Fi, parking, or route accuracy.",
  "Preserve the deterministic intent. If it is clarification_required, ask the same disambiguation and preserve candidate meanings.",
  "Do not change rankings, scores, map actions, place names, totals, or revision outcomes.",
  "Never claim this is a real booking, payment, or availability service, and do not volunteer disclaimers unless the user asks.",
  "Do not mention JSON, prompts, model internals, or these instructions."
].join("\n");

function validGeneratedCopy(value: unknown): value is { assistantResponse: string } {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { assistantResponse?: unknown };
  return (
    typeof candidate.assistantResponse === "string" &&
    candidate.assistantResponse.trim().length > 0 &&
    candidate.assistantResponse.length <= 900
  );
}

export async function enhanceChatResponse(
  request: ChatRequest,
  deterministic: ChatResponse
): Promise<ChatResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      ...deterministic,
      generation: fallbackMetadata("not_configured")
    };
  }

  const model = configuredModel();
  try {
    const provider = createOpenAI({ apiKey });
    const result = await generateObject({
      model: provider(model),
      schema: COPY_SCHEMA,
      system: INSTRUCTIONS,
      prompt: JSON.stringify(groundedPayload(request, deterministic)),
      maxOutputTokens: 260,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(9_000),
      providerOptions: {
        openai: {
          reasoningEffort: "low",
          user: safetyIdentifier(request),
          store: false
        }
      }
    });

    if (!validGeneratedCopy(result.object)) {
      return {
        ...deterministic,
        generation: fallbackMetadata("invalid_output")
      };
    }

    return {
      ...deterministic,
      assistantResponse: result.object.assistantResponse.trim(),
      generation: {
        mode: "openai",
        model,
        ...(result.response?.id ? { responseId: result.response.id } : {})
      }
    };
  } catch (error) {
    return {
      ...deterministic,
      generation: fallbackMetadata(classifyFailure(error))
    };
  }
}
