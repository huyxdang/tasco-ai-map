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

import type { ChatResponse, Journey, Poi, UserProfile } from "@/lib/types";
import { isConfirmedSpeech, setAudioTracksMuted } from "@/lib/realtime";
import { routeTheaterAvailability } from "@/lib/route-theater";
import { startScribeSession, type SttSession } from "@/lib/stt-client";
import { playGroundedSpeech, type TtsPlayback } from "@/lib/tts-client";

const MapView = dynamic(
  () => import("@/components/map-view").then((module) => module.MapView),
  { ssr: false, loading: () => <div className="atlas-map-loading">Đang mở bản đồ…</div> }
);

type TascoAtlasProps = { initialPois: Poi[]; profiles: UserProfile[] };
type Screen = "home" | "session" | "live" | "checkout" | "receipt";
type VoiceState = "idle" | "listening" | "thinking" | "speaking" | "interrupted" | "muted";
type DemoStage = 0 | 1 | 2 | 3;
type MapMode = "2d" | "3d";
type SimulatedReceipt = { id: string; journey: Journey; confirmedAt: string };

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

  useEffect(() => { sessionIdRef.current = newSessionId(); }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setShowDemoRail(new URLSearchParams(window.location.search).has("demo"));
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => () => stopRealtime(), []);
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

  function stopRealtime() {
    realtimeAttemptRef.current += 1;
    responseActiveRef.current = false;
    ttsRef.current?.stop();
    ttsRef.current = null;
    sttRef.current?.stop();
    sttRef.current = null;
    streamRef.current = null;
  }

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
  sttHandlersRef.current = {
    onPartial: handlePartialTranscript,
    onCommitted: handleCommittedTranscript,
    onError: handleSttError,
  };

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

  if (screen === "home") return <VetcHome onOpen={() => setScreen("session")} />;

  return (
    <main className="atlas-mobile-shell">
      <section className="atlas-map-layer" aria-label="Bản đồ TASCO Atlas">
        <MapView pois={mapPois} mode={mapMode} selectedPoiId={selectedPoiId} routeCoordinates={routeCoordinates} activeStopIndex={activeStopIndex} onSelectPoi={(poi) => setSelectedPoiId(poi.id)} onReadyChange={setMapReady} />
        {/* 3D is receipt-stage Route Theater only (design §2.5) — no live map-mode toggle. */}
        <div className="atlas-map-disclosure"><ShieldCheck size={13} /> Dữ liệu &amp; tuyến mô phỏng · {latestResponse?.journey?.actions.length ?? mapPois.length} điểm dừng</div>
      </section>

      <header className="atlas-floating-header">
        <button type="button" onClick={() => { stopRealtime(); setScreen("home"); }} aria-label="Quay lại"><ArrowLeft size={20} /></button>
        <div><strong>TASCO Atlas</strong><span><i /> Phiên trực tiếp</span></div>
        <button type="button" onClick={() => setShowPrivacy((value) => !value)} aria-label="Thông tin quyền riêng tư"><ShieldCheck size={19} /></button>
      </header>

      {showPrivacy ? <aside className="atlas-privacy-card"><button type="button" onClick={() => setShowPrivacy(false)} aria-label="Đóng"><X size={16} /></button><strong>Quyền riêng tư phiên Atlas</strong><p>Micrô chỉ hoạt động sau khi bạn bấm bắt đầu. Không camera, không tài khoản VETC thật, không lưu âm thanh hay lịch sử sau phiên.</p><small>POI, tuyến, giá, ưu đãi và thanh toán đều là dữ liệu mô phỏng.</small></aside> : null}

      {screen === "session" ? (
        <section className="atlas-start-sheet">
          <div className="sheet-handle" />
          <div className="start-orb"><Mic size={31} /></div>
          <h1>Bắt đầu phiên trò chuyện</h1>
          <p>Hãy cùng nhau nói về chuyến đi. Bạn có thể ngắt lời Atlas bất cứ lúc nào.</p>
          <button className="atlas-primary" type="button" onClick={() => void startSession()}><Mic size={20} /> Bắt đầu trò chuyện</button>
          <button className="atlas-text-link" type="button" onClick={() => { setIsTextMode(true); setScreen("live"); setVoiceState("listening"); }}>Không dùng giọng nói? <strong>Nhập bằng chữ</strong></button>
          <small><ShieldCheck size={13} /> Micrô chỉ được dùng trong phiên đang hoạt động và dừng ngay khi bạn kết thúc.</small>
        </section>
      ) : screen === "checkout" && latestResponse?.journey ? (
        <JourneyCheckout response={latestResponse} isConfirming={isConfirming} confirmed={Boolean(receipt)} onBack={() => setScreen("live")} onConfirm={confirmParking} onReceipt={() => setScreen("receipt")} />
      ) : screen === "receipt" && receipt ? (
        <JourneyReceipt receipt={receipt} isTheaterPlaying={isTheaterPlaying} mapReady={mapReady} theaterFallback={theaterFallback} onTheater={playRouteTheater} onBack={() => setScreen("checkout")} />
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

          {constraints.length ? <><div className="constraint-caption">Ràng buộc đã hiểu <span>Điều chỉnh bằng lời hoặc ô nhập</span></div><div className="constraint-chips">{constraints.map((item) => <span key={item}>{item}</span>)}</div></> : null}
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
function RecommendationCard({ response, onOpen }: { response: ChatResponse; onOpen: () => void }) {
  const primary = response.recommendations[0]?.poi;
  const journey = response.journey;
  const revised = journey?.revision.outcome === "cheaper";
  if (!primary) {
    return (
      <article className="live-recommendation">
        <header><span><Sparkles size={14} /> Gợi ý phù hợp nhất</span></header>
        <p>{response.assistantResponse}</p>
      </article>
    );
  }
  const attributes = primary.attributes.slice(0, 2).join(" · ");
  return (
    <article className={`live-recommendation${revised ? " is-revised" : ""}`}>
      <header><span><Sparkles size={14} /> Gợi ý phù hợp nhất</span>{revised ? <em><Check size={13} /> Đã thay đổi</em> : null}</header>
      <div className="recommendation-title"><div><Utensils size={20} /></div><span><strong>{primary.name}</strong><small>{primary.category}{attributes ? ` · ${attributes}` : ""}</small></span></div>
      <div className="recommendation-facts">
        <span><MapPin size={14} /><strong>{primary.district}, {primary.city}</strong><small>vị trí</small></span>
        <span><Clock3 size={14} /><strong>{primary.rating.toFixed(1)}/5</strong><small>đánh giá dữ liệu</small></span>
        {journey ? <span><CreditCard size={14} /><strong>{journey.totalVnd.toLocaleString("vi-VN")} ₫</strong><small>tổng ước tính</small></span> : null}
      </div>
      {revised && journey ? <div className="savings-line"><Check size={15} /> Tiết kiệm {journey.savingsVnd.toLocaleString("vi-VN")} ₫ so với phương án trước</div> : null}
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

function JourneyReceipt({ receipt, isTheaterPlaying, mapReady, theaterFallback, onTheater, onBack }: { receipt: SimulatedReceipt; isTheaterPlaying: boolean; mapReady: boolean; theaterFallback: string; onTheater: () => void; onBack: () => void }) {
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
    <button className="receipt-theater" type="button" onClick={onTheater} disabled={isTheaterPlaying || !mapReady}><Play size={17} />{isTheaterPlaying ? "Đang trình diễn tuyến 3D" : mapReady ? "Bắt đầu dẫn đường · Xem tuyến 3D" : "Xem tuyến 3D không khả dụng"}</button>
    <small className="theater-disclosure">Tuyến và công trình 3D là hình ảnh mô phỏng.</small>
  </section>;
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
