import { NextResponse } from "next/server";

import { resolveTtsProvider } from "../../../lib/voice-provider";

export const runtime = "nodejs";

// Provider-toggleable TTS proxy. TASCO_TTS_PROVIDER selects the upstream:
//   - "elevenlabs" (default): Flash v2.5, the lowest-latency ElevenLabs model
//     (~75ms) with Vietnamese support.
//   - "valsea": SEA-specialized voices via the OpenAI-compatible
//     POST /v1/audio/speech endpoint (Bearer auth).
// Either way the API key stays server-side; the browser only ever receives the
// audio stream. Content is always the deterministic assistantResponse — this
// endpoint never generates or alters text.
const ELEVENLABS_MODEL_ID = "eleven_flash_v2_5";
const ELEVENLABS_DEFAULT_VOICE_ID = "EXAVITQu4vr4xnSDxMaL";
const VALSEA_DEFAULT_VOICE = "valsea-neutral";
const MAX_TEXT_LENGTH = 800;

async function fetchElevenLabsAudio(text: string, apiKey: string): Promise<Response> {
  const voiceId = process.env.ELEVENLABS_VOICE_ID ?? ELEVENLABS_DEFAULT_VOICE_ID;
  return fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=mp3_44100_64`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: ELEVENLABS_MODEL_ID,
        language_code: "vi",
      }),
      cache: "no-store",
    },
  );
}

async function fetchValseaAudio(text: string, apiKey: string): Promise<Response> {
  return fetch("https://api.valsea.ai/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "valsea-tts",
      input: text,
      voice: process.env.VALSEA_VOICE ?? VALSEA_DEFAULT_VOICE,
      language: "vietnamese",
      response_format: "mp3",
    }),
    cache: "no-store",
  });
}

export async function POST(request: Request) {
  const provider = resolveTtsProvider();
  const apiKey =
    provider === "valsea" ? process.env.VALSEA_API_KEY : process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "TTS is not configured." }, { status: 503 });
  }
  let text = "";
  try {
    const body = (await request.json()) as { text?: string };
    text = (body.text ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!text) {
    return NextResponse.json({ error: "Missing text." }, { status: 400 });
  }
  const clipped = text.slice(0, MAX_TEXT_LENGTH);
  const upstream =
    provider === "valsea"
      ? await fetchValseaAudio(clipped, apiKey)
      : await fetchElevenLabsAudio(clipped, apiKey);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "TTS upstream unavailable." }, { status: 502 });
  }
  return new Response(upstream.body, {
    status: 200,
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
}
