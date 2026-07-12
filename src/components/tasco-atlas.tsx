"use client";

import {
  ArrowLeft,
  Bell,
  BatteryCharging,
  Car,
  Check,
  CheckCircle2,
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
import { isConfirmedBargeIn, isConfirmedSpeech, setAudioTracksMuted } from "@/lib/realtime";
import { routeTheaterAvailability } from "@/lib/route-theater";
import { buildRoutes } from "@/lib/routing";
import {
  buildSubmissionDemoFlow,
  classifySubmissionDemoVoice,
  resolveSubmissionDemoOrigin,
  SUBMISSION_DEMO_FALLBACK_ORIGIN,
  type SubmissionDemoOrigin,
  type SubmissionDemoOriginSource,
  type SubmissionDemoFlow,
  type SubmissionDemoVoiceStage,
} from "@/lib/submission-demo";
import { startSttSession, type SttProvider, type SttSession } from "@/lib/stt-client";
import { playGroundedSpeech, type TtsPlayback } from "@/lib/tts-client";

const MapView = dynamic(
  () => import("@/components/map-view").then((module) => module.MapView),
  { ssr: false, loading: () => <div className="atlas-map-loading">Đang mở bản đồ…</div> }
);

type TascoAtlasProps = { initialPois: Poi[]; profiles: UserProfile[]; presetDrivingPois: Poi[] };
type Screen = "home" | "session" | "live" | "checkout" | "receipt" | "driving";
type VoiceState = "idle" | "listening" | "thinking" | "speaking" | "interrupted" | "muted";
type MapMode = "2d" | "3d";
type SimulatedReceipt = { id: string; journey: Journey; confirmedAt: string };
type DriveStop = { poi: Poi; kind: JourneyActionKind };
type DrivingOriginSource = SubmissionDemoOriginSource;
type SubmissionConversationTurn = { id: string; role: "user" | "assistant"; text: string };
type DriveState = {
  total: number;
  index: number;
  nextStop: DriveStop;
  isFinalStop: boolean;
  legDistanceMeters: number;
  legSeconds: number;
  remainingSeconds: number;
  speedKph: number;
};

const DEFAULT_STT_PROVIDER: SttProvider = "valsea";
const DEFAULT_TTS_PROVIDER: SttProvider = "elevenlabs";

// Simulated-navigation origin: the user's location in central HCMC (the map's
// default center). Disclosed as "mô phỏng" — it only seeds the deterministic
// route math (buildRoutes) that produces every distance/ETA shown while driving.
const DRIVING_ORIGIN: Coordinates = { ...SUBMISSION_DEMO_FALLBACK_ORIGIN };

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

function locateDrivingOrigin(): Promise<SubmissionDemoOrigin> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(resolveSubmissionDemoOrigin());
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve(resolveSubmissionDemoOrigin({ lat: coords.latitude, lon: coords.longitude })),
      () => resolve(resolveSubmissionDemoOrigin()),
      { enableHighAccuracy: false, timeout: 4_500, maximumAge: 60_000 },
    );
  });
}

function newSessionId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `tasco-${Date.now().toString(36)}`;
}

