import { afterEach, describe, expect, it, vi } from "vitest";

import { POST as POST_STT_TOKEN } from "../src/app/api/stt/token/route";
import { POST as POST_TTS } from "../src/app/api/tts/route";
import { isConfirmedBargeIn, isConfirmedSpeech, setAudioTracksMuted } from "../src/lib/realtime";
import { routeTheaterAvailability } from "../src/lib/route-theater";

// The voice stack is provider-toggleable via TASCO_STT_PROVIDER /
// TASCO_TTS_PROVIDER: ElevenLabs by default (Scribe v2 Realtime STT behind
// /api/stt/token single-use tokens, Flash v2.5 TTS behind /api/tts), Valsea
// as the SEA-accent alternative. Endpoints fail closed without the selected
// provider's key.
describe("ElevenLabs voice endpoints (default provider)", () => {
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
    await expect(response.json()).resolves.toEqual({ provider: "elevenlabs", token: "single-use-token" });
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

describe("Valsea voice endpoints (TASCO_STT_PROVIDER / TASCO_TTS_PROVIDER = valsea)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("STT token endpoint fails closed without the Valsea key", async () => {
    vi.stubEnv("TASCO_STT_PROVIDER", "valsea");
    vi.stubEnv("VALSEA_API_KEY", "");
    const response = await POST_STT_TOKEN();
    expect(response.status).toBe(503);
  });

  it("STT token endpoint returns the Valsea browser credential without calling ElevenLabs", async () => {
    vi.stubEnv("TASCO_STT_PROVIDER", "valsea");
    vi.stubEnv("VALSEA_API_KEY", "vs-demo-key");
    const upstreamFetch = vi.fn();
    vi.stubGlobal("fetch", upstreamFetch);
    const response = await POST_STT_TOKEN();
    expect(response.status).toBe(200);
    // Valsea has no single-use-token endpoint; browser WS auth is the raw key
    // (documented ?api_key= handshake), so the key IS the token here.
    await expect(response.json()).resolves.toEqual({ provider: "valsea", token: "vs-demo-key" });
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it("allows the session UI to choose Valsea STT independently of the server default", async () => {
    vi.stubEnv("TASCO_STT_PROVIDER", "elevenlabs");
    vi.stubEnv("VALSEA_API_KEY", "vs-demo-key");
    vi.stubGlobal("fetch", vi.fn());
    const response = await POST_STT_TOKEN(new Request("http://localhost/api/stt/token", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "valsea" })
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ provider: "valsea", token: "vs-demo-key" });
  });

  it("never exposes the Valsea browser credential in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TASCO_STT_PROVIDER", "elevenlabs");
    vi.stubEnv("VALSEA_API_KEY", "vs-demo-key");
    const response = await POST_STT_TOKEN(new Request("http://localhost/api/stt/token", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "valsea" })
    }));
    expect(response.status).toBe(403);
    expect(JSON.stringify(await response.json())).not.toContain("vs-demo-key");
  });

  it("TTS endpoint fails closed without the Valsea key", async () => {
    vi.stubEnv("TASCO_TTS_PROVIDER", "valsea");
    vi.stubEnv("VALSEA_API_KEY", "");
    const response = await POST_TTS(new Request("http://localhost/api/tts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Xin chào" })
    }));
    expect(response.status).toBe(503);
  });

  it("TTS endpoint streams Valsea audio via the OpenAI-compatible speech route", async () => {
    vi.stubEnv("TASCO_TTS_PROVIDER", "valsea");
    vi.stubEnv("VALSEA_API_KEY", "vs-demo-key");
    const upstreamFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://api.valsea.ai/v1/audio/speech");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({ Authorization: "Bearer vs-demo-key" });
      const body = JSON.parse(String(init?.body)) as {
        model: string; input: string; voice: string; language: string; response_format: string;
      };
      expect(body.model).toBe("valsea-tts");
      expect(body.voice).toBe("valsea-neutral");
      expect(body.language).toBe("vietnamese");
      expect(body.response_format).toBe("mp3");
      expect(body.input).toBe("Tôi tìm được 2 lựa chọn phù hợp nhất.");
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
    expect(JSON.stringify([...response.headers.entries()])).not.toContain("vs-demo-key");
    expect(upstreamFetch).toHaveBeenCalledOnce();
  });

  it("allows the session UI to pair Valsea STT with ElevenLabs TTS", async () => {
    vi.stubEnv("TASCO_TTS_PROVIDER", "valsea");
    vi.stubEnv("ELEVENLABS_API_KEY", "el-secret-key");
    const upstreamFetch = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toContain("api.elevenlabs.io/v1/text-to-speech/");
      return new Response(new Blob([new Uint8Array([1])]).stream(), {
        status: 200, headers: { "Content-Type": "audio/mpeg" }
      });
    });
    vi.stubGlobal("fetch", upstreamFetch);
    const response = await POST_TTS(new Request("http://localhost/api/tts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Xin chào", provider: "elevenlabs" })
    }));
    expect(response.status).toBe(200);
    expect(upstreamFetch).toHaveBeenCalledOnce();
  });

  it("unrecognized provider values fall back to ElevenLabs", async () => {
    vi.stubEnv("TASCO_TTS_PROVIDER", "whisper-lol");
    vi.stubEnv("ELEVENLABS_API_KEY", "el-secret-key");
    const upstreamFetch = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toContain("api.elevenlabs.io/v1/text-to-speech/");
      return new Response(new Blob([new Uint8Array([1])]).stream(), {
        status: 200, headers: { "Content-Type": "audio/mpeg" }
      });
    });
    vi.stubGlobal("fetch", upstreamFetch);
    const response = await POST_TTS(new Request("http://localhost/api/tts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Xin chào" })
    }));
    expect(response.status).toBe(200);
    expect(upstreamFetch).toHaveBeenCalledOnce();
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

  it("demands more evidence to interrupt playback than to open a turn", () => {
    expect(isConfirmedBargeIn("gần hơn và rẻ hơn")).toBe(true);
    expect(isConfirmedBargeIn("dừng lại đi")).toBe(true);
    expect(isConfirmedBargeIn("khoan đã nhé")).toBe(true);
    // Two short stray words (TV, other people) must NOT stop the assistant.
    expect(isConfirmedBargeIn("à ừm")).toBe(false);
    expect(isConfirmedBargeIn("ok la")).toBe(false);
    expect(isConfirmedBargeIn("gần hơn")).toBe(true);
    expect(isConfirmedBargeIn("khoan")).toBe(false);
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
      message: "Bản đồ 3D chưa sẵn sàng. Biên nhận và hành trình vẫn được giữ nguyên."
    });
  });
});
