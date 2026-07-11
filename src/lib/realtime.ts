import type { ChatResponse } from "./types";

type AudioTrackSource = Pick<MediaStream, "getAudioTracks">;

export type RealtimeEventSink = {
  onSpeechStarted: () => void;
  onTranscriptDelta: (delta: string) => void;
  onTranscriptCompleted: (transcript: string) => void;
  onResponseCreated: () => void;
  onOutputTranscriptDelta: (delta: string) => void;
  onResponseDone: () => void;
};

export function dispatchRealtimeServerEvent(raw: string, sink: RealtimeEventSink) {
  let event: { type?: string; transcript?: string; delta?: string };
  try { event = JSON.parse(raw) as typeof event; } catch { return false; }
  if (event.type === "input_audio_buffer.speech_started") sink.onSpeechStarted();
  else if (event.type === "conversation.item.input_audio_transcription.delta") sink.onTranscriptDelta(event.delta ?? "");
  else if (event.type === "conversation.item.input_audio_transcription.completed" && event.transcript) sink.onTranscriptCompleted(event.transcript);
  else if (event.type === "response.created") sink.onResponseCreated();
  else if (event.type === "response.output_audio_transcript.delta") sink.onOutputTranscriptDelta(event.delta ?? "");
  else if (event.type === "response.done") sink.onResponseDone();
  else return false;
  return true;
}

export function setAudioTracksMuted(stream: AudioTrackSource | null, muted: boolean) {
  stream?.getAudioTracks().forEach((track) => { track.enabled = !muted; });
}

// Barge-in must be confirmed by transcribed words, never by raw VAD events, so a
// breath or a bump on the microphone cannot stop the assistant mid-sentence.
// Two word-like tokens, or one reasonably long word, count as real speech.
export function isConfirmedSpeech(transcript: string): boolean {
  const tokens = transcript
    .split(/\s+/)
    .map((token) => token.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((token) => token.length > 0);
  if (tokens.length >= 2) return true;
  return tokens.some((token) => token.length >= 4);
}

export function groundedRealtimeResponse(response: ChatResponse) {
  const grounding = JSON.stringify({
    assistantResponse: response.assistantResponse,
    selectedPoi: response.recommendations?.[0]?.poi.name ?? null,
    journeyTotalVnd: response.journey?.totalVnd ?? null,
    savingsVnd: response.journey?.savingsVnd ?? null,
    revisionOutcome: response.journey?.revision.outcome ?? null,
    simulation: true
  });
  return {
    type: "response.create",
    response: {
      conversation: "none",
      metadata: { source: "tasco-deterministic-chat" },
      output_modalities: ["audio"],
      input: [{ type: "message", role: "user", content: [{ type: "input_text", text: grounding }] }],
      instructions: "Đọc ngắn gọn đúng nội dung assistantResponse trong dữ liệu có cấu trúc. Không thêm hoặc đổi địa điểm, giá, tuyến, ưu đãi, tổng tiền hay kết quả sửa đổi. Nói rõ đây là mô phỏng nếu có hành trình."
    }
  };
}
