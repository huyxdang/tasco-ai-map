import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "../src/app/api/realtime/session/route";
import { dispatchRealtimeServerEvent, groundedRealtimeResponse, setAudioTracksMuted } from "../src/lib/realtime";
import type { ChatResponse } from "../src/lib/types";
import { routeTheaterAvailability } from "../src/lib/route-theater";

describe("Realtime session endpoint", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("fails closed without exposing or requiring a client-side API key", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const response = await POST(new Request("http://localhost/api/realtime/session", {
      method: "POST",
      headers: { "Content-Type": "application/sdp" },
      body: "v=0"
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Realtime is not configured." });
  });

  it("creates a transcription-first grounded session without returning the server key", async () => {
    vi.stubEnv("OPENAI_API_KEY", "server-secret-key");
    const upstreamFetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const form = init?.body as FormData;
      const session = JSON.parse(String(form.get("session"))) as {
        model: string;
        audio: { input: { turn_detection: { create_response: boolean; interrupt_response: boolean } } };
      };
      expect(session.model).toBe("gpt-realtime-2.1");
      expect(session.audio.input.turn_detection).toMatchObject({ create_response: false, interrupt_response: false });
      expect(init?.headers).toMatchObject({ Authorization: "Bearer server-secret-key", "OpenAI-Safety-Identifier": "browser-session" });
      expect(form.get("sdp")).toBe("v=0\r\no=tasco");
      return new Response("v=0\r\no=openai-answer", { status: 200, headers: { "Content-Type": "application/sdp" } });
    });
    vi.stubGlobal("fetch", upstreamFetch);

    const response = await POST(new Request("http://localhost/api/realtime/session", {
      method: "POST",
      headers: { "Content-Type": "application/sdp", "X-TASCO-Session": "browser-session" },
      body: "v=0\r\no=tasco"
    }));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("v=0\r\no=openai-answer");
    expect(upstreamFetch).toHaveBeenCalledOnce();
    expect(JSON.stringify([...response.headers.entries()])).not.toContain("server-secret-key");
  });

  it("builds speech only from the deterministic chat response", () => {
    const response = {
      assistantResponse: "Đã đổi hành trình mô phỏng và tiết kiệm 120.000 ₫.",
      recommendations: [], confidence: 1, intent: "journey_revision", mapAction: { type: "plan" }
    } as ChatResponse;
    const event = groundedRealtimeResponse(response);
    const serialized = JSON.stringify(event);
    expect(event.type).toBe("response.create");
    expect(event.response.metadata.source).toBe("tasco-deterministic-chat");
    expect(serialized).toContain(response.assistantResponse);
    expect(serialized).toContain('"conversation":"none"');
  });

  it("hard-mutes and explicitly re-enables every audio track", () => {
    const tracks = [{ enabled: true }, { enabled: true }] as MediaStreamTrack[];
    const stream = { getAudioTracks: () => tracks };
    setAudioTracksMuted(stream, true);
    expect(tracks.every((track) => !track.enabled)).toBe(true);
    setAudioTracksMuted(stream, false);
    expect(tracks.every((track) => track.enabled)).toBe(true);
  });

  it("dispatches provider events through the supplied current sink", () => {
    const first = vi.fn();
    const second = vi.fn();
    dispatchRealtimeServerEvent(JSON.stringify({ type: "conversation.item.input_audio_transcription.completed", transcript: "first" }), {
      onSpeechStarted: vi.fn(), onTranscriptDelta: vi.fn(), onTranscriptCompleted: first,
      onResponseCreated: vi.fn(), onOutputTranscriptDelta: vi.fn(), onResponseDone: vi.fn()
    });
    dispatchRealtimeServerEvent(JSON.stringify({ type: "conversation.item.input_audio_transcription.completed", transcript: "latest" }), {
      onSpeechStarted: vi.fn(), onTranscriptDelta: vi.fn(), onTranscriptCompleted: second,
      onResponseCreated: vi.fn(), onOutputTranscriptDelta: vi.fn(), onResponseDone: vi.fn()
    });
    expect(first).toHaveBeenCalledWith("first");
    expect(second).toHaveBeenCalledWith("latest");
  });

  it("starts Route Theater only when MapLibre reports ready", () => {
    expect(routeTheaterAvailability(true)).toEqual({ canPlay: true, message: "" });
    expect(routeTheaterAvailability(false)).toEqual({
      canPlay: false,
      message: "Bản đồ 3D chưa sẵn sàng. Biên nhận và hành trình mô phỏng vẫn được giữ nguyên."
    });
  });
});
