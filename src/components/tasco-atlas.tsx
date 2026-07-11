"use client";

import {
  ArrowLeft,
  Bell,
  BatteryCharging,
  Car,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleStop,
  Clock3,
  CreditCard,
  FileText,
  Gift,
  Grid2X2,
  Link,
  MapPin,
  Menu,
  Mic,
  MicOff,
  Navigation,
  ParkingCircle,
  Pause,
  Play,
  ReceiptText,
  Send,
  ShieldCheck,
  Sparkles,
  Utensils,
  Volume2,
  X
} from "lucide-react";
import dynamic from "next/dynamic";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";

import type { ChatResponse, Coordinates, Journey, JourneyActionKind, Poi, UserProfile } from "@/lib/types";
import { isConfirmedSpeech, setAudioTracksMuted } from "@/lib/realtime";
import { routeTheaterAvailability } from "@/lib/route-theater";
import { buildRoutes } from "@/lib/routing";
import { startScribeSession, type SttSession } from "@/lib/stt-client";
import { playGroundedSpeech, type TtsPlayback } from "@/lib/tts-client";

const MapView = dynamic(
  () => import("@/components/map-view").then((module) => module.MapView),
  { ssr: false, loading: () => <div className="atlas-map-loading">Đang mở bản đồ…</div> }
);

type TascoAtlasProps = { initialPois: Poi[]; profiles: UserProfile[] };
type Screen = "home" | "session" | "live" | "checkout" | "receipt" | "driving";
type VoiceState = "idle" | "listening" | "thinking" | "speaking" | "interrupted" | "muted";
type DemoStage = 0 | 1 | 2 | 3;
type MapMode = "2d" | "3d";
type SimulatedReceipt = { id: string; journey: Journey; confirmedAt: string };
type DriveStop = { poi: Poi; kind: JourneyActionKind };
type DriveLogEntry = { id: string; who: "user" | "atlas"; text: string };
type DriveState = {
  total: number;
  index: number;
  nextStop: DriveStop;
  isFinalStop: boolean;
  legDistanceMeters: number;
  legSeconds: number;
  remainingSeconds: number;
};

// Simulated-navigation origin: the user's location in central HCMC (the map's
// default center). Disclosed as "mô phỏng" — it only seeds the deterministic
// route math (buildRoutes) that produces every distance/ETA shown while driving.
const DRIVING_ORIGIN: Coordinates = { lat: 10.7758, lon: 106.7002 };
// Complex asks while the car is moving are deferred, per design §2.6.
const DRIVING_DEFERRAL =
  "Tôi có thể giúp bạn lập kế hoạch chi tiết khi xe đã dừng. Hiện tại tôi sẽ giữ tuyến đường an toàn.";

function formatDriveDistance(meters: number) {
  if (meters >= 1_000) return `${(meters / 1_000).toFixed(1).replace(".", ",")} km`;
  return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
}
function formatDriveMinutes(seconds: number) {
  return Math.max(1, Math.round(seconds / 60));
}
function driveClock(offsetSeconds: number) {
  return new Date(Date.now() + offsetSeconds * 1_000)
    .toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

const SCRIPT = {
  first: "Tối nay bốn người muốn ăn món Việt gần trung tâm, dễ đỗ xe.",
  budget: "Nhưng đừng mắc quá. Khoảng một triệu thôi.",
  interrupt: "Không, chỗ đó xa quá. Gần hơn và rẻ hơn một chút."
};

function newSessionId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `tasco-${Date.now().toString(36)}`;
}

