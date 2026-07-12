// Client-side player for the server-proxied ElevenLabs stream. The text passed
// in is always the deterministic assistantResponse; this module only moves audio.

export interface TtsPlayback {
  /** Stops playback immediately (barge-in) and aborts any in-flight fetch. */
  stop: () => void;
  /** Resolves true when playback finished (or was stopped), false on fetch/playback failure. */
  done: Promise<boolean>;
}

export function playGroundedSpeech(text: string, provider: "elevenlabs" | "valsea"): TtsPlayback {
  const controller = new AbortController();
  let audio: HTMLAudioElement | null = null;
  let objectUrl: string | null = null;
  let stopped = false;

  const cleanup = () => {
    if (audio) {
      audio.pause();
      audio.src = "";
      audio = null;
    }
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
  };

  const done = (async () => {
    const response = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, provider }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`TTS unavailable (${response.status})`);
    const blob = await response.blob();
    if (stopped) return;
    objectUrl = URL.createObjectURL(blob);
    audio = new Audio(objectUrl);
    await new Promise<void>((resolve, reject) => {
      if (!audio) return resolve();
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error("TTS playback failed"));
      audio.onpause = () => resolve();
      audio.play().catch(reject);
    });
  })().finally(cleanup);

  return {
    stop: () => {
      stopped = true;
      controller.abort();
      cleanup();
    },
    done: done.then(() => true).catch(() => stopped),
  };
}
