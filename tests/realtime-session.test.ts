import { afterEach, describe, expect, it, vi } from "vitest";

import { POST as POST_STT_TOKEN } from "../src/app/api/stt/token/route";
import { POST as POST_TTS } from "../src/app/api/tts/route";
import { isConfirmedSpeech, setAudioTracksMuted } from "../src/lib/realtime";
import { routeTheaterAvailability } from "../src/lib/route-theater";

// The voice stack is fully ElevenLabs: Scribe v2 Realtime STT behind
// /api/stt/token (single-use tokens) and Flash v2.5 TTS behind /api/tts.
// Both endpoints hold the API key server-side and fail closed without it.
describe("ElevenLabs voice endpoints", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("STT token endpoint fails closed without the ElevenLabs key", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    const response = await POST_STT_TOKEN();
    expect(response.status).toBe(503);
  });

  it("STT token endpoint mints a single-use realtime_scribe token without exposing the key", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "el-secret-key");
    const upstreamFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://api.elevenlabs.io/v1/single-use-token/realtime_scribe");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({ "xi-api-key": "el-secret-key" });
      return new Response(JSON.stringify({ token: "single-use-token" }), {
        status: 200, headers: { "Content-Type": "application/json" }
      });
    });
    vi.stubGlobal("fetch", upstreamFetch);
    const response = await POST_STT_TOKEN();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ token: "single-use-token" });
    expect(JSON.stringify([...response.headers.entries()])).not.toContain("el-secret-key");
    expect(upstreamFetch).toHaveBeenCalledOnce();
  });

  it("STT token endpoint surfaces upstream failures as 502", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "el-secret-key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 401 })));
    const response = await POST_STT_TOKEN();
    expect(response.status).toBe(502);
  });

  it("TTS endpoint fails closed without the ElevenLabs key", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    const response = await POST_TTS(new Request("http://localhost/api/tts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Xin chào" })
    }));
    expect(response.status).toBe(503);
  });

  it("TTS endpoint streams ElevenLabs audio without exposing the server key", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "el-secret-key");
    const upstreamFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toContain("api.elevenlabs.io/v1/text-to-speech/");
      expect(init?.headers).toMatchObject({ "xi-api-key": "el-secret-key" });
      const body = JSON.parse(String(init?.body)) as { text: string; model_id: string; language_code: string };
      expect(body.model_id).toBe("eleven_flash_v2_5");
      expect(body.language_code).toBe("vi");
      expect(body.text).toBe("Tôi tìm được 2 lựa chọn phù hợp nhất.");
      return new Response(new Blob([new Uint8Array([1, 2, 3])]).stream(), {
        status: 200, headers: { "Content-Type": "audio/mpeg" }
      });
    });
    vi.stubGlobal("fetch", upstreamFetch);
    const response = await POST_TTS(new Request("http://localhost/api/tts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Tôi tìm được 2 lựa chọn phù hợp nhất." })
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(JSON.stringify([...response.headers.entries()])).not.toContain("el-secret-key");
    expect(upstreamFetch).toHaveBeenCalledOnce();
  });

  it("TTS endpoint rejects empty or malformed requests", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "el-secret-key");
    const empty = await POST_TTS(new Request("http://localhost/api/tts", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "  " })
    }));
    expect(empty.status).toBe(400);
    const malformed = await POST_TTS(new Request("http://localhost/api/tts", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "not json"
    }));
    expect(malformed.status).toBe(400);
  });
});

describe("voice UI guards", () => {
  it("confirms barge-in only on real words, never on noise artifacts", () => {
    expect(isConfirmedSpeech("gần hơn")).toBe(true);
    expect(isConfirmedSpeech("rẻ hơn một chút")).toBe(true);
    expect(isConfirmedSpeech("khoan")).toBe(true);
    expect(isConfirmedSpeech("")).toBe(false);
    expect(isConfirmedSpeech("   ")).toBe(false);
    expect(isConfirmedSpeech("à")).toBe(false);
    expect(isConfirmedSpeech("ừm")).toBe(false);
    expect(isConfirmedSpeech("...")).toBe(false);
    expect(isConfirmedSpeech("hm")).toBe(false);
  });

  it("hard-mutes and explicitly re-enables every audio track", () => {
    const tracks = [{ enabled: true }, { enabled: true }] as MediaStreamTrack[];
    const stream = { getAudioTracks: () => tracks };
    setAudioTracksMuted(stream, true);
    expect(tracks.every((track) => !track.enabled)).toBe(true);
    setAudioTracksMuted(stream, false);
    expect(tracks.every((track) => track.enabled)).toBe(true);
  });

  it("starts Route Theater only when MapLibre reports ready", () => {
    expect(routeTheaterAvailability(true)).toEqual({ canPlay: true, message: "" });
    expect(routeTheaterAvailability(false)).toEqual({
      canPlay: false,
      message: "Bản đồ 3D chưa sẵn sàng. Biên nhận và hành trình mô phỏng vẫn được giữ nguyên."
    });
  });
});