export function TascoAtlas({ initialPois, profiles }: TascoAtlasProps) {
  const defaultPois = useMemo(() => {
    const hcmc = initialPois.filter((poi) => poi.city === "TP.HCM");
    return (hcmc.length ? hcmc : initialPois).slice(0, 10);
  }, [initialPois]);
  const [screen, setScreen] = useState<Screen>("home");
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [stage, setStage] = useState<DemoStage>(0);
  const [input, setInput] = useState("");
  const [partial, setPartial] = useState("");
  const [isTextMode, setIsTextMode] = useState(false);
  const [latestResponse, setLatestResponse] = useState<ChatResponse | null>(null);
  const [mapMode, setMapMode] = useState<MapMode>("2d");
  const [activeStopIndex, setActiveStopIndex] = useState(-1);
  const [isTheaterPlaying, setIsTheaterPlaying] = useState(false);
  const [receipt, setReceipt] = useState<SimulatedReceipt | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [theaterFallback, setTheaterFallback] = useState("");
  const [mapPois, setMapPois] = useState<Poi[]>(defaultPois);
  const [selectedPoiId, setSelectedPoiId] = useState<string | null>(defaultPois[0]?.id ?? null);
  const [notice, setNotice] = useState("");
  const [realtimeMode, setRealtimeMode] = useState<"connecting" | "realtime" | "scripted">("scripted");
  const sessionIdRef = useRef("tasco-demo");
  const contextRef = useRef<ChatResponse["sessionContext"]>(undefined);
  const sttRef = useRef<SttSession | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const confirmationLockRef = useRef(false);
  const realtimeAttemptRef = useRef(0);
  const responseActiveRef = useRef(false);
  const utteranceRef = useRef("");
  const ttsRef = useRef<TtsPlayback | null>(null);
  // Demo chrome (scripted advance button) only appears with ?demo=1 — the design
  // keeps demo stepping outside the customer sheet.
  const [showDemoRail, setShowDemoRail] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  // Driving mode (design §2.6 / Step 7): simulated progression through the
  // confirmed journey's ordered stops, with pause/resume and canned commands.
  const [driveStopIndex, setDriveStopIndex] = useState(0);
  const [drivePaused, setDrivePaused] = useState(false);
  const [driveLog, setDriveLog] = useState<DriveLogEntry[]>([]);

  useEffect(() => { sessionIdRef.current = newSessionId(); }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setShowDemoRail(new URLSearchParams(window.location.search).has("demo"));
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    if (!isTheaterPlaying) return;
    const stopCount = latestResponse?.journey?.actions.length ?? 0;
    if (!stopCount || activeStopIndex >= stopCount - 1) {
      const done = window.setTimeout(() => { setIsTheaterPlaying(false); setMapMode("2d"); }, 900);
      return () => window.clearTimeout(done);
    }
    const timer = window.setTimeout(() => setActiveStopIndex((index) => index + 1), activeStopIndex < 0 ? 200 : 1400);
    return () => window.clearTimeout(timer);
  }, [activeStopIndex, isTheaterPlaying, latestResponse?.journey?.actions.length]);

  // Truth rules: chips are the deterministic engine's parsed constraints and the
  // route line follows real journey stops (or top recommendations) — never a
  // stage counter.
  const constraints = latestResponse?.sessionContext?.constraints ?? [];

  // A polyline only exists for an actual journey (ordered stops). Plain search
  // results are independent suggestions — connecting them would draw a fake
  // "route" across whatever cities the results span.
  const routeCoordinates = useMemo<[number, number][]>(() => {
    const journeyStops = latestResponse?.journey?.actions
      .map((action) => latestResponse.recommendations.find((item) => item.poi.id === action.poiId)?.poi)
      .filter((poi): poi is Poi => Boolean(poi));
    if (!journeyStops || journeyStops.length < 2) return [];
    return journeyStops.map((poi) => [poi.coordinates.lon, poi.coordinates.lat] as [number, number]);
  }, [latestResponse]);

  // The confirmed journey's ordered stops, resolved back to their POIs so the
  // driving screen can speak real names and route between real coordinates.
  const driveStops = useMemo<DriveStop[]>(() => {
    const journey = latestResponse?.journey;
    if (!journey) return [];
    return journey.actions.flatMap((action) => {
      const poi = latestResponse?.recommendations.find((item) => item.poi.id === action.poiId)?.poi;
      return poi ? [{ poi, kind: action.kind }] : [];
    });
  }, [latestResponse]);

  // A single deterministic route from the simulated origin through every stop.
  // Every distance/duration the driving UI shows is read from these maneuvers —
  // nothing is a hardcoded literal (truth rule).
  const driveRoute = useMemo(() => {
    if (driveStops.length < 1) return null;
    const locations = [DRIVING_ORIGIN, ...driveStops.map((stop) => stop.poi.coordinates)];
    return buildRoutes({ locations, mode: "driving" }).routes[0] ?? null;
  }, [driveStops]);

  // Current-leg facts for the active stop index: distance/ETA to the next stop
  // and the summed remaining duration to the final destination.
  const drive = useMemo<DriveState | null>(() => {
    if (!driveRoute || driveStops.length === 0) return null;
    const total = driveStops.length;
    const index = Math.min(Math.max(0, driveStopIndex), total - 1);
    const legs = driveRoute.maneuvers; // one leg per stop (origin→stop0, stop0→stop1, …)
    const currentLeg = legs[index];
    const legDistanceMeters = currentLeg?.distanceMeters ?? 0;
    const legSeconds = currentLeg?.durationSeconds ?? 0;
    const remainingSeconds = legs.slice(index).reduce((sum, leg) => sum + leg.durationSeconds, 0);
    return {
      total,
      index,
      nextStop: driveStops[index],
      isFinalStop: index >= total - 1,
      legDistanceMeters,
      legSeconds,
      remainingSeconds,
    };
  }, [driveRoute, driveStops, driveStopIndex]);

  // Simulated forward progress (timer-based like the 3D theater), paused by the
  // pause control and only while the driving screen is on top.
  useEffect(() => {
    if (screen !== "driving" || drivePaused || !drive) return;
    if (drive.index >= drive.total - 1) return;
    const timer = window.setTimeout(() => {
      setDriveStopIndex((index) => Math.min(drive.total - 1, index + 1));
    }, 3_400);
    return () => window.clearTimeout(timer);
  }, [screen, drivePaused, drive]);

  function stopRealtime() {
    realtimeAttemptRef.current += 1;
    responseActiveRef.current = false;
    ttsRef.current?.stop();
    ttsRef.current = null;
    sttRef.current?.stop();
    sttRef.current = null;
    streamRef.current = null;
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount cleanup only
  useEffect(() => () => stopRealtime(), []);

  function setMicrophoneMuted(muted: boolean) {
    setAudioTracksMuted(streamRef.current, muted);
    setVoiceState(muted ? "muted" : "listening");
  }

  function toggleMute() {
    setMicrophoneMuted(voiceState !== "muted");
  }

  // Speaks the deterministic assistantResponse via ElevenLabs (/api/tts). OpenAI
  // is transcription-only now and never produces audio.
  async function speakGrounded(response: ChatResponse) {
    if (realtimeMode !== "realtime") {
      setVoiceState("listening");
      return;
    }
    ttsRef.current?.stop();
    responseActiveRef.current = true;
    setVoiceState("speaking");
    const playback = playGroundedSpeech(response.assistantResponse);
    ttsRef.current = playback;
    const played = await playback.done;
    if (ttsRef.current === playback) {
      responseActiveRef.current = false;
      setVoiceState("listening");
      if (!played) setNotice("Không phát được âm thanh — hãy kiểm tra quyền phát âm thanh của trình duyệt.");
    }
  }

  // A noise blip never stops the assistant: Scribe's server VAD filters
  // background audio at the source, and playback is cancelled only once a
  // transcript confirms real words. Genuine barge-in still works instantly.
  function cancelActiveResponseForBargeIn() {
    if (!responseActiveRef.current) return;
    ttsRef.current?.stop();
    responseActiveRef.current = false;
  }

  function handlePartialTranscript(text: string) {
    if (!text.trim()) return;
    utteranceRef.current = text;
    if (responseActiveRef.current && isConfirmedSpeech(text)) {
      cancelActiveResponseForBargeIn();
      setVoiceState("listening");
    }
    if (!responseActiveRef.current) setPartial(text);
  }

  function handleCommittedTranscript(text: string) {
    utteranceRef.current = "";
    if (!isConfirmedSpeech(text)) return;
    cancelActiveResponseForBargeIn();
    if (screen === "driving") { handleDrivingText(text); return; }
    setPartial(text);
    void handleUtterance(text);
  }

  function handleSttError() {
    stopRealtime();
    setRealtimeMode("scripted");
    setVoiceState("listening");
    setNotice("Đang dùng kịch bản demo ổn định. Bạn vẫn có thể nhập bằng chữ.");
  }

  // The Scribe session outlives many renders, so its callbacks must always run
  // against the CURRENT render's closures. Handlers registered directly would
  // freeze the first render's state (realtimeMode "connecting") and silently
  // skip TTS forever — the exact "transcribes but never speaks" bug.
  const sttHandlersRef = useRef({
    onPartial: handlePartialTranscript,
    onCommitted: handleCommittedTranscript,
    onError: handleSttError,
  });
  useEffect(() => {
    sttHandlersRef.current = {
      onPartial: handlePartialTranscript,
      onCommitted: handleCommittedTranscript,
      onError: handleSttError,
    };
  });

  async function startRealtime() {
    const attempt = realtimeAttemptRef.current + 1;
    realtimeAttemptRef.current = attempt;
    setRealtimeMode("connecting");
    setNotice("");
    try {
      const session = await startScribeSession({
        onOpen: () => {
          if (realtimeAttemptRef.current !== attempt) return;
          setRealtimeMode("realtime");
          setVoiceState("listening");
        },
        onPartial: (text) => { if (realtimeAttemptRef.current === attempt) sttHandlersRef.current.onPartial(text); },
        onCommitted: (text) => { if (realtimeAttemptRef.current === attempt) sttHandlersRef.current.onCommitted(text); },
        onError: () => { if (realtimeAttemptRef.current === attempt) sttHandlersRef.current.onError(); },
      });
      if (realtimeAttemptRef.current !== attempt) { session.stop(); return; }
      sttRef.current = session;
      streamRef.current = session.stream;
    } catch {
      if (realtimeAttemptRef.current !== attempt) return;
      stopRealtime();
      setRealtimeMode("scripted");
      setVoiceState("listening");
      setNotice("Đang dùng kịch bản demo ổn định. Bạn vẫn có thể nhập bằng chữ.");
    }
  }

  async function startSession() {
    setScreen("live");
    setStage(0);
    setPartial("");
    await startRealtime();
  }

  async function queryDeterministic(message: string, options?: { cleanJourneyContext?: boolean }): Promise<ChatResponse | null> {
    try {
      const response = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          ...(options?.cleanJourneyContext ? {} : { profileId: profiles[0]?.id, sessionContext: contextRef.current }),
          message
        })
      });
      if (!response.ok) return null;
      const payload = await response.json() as ChatResponse;
      contextRef.current = payload.sessionContext;
      setLatestResponse(payload);
      const pois = payload.recommendations?.map((item) => item.poi).filter(Boolean) ?? [];
      if (pois.length) { setMapPois(pois); setSelectedPoiId(pois[0].id); }
      return payload;
    } catch { /* The scripted visual fallback remains authoritative for the demo. */ }
    return null;
  }

  async function handleUtterance(message: string) {
    const normalized = message.toLocaleLowerCase("vi");
    setInput(""); setPartial(message);
    if (normalized.includes("gần hơn") || normalized.includes("rẻ hơn")) {
      cancelActiveResponseForBargeIn();
      setVoiceState("interrupted"); setStage(3);
      const result = await queryDeterministic(message);
      if (result) void speakGrounded(result); else setVoiceState("listening");
      return;
    }
    if (stage === 0) {
      setStage(1); setVoiceState("thinking");
      const result = await queryDeterministic(message);
      if (result) void speakGrounded(result); else setVoiceState("listening");
      return;
    }
    setStage(2); setVoiceState("thinking");
    const result = await queryDeterministic(message);
    if (result) void speakGrounded(result); else setVoiceState("listening");
  }

  function submit(event: FormEvent) { event.preventDefault(); if (input.trim()) void handleUtterance(input.trim()); }
  function advanceDemo() {
    const next = stage === 0 ? SCRIPT.first : stage === 1 ? SCRIPT.budget : SCRIPT.interrupt;
    void handleUtterance(next);
  }
  function endSession() {
    stopRealtime(); setVoiceState("idle"); setScreen("session"); setStage(0); setPartial(""); setLatestResponse(null); setMapPois(defaultPois); setReceipt(null); confirmationLockRef.current = false;
    setDriveLog([]); setDrivePaused(false); setDriveStopIndex(0);
    setSessionEnded(true);
  }

  async function openJourney() {
    let result = latestResponse;
    if (!result?.journey) {
      setVoiceState("thinking");
      result = await queryDeterministic("Tôi lái xe ở TP.HCM, cần đổ xăng, ăn tối và bãi đỗ xe.", { cleanJourneyContext: true });
    }
    if (stage >= 3 && result?.journey?.revision.outcome === "composed") {
      result = await queryDeterministic(SCRIPT.interrupt);
    }
    if (!result?.journey) { setNotice("Chưa đủ dữ liệu để tạo hành trình."); setVoiceState("listening"); return; }
    setScreen("checkout");
  }

  function confirmParking() {
    const journey = latestResponse?.journey;
    if (!journey || confirmationLockRef.current) return;
    confirmationLockRef.current = true;
    setIsConfirming(true);
    window.setTimeout(() => {
      const confirmed = { ...journey, actions: journey.actions.map((action) => action.kind === "parking" ? { ...action, status: "confirmed" as const } : action) };
      setReceipt({ id: `VETC-MP-${journey.id.slice(-6).toUpperCase()}`, journey: confirmed, confirmedAt: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) });
      setIsConfirming(false);
      setScreen("receipt");
    }, 350);
  }

  function playRouteTheater() {
    const availability = routeTheaterAvailability(mapReady);
    if (!availability.canPlay) {
      setTheaterFallback(availability.message);
      return;
    }
    setTheaterFallback(""); setMapMode("3d"); setActiveStopIndex(-1); setIsTheaterPlaying(true);
  }

  function startDriving() {
    setIsTheaterPlaying(false);
    setMapMode("2d");
    setDriveLog([]);
    setDrivePaused(false);
    setDriveStopIndex(0);
    // Reorder the map markers to the journey order so activeStopIndex lines up.
    const stops = driveStops.map((stop) => stop.poi);
    if (stops.length) { setMapPois(stops); setSelectedPoiId(stops[0].id); }
    setActiveStopIndex(0);
    setScreen("driving");
  }

  function endDriving() {
    ttsRef.current?.stop();
    responseActiveRef.current = false;
    setDrivePaused(false);
    setActiveStopIndex(-1);
    setMapMode("2d");
    setScreen("receipt");
  }

  // Spoken driving replies degrade gracefully: audio only when a live TTS
  // session is realistic, otherwise the line stays on-screen text (truth rule).
  async function speakDrivingLine(text: string) {
    if (realtimeMode !== "realtime") return;
    ttsRef.current?.stop();
    responseActiveRef.current = true;
    const playback = playGroundedSpeech(text);
    ttsRef.current = playback;
    await playback.done;
    if (ttsRef.current === playback) responseActiveRef.current = false;
  }

  function pushDriveLine(who: DriveLogEntry["who"], text: string) {
    setDriveLog((log) => [...log, { id: newSessionId(), who, text }].slice(-6));
  }

  function respondDriving(userText: string, atlasText: string) {
    if (drivePaused) return;
    pushDriveLine("user", userText);
    window.setTimeout(() => {
      pushDriveLine("atlas", atlasText);
      void speakDrivingLine(atlasText);
    }, 480);
  }

  // "Đọc điểm dừng tiếp theo" — next stop name + time, from the route legs.
  function readNextStop() {
    if (!drive) return;
    respondDriving(
      "Đọc điểm dừng tiếp theo.",
      `Điểm dừng tiếp theo: ${drive.nextStop.poi.name} — còn ${formatDriveDistance(drive.legDistanceMeters)}, khoảng ${formatDriveMinutes(drive.legSeconds)} phút.`
    );
  }
  // "Mấy giờ đến?" — ETA computed from summed leg durations.
  function askDriveEta() {
    if (!drive) return;
    respondDriving(
      "Mấy giờ đến?",
      `Dự kiến đến nơi lúc ${driveClock(drive.remainingSeconds)} — còn khoảng ${formatDriveMinutes(drive.remainingSeconds)} phút.`
    );
  }
  // "Lặp lại chỉ dẫn" — re-speak the current instruction.
  function repeatDriveInstruction() {
    if (!drive) return;
    respondDriving(
      "Lặp lại chỉ dẫn.",
      `Đi tiếp ${formatDriveDistance(drive.legDistanceMeters)} đến ${drive.nextStop.poi.name}.`
    );
  }
  // "Tìm cây xăng gần nhất" — deterministic /api/chat lookup; the journey state
  // is left untouched (no setLatestResponse) so the active route stays intact.
  async function findNearestFuel() {
    if (drivePaused) return;
    pushDriveLine("user", "Tìm cây xăng gần nhất.");
    let line = "";
    try {
      const response = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sessionIdRef.current, message: "Tìm cây xăng gần nhất" })
      });
      if (response.ok) {
        const payload = await response.json() as ChatResponse;
        const poi = payload.recommendations?.[0]?.poi;
        line = poi
          ? `Trạm gần nhất: ${poi.name} — ${poi.district}, ${poi.city}. Tôi sẽ thêm làm điểm dừng khi xe đã dừng.`
          : payload.assistantResponse;
      }
    } catch { /* fall through to the safe deferral line */ }
    if (!line) line = DRIVING_DEFERRAL;
    pushDriveLine("atlas", line);
    void speakDrivingLine(line);
  }

  // Voice or typed free requests while driving: match a canned intent, else defer.
  function handleDrivingText(text: string) {
    const value = text.toLocaleLowerCase("vi");
    if (value.includes("điểm dừng") || value.includes("tiếp theo")) return readNextStop();
    if (value.includes("mấy giờ") || value.includes("bao lâu") || value.includes("khi nào")) return askDriveEta();
    if (value.includes("lặp lại") || value.includes("nhắc lại") || value.includes("chỉ dẫn")) return repeatDriveInstruction();
    if (value.includes("cây xăng") || value.includes("đổ xăng") || value.includes("trạm xăng")) return void findNearestFuel();
    respondDriving(text, DRIVING_DEFERRAL);
  }

  if (screen === "home") return <VetcHome onOpen={() => setScreen("session")} />;

  return (
    <main className="atlas-mobile-shell">
      <section className="atlas-map-layer" aria-label="Bản đồ TASCO Atlas">
        <MapView pois={mapPois} mode={mapMode} selectedPoiId={screen === "driving" && drive ? drive.nextStop.poi.id : selectedPoiId} routeCoordinates={routeCoordinates} activeStopIndex={screen === "driving" && drive ? drive.index : activeStopIndex} onSelectPoi={(poi) => setSelectedPoiId(poi.id)} onReadyChange={setMapReady} />
        {/* 3D is receipt-stage Route Theater only (design §2.5) — no live map-mode toggle. */}
        {screen !== "driving" ? <div className="atlas-map-disclosure"><ShieldCheck size={13} /> Dữ liệu &amp; tuyến mô phỏng · {latestResponse?.journey?.actions.length ?? mapPois.length} điểm dừng</div> : null}
      </section>

      {screen !== "driving" ? (
        <header className="atlas-floating-header">
          <button type="button" onClick={() => { stopRealtime(); setScreen("home"); }} aria-label="Quay lại"><ArrowLeft size={20} /></button>
          <div><strong>TASCO Atlas</strong><span><i /> Phiên trực tiếp</span></div>
          <button type="button" onClick={() => setShowPrivacy((value) => !value)} aria-label="Thông tin quyền riêng tư"><ShieldCheck size={19} /></button>
        </header>
      ) : null}

      {showPrivacy ? <aside className="atlas-privacy-card"><button type="button" onClick={() => setShowPrivacy(false)} aria-label="Đóng"><X size={16} /></button><strong>Quyền riêng tư phiên Atlas</strong><p>Micrô chỉ hoạt động sau khi bạn bấm bắt đầu. Không camera, không tài khoản VETC thật, không lưu âm thanh hay lịch sử sau phiên.</p><small>POI, tuyến, giá, ưu đãi và thanh toán đều là dữ liệu mô phỏng.</small></aside> : null}

      {screen === "session" ? (
        <section className="atlas-start-sheet">
          <div className="sheet-handle" />
          <div className="start-orb"><Mic size={31} /></div>
          <h1>Bắt đầu phiên trò chuyện</h1>
          <p>Hãy cùng nhau nói về chuyến đi. Bạn có thể ngắt lời Atlas bất cứ lúc nào.</p>
          {sessionEnded ? <p className="ended-notice"><CheckCircle2 size={14} /> Phiên đã kết thúc — bản ghi và ngữ cảnh đã được xoá.</p> : null}
          <button className="atlas-primary" type="button" onClick={() => { setSessionEnded(false); void startSession(); }}><Mic size={20} /> Bắt đầu trò chuyện</button>
          <button className="atlas-text-link" type="button" onClick={() => { setIsTextMode(true); setScreen("live"); setVoiceState("listening"); }}>Không dùng giọng nói? <strong>Nhập bằng chữ</strong></button>
          <small><ShieldCheck size={13} /> Micrô chỉ được dùng trong phiên đang hoạt động và dừng ngay khi bạn kết thúc.</small>
        </section>
      ) : screen === "checkout" && latestResponse?.journey ? (
        <JourneyCheckout response={latestResponse} isConfirming={isConfirming} confirmed={Boolean(receipt)} onBack={() => setScreen("live")} onConfirm={confirmParking} onReceipt={() => setScreen("receipt")} />
      ) : screen === "receipt" && receipt ? (
        <JourneyReceipt receipt={receipt} isTheaterPlaying={isTheaterPlaying} mapReady={mapReady} theaterFallback={theaterFallback} canDrive={driveStops.length >= 2} onTheater={playRouteTheater} onDrive={startDriving} onBack={() => setScreen("checkout")} />
      ) : screen === "driving" && drive ? (
        <JourneyDriving
          drive={drive}
          driveLog={driveLog}
          paused={drivePaused}
          voiceMuted={voiceState === "muted"}
          realtimeMode={realtimeMode}
          showComposer={realtimeMode === "scripted" || isTextMode}
          input={input}
          onInput={setInput}
          onComposerSubmit={() => { if (input.trim()) { handleDrivingText(input.trim()); setInput(""); } }}
          onMicTap={toggleMute}
          onPauseToggle={() => setDrivePaused((value) => !value)}
          onEnd={endDriving}
          onReadNext={readNextStop}
          onEta={askDriveEta}
          onRepeat={repeatDriveInstruction}
          onFuel={() => void findNearestFuel()}
        />
      ) : (
        <section className="atlas-live-sheet">
          <div className="sheet-handle" />
          <div className="live-controls">
            <button className={`live-orb state-${voiceState}`} type="button" onClick={toggleMute} aria-label="Bật hoặc tắt micrô">
              {voiceState === "muted" ? <MicOff size={25} /> : voiceState === "speaking" ? <Volume2 size={25} /> : <Mic size={25} />}
            </button>
            <div className="live-status"><strong>{voiceLabel(voiceState)}</strong><span>{voiceSubline(voiceState, realtimeMode)}</span></div>
            <button className="mute-control" type="button" onClick={toggleMute}><MicOff size={17} /><span>{voiceState === "muted" ? "Bật mic" : "Tắt mic"}</span></button>
            <button className="end-control" type="button" onClick={endSession}><CircleStop size={17} /><span>Kết thúc</span></button>
          </div>

          {notice ? <p className="fallback-notice">{notice}</p> : null}
          <div className="conversation-label"><span>Cuộc trò chuyện</span><small>Không nhận diện người nói</small></div>
          <p className="live-transcript">{partial || "Hãy nói tự nhiên về nơi bạn muốn đến…"}</p>
          {stage >= 3 ? <div className="interrupt-banner"><Check size={16} /><div><strong>Đã nghe yêu cầu mới</strong><span>Đã dừng nói khi bạn ngắt lời</span></div></div> : null}

          {latestResponse?.intent === "clarification_required" && latestResponse.quickReplies?.length ? (
            <div className="quick-replies">
              {latestResponse.quickReplies.map((reply) => (
                <button key={reply} type="button" onClick={() => void handleUtterance(reply)}>{reply}</button>
              ))}
            </div>
          ) : null}
          {constraints.length ? <><div className="constraint-caption">Ràng buộc đã hiểu <span>Điều chỉnh bằng lời hoặc ô nhập</span></div><div className="constraint-chips">{constraints.map((item) => (
            <span key={item}>{item}<button type="button" aria-label={`Bỏ tiêu chí ${item}`} onClick={() => void handleUtterance(`Bỏ tiêu chí ${item}`)}><X size={11} /></button></span>
          ))}</div></> : null}
          {latestResponse ? <RecommendationCard response={latestResponse} onOpen={() => void openJourney()} /> : <div className="empty-understanding"><Sparkles size={18} /><span>Atlas sẽ biến cuộc trò chuyện thành một kế hoạch duy nhất trên bản đồ.</span></div>}

          {(isTextMode || realtimeMode === "scripted") ? (
            <form className="atlas-composer" onSubmit={submit}>
              <input aria-label="Nhập yêu cầu" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Nhập yêu cầu của bạn…" />
              <button type="submit" disabled={!input.trim()} aria-label="Gửi"><Send size={18} /></button>
            </form>
          ) : null}
          {showDemoRail ? (
            <button className="demo-next" type="button" onClick={advanceDemo} disabled={stage >= 3}>
              {stage === 0 ? "Chạy câu mở đầu mẫu" : stage === 1 ? "Thêm ngân sách mẫu" : stage === 2 ? "Ngắt lời: gần hơn, rẻ hơn" : "Kịch bản demo đã chạy xong"}
              <ChevronRight size={17} />
            </button>
          ) : null}
        </section>
      )}
    </main>
  );
}

