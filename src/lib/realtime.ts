// Voice stack is fully ElevenLabs: Scribe v2 Realtime for STT (src/lib/stt-client.ts)
// and Flash v2.5 for TTS (src/lib/tts-client.ts). This module keeps the pieces the
// voice UI shares: the word-confirmed barge-in guard and hard mic muting.

type AudioTrackSource = Pick<MediaStream, "getAudioTracks">;

export function setAudioTracksMuted(stream: AudioTrackSource | null, muted: boolean) {
  stream?.getAudioTracks().forEach((track) => { track.enabled = !muted; });
}

// Barge-in must be confirmed by transcribed words, never by raw VAD events, so a
// breath or a bump on the microphone cannot stop the assistant mid-sentence.
// Two word-like tokens, or one reasonably long word, count as real speech.
export function isConfirmedSpeech(transcript: string): boolean {
  const tokens = wordTokens(transcript);
  if (tokens.length >= 2) return true;
  return tokens.some((token) => token.length >= 4);
}

// Interrupting active playback demands MORE evidence than opening a turn:
// in a noisy room, stray transcribed words (TV, other people) must not stop
// the assistant — three word tokens or two substantial ones.
export function isConfirmedBargeIn(transcript: string): boolean {
  const tokens = wordTokens(transcript);
  if (tokens.length >= 3) return true;
  // Two-word interrupts like "gần hơn"/"rẻ hơn" (6 letters) must pass while
  // filler pairs like "à ừm"/"ok la" stay below the bar.
  return tokens.length === 2 && tokens.join("").length >= 6;
}

function wordTokens(transcript: string): string[] {
  return transcript
    .split(/\s+/)
    .map((token) => token.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((token) => token.length > 0);
}

// Speech synthesis moved to ElevenLabs (/api/tts + src/lib/tts-client.ts). The
// OpenAI Realtime session is transcription-only and never produces audio, so no
// response.create payload exists anymore — the deterministic assistantResponse
// is sent verbatim to the TTS endpoint instead.
