// Browser client for realtime speech-to-text, provider-toggleable between
// ElevenLabs Scribe v2 Realtime (default) and Valsea RTT (SEA-accent
// specialist). /api/stt/token tells us which provider the server selected via
// TASCO_STT_PROVIDER; this module speaks the matching WebSocket protocol.
// Either way: mic audio is captured, downsampled to 16kHz PCM16, and streamed;
// partial transcripts drive the live caption, committed/final transcripts feed
// the deterministic engine.

export interface SttHandlers {
  onOpen: () => void;
  onPartial: (text: string) => void;
  onCommitted: (text: string) => void;
  onError: (message: string) => void;
}

export interface SttSession {
  stream: MediaStream;
  stop: () => void;
}

export type SttProvider = "elevenlabs" | "valsea";

const TARGET_SAMPLE_RATE = 16_000;

// Domain vocabulary biases the recognizer toward the words our users actually
// say — venue types, districts, landmarks, and the planned trip's key phrases.
// ElevenLabs takes these as repeated `keyterms` params; Valsea as `hint_text`.
const KEYTERMS = [
  "quán cà phê", "nhà hàng", "khách sạn", "trạm xăng", "bãi đỗ xe", "công viên",
  "Quận 1", "Sài Gòn", "Hà Nội", "Đà Nẵng", "Hồ Gươm", "Chợ Bến Thành",
  "Tân Sơn Nhất", "phở", "bún chả", "món Việt", "món Ý", "gần đây", "yên tĩnh",
  "wifi", "giá rẻ", "mở cửa khuya", "học nhóm", "hẹn hò", "đặt bàn", "gần hơn",
  "rẻ hơn", "đổ xăng", "ăn tối", "ba người", "làm việc", "gần trung tâm", "dễ đỗ xe",
  "Pizza 4P's", "Trung Nguyên", "Ví VETC", "7 giờ tối", "19 giờ", "12 tháng 7",
  "ngày 12 tháng 7", "chốt đi", "chốt hành trình", "bắt đầu dẫn đường",
];

const SCRIBE_PARAMS = new URLSearchParams({
  model_id: "scribe_v2_realtime",
  language_code: "vi",
  audio_format: "pcm_16000",
  commit_strategy: "vad",
  // Raised after real-world QA: noisy rooms were still sneaking through.
  vad_threshold: "0.75",
  vad_silence_threshold_secs: "1.2",
  min_speech_duration_ms: "300",
  filter_background_audio: "true",
});
for (const term of KEYTERMS) SCRIBE_PARAMS.append("keyterms", term);

function downsampleTo16k(input: Float32Array, inputRate: number): Int16Array {
  const ratio = inputRate / TARGET_SAMPLE_RATE;
  const length = Math.floor(input.length / ratio);
  const output = new Int16Array(length);
  for (let i = 0; i < length; i++) {
    const sample = input[Math.floor(i * ratio)] ?? 0;
    const clamped = Math.max(-1, Math.min(1, sample));
    output[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  return output;
}

function toBase64(samples: Int16Array): string {
  const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x2000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x2000));
  }
  return btoa(binary);
}

function buildSocketUrl(provider: SttProvider, token: string): string {
  if (provider === "valsea") {
    // Browsers can't set WebSocket headers; Valsea's documented browser auth
    // is the api_key query param.
    return `wss://api.valsea.ai/v1/realtime?api_key=${encodeURIComponent(token)}`;
  }
  return `wss://api.elevenlabs.io/v1/speech-to-text/realtime?${SCRIBE_PARAMS}&token=${encodeURIComponent(token)}`;
}

function encodeChunk(provider: SttProvider, pcm: Int16Array): string {
  if (provider === "valsea") {
    return JSON.stringify({ type: "audio.append", audio: toBase64(pcm) });
  }
  return JSON.stringify({
    message_type: "input_audio_chunk",
    audio_base_64: toBase64(pcm),
    sample_rate: TARGET_SAMPLE_RATE,
  });
}

export async function startSttSession(handlers: SttHandlers, requestedProvider: SttProvider = "elevenlabs"): Promise<SttSession> {
  const tokenResponse = await fetch("/api/stt/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider: requestedProvider }),
  });
  if (!tokenResponse.ok) throw new Error("STT token unavailable");
  const { token, provider = "elevenlabs" } = (await tokenResponse.json()) as {
    token: string;
    provider?: SttProvider;
  };

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });

  const socket = new WebSocket(buildSocketUrl(provider, token));

  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(4096, 1, 1);
  let closed = false;
  let streaming = false;

  processor.onaudioprocess = (event) => {
    if (closed || !streaming || socket.readyState !== WebSocket.OPEN) return;
    const pcm = downsampleTo16k(event.inputBuffer.getChannelData(0), audioContext.sampleRate);
    socket.send(encodeChunk(provider, pcm));
  };

  const beginStreaming = () => {
    if (streaming || closed) return;
    streaming = true;
    source.connect(processor);
    processor.connect(audioContext.destination);
    handlers.onOpen();
  };

  socket.onopen = () => {
    if (provider === "valsea") {
      // Valsea handshakes in-band: configure the session, then wait for
      // session.ready before shipping audio. Server-side segmentation emits
      // transcript.final per utterance, so no client VAD commit is needed.
      socket.send(
        JSON.stringify({
          type: "session.start",
          model: "valsea-rtt",
          language: "vietnamese",
          hint_text: KEYTERMS.join(", "),
          enable_correction: true,
        }),
      );
      return;
    }
    beginStreaming();
  };
  socket.onmessage = (event) => {
    let message: { message_type?: string; type?: string; text?: string; error?: string; message?: string };
    try {
      message = JSON.parse(String(event.data)) as typeof message;
    } catch {
      return;
    }
    const kind = message.message_type ?? message.type ?? "";
    if (kind === "session.ready") beginStreaming();
    else if (kind === "partial_transcript" || kind === "transcript.partial") {
      handlers.onPartial(message.text ?? "");
    } else if (
      kind === "committed_transcript" ||
      kind === "committed_transcript_with_timestamps" ||
      kind === "transcript.final"
    ) {
      handlers.onCommitted(message.text ?? "");
    } else if (kind.includes("error") || kind === "quota_exceeded" || kind === "rate_limited") {
      handlers.onError(message.error ?? message.message ?? kind);
    }
  };
  socket.onerror = () => {
    if (!closed) handlers.onError("stt-socket-error");
  };
  socket.onclose = () => {
    if (!closed) handlers.onError("stt-socket-closed");
  };

  const stop = () => {
    closed = true;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    if (provider === "valsea" && socket.readyState === WebSocket.OPEN) {
      try { socket.send(JSON.stringify({ type: "session.stop" })); } catch { /* closing anyway */ }
    }
    try { socket.close(); } catch { /* already closed */ }
    processor.disconnect();
    source.disconnect();
    void audioContext.close().catch(() => undefined);
    stream.getTracks().forEach((track) => track.stop());
  };

  return { stream, stop };
}
