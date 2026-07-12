import { NextResponse } from "next/server";

import { resolveSttProvider, resolveVoiceProvider } from "../../../../lib/voice-provider";

export const runtime = "nodejs";

// Hands the browser what it needs to open the realtime STT WebSocket, without
// bundling any key into the client build. The response carries a `provider`
// field so stt-client.ts knows which protocol to speak.
//
//   - "elevenlabs" (default): mints a single-use Scribe v2 Realtime token
//     (15-minute expiry, consumed on use). The API key never leaves the server.
//   - "valsea": Valsea has NO single-use-token endpoint — its documented
//     browser auth is `?api_key=` on the WebSocket URL, so this route returns
//     the raw VALSEA_API_KEY as the token. That exposes the key to the browser
//     session, so the route only permits it outside production.
export async function POST(request?: Request) {
  let requestedProvider: string | undefined;
  try { requestedProvider = request ? ((await request.json()) as { provider?: string }).provider : undefined; } catch { /* env default */ }
  const provider = requestedProvider ? resolveVoiceProvider(requestedProvider) : resolveSttProvider();

  if (provider === "valsea") {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "Valsea browser STT is disabled in production." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }
    const apiKey = process.env.VALSEA_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "STT is not configured." }, { status: 503 });
    }
    return NextResponse.json(
      { provider, token: apiKey },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

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
  return NextResponse.json(
    { provider, token: body.token },
    { headers: { "Cache-Control": "no-store" } },
  );
}
