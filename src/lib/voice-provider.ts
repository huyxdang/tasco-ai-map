// Server-side voice provider selection. TASCO_STT_PROVIDER / TASCO_TTS_PROVIDER
// toggle between ElevenLabs (default) and Valsea (SEA-accent specialist) per
// direction independently — e.g. Valsea STT with ElevenLabs TTS is valid.
// Unrecognized values fall back to ElevenLabs so a typo never kills the demo.

export type VoiceProvider = "elevenlabs" | "valsea";

export function resolveVoiceProvider(value: string | undefined): VoiceProvider {
  return value?.trim().toLowerCase() === "valsea" ? "valsea" : "elevenlabs";
}

export function resolveSttProvider(): VoiceProvider {
  return resolveVoiceProvider(process.env.TASCO_STT_PROVIDER);
}

export function resolveTtsProvider(): VoiceProvider {
  return resolveVoiceProvider(process.env.TASCO_TTS_PROVIDER);
}