// Animates a VND amount toward its real deterministic value (~650ms, design
// §3.7). The displayed number always ends exactly at the engine's figure.
function useAnimatedVnd(target: number): number {
  const [display, setDisplay] = useState(target);
  const previousRef = useRef(target);
  useEffect(() => {
    const from = previousRef.current;
    previousRef.current = target;
    if (from === target) return;
    const reducedMotion =
      typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();
    const duration = reducedMotion ? 1 : 650;
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - progress) ** 3;
      setDisplay(Math.round(from + (target - from) * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return display;
}

function voiceLabel(state: VoiceState) {
  return ({ idle: "Bắt đầu phiên trò chuyện", listening: "Atlas đang nghe", thinking: "Atlas đang tìm…", speaking: "Atlas đang nói", interrupted: "Đã nghe yêu cầu mới", muted: "Micrô đang tắt" })[state];
}
function voiceSubline(state: VoiceState, mode: "connecting" | "realtime" | "scripted") {
  if (mode === "connecting") return "Đang kết nối phiên âm thanh…";
  if (state === "speaking") return "Bạn có thể ngắt lời bất cứ lúc nào";
  if (state === "thinking") return "Đang cập nhật gợi ý và tuyến";
  if (state === "interrupted") return "Đang áp dụng yêu cầu mới";
  return mode === "realtime" ? "Âm thanh trực tiếp đang hoạt động" : "Sẵn sàng cho kịch bản demo";
}

// Every value on this card comes from the deterministic response — name,
// rating, location, journey totals, savings. Nothing here may be a literal:
// the design contract says "the exact amount and place must come from
// deterministic output, not from example copy."
// Human labels for the deterministic score components — the "receipts" panel
// renders only what the engine actually computed for this exact response.
const SCORE_LABELS: Record<string, string> = {
  textMatch: "Khớp nội dung",
  categoryMatch: "Đúng loại địa điểm",
  locationMatch: "Đúng khu vực",
  attributeMatch: "Khớp tiêu chí",
  preferenceMatch: "Hợp sở thích",
  quality: "Chất lượng dữ liệu",
  distance: "Khoảng cách",
  budget: "Ngân sách",
  nameMatch: "Gọi đúng tên",
  intentBoost: "Phù hợp mục đích",
};

function sourceLabel(tier?: string): string {
  if (tier === "open-enriched") return "Overture Maps · thuộc tính xác minh từ Foody/Google";
  if (tier === "open-skeleton") return "Overture Maps (dữ liệu mở)";
  return "Bộ dữ liệu TASCO";
}

function RecommendationCard({ response, onOpen }: { response: ChatResponse; onOpen: () => void }) {
  const [showReceipts, setShowReceipts] = useState(false);
  const recommendation = response.recommendations[0];
  const primary = recommendation?.poi;
  const journey = response.journey;
  const revised = journey?.revision.outcome === "cheaper";
  const animatedTotal = useAnimatedVnd(journey?.totalVnd ?? 0);
  if (!primary || !recommendation) {
    return (
      <article className="live-recommendation">
        <header><span><Sparkles size={14} /> Gợi ý phù hợp nhất</span></header>
        <p>{response.assistantResponse}</p>
      </article>
    );
  }
  const attributes = primary.attributes.slice(0, 2).join(" · ");
  const scoreParts = Object.entries(recommendation.scoreBreakdown ?? {})
    .filter(([key, value]) => value > 0 && SCORE_LABELS[key])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const maxPart = scoreParts[0]?.[1] ?? 1;
  return (
    <article className={`live-recommendation${revised ? " is-revised" : ""}`}>
      <header><span><Sparkles size={14} /> Gợi ý phù hợp nhất</span>{revised ? <em><Check size={13} /> Đã thay đổi</em> : null}</header>
      <div className="recommendation-title"><div><Utensils size={20} /></div><span><strong>{primary.name}</strong><small>{primary.category}{attributes ? ` · ${attributes}` : ""}</small></span></div>
      <div className="recommendation-facts">
        <span><MapPin size={14} /><strong>{primary.district}, {primary.city}</strong><small>vị trí</small></span>
        <span><Clock3 size={14} /><strong>{primary.rating.toFixed(1)}/5</strong><small>đánh giá dữ liệu</small></span>
        {journey ? <span><CreditCard size={14} /><strong className="is-counting">{animatedTotal.toLocaleString("vi-VN")} ₫</strong><small>tổng ước tính</small></span> : null}
      </div>
      {revised && journey ? <div className="savings-line"><Check size={15} /> Tiết kiệm {journey.savingsVnd.toLocaleString("vi-VN")} ₫ so với phương án trước</div> : null}
      <button className="receipts-toggle" type="button" onClick={() => setShowReceipts((value) => !value)} aria-expanded={showReceipts}>
        <ShieldCheck size={13} /> Vì sao gợi ý này? · {showReceipts ? "Ẩn" : "Xem điểm thành phần"}
      </button>
      {showReceipts ? (
        <div className="receipts-panel">
          {scoreParts.map(([key, value]) => (
            <div className="receipts-row" key={key}>
              <small>{SCORE_LABELS[key]}</small>
              <i><b style={{ width: `${Math.round((value / maxPart) * 100)}%` }} /></i>
              <em>{value.toFixed(2)}</em>
            </div>
          ))}
          <p>{recommendation.reason}</p>
          <small className="receipts-source"><ShieldCheck size={11} /> Nguồn: {sourceLabel(primary.datasetTier)} · {primary.id}</small>
        </div>
      ) : null}
      {journey ? <button type="button" onClick={onOpen}><Navigation size={17} /> Chốt hành trình</button> : null}
    </article>
  );
}

function actionIcon(kind: Journey["actions"][number]["kind"]) {
  if (kind === "fuel") return <BatteryCharging size={18} />;
  if (kind === "parking") return <ParkingCircle size={18} />;
  return <Utensils size={18} />;
}

function JourneyCheckout({ response, isConfirming, confirmed, onBack, onConfirm, onReceipt }: { response: ChatResponse; isConfirming: boolean; confirmed: boolean; onBack: () => void; onConfirm: () => void; onReceipt: () => void }) {
  const journey = response.journey!;
  const parking = journey.actions.find((action) => action.kind === "parking");
  return <section className="atlas-checkout-sheet">
    <div className="sheet-handle" />
    <header><button type="button" onClick={onBack}><ArrowLeft size={19} /></button><div><small>HÀNH TRÌNH MÔ PHỎNG</small><h1>Chốt hành trình</h1></div></header>
    <p className="checkout-summary">Một hành trình theo thứ tự. Chỉ chỗ đỗ xe được thanh toán ngay; nhiên liệu và bữa ăn thanh toán tại địa điểm.</p>
    <ol className="checkout-stops">{journey.actions.map((action, index) => {
      const poi = response.recommendations.find((item) => item.poi.id === action.poiId)?.poi;
      return <li key={action.id}><i>{index + 1}</i><span className="checkout-stop-icon">{actionIcon(action.kind)}</span><div><strong>{poi?.name ?? action.miniApp}</strong><small>{action.reason}</small><em>{action.kind === "parking" ? `Thanh toán ngay · ${action.finalPriceVnd.toLocaleString("vi-VN")} ₫` : `Thanh toán tại ${action.kind === "fuel" ? "trạm" : "quán"}`}</em></div></li>;
    })}</ol>
    <div className="checkout-costs"><span><small>Chi phí ước tính toàn hành trình</small><strong>{journey.totalVnd.toLocaleString("vi-VN")} ₫</strong></span><span className="is-prepaid"><small>Thanh toán ngay · Đỗ xe 2 giờ</small><strong>{(parking?.finalPriceVnd ?? 0).toLocaleString("vi-VN")} ₫</strong></span></div>
    <p className="checkout-disclosure">Giá và giữ chỗ đều là mô phỏng. Không trừ tiền thật.</p>
    <button className="checkout-confirm" type="button" onClick={confirmed ? onReceipt : onConfirm} disabled={isConfirming || !parking}>{confirmed ? "Xem biên nhận" : isConfirming ? "Đang xác nhận…" : `Xác nhận ${(parking?.finalPriceVnd ?? 0).toLocaleString("vi-VN")} ₫`}</button>
    <button className="checkout-back" type="button" onClick={onBack}>Chưa, để tôi chỉnh lại</button>
  </section>;
}

function JourneyReceipt({ receipt, isTheaterPlaying, mapReady, theaterFallback, canDrive, onTheater, onDrive, onBack }: { receipt: SimulatedReceipt; isTheaterPlaying: boolean; mapReady: boolean; theaterFallback: string; canDrive: boolean; onTheater: () => void; onDrive: () => void; onBack: () => void }) {
  const parking = receipt.journey.actions.find((action) => action.kind === "parking");
  const payLater = receipt.journey.actions.filter((action) => action.kind !== "parking");
  return <section className="atlas-receipt-sheet">
    <div className="sheet-handle" />
    <header><button type="button" onClick={onBack}><ArrowLeft size={19} /></button><div><CheckCircle2 size={28} /><span><small>BIÊN NHẬN VETC — MÔ PHỎNG</small><h1>Đã giữ chỗ đỗ xe</h1></span></div></header>
    <div className="receipt-id"><span><small>Mã hành trình</small><strong>{receipt.id}</strong></span><span><small>Xác nhận lúc</small><strong>{receipt.confirmedAt}</strong></span></div>
    <article className="receipt-paid"><ReceiptText size={20} /><div><small>ĐÃ THANH TOÁN MÔ PHỎNG</small><strong>{parking?.miniApp ?? "Bãi đỗ xe"} · 2 giờ</strong></div><b>{(parking?.finalPriceVnd ?? 0).toLocaleString("vi-VN")} ₫</b></article>
    <div className="receipt-later"><small>THANH TOÁN TẠI ĐỊA ĐIỂM</small>{payLater.map((action) => <span key={action.id}>{action.miniApp}<b>{action.finalPriceVnd.toLocaleString("vi-VN")} ₫</b></span>)}</div>
    <p><ShieldCheck size={14} /> Biên nhận, giá, ưu đãi và đặt chỗ đều là mô phỏng; không có giao dịch thật.</p>
    {!mapReady ? <div className="theater-fallback"><ShieldCheck size={15} /><span><strong>Bản đồ 3D chưa sẵn sàng</strong>{theaterFallback || "Biên nhận và hành trình mô phỏng vẫn hoạt động. Hãy thử lại trên thiết bị hỗ trợ WebGL."}</span></div> : null}
    <button className="receipt-theater" type="button" onClick={onDrive} disabled={!canDrive}><Navigation size={17} /> Bắt đầu dẫn đường</button>
    <button className="receipt-theater-alt" type="button" onClick={onTheater} disabled={isTheaterPlaying || !mapReady}><Play size={16} />{isTheaterPlaying ? "Đang trình diễn tuyến 3D" : mapReady ? "Xem tuyến 3D" : "Xem tuyến 3D không khả dụng"}</button>
    <small className="theater-disclosure">Tuyến và công trình 3D là hình ảnh mô phỏng.</small>
  </section>;
}

// Driving mode (design §2.6 / Step 7): dark-green instruction card, next-stop
// strip, one big mic, pause/end, four canned commands. Every distance/ETA/name
// is read from the deterministic route + journey POIs — no fabricated literals.
function JourneyDriving({
  drive, driveLog, paused, voiceMuted, realtimeMode, showComposer, input,
  onInput, onComposerSubmit, onMicTap, onPauseToggle, onEnd, onReadNext, onEta, onRepeat, onFuel
}: {
  drive: DriveState;
  driveLog: DriveLogEntry[];
  paused: boolean;
  voiceMuted: boolean;
  realtimeMode: "connecting" | "realtime" | "scripted";
  showComposer: boolean;
  input: string;
  onInput: (value: string) => void;
  onComposerSubmit: () => void;
  onMicTap: () => void;
  onPauseToggle: () => void;
  onEnd: () => void;
  onReadNext: () => void;
  onEta: () => void;
  onRepeat: () => void;
  onFuel: () => void;
}) {
  const { nextStop } = drive;
  const commands: Array<{ label: string; run: () => void }> = [
    { label: "Đọc điểm dừng tiếp theo", run: onReadNext },
    { label: "Mấy giờ đến?", run: onEta },
    { label: "Lặp lại chỉ dẫn", run: onRepeat },
    { label: "Tìm cây xăng gần nhất", run: onFuel }
  ];
  const micSubline = realtimeMode === "realtime"
    ? "Nói lệnh ngắn — Atlas trả lời bằng giọng"
    : "Chạm lệnh ngắn — Atlas trả lời trên màn hình";
  return (
    <>
      <div className="atlas-driving-instruction" role="status" aria-live="polite">
        <span className="driving-instruction-icon"><Navigation size={22} /></span>
        <div className="driving-instruction-main">
          <strong>Đi tiếp {formatDriveDistance(drive.legDistanceMeters)}</strong>
          <small>đến {nextStop.poi.name} · {nextStop.poi.district}</small>
        </div>
        <div className="driving-instruction-eta">
          <strong>{driveClock(drive.remainingSeconds)}</strong>
          <small>đến nơi</small>
        </div>
      </div>

      <div className="atlas-driving-next">
        <span className="driving-next-icon">{actionIcon(nextStop.kind)}</span>
        <span className="driving-next-name">Tiếp theo: {nextStop.poi.name}</span>
        <span className="driving-next-time">còn {formatDriveMinutes(drive.legSeconds)} phút</span>
      </div>

      {paused ? <div className="atlas-driving-paused">Đã tạm dừng dẫn đường — chạm nút Tiếp tục để đi tiếp.</div> : null}

      <section className="atlas-driving-sheet">
        <div className="sheet-handle" />
        {driveLog.length ? (
          <div className="driving-log">
            {driveLog.map((entry) => (
              <div key={entry.id} className={`driving-bubble is-${entry.who}`}>{entry.text}</div>
            ))}
          </div>
        ) : null}
        <div className="driving-controls">
          <button type="button" className="driving-side" onClick={onPauseToggle}>
            {paused ? <Play size={18} /> : <Pause size={18} />}
            <span>{paused ? "Tiếp tục" : "Tạm dừng"}</span>
          </button>
          <div className="driving-mic-wrap">
            <button type="button" className={`driving-orb${voiceMuted ? " is-muted" : ""}`} onClick={onMicTap} aria-label={voiceMuted ? "Bật micrô" : "Tắt micrô"}>
              {voiceMuted ? <MicOff size={28} /> : <Mic size={28} />}
            </button>
            <small>{micSubline}</small>
          </div>
          <button type="button" className="driving-side is-end" onClick={onEnd}>
            <CircleStop size={18} />
            <span>Kết thúc</span>
          </button>
        </div>
        <div className="driving-cmds">
          {commands.map((command) => (
            <button key={command.label} type="button" onClick={command.run}>{command.label}</button>
          ))}
        </div>
        {showComposer ? (
          <form className="atlas-composer driving-composer" onSubmit={(event) => { event.preventDefault(); onComposerSubmit(); }}>
            <input aria-label="Nhập lệnh khi lái" value={input} onChange={(event) => onInput(event.target.value)} placeholder="Yêu cầu khác sẽ được hoãn khi xe đang chạy…" />
            <button type="submit" disabled={!input.trim()} aria-label="Gửi"><Send size={18} /></button>
          </form>
        ) : null}
        <small className="driving-disclosure"><ShieldCheck size={12} /> Điều hướng, tuyến và thời gian đều là mô phỏng — không phải chỉ dẫn thật.</small>
      </section>
    </>
  );
}

function VetcHome({ onOpen }: { onOpen: () => void }) {
  return (
    <main className="vetc-home">
      <header className="vetc-hero"><div className="vetc-top"><button aria-label="Menu"><Menu size={21} /></button><strong>vetc</strong><button aria-label="Thông báo"><Bell size={21} /><i /></button></div></header>
      <section className="vetc-services"><div className="service-grid">
        <Service icon={<CreditCard size={23} />} title="Nạp tiền" />
        <Service icon={<Gift size={23} />} title="My Loyalty" />
        <Service icon={<Link size={23} />} title="Liên kết ngân hàng" />
        <Service icon={<FileText size={23} />} title="Ví giấy tờ" badge />
        <button className="atlas-entry" type="button" onClick={onOpen}><i>Mới</i><span className="service-icon"><MapPin size={23} /><Sparkles size={12} /></span><strong>Đi đâu?</strong><small>TASCO AI</small></button>
        <Service icon={<Car size={23} />} title="Cứu hộ toàn quốc" badge />
        <Service icon={<BatteryCharging size={23} />} title="Trạm sạc" />
        <Service icon={<Grid2X2 size={23} />} title="Tất cả" />
      </div></section>
      <section className="vetc-alert"><span>!</span><p>Giấy tờ của bạn đã hết hạn, vui lòng cập nhật giấy tờ mới</p><button type="button">Cập nhật ngay</button></section>
      <section className="vehicle-card"><div><Car size={21} /><span><small>Phương tiện</small><strong>50A-123.45</strong></span></div><em>Đang hoạt động</em></section>
      <section className="vetc-video"><strong>▶&nbsp; VETC Video</strong><div><span>Video demo</span><span>Video demo</span><span>Video demo</span></div></section>
    </main>
  );
}
function Service({ icon, title, badge = false }: { icon: React.ReactNode; title: string; badge?: boolean }) { return <button type="button">{badge ? <i>Mới</i> : null}<span className="service-icon">{icon}</span><strong>{title}</strong></button>; }
