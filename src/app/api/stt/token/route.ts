import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Mints a single-use ElevenLabs token (15-minute expiry, consumed on use) so the
// browser can open the Scribe v2 Realtime WebSocket without ever seeing the API
// key. This replaces the OpenAI Realtime session entirely.
export async function POST() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "STT is not configured." }, { status: 503 });
  }
  const upstream = await fetch(
    "https://api.elevenlabs.io/v1/single-use-token/realtime_scribe",
    { method: "POST", headers: { "xi-api-key": apiKey }, cache: "no-store" },
  );
  if (!upstream.ok) {
    return NextResponse.json({ error: "STT token unavailable." }, { status: 502 });
  }
  const body = (await upstream.json()) as { token?: string };
  if (!body.token) {
    return NextResponse.json({ error: "STT token unavailable." }, { status: 502 });
  }
  return NextResponse.json({ token: body.token }, { headers: { "Cache-Control": "no-store" } });
}
