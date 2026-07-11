import { NextResponse } from "next/server";

export const runtime = "nodejs";

// ElevenLabs Flash v2.5: the lowest-latency ElevenLabs model (~75ms) with
// Vietnamese support. The API key stays server-side; the browser only ever
// receives the audio stream. Content is always the deterministic
// assistantResponse — this endpoint never generates or alters text.
const MODEL_ID = "eleven_flash_v2_5";
const DEFAULT_VOICE_ID = "EXAVITQu4vr4xnSDxMaL";
const MAX_TEXT_LENGTH = 800;

export async function POST(request: Request) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
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
  const voiceId = process.env.ELEVENLABS_VOICE_ID ?? DEFAULT_VOICE_ID;
  const upstream = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=mp3_44100_64`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        text: text.slice(0, MAX_TEXT_LENGTH),
        model_id: MODEL_ID,
        language_code: "vi",
      }),
      cache: "no-store",
    },
  );
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "TTS upstream unavailable." }, { status: 502 });
  }
  return new Response(upstream.body, {
    status: 200,
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
}