export function TascoAtlas({ initialPois, profiles, presetDrivingPois }: TascoAtlasProps) {
  const defaultPois = useMemo(() => {
    const hcmc = initialPois.filter((poi) => poi.city === "TP.HCM");
    return (hcmc.length ? hcmc : initialPois).slice(0, 10);
  }, [initialPois]);
  const [screen, setScreen] = useState<Screen>("home");
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [wasInterrupted, setWasInterrupted] = useState(false);
  const [input, setInput] = useState("");
  const [partial, setPartial] = useState("");
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
  const [sessionEnded, setSessionEnded] = useState(false);
  const [submissionDemo, setSubmissionDemo] = useState<SubmissionDemoFlow | null>(null);
  const [submissionDemoChoiceMade, setSubmissionDemoChoiceMade] = useState(false);
  const [submissionDemoStage, setSubmissionDemoStage] = useState<SubmissionDemoVoiceStage | "idle">("idle");
  const [submissionConversation, setSubmissionConversation] = useState<SubmissionConversationTurn[]>([]);
  const [isSubmissionBooking, setIsSubmissionBooking] = useState(false);
  const submissionDemoRef = useRef<SubmissionDemoFlow | null>(null);
  const submissionDemoStageRef = useRef<SubmissionDemoVoiceStage | "idle">("idle");
  const submissionBookingRef = useRef(false);
  const submissionBookingRunRef = useRef(0);
  const submissionBookingTimerRef = useRef<number | null>(null);
  const drivingVideoRef = useRef<HTMLVideoElement | null>(null);
  // Driving mode: one deterministic route visual, intentionally without a
  // second planning surface or suggestion controls.
  const [driveStopIndex, setDriveStopIndex] = useState(0);
  const [drivePaused, setDrivePaused] = useState(false);
  const [drivingOrigin, setDrivingOrigin] = useState<Coordinates>(DRIVING_ORIGIN);
  const [drivingOriginSource, setDrivingOriginSource] = useState<DrivingOriginSource>("simulated");

  useEffect(() => { sessionIdRef.current = newSessionId(); }, []);
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
  function updateSubmissionDemoStage(stage: SubmissionDemoVoiceStage | "idle") {
    submissionDemoStageRef.current = stage;
    setSubmissionDemoStage(stage);
  }

  function cancelSubmissionBooking() {
    submissionBookingRunRef.current += 1;
    submissionBookingRef.current = false;
    if (submissionBookingTimerRef.current !== null) {
      window.clearTimeout(submissionBookingTimerRef.current);
      submissionBookingTimerRef.current = null;
    }
    setIsSubmissionBooking(false);
  }

  function appendSubmissionTurn(role: SubmissionConversationTurn["role"], text: string) {
    setSubmissionConversation((turns) => [...turns, { id: newSessionId(), role, text }]);
  }

  // Truth rules: chips are the deterministic engine's parsed constraints and the
  // route line follows real journey stops (or top recommendations) — never a
  // stage counter.
  const constraints = latestResponse?.sessionContext?.constraints ?? [];

  // A polyline only exists for an actual journey (ordered stops). Plain search
  // results are independent suggestions — connecting them would draw a fake
  // "route" across whatever cities the results span.
  const routeCoordinates = useMemo<[number, number][]>(() => {
    const seen = new Set<string>();
    const journeyStops = latestResponse?.journey?.actions
      .map((action) => latestResponse.recommendations.find((item) => item.poi.id === action.poiId)?.poi)
      .filter((poi): poi is Poi => {
        if (!poi || seen.has(poi.id)) return false;
        seen.add(poi.id);
        return true;
      });
    if (!journeyStops || journeyStops.length < 2) return [];
    return journeyStops.map((poi) => [poi.coordinates.lon, poi.coordinates.lat] as [number, number]);
  }, [latestResponse]);

  // The confirmed journey's ordered stops, resolved back to their POIs.
  const journeyDriveStops = useMemo<DriveStop[]>(() => {
    const journey = latestResponse?.journey;
    if (!journey) return [];
    const seen = new Set<string>();
    return journey.actions.flatMap((action) => {
      const poi = latestResponse?.recommendations.find((item) => item.poi.id === action.poiId)?.poi;
      if (!poi || seen.has(poi.id)) return [];
      seen.add(poi.id);
      return [{ poi, kind: action.kind }];
    });
  }, [latestResponse]);

  const submissionDemoFixture = useMemo(() => {
    try {
      return buildSubmissionDemoFlow(presetDrivingPois);
    } catch {
      return null;
    }
  }, [presetDrivingPois]);

  const driveStops = journeyDriveStops;

  useEffect(() => {
    if (screen !== "driving" || drivePaused || driveStopIndex >= driveStops.length - 1) return;
    const timer = window.setTimeout(() => {
      setDriveStopIndex((index) => Math.min(index + 1, driveStops.length - 1));
    }, 6_000);
    return () => window.clearTimeout(timer);
  }, [screen, drivePaused, driveStopIndex, driveStops.length]);

  useEffect(() => {
    const video = drivingVideoRef.current;
    if (!video || screen !== "driving") return;
    if (drivePaused) {
      video.pause();
      return;
    }
    void video.play().catch(() => undefined);
  }, [drivePaused, screen]);

  // A single deterministic route from the simulated origin through every stop.
  // Every distance/duration the driving UI shows is read from these maneuvers —
  // nothing is a hardcoded literal (truth rule).
  const driveRoute = useMemo(() => {
    if (driveStops.length < 1) return null;
    const locations = [drivingOrigin, ...driveStops.map((stop) => stop.poi.coordinates)];
    return buildRoutes({ locations, mode: "driving" }).routes[0] ?? null;
  }, [driveStops, drivingOrigin]);

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
    const speedKph = legSeconds > 0 ? Math.round((legDistanceMeters / legSeconds) * 3.6) : 0;
    return {
      total,
      index,
      nextStop: driveStops[index],
      isFinalStop: index >= total - 1,
      legDistanceMeters,
      legSeconds,
      remainingSeconds,
      speedKph,
    };
  }, [driveRoute, driveStops, driveStopIndex]);

  function stopRealtime() {
    realtimeAttemptRef.current += 1;
    responseActiveRef.current = false;
    ttsRef.current?.stop();
    ttsRef.current = null;
    sttRef.current?.stop();
    sttRef.current = null;
    streamRef.current = null;
  }
  useEffect(() => () => {
    stopRealtime();
    submissionBookingRunRef.current += 1;
    if (submissionBookingTimerRef.current !== null) {
      window.clearTimeout(submissionBookingTimerRef.current);
    }
  }, []);

  function setMicrophoneMuted(muted: boolean) {
    setAudioTracksMuted(streamRef.current, muted);
    setVoiceState(muted ? "muted" : "listening");
  }

  function toggleMute() {
    setMicrophoneMuted(voiceState !== "muted");
  }

  // Speaks the deterministic assistantResponse through the configured speech
  // endpoint. OpenAI is transcription-only here and never produces audio.
  async function speakGrounded(response: ChatResponse) {
    if (realtimeMode !== "realtime") {
      setVoiceState("listening");
      return;
    }
    ttsRef.current?.stop();
    responseActiveRef.current = true;
    setVoiceState("speaking");
    const playback = playGroundedSpeech(response.assistantResponse, DEFAULT_TTS_PROVIDER);
    ttsRef.current = playback;
    const played = await playback.done;
    if (ttsRef.current === playback) {
      responseActiveRef.current = false;
      setVoiceState("listening");
      if (!played) setNotice("Không phát được âm thanh — hãy kiểm tra quyền phát âm thanh của trình duyệt.");
    }
  }

  // The recording path keeps its provider choice internal. Every reply stays
  // visible so the flow still works when browser audio is unavailable.
  async function speakSubmissionLine(text: string) {
    ttsRef.current?.stop();
    responseActiveRef.current = true;
    setVoiceState("speaking");
    const playback = playGroundedSpeech(text, DEFAULT_TTS_PROVIDER);
    ttsRef.current = playback;
    const played = await playback.done;
    if (ttsRef.current !== playback) return;
    responseActiveRef.current = false;
    setVoiceState("listening");
    if (!played) setNotice("Âm thanh không khả dụng — tiếp tục bằng lời thoại đang hiển thị.");
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
    if (submissionDemoRef.current && (
      responseActiveRef.current ||
      submissionBookingRef.current ||
      submissionDemoStageRef.current === "complete"
    )) return;
    utteranceRef.current = text;
    if (responseActiveRef.current && isConfirmedBargeIn(text)) {
      cancelActiveResponseForBargeIn();
      setVoiceState("listening");
    }
    if (!responseActiveRef.current) setPartial(text);
  }

  function handleCommittedTranscript(text: string) {
    utteranceRef.current = "";
    if (!isConfirmedSpeech(text)) return;
    if (submissionDemoRef.current && (
      responseActiveRef.current ||
      submissionBookingRef.current ||
      submissionDemoStageRef.current === "complete"
    )) return;
    cancelActiveResponseForBargeIn();
    if (screen === "driving") return;
    setPartial(text);
    void handleUtterance(text);
  }

  function handleSttError() {
    stopRealtime();
    setRealtimeMode("scripted");
    setVoiceState("listening");
    setNotice("Không thể kết nối mic. Bạn vẫn có thể tiếp tục bằng cách nhập chữ.");
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

  async function startRealtime(requestedProvider: SttProvider = DEFAULT_STT_PROVIDER) {
    const attempt = realtimeAttemptRef.current + 1;
    realtimeAttemptRef.current = attempt;
    setRealtimeMode("connecting");
    setNotice("");
    try {
      const session = await startSttSession({
        onOpen: () => {
          if (realtimeAttemptRef.current !== attempt) return;
          setRealtimeMode("realtime");
          setVoiceState("listening");
          if (submissionDemoRef.current) setNotice("Mic đang nghe · hãy nói câu mở đầu của bạn.");
        },
        onPartial: (text) => { if (realtimeAttemptRef.current === attempt) sttHandlersRef.current.onPartial(text); },
        onCommitted: (text) => { if (realtimeAttemptRef.current === attempt) sttHandlersRef.current.onCommitted(text); },
        onError: () => { if (realtimeAttemptRef.current === attempt) sttHandlersRef.current.onError(); },
      }, requestedProvider);
      if (realtimeAttemptRef.current !== attempt) { session.stop(); return; }
      sttRef.current = session;
      streamRef.current = session.stream;
    } catch {
      if (realtimeAttemptRef.current !== attempt) return;
      stopRealtime();
      setRealtimeMode("scripted");
      setVoiceState("listening");
      setNotice("Không thể kết nối mic. Bạn vẫn có thể tiếp tục bằng cách nhập chữ.");
    }
  }

  async function startSubmissionDemo(withVoice: boolean) {
    const flow = submissionDemoFixture;
    if (!flow) {
      setNotice("Chưa tải được dữ liệu cho Pizza 4P's và Trung Nguyên.");
      return;
    }
    stopRealtime();
    cancelSubmissionBooking();
    confirmationLockRef.current = false;
    contextRef.current = undefined;
    submissionDemoRef.current = flow;
    setReceipt(null);
    setSubmissionDemo(flow);
    setSubmissionDemoChoiceMade(false);
    updateSubmissionDemoStage("request");
    setSubmissionConversation([]);
    setLatestResponse(null);
    setMapPois(defaultPois);
    setSelectedPoiId(defaultPois[0]?.id ?? null);
    setPartial("");
    setWasInterrupted(false);
    setSessionEnded(false);
    setScreen("live");
    if (withVoice) {
      setNotice("Đang bật mic…");
      await startRealtime();
    } else {
      setRealtimeMode("scripted");
      setVoiceState("listening");
      setNotice("Nhập chữ đang hoạt động · hãy mô tả bữa tối và quán cà phê bạn muốn.");
    }
  }

  function beginSubmissionBooking(flow: SubmissionDemoFlow) {
    const runId = submissionBookingRunRef.current + 1;
    submissionBookingRunRef.current = runId;
    submissionBookingRef.current = true;
    setIsSubmissionBooking(true);
    setPartial("");
    setNotice("Đang đặt bàn Pizza 4P's cho ngày 12/7 lúc 19:00…");
    appendSubmissionTurn("assistant", flow.bookingStartedResponse);

    void (async () => {
      await speakSubmissionLine(flow.bookingStartedResponse);
      if (submissionBookingRunRef.current !== runId || submissionDemoRef.current !== flow) return;

      setVoiceState("thinking");
      await new Promise<void>((resolve) => {
        submissionBookingTimerRef.current = window.setTimeout(() => {
          submissionBookingTimerRef.current = null;
          resolve();
        }, 4_000);
      });
      if (submissionBookingRunRef.current !== runId || submissionDemoRef.current !== flow) return;

      contextRef.current = flow.response.sessionContext;
      setSubmissionDemoChoiceMade(true);
      setLatestResponse(flow.response);
      setMapPois([...flow.stops]);
      setSelectedPoiId(flow.stops[0].id);
      submissionBookingRef.current = false;
      setIsSubmissionBooking(false);
      setNotice("");
      appendSubmissionTurn("assistant", flow.bookingConfirmedResponse);
      await speakSubmissionLine(flow.bookingConfirmedResponse);
      if (submissionBookingRunRef.current === runId && submissionDemoRef.current === flow) {
        stopRealtime();
        setRealtimeMode("scripted");
        setVoiceState("idle");
      }
    })();
  }

  function handleSubmissionDemoUtterance(message: string) {
    const flow = submissionDemoRef.current;
    const stage = submissionDemoStageRef.current;
    if (!flow || stage === "idle" || stage === "complete") return;

    setInput("");
    setPartial(message);
    setVoiceState("thinking");
    appendSubmissionTurn("user", message);

    const action = classifySubmissionDemoVoice(stage, message);
    if (!action.accepted) {
      const retry = stage === "request"
        ? "Tôi cần nghe đủ: ba người, ăn tối ở Quận 1, rồi đi cà phê. Bạn nói lại giúp tôi nhé."
        : stage === "cuisine"
          ? "Bạn muốn ăn món gì? Để tiếp tục, hãy nói: Món Ý."
          : stage === "time"
            ? "Bạn muốn đặt bàn lúc mấy giờ? Để tiếp tục, hãy nói: Khoảng 7 giờ tối."
            : "Mình cần bạn xác nhận đúng ngày 12 tháng 7 lúc 19:00. Nếu đồng ý, hãy nói: Chốt đi."
      appendSubmissionTurn("assistant", retry);
      setNotice("Mình chưa nghe được câu xác nhận · hành trình chưa thay đổi.");
      void speakSubmissionLine(retry);
      return;
    }

    updateSubmissionDemoStage(action.nextStage);
    setNotice("");
    if (action.stage === "request") {
      contextRef.current = flow.clarificationResponse.sessionContext;
      setLatestResponse(flow.clarificationResponse);
      appendSubmissionTurn("assistant", flow.clarificationResponse.assistantResponse);
      void speakSubmissionLine(flow.clarificationResponse.assistantResponse);
      return;
    }

    if (action.stage === "cuisine") {
      appendSubmissionTurn("assistant", flow.timePrompt);
      void speakSubmissionLine(flow.timePrompt);
      return;
    }

    if (action.stage === "time") {
      appendSubmissionTurn("assistant", flow.confirmationPrompt);
      void speakSubmissionLine(flow.confirmationPrompt);
      return;
    }

    beginSubmissionBooking(flow);
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
    if (submissionDemoRef.current) {
      handleSubmissionDemoUtterance(message);
      return;
    }
    const normalized = message.toLocaleLowerCase("vi");
    setInput(""); setPartial(message);
    const interrupted = normalized.includes("gần hơn") || normalized.includes("rẻ hơn");
    if (interrupted) cancelActiveResponseForBargeIn();
    setWasInterrupted(interrupted);
    setVoiceState(interrupted ? "interrupted" : "thinking");
    const result = await queryDeterministic(message);
    if (result) void speakGrounded(result); else setVoiceState("listening");
  }

  function submit(event: FormEvent) { event.preventDefault(); if (input.trim()) void handleUtterance(input.trim()); }
  function endSession() {
    stopRealtime(); cancelSubmissionBooking(); setVoiceState("idle"); setScreen("session"); setPartial(""); setLatestResponse(null); setMapPois(defaultPois); setReceipt(null); confirmationLockRef.current = false;
    submissionDemoRef.current = null;
    setDrivePaused(false); setDriveStopIndex(0); setSubmissionDemo(null); setSubmissionDemoChoiceMade(false); updateSubmissionDemoStage("idle"); setSubmissionConversation([]); setWasInterrupted(false);
    setSessionEnded(true);
  }

  async function openJourney() {
    if (!latestResponse?.journey) { setNotice("Chưa đủ dữ liệu để tạo hành trình."); return; }
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

  function beginDriving(stops: DriveStop[]) {
    stopRealtime();
    setVoiceState("idle");
    setIsTheaterPlaying(false);
    setMapMode("2d");
    setDrivePaused(false);
    setDriveStopIndex(0);
    const pois = stops.map((stop) => stop.poi);
    if (pois.length) { setMapPois(pois); setSelectedPoiId(pois[0].id); }
    setActiveStopIndex(0);
    setScreen("driving");
  }

  async function startDriving() {
    const origin = await locateDrivingOrigin();
    setDrivingOrigin(origin.coordinates);
    setDrivingOriginSource(origin.source);
    beginDriving(journeyDriveStops);
  }

  function endDriving() {
    stopRealtime();
    setDrivePaused(false);
    setActiveStopIndex(-1);
    setMapMode("2d");
    setScreen("receipt");
  }

  if (screen === "home") return <VetcHome onOpen={() => setScreen("session")} />;

  return (
    <main className={`atlas-mobile-shell${screen === "driving" ? " is-driving" : ""}`}>
      {screen === "driving" && drive ? (
        <section className={`atlas-driving-visual${drivePaused ? " is-paused" : ""}`} aria-label="Xe đang di chuyển trên hành trình">
          <video
            ref={drivingVideoRef}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            poster="/assets/tasco-driving-car-scene.png"
            aria-hidden="true"
          >
            <source src="/assets/tasco-driving-loop.mp4" type="video/mp4" />
          </video>
        </section>
      ) : (
        <section className="atlas-map-layer" aria-label="Bản đồ TASCO Atlas">
          <MapView pois={mapPois} mode={mapMode} selectedPoiId={selectedPoiId} routeCoordinates={routeCoordinates} activeStopIndex={activeStopIndex} onSelectPoi={(poi) => setSelectedPoiId(poi.id)} onReadyChange={setMapReady} />
          {/* 3D is receipt-stage Route Theater only (design §2.5) — no live map-mode toggle. */}
          <div className="atlas-map-disclosure"><Navigation size={13} /> Lộ trình · {latestResponse?.journey?.actions.length ?? mapPois.length} điểm dừng</div>
        </section>
      )}

      {screen !== "driving" ? (
        <header className="atlas-floating-header">
          <button type="button" onClick={() => { stopRealtime(); cancelSubmissionBooking(); setScreen("home"); }} aria-label="Quay lại"><ArrowLeft size={20} /></button>
          <div><strong>TASCO Atlas</strong><span><i /> Phiên trực tiếp</span></div>
          <button type="button" onClick={() => setShowPrivacy((value) => !value)} aria-label="Thông tin quyền riêng tư"><ShieldCheck size={19} /></button>
        </header>
      ) : null}

      {showPrivacy ? <aside className="atlas-privacy-card"><button type="button" onClick={() => setShowPrivacy(false)} aria-label="Đóng"><X size={16} /></button><strong>Quyền riêng tư phiên Atlas</strong><p>Micrô chỉ hoạt động sau khi bạn bấm bắt đầu. Atlas không dùng camera và không lưu âm thanh hay lịch sử sau khi phiên kết thúc.</p><small>Vị trí hiện tại chỉ được dùng để lập lộ trình trong phiên này.</small></aside> : null}

      {screen === "session" ? (
        <section className="atlas-start-sheet">
          <div className="sheet-handle" />
          <div className="start-orb"><Mic size={31} /></div>
          <h1>Bắt đầu phiên trò chuyện</h1>
          <p>Hãy cùng nhau nói về chuyến đi. Bạn có thể ngắt lời Atlas bất cứ lúc nào.</p>
          {sessionEnded ? <p className="ended-notice"><CheckCircle2 size={14} /> Phiên đã kết thúc — bản ghi và ngữ cảnh đã được xoá.</p> : null}
          <div className="atlas-route-entry is-summary">
            <span className="atlas-route-entry-icon"><Navigation size={21} /></span>
            <span><small>LẬP KẾ HOẠCH · 4 BƯỚC BẰNG GIỌNG NÓI</small><strong>Ăn tối → Cà phê → Đặt chỗ</strong></span>
            <Navigation size={19} />
          </div>
          <div className="atlas-route-origin-hint"><Mic size={12} /> Hãy nói tự nhiên; Atlas sẽ hỏi thêm và xác nhận trước khi đặt chỗ.</div>
          <button className="atlas-primary" type="button" onClick={() => void startSubmissionDemo(true)} disabled={!submissionDemoFixture}><Mic size={20} /> Bắt đầu bằng giọng nói</button>
          <button className="atlas-text-link" type="button" onClick={() => void startSubmissionDemo(false)}>Mic gặp lỗi? <strong>Dùng nhập chữ dự phòng</strong></button>
          <small><ShieldCheck size={13} /> Micrô chỉ được dùng trong phiên đang hoạt động và dừng ngay khi bạn kết thúc.</small>
        </section>
      ) : screen === "checkout" && latestResponse?.journey ? (
        <JourneyCheckout response={latestResponse} isConfirming={isConfirming} confirmed={Boolean(receipt)} onBack={() => setScreen("live")} onConfirm={confirmParking} onReceipt={() => setScreen("receipt")} />
      ) : screen === "receipt" && receipt ? (
        <JourneyReceipt response={latestResponse} receipt={receipt} isTheaterPlaying={isTheaterPlaying} mapReady={mapReady} theaterFallback={theaterFallback} canDrive={driveStops.length >= 2} onTheater={playRouteTheater} onDrive={() => void startDriving()} onBack={() => setScreen("checkout")} />
      ) : screen === "driving" && drive ? (
        <JourneyDriving
          drive={drive}
          stops={driveStops}
          paused={drivePaused}
          originSource={drivingOriginSource}
          onPauseToggle={() => setDrivePaused((value) => !value)}
          onEnd={endDriving}
        />
      ) : (
        <section className="atlas-live-sheet">
          <div className={`live-controls${submissionDemo ? " is-submission-demo" : ""}`}>
            <button className={`live-orb state-${voiceState}`} type="button" onClick={toggleMute} aria-label="Bật hoặc tắt micrô">
              {voiceState === "muted" ? <MicOff size={25} /> : voiceState === "speaking" ? <Volume2 size={25} /> : <Mic size={25} />}
            </button>
            <div className="live-status"><strong>{isSubmissionBooking ? "Đang hoàn tất đặt chỗ…" : submissionDemoStage === "complete" && submissionDemoChoiceMade ? "Hành trình đã sẵn sàng" : submissionDemo && realtimeMode === "connecting" ? "Đang bật mic…" : voiceLabel(voiceState)}</strong><span>{isSubmissionBooking ? "Pizza 4P's · 12/7 · 19:00" : submissionDemoStage === "complete" && submissionDemoChoiceMade ? "Pizza 4P's · 12/7 19:00 · VETC" : submissionDemo ? `${voiceSubline(voiceState, realtimeMode)} · đang lập hành trình` : voiceSubline(voiceState, realtimeMode)}</span></div>
            <button className="mute-control" type="button" onClick={toggleMute}><MicOff size={17} /><span>{voiceState === "muted" ? "Bật mic" : "Tắt mic"}</span></button>
            <button className="end-control" type="button" onClick={endSession}><CircleStop size={17} /><span>Kết thúc</span></button>
          </div>

          {notice ? <p className="fallback-notice">{notice}</p> : null}
          <div className="conversation-label"><span>Cuộc trò chuyện</span><small>Không nhận diện người nói</small></div>
          {submissionDemo ? <SubmissionDemoTranscript turns={submissionConversation} partial={partial} stage={submissionDemoStage} isBooking={isSubmissionBooking} /> : <p className="live-transcript">{partial || "Hãy nói tự nhiên về nơi bạn muốn đến…"}</p>}
          {wasInterrupted ? <div className="interrupt-banner"><Check size={16} /><div><strong>Đã nghe yêu cầu mới</strong><span>Đã dừng nói khi bạn ngắt lời</span></div></div> : null}

          {!submissionDemo && latestResponse?.intent === "clarification_required" && latestResponse.quickReplies?.length ? (
            <div className="quick-replies">
              {latestResponse.quickReplies.map((reply) => (
                <button key={reply} type="button" onClick={() => void handleUtterance(reply)}>{reply}</button>
              ))}
            </div>
          ) : null}
          {constraints.length && (!submissionDemo || submissionDemoChoiceMade) ? <><div className="constraint-caption">Ràng buộc đã hiểu <span>{submissionDemo ? "Từ cuộc trò chuyện" : "Điều chỉnh bằng lời hoặc ô nhập"}</span></div><div className="constraint-chips">{constraints.map((item) => (
            <span key={item}>{item}{submissionDemo ? null : <button type="button" aria-label={`Bỏ tiêu chí ${item}`} onClick={() => void handleUtterance(`Bỏ tiêu chí ${item}`)}><X size={11} /></button>}</span>
          ))}</div></> : null}
          {latestResponse && (!submissionDemo || submissionDemoChoiceMade) ? <RecommendationCard response={latestResponse} onOpen={() => void openJourney()} /> : submissionDemo ? null : <div className="empty-understanding"><Sparkles size={18} /><span>Atlas sẽ biến cuộc trò chuyện thành một kế hoạch duy nhất trên bản đồ.</span></div>}

          {realtimeMode !== "realtime" && submissionDemoStage !== "complete" ? (
            <form className="atlas-composer" onSubmit={submit}>
              <input aria-label="Nhập yêu cầu" value={input} onChange={(event) => setInput(event.target.value)} placeholder={submissionDemoStage === "cuisine" ? "Nhập: Món Ý" : submissionDemoStage === "time" ? "Nhập: Khoảng 7 giờ tối" : submissionDemoStage === "confirmation" ? "Nhập: Chốt đi" : "Mô tả bữa tối và quán cà phê bạn muốn…"} />
              <button type="submit" disabled={!input.trim()} aria-label="Gửi"><Send size={18} /></button>
            </form>
          ) : null}
        </section>
      )}
    </main>
  );
}

function SubmissionDemoTranscript({ turns, partial, stage, isBooking }: { turns: SubmissionConversationTurn[]; partial: string; stage: SubmissionDemoVoiceStage | "idle"; isBooking: boolean }) {
  const latestUserText = [...turns].reverse().find((turn) => turn.role === "user")?.text ?? "";
  const showPartial = Boolean(partial.trim()) && partial.trim() !== latestUserText.trim();
  const prompt = stage === "cuisine"
    ? "Đến lượt bạn: hãy nói “Món Ý”."
    : stage === "time"
      ? "Đến lượt bạn: hãy nói “Khoảng 7 giờ tối”."
    : stage === "confirmation"
      ? "Xác nhận ngày 12 tháng 7 lúc 19:00 bằng cách nói “Chốt đi”."
    : stage === "complete"
      ? isBooking ? "Atlas đang hoàn tất đặt chỗ…" : "Hành trình đã sẵn sàng."
      : "Đến lượt bạn: hãy nói câu mở đầu về ba người, Quận 1, ăn tối và cà phê.";
  return (
    <div className="submission-demo-transcript" aria-live="polite">
      {turns.map((turn) => <p key={turn.id} className={turn.role === "user" ? "is-user" : "is-atlas"}><small>{turn.role === "user" ? "Bạn · phiên âm trực tiếp" : "Atlas"}</small>{turn.text}</p>)}
      {showPartial ? <p className="is-user is-partial"><small>Bạn · đang nghe</small>{partial}</p> : null}
      {isBooking ? <div className="submission-booking-state" role="status"><i aria-hidden="true" /><span><strong>Đang hoàn tất đặt chỗ</strong><small>{"Pizza 4P's · 12/7 · 19:00"}</small></span></div> : null}
      {!turns.length || (!showPartial && stage !== "complete") ? <p className="is-prompt"><small>Gợi ý nói</small>{prompt}</p> : null}
    </div>
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
  return mode === "realtime" ? "Âm thanh trực tiếp đang hoạt động" : "Sẵn sàng nhận nội dung bằng chữ";
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
  const [expandedRecommendationIndex, setExpandedRecommendationIndex] = useState<number | null>(null);
  const journey = response.journey;
  const revised = journey?.revision.outcome === "cheaper";
  const animatedTotal = useAnimatedVnd(journey?.totalVnd ?? 0);
  if (!response.recommendations.length) {
    return (
      <article className="live-recommendation">
        <header><span><Sparkles size={14} /> Gợi ý phù hợp nhất</span></header>
        <p>{response.assistantResponse}</p>
      </article>
    );
  }

  const recommendationCount = response.recommendations.length;
  return (
    <section className="live-recommendations" aria-labelledby="live-recommendations-heading">
      <header className="recommendations-summary">
        <span id="live-recommendations-heading"><Sparkles size={14} /> {recommendationCount} gợi ý phù hợp</span>
        {revised ? <em><Check size={13} /> Đã thay đổi</em> : null}
      </header>
      <ol className="live-recommendation-list">
        {response.recommendations.map((recommendation, index) => {
          const primary = recommendation.poi;
          const attributes = primary.attributes.slice(0, 2).join(" · ");
          const scoreParts = Object.entries(recommendation.scoreBreakdown ?? {})
            .filter(([key, value]) => value > 0 && SCORE_LABELS[key])
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
          const maxPart = scoreParts[0]?.[1] ?? 1;
          const showReceipts = expandedRecommendationIndex === index;
          const receiptsId = `recommendation-receipts-${index}`;
          const titleId = `recommendation-title-${index}`;
          return (
            <li key={primary.id}>
              <article className={`live-recommendation${revised && index === 0 ? " is-revised" : ""}`} aria-labelledby={titleId}>
                <header>
                  <span><Sparkles size={14} /> {index === 0 ? "Phù hợp nhất" : `Lựa chọn ${index + 1}`}</span>
                  <em>{index + 1}/{recommendationCount}</em>
                </header>
                <div className="recommendation-title"><div><Utensils size={20} /></div><span><strong id={titleId}>{primary.name}</strong><small>{primary.category}{attributes ? ` · ${attributes}` : ""}</small></span></div>
                <div className="recommendation-facts">
                  <span><MapPin size={14} /><strong>{primary.district}, {primary.city}</strong><small>vị trí</small></span>
                  <span><Clock3 size={14} /><strong>{primary.rating.toFixed(1)}/5</strong><small>đánh giá dữ liệu</small></span>
                  {journey && index === 0 ? <span><CreditCard size={14} /><strong className="is-counting">{animatedTotal.toLocaleString("vi-VN")} ₫</strong><small>tổng ước tính</small></span> : null}
                </div>
                {revised && journey && index === 0 ? <div className="savings-line"><Check size={15} /> Tiết kiệm {journey.savingsVnd.toLocaleString("vi-VN")} ₫ so với phương án trước</div> : null}
                <button
                  className="receipts-toggle"
                  type="button"
                  onClick={() => setExpandedRecommendationIndex(showReceipts ? null : index)}
                  aria-expanded={showReceipts}
                  aria-controls={receiptsId}
                >
                  <ShieldCheck size={13} /> Vì sao gợi ý này? · {showReceipts ? "Ẩn" : "Xem điểm thành phần"}
                </button>
                {showReceipts ? (
                  <div className="receipts-panel" id={receiptsId}>
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
              </article>
            </li>
          );
        })}
      </ol>
      {journey ? <button className="atlas-primary recommendations-journey-button" type="button" onClick={onOpen}><Navigation size={17} /> Chốt hành trình</button> : null}
    </section>
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
  const routePoiIds = [...new Set(journey.actions.map((action) => action.poiId))];
  return <section className="atlas-checkout-sheet">
    <div className="sheet-handle" />
    <header><button type="button" onClick={onBack}><ArrowLeft size={19} /></button><div><small>HÀNH TRÌNH ĐÃ LÊN</small><h1>Chốt hành trình</h1></div></header>
    <p className="checkout-summary">Một hành trình theo thứ tự. Chỉ chỗ đỗ xe được thanh toán ngay; nhiên liệu và bữa ăn thanh toán tại địa điểm.</p>
    <ol className="checkout-stops">{journey.actions.map((action) => {
      const poi = response.recommendations.find((item) => item.poi.id === action.poiId)?.poi;
      const routeNumber = routePoiIds.indexOf(action.poiId) + 1;
      const status = action.kind === "parking"
        ? `Ví VETC · ${action.originalPriceVnd.toLocaleString("vi-VN")} ₫ − ${action.discountVnd.toLocaleString("vi-VN")} ₫ = ${action.finalPriceVnd.toLocaleString("vi-VN")} ₫`
        : action.status === "confirmed"
          ? action.cta
          : `Thanh toán tại ${action.kind === "fuel" ? "trạm" : "quán"}`;
      return <li key={action.id} className={action.kind === "parking" ? "is-attached-service" : undefined}><i>{routeNumber}</i><span className="checkout-stop-icon">{actionIcon(action.kind)}</span><div><strong>{poi?.name ?? action.miniApp}</strong><small>{action.reason}</small><em>{status}</em></div></li>;
    })}</ol>
    <div className="checkout-costs"><span><small>Chi phí ước tính toàn hành trình</small><strong>{journey.totalVnd.toLocaleString("vi-VN")} ₫</strong></span><span className="is-prepaid"><small>Thanh toán ngay · Đỗ xe 2 giờ</small><strong>{(parking?.finalPriceVnd ?? 0).toLocaleString("vi-VN")} ₫</strong></span></div>
    <p className="checkout-disclosure">Ưu đãi VETC đã được áp dụng cho chỗ đỗ xe 2 giờ.</p>
    <button className="checkout-confirm" type="button" onClick={confirmed ? onReceipt : onConfirm} disabled={isConfirming || !parking}>{confirmed ? "Xem biên nhận" : isConfirming ? "Đang xác nhận…" : `Thanh toán ${(parking?.finalPriceVnd ?? 0).toLocaleString("vi-VN")} ₫ bằng Ví VETC`}</button>
    <button className="checkout-back" type="button" onClick={onBack}>Chưa, để tôi chỉnh lại</button>
  </section>;
}

function JourneyReceipt({ response, receipt, isTheaterPlaying, mapReady, theaterFallback, canDrive, onTheater, onDrive, onBack }: { response: ChatResponse | null; receipt: SimulatedReceipt; isTheaterPlaying: boolean; mapReady: boolean; theaterFallback: string; canDrive: boolean; onTheater: () => void; onDrive: () => void; onBack: () => void }) {
  const parking = receipt.journey.actions.find((action) => action.kind === "parking");
  const payLater = receipt.journey.actions.filter((action) => action.kind !== "parking");
  const poiName = (poiId: string) => response?.recommendations.find((item) => item.poi.id === poiId)?.poi.name;
  return <section className="atlas-receipt-sheet">
    <div className="sheet-handle" />
    <header><button type="button" onClick={onBack}><ArrowLeft size={19} /></button><div><CheckCircle2 size={28} /><span><small>BIÊN NHẬN VETC</small><h1>Đã giữ chỗ đỗ xe</h1></span></div></header>
    <div className="receipt-id"><span><small>Mã hành trình</small><strong>{receipt.id}</strong></span><span><small>Xác nhận lúc</small><strong>{receipt.confirmedAt}</strong></span></div>
    <article className="receipt-paid"><ReceiptText size={20} /><div><small>ĐÃ THANH TOÁN QUA VÍ VETC</small><strong>Đỗ xe tại {parking ? poiName(parking.poiId) ?? parking.miniApp : "Pizza 4P's"} · 2 giờ</strong></div><b>{(parking?.finalPriceVnd ?? 0).toLocaleString("vi-VN")} ₫</b></article>
    <div className="receipt-later"><small>BÀN ĐÃ GIỮ · THANH TOÁN TẠI ĐỊA ĐIỂM</small>{payLater.map((action) => <span key={action.id}>{poiName(action.poiId) ?? action.miniApp}<b>{action.finalPriceVnd.toLocaleString("vi-VN")} ₫</b></span>)}</div>
    <p><ShieldCheck size={14} /> Đặt bàn, đỗ xe và lộ trình đã được liên kết trong một hành trình.</p>
    {!mapReady ? <div className="theater-fallback"><ShieldCheck size={15} /><span><strong>Bản đồ 3D chưa sẵn sàng</strong>{theaterFallback || "Biên nhận và hành trình vẫn được giữ nguyên. Hãy thử lại trên thiết bị hỗ trợ WebGL."}</span></div> : null}
    <button className="receipt-theater" type="button" onClick={onDrive} disabled={!canDrive}><Navigation size={17} /> Bắt đầu dẫn đường</button>
    <button className="receipt-theater-alt" type="button" onClick={onTheater} disabled={isTheaterPlaying || !mapReady}><Play size={16} />{isTheaterPlaying ? "Đang trình diễn tuyến 3D" : mapReady ? "Xem tuyến 3D" : "Xem tuyến 3D không khả dụng"}</button>
    <small className="theater-disclosure">Tuyến 3D hiển thị thứ tự các điểm dừng trong hành trình.</small>
  </section>;
}

// Mobile driving mode: the Tesla reference's car-visualization pane only. The
// supplied raster asset carries the scene; UI stays to one maneuver, telemetry,
// ordered stops, and pause/end. Route facts still come only from buildRoutes.
function JourneyDriving({
  drive, stops, paused, originSource, onPauseToggle, onEnd
}: {
  drive: DriveState;
  stops: DriveStop[];
  paused: boolean;
  originSource: DrivingOriginSource;
  onPauseToggle: () => void;
  onEnd: () => void;
}) {
  const { nextStop } = drive;
  return (
    <>
      <div className="atlas-driving-instruction" role="status" aria-live="polite">
        <span className="driving-instruction-icon"><Navigation size={22} /></span>
        <div className="driving-instruction-main">
          <span>{paused ? "ĐÃ TẠM DỪNG" : "CHỈ DẪN TIẾP THEO"}</span>
          <strong>Đi tiếp {formatDriveDistance(drive.legDistanceMeters)}</strong>
          <small>đến {nextStop.poi.name} · {nextStop.poi.district}</small>
        </div>
      </div>

      <div className="atlas-driving-telemetry" aria-label="Tốc độ và thời gian dự kiến">
        <div className="driving-speed">
          <strong>{paused ? 0 : drive.speedKph}</strong>
          <small>km/h</small>
          <em>{paused ? "ĐÃ TẠM DỪNG" : "ĐANG DI CHUYỂN"}</em>
        </div>
        <div className="driving-eta">
          <small>ĐẾN NƠI</small>
          <strong>{driveClock(drive.remainingSeconds)}</strong>
          <span>{formatDriveMinutes(drive.remainingSeconds)} phút</span>
        </div>
      </div>

      <section className="atlas-driving-sheet">
        <header className="driving-progress-header"><span>Hành trình</span><strong>{drive.index + 1} / {drive.total} điểm dừng</strong></header>
        <ol className="driving-stops">
          {stops.map((stop, index) => {
            const state = index < drive.index ? "done" : index === drive.index ? "active" : "upcoming";
            return (
              <li key={stop.poi.id} className={`is-${state}`} aria-current={state === "active" ? "step" : undefined}>
                <i>{state === "done" ? <Check size={13} /> : index + 1}</i>
                <span><strong>{stop.poi.name}</strong><small>{stop.poi.address}</small></span>
                <em>{state === "done" ? "Đã đến" : state === "active" ? "Tiếp theo" : "Sau đó"}</em>
              </li>
            );
          })}
        </ol>
        <div className="driving-controls">
          <button type="button" className="driving-control is-pause" onClick={onPauseToggle}>
            {paused ? <Play size={19} /> : <Pause size={19} />}
            {paused ? "Tiếp tục" : "Tạm dừng"}
          </button>
          <button type="button" className="driving-control is-end" onClick={onEnd}>
            <CircleStop size={19} />
            Kết thúc
          </button>
        </div>
        <small className="driving-disclosure"><MapPin size={12} />{originSource === "device" ? "Xuất phát từ vị trí hiện tại của bạn." : "Xuất phát từ điểm mặc định tại Quận 1."}</small>
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
      <section className="vetc-video"><strong>▶&nbsp; VETC Video</strong><div><span>Hướng dẫn</span><span>Ưu đãi</span><span>Tin mới</span></div></section>
    </main>
  );
}
function Service({ icon, title, badge = false }: { icon: React.ReactNode; title: string; badge?: boolean }) { return <button type="button">{badge ? <i>Mới</i> : null}<span className="service-icon">{icon}</span><strong>{title}</strong></button>; }
