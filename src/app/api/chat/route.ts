import { NextResponse } from "next/server";

import { handleChat } from "../../../lib/chat";
import { translateUtterance } from "../../../lib/nlu";
import { enhanceChatResponse } from "../../../lib/openai";
import { traceChatTurn } from "../../../lib/telemetry";
import type { ChatRequest } from "../../../lib/types";

function isChatRequest(value: unknown): value is ChatRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Partial<ChatRequest>;
  return (
    typeof request.message === "string" && request.message.trim().length > 0
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON", message: "Nội dung JSON không hợp lệ." } },
      { status: 400 },
    );
  }

  if (!isChatRequest(body)) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_CHAT_REQUEST",
          message: "message là trường bắt buộc.",
        },
      },
      { status: 400 },
    );
  }

  const startedAt = Date.now();
  // Primary NLU: the LLM translates any human phrasing into canonical
  // Vietnamese constraint language (strict enum schema — it cannot name venues
  // or touch ranking). The deterministic engine still decides everything.
  const nluHint = await translateUtterance(
    body.message,
    body.sessionContext?.recentQueries ?? [],
  );
  const deterministic = handleChat(nluHint ? { ...body, nluHint } : body);
  const enhanced = await enhanceChatResponse(body, deterministic);
  traceChatTurn(body, enhanced, Date.now() - startedAt);
  return NextResponse.json(enhanced);
}
