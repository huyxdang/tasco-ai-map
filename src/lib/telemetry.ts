import { Langfuse } from "langfuse";

import { activePackName } from "./data";
import type { ChatRequest, ChatResponse } from "./types";

// Observability evidence layer (Langfuse). STRICTLY fire-and-forget: nothing in
// here may block, delay, or throw into the chat hot path. If keys are absent,
// every call is a no-op.

let client: Langfuse | null | undefined;

function getLangfuse(): Langfuse | null {
  if (client !== undefined) return client;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  if (!secretKey || !publicKey) {
    client = null;
    return client;
  }
  client = new Langfuse({
    secretKey,
    publicKey,
    // This project's Langfuse account lives in the JP region; env overrides win.
    baseUrl:
      process.env.LANGFUSE_URL ||
      process.env.LANGFUSE_BASEURL ||
      process.env.LANGFUSE_HOST ||
      "https://jp.cloud.langfuse.com",
    requestTimeout: 5_000,
  });
  return client;
}

export function traceChatTurn(
  request: ChatRequest,
  response: ChatResponse,
  durationMs: number,
): void {
  try {
    const langfuse = getLangfuse();
    if (!langfuse) return;
    const trace = langfuse.trace({
      name: "chat-turn",
      sessionId: request.sessionId ?? "anonymous",
      input: request.message,
      output: response.assistantResponse,
      metadata: {
        pack: activePackName,
        intent: response.intent,
        mapAction: response.mapAction.type,
        recommendationIds: response.recommendations.map(({ poi }) => poi.id),
        constraints: response.sessionContext?.constraints ?? [],
        generationMode: response.generation?.mode ?? "deterministic",
        durationMs,
      },
      tags: ["tasco-atlas", activePackName],
    });
    trace.score({ name: "engine-confidence", value: response.confidence });
    if (response.recommendations.length === 0 && response.mapAction.type === "search") {
      trace.score({ name: "honest-no-match", value: 1 });
    }
    void langfuse.flushAsync().catch(() => undefined);
  } catch {
    // Observability must never affect the product path.
  }
}
