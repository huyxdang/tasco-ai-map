// Browser client for ElevenLabs Scribe v2 Realtime speech-to-text.
// Mic audio is captured, downsampled to 16kHz PCM, and streamed over a WebSocket
// authenticated with a single-use token from /api/stt/token. Server-side VAD
// commits segments on silence; `filter_background_audio`, a raised
// `vad_threshold`, and `min_speech_duration_ms` keep breaths and mic bumps from
// registering as speech at the source.

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

const TARGET_SAMPLE_RATE = 16_000;

// Domain vocabulary biases Scribe toward the words our users actually say —
// venue types, districts, landmarks, and the demo's key phrases.
const KEYTERMS = [
  "quán cà phê", "nhà hàng", "khách sạn", "trạm xăng", "bãi đỗ xe", "công viên",
  "Quận 1", "Sài Gòn", "Hà Nội", "Đà Nẵng", "Hồ Gươm", "Chợ Bến Thành",
  "Tân Sơn Nhất", "phở", "bún chả", "món Việt", "món Ý", "gần đây", "yên tĩnh",
  "wifi", "giá rẻ", "mở cửa khuya", "học nhóm", "hẹn hò", "đặt bàn", "gần hơn",
  "rẻ hơn", "đổ xăng", "ăn tối", "gần trung tâm", "dễ đỗ xe",
];

const WS_PARAMS = new URLSearchParams({
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
for (const term of KEYTERMS) WS_PARAMS.append("keyterms", term);

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

export async function startScribeSession(handlers: SttHandlers): Promise<SttSession> {
  const tokenResponse = await fetch("/api/stt/token", { method: "POST" });
  if (!tokenResponse.ok) throw new Error("STT token unavailable");
  const { token } = (await tokenResponse.json()) as { token: string };

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });

  const socket = new WebSocket(
    `wss://api.elevenlabs.io/v1/speech-to-text/realtime?${WS_PARAMS}&token=${encodeURIComponent(token)}`,
  );

  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(4096, 1, 1);
  let closed = false;

  processor.onaudioprocess = (event) => {
    if (closed || socket.readyState !== WebSocket.OPEN) return;
    const pcm = downsampleTo16k(event.inputBuffer.getChannelData(0), audioContext.sampleRate);
    socket.send(
      JSON.stringify({
        message_type: "input_audio_chunk",
        audio_base_64: toBase64(pcm),
        sample_rate: TARGET_SAMPLE_RATE,
      }),
    );
  };

  socket.onopen = () => {
    source.connect(processor);
    processor.connect(audioContext.destination);
    handlers.onOpen();
  };
  socket.onmessage = (event) => {
    let message: { message_type?: string; type?: string; text?: string; error?: string };
    try {
      message = JSON.parse(String(event.data)) as typeof message;
    } catch {
      return;
    }
    const kind = message.message_type ?? message.type ?? "";
    if (kind === "partial_transcript") handlers.onPartial(message.text ?? "");
    else if (kind === "committed_transcript" || kind === "committed_transcript_with_timestamps") {
      handlers.onCommitted(message.text ?? "");
    } else if (kind.includes("error") || kind === "quota_exceeded" || kind === "rate_limited") {
      handlers.onError(message.error ?? kind);
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
    try { socket.close(); } catch { /* already closed */ }
    processor.disconnect();
    source.disconnect();
    void audioContext.close().catch(() => undefined);
    stream.getTracks().forEach((track) => track.stop());
  };

  return { stream, stop };
}
