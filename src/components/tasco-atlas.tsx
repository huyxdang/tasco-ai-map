"use client";

import {
  Box,
  ChevronRight,
  CircleStop,
  LocateFixed,
  Map as MapIcon,
  Mic,
  Navigation,
  Play,
  RotateCcw,
  Send,
  ShieldCheck,
  BadgePercent,
  CheckCircle2,
  ReceiptText,
  WalletCards,
  Sparkles,
  Star,
  UserRound,
  Volume2,
  X
} from "lucide-react";
import dynamic from "next/dynamic";
import {
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

import type {
  ChatResponse,
  Journey,
  Poi,
  Recommendation,
  UserProfile
} from "@/lib/types";

const MapView = dynamic(
  () => import("@/components/map-view").then((module) => module.MapView),
  {
    ssr: false,
    loading: () => (
      <div className="map-loading">
        <span />
        Đang dựng bản đồ TASCO…
      </div>
    )
  }
);

type MapMode = "2d" | "3d";

type UiMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  response?: ChatResponse;
};

type TascoAtlasProps = {
  initialPois: Poi[];
  profiles: UserProfile[];
};

type SimulatedReceipt = {
  id: string;
  journey: Journey;
};

type SpeechResultEvent = {
  results: ArrayLike<{ 0: { transcript: string } }>;
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

const QUICK_PROMPTS = [
  "Tôi lái xe ở TP.HCM, cần đổ xăng, ăn tối và bãi đỗ xe.",
  "Tôi có 90 phút ở Quận 1: cà phê yên tĩnh rồi ăn tối có view.",
  "Đưa tôi đến Galaxy.",
  "Gợi ý nơi hẹn hò lãng mạn tối nay ở Quận 1.",
  "Tôi lái xe đêm, cần nơi ăn khuya và đổ xăng."
];

function responseConfidence(response: ChatResponse) {
  const raw = Number(response.confidence ?? 0);
  return Math.round(raw <= 1 ? raw * 100 : raw);
}

function recommendationPois(recommendations: Recommendation[]) {
  return recommendations.map((recommendation) => recommendation.poi).filter(Boolean);
}

function sessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `demo-${Date.now().toString(36)}`;
}

export function TascoAtlas({ initialPois, profiles }: TascoAtlasProps) {
  const defaultPois = useMemo(() => {
    const hcmc = initialPois.filter((poi) => poi.city === "TP.HCM");
    return (hcmc.length ? hcmc : initialPois).slice(0, 12);
  }, [initialPois]);

  const [messages, setMessages] = useState<UiMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Chào Edward — nói cho tôi biết bạn đang đi đâu, đi với ai, và điều gì quan trọng. Tôi sẽ biến cuộc trò chuyện thành hành động trên bản đồ."
    }
  ]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState(profiles[0]?.id ?? "");
  const [mapMode, setMapMode] = useState<MapMode>("2d");
  const [mapPois, setMapPois] = useState<Poi[]>(defaultPois);
  const [selectedPoiId, setSelectedPoiId] = useState<string | null>(
    defaultPois[0]?.id ?? null
  );
  const [latestResponse, setLatestResponse] = useState<ChatResponse | null>(null);
  const [activeStopIndex, setActiveStopIndex] = useState(-1);
  const [isTheaterPlaying, setIsTheaterPlaying] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [journeyOpen, setJourneyOpen] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [receipt, setReceipt] = useState<SimulatedReceipt | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [liveStatus, setLiveStatus] = useState("");
  const conversationRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef("demo-session");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const messageSequenceRef = useRef(0);
  const confirmationLockRef = useRef(false);
  const journeyCloseRef = useRef<HTMLButtonElement>(null);

  const latestRecommendations = useMemo(
    () => latestResponse?.recommendations ?? [],
    [latestResponse]
  );
  const selectedPoi =
    mapPois.find((poi) => poi.id === selectedPoiId) ?? mapPois[0] ?? null;

  const theaterPois = useMemo(
    () => recommendationPois(latestRecommendations).slice(0, 4),
    [latestRecommendations]
  );

  const routeCoordinates = useMemo<[number, number][]>(() => {
    if (!theaterPois.length) return [];
    const visibleStops =
      activeStopIndex >= 0
        ? theaterPois.slice(0, Math.min(activeStopIndex + 1, theaterPois.length))
        : theaterPois.slice(0, 2);
    const first = theaterPois[0];
    const origin: [number, number] = [
      first.coordinates.lon - 0.0026,
      first.coordinates.lat - 0.0019
    ];
    return [
      origin,
      ...visibleStops.map(
        (poi): [number, number] => [poi.coordinates.lon, poi.coordinates.lat]
      )
    ];
  }, [activeStopIndex, theaterPois]);

  function nextMessageId(prefix: string) {
    messageSequenceRef.current += 1;
    return `${prefix}-${messageSequenceRef.current}`;
  }

  useEffect(() => {
    sessionRef.current = sessionId();
  }, []);

  useEffect(() => {
    conversationRef.current?.scrollTo({
      top: conversationRef.current.scrollHeight,
      behavior: "smooth"
    });
  }, [isThinking, messages]);

  useEffect(() => {
    if (!isTheaterPlaying || !theaterPois.length) return;
    if (activeStopIndex >= theaterPois.length - 1) {
      const finishTimer = window.setTimeout(() => setIsTheaterPlaying(false), 1100);
      return () => window.clearTimeout(finishTimer);
    }
    const timer = window.setTimeout(
      () => setActiveStopIndex((index) => index + 1),
      activeStopIndex < 0 ? 250 : 1650
    );
    return () => window.clearTimeout(timer);
  }, [activeStopIndex, isTheaterPlaying, theaterPois.length]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function submitMessage(message: string) {
    const trimmed = message.trim();
    if (!trimmed || isThinking) return;

    const userMessage: UiMessage = {
      id: nextMessageId("user"),
      role: "user",
      content: trimmed
    };
    setMessages((current) => [...current, userMessage]);
    setInput("");
    setIsThinking(true);
    setActiveStopIndex(-1);
    setIsTheaterPlaying(false);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionRef.current,
          message: trimmed,
          profileId: selectedProfileId,
          history: messages.slice(-10).map((item) => ({
            role: item.role,
            content: item.content
          })),
          sessionContext: latestResponse?.sessionContext
        })
      });

      if (!response.ok) {
        throw new Error(`Chat request failed with ${response.status}`);
      }

      const payload = (await response.json()) as ChatResponse;
      const assistantMessage: UiMessage = {
        id: nextMessageId("assistant"),
        role: "assistant",
        content: payload.assistantResponse,
        response: payload
      };
      const resultPois = recommendationPois(payload.recommendations ?? []);
      setMessages((current) => [...current, assistantMessage]);
      setLatestResponse(payload);
      setReceipt(null);
      confirmationLockRef.current = false;
      if (payload.journey) {
        setJourneyOpen(true);
        setLiveStatus(payload.journey.revision.message);
        window.setTimeout(() => journeyCloseRef.current?.focus(), 0);
      } else {
        setJourneyOpen(false);
      }
      if (resultPois.length) {
        setMapPois(resultPois);
        setSelectedPoiId(resultPois[0].id);
      }
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: nextMessageId("assistant-error"),
          role: "assistant",
          content:
            "Tôi không kết nối được với bộ máy đề xuất. Hãy thử lại — dữ liệu demo của bạn vẫn chưa được lưu ở đâu cả."
        }
      ]);
    } finally {
      setIsThinking(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitMessage(input);
  }

  function toggleVoice() {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const speechWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition =
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setToast("Trình duyệt này chưa hỗ trợ nhập giọng nói.");
      return;
    }

    const recognition = new Recognition();
    recognition.lang = "vi-VN";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      setInput(transcript);
      setToast("Đã nhận giọng nói — kiểm tra rồi gửi.");
    };
    recognition.onerror = () => setToast("Không nghe rõ. Hãy thử lại.");
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  }

  function playRouteTheater() {
    if (!theaterPois.length) return;
    setMapMode("3d");
    setActiveStopIndex(-1);
    setIsTheaterPlaying(true);
    setToast("3D Route Theater đang biến lý do thành hành động bản đồ.");
  }

  function confirmJourney() {
    const journey = latestResponse?.journey;
    if (!journey || confirmationLockRef.current) return;
    confirmationLockRef.current = true;
    setIsConfirming(true);
    setLiveStatus("Đang xác nhận mô phỏng bằng ví VETC…");
    window.setTimeout(() => {
      const confirmed: Journey = {
        ...journey,
        actions: journey.actions.map((item) => ({ ...item, status: "confirmed" })),
      };
      setReceipt({ id: `VETC-MP-${journey.id.slice(-6).toUpperCase()}`, journey: confirmed });
      setIsConfirming(false);
      setLiveStatus("Đã tạo một biên nhận VETC mô phỏng.");
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reducedMotion) {
        setMapMode("3d");
        setToast("Đã xác nhận. Chuyển động giảm: nhấn Trình diễn khi bạn sẵn sàng.");
      } else if (mapReady) {
        playRouteTheater();
      } else {
        setToast("Đã xác nhận; bản đồ chưa sẵn sàng. Bạn có thể chạy Trình diễn thủ công.");
      }
    }, 350);
  }

  function clearConversation() {
    sessionRef.current = sessionId();
    setMessages([
      {
        id: nextMessageId("welcome"),
        role: "assistant",
        content:
          "Phiên cũ đã được xoá khỏi bộ nhớ tạm. Bạn muốn khám phá điều gì tiếp theo?"
      }
    ]);
    setLatestResponse(null);
    setMapPois(defaultPois);
    setSelectedPoiId(defaultPois[0]?.id ?? null);
    setActiveStopIndex(-1);
    setIsTheaterPlaying(false);
    setJourneyOpen(false);
    setReceipt(null);
    setIsConfirming(false);
    confirmationLockRef.current = false;
  }

  return (
    <main className="atlas-shell">
      <aside className="conversation-panel">
        <header className="brand-header">
          <div className="brand-lockup">
            <div className="brand-mark" aria-hidden="true">
              <span />
              <Navigation size={17} strokeWidth={2.6} />
            </div>
            <div>
              <p>TASCO</p>
              <h1>Atlas</h1>
            </div>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={clearConversation}
            aria-label="Xoá cuộc trò chuyện"
            title="Xoá cuộc trò chuyện"
          >
            <RotateCcw size={17} />
          </button>
        </header>

        <div className="profile-strip">
          <UserRound size={16} />
          <label htmlFor="profile-select">Bối cảnh</label>
          <select
            id="profile-select"
            value={selectedProfileId}
            onChange={(event) => {
              setSelectedProfileId(event.target.value);
              setJourneyOpen(false);
              setReceipt(null);
              setLatestResponse(null);
            }}
          >
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.persona} · {profile.currentLocation}
              </option>
            ))}
          </select>
        </div>

        <div className="conversation-scroll" ref={conversationRef}>
          <div className="session-note">
            <ShieldCheck size={15} />
            <span>Demo riêng tư</span>
            Dữ liệu tổng hợp · không camera · không tài khoản
          </div>

          {messages.map((message) => (
            <article
              className={`message ${message.role === "user" ? "message-user" : "message-assistant"}`}
              key={message.id}
            >
              {message.role === "assistant" ? (
                <div className="assistant-avatar" aria-hidden="true">
                  <Sparkles size={14} />
                </div>
              ) : null}
              <div className="message-body">
                <p>{message.content}</p>
                {message.response ? (
                  <>
                    <div className="response-meta">
                      <span>{message.response.intent}</span>
                      <i />
                      <span>{responseConfidence(message.response)}% tin cậy</span>
                      <i />
                      <span>
                        {message.response.generation?.mode === "openai"
                          ? "OpenAI grounded"
                          : "Local fallback"}
                      </span>
                    </div>
                    {message.response.recommendations?.length ? (
                      <div className="recommendation-list">
                        {message.response.recommendations.slice(0, 4).map((recommendation, index) => (
                          <button
                            className={`recommendation-card${
                              selectedPoiId === recommendation.poi.id ? " is-active" : ""
                            }`}
                            type="button"
                            key={recommendation.poi.id}
                            onClick={() => {
                              setSelectedPoiId(recommendation.poi.id);
                              setMapPois(recommendationPois(message.response?.recommendations ?? []));
                            }}
                          >
                            <span className="recommendation-rank">{index + 1}</span>
                            <span className="recommendation-copy">
                              <strong>{recommendation.poi.name}</strong>
                              <small>{recommendation.reason}</small>
                              <em>
                                <Star size={12} fill="currentColor" />
                                {recommendation.poi.rating.toFixed(1)}
                                <b>
                                  {Math.round(
                                    recommendation.score <= 1
                                      ? recommendation.score * 100
                                      : recommendation.score
                                  )}{" "}
                                  điểm phù hợp
                                </b>
                              </em>
                            </span>
                            <ChevronRight size={16} />
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            </article>
          ))}

          {isThinking ? (
            <div className="thinking-row" role="status">
              <span /><span /><span />
              Đang đọc bối cảnh và xếp hạng…
            </div>
          ) : null}

          {messages.length === 1 ? (
            <div className="quick-prompts">
              <p>Thử một tình huống</p>
              {QUICK_PROMPTS.map((prompt) => (
                <button type="button" key={prompt} onClick={() => void submitMessage(prompt)}>
                  <Sparkles size={13} />
                  <span>{prompt}</span>
                  <ChevronRight size={14} />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="composer-wrap">
          <form className="composer" onSubmit={handleSubmit}>
            <textarea
              aria-label="Nhắn cho trợ lý bản đồ"
              placeholder="Bạn muốn đi đâu, với ai, khi nào?"
              value={input}
              rows={1}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void submitMessage(input);
                }
              }}
            />
            <button
              className={`voice-button${isListening ? " is-listening" : ""}`}
              type="button"
              onClick={toggleVoice}
              aria-label={isListening ? "Dừng nghe" : "Nhập bằng giọng nói"}
            >
              {isListening ? <CircleStop size={18} /> : <Mic size={18} />}
            </button>
            <button
              className="send-button"
              type="submit"
              disabled={!input.trim() || isThinking}
              aria-label="Gửi"
            >
              <Send size={17} />
            </button>
          </form>
          <p>Enter để gửi · Shift + Enter để xuống dòng</p>
        </div>
      </aside>

      <section className="map-panel">
        <MapView
          pois={mapPois}
          mode={mapMode}
          selectedPoiId={selectedPoiId}
          routeCoordinates={routeCoordinates}
          activeStopIndex={activeStopIndex}
          onSelectPoi={(poi) => setSelectedPoiId(poi.id)}
          onReadyChange={setMapReady}
        />

        <div className="map-topbar">
          <button
            type="button"
            className="privacy-button"
            onClick={() => setShowPrivacy((current) => !current)}
          >
            <ShieldCheck size={15} />
            Camera-free demo
          </button>

          <div className="mode-toggle" role="group" aria-label="Chế độ bản đồ">
            <button
              type="button"
              className={mapMode === "2d" ? "is-active" : ""}
              onClick={() => setMapMode("2d")}
            >
              <MapIcon size={15} />
              2D
            </button>
            <button
              type="button"
              className={mapMode === "3d" ? "is-active" : ""}
              onClick={() => setMapMode("3d")}
            >
              <Box size={15} />
              3D
            </button>
          </div>
        </div>

        {showPrivacy ? (
          <div className="privacy-popover">
            <div>
              <ShieldCheck size={20} />
              <strong>Privacy by demo design</strong>
              <button type="button" onClick={() => setShowPrivacy(false)} aria-label="Đóng">
                <X size={16} />
              </button>
            </div>
            <p>Phiên này chỉ dùng dữ liệu tổng hợp có sẵn trong repo.</p>
            <ul>
              <li>Không ảnh, khuôn mặt hay video</li>
              <li>Không tài khoản hoặc lịch sử VETC thật</li>
              <li>Ngữ cảnh chỉ sống trong bộ nhớ phiên demo</li>
              <li>OpenAI chỉ viết lại câu trả lời đã được xếp hạng; yêu cầu dùng store=false</li>
              <li>Tín hiệu điểm thưởng và tuyến đường đều được gắn nhãn mô phỏng</li>
            </ul>
          </div>
        ) : null}

        <div className="demo-signal">
          <span />
          SYNTHETIC DATA
        </div>

        <div className="sr-live" role="status" aria-live="polite">{liveStatus}</div>

        {latestResponse?.journey ? (
          <button className="journey-entry" type="button" onClick={() => setJourneyOpen(true)}>
            <WalletCards size={17} />
            <span><small>HÀNH TRÌNH TASCO · MÔ PHỎNG</small><strong>{latestResponse.journey.totalVnd.toLocaleString("vi-VN")} ₫</strong></span>
            <ChevronRight size={16} />
          </button>
        ) : null}

        {journeyOpen && latestResponse?.journey ? (
          <section className="journey-sheet" role="dialog" aria-modal="true" aria-labelledby="journey-title">
            <header>
              <div><small>MÔ PHỎNG · KHÔNG TRỪ TIỀN THẬT</small><h2 id="journey-title">{latestResponse.journey.title}</h2></div>
              <button ref={journeyCloseRef} type="button" onClick={() => setJourneyOpen(false)} aria-label="Đóng hành trình"><X size={18} /></button>
            </header>
            <p className={`journey-feedback outcome-${latestResponse.journey.revision.outcome}`}>
              <BadgePercent size={15} /> {latestResponse.journey.revision.message}
            </p>
            <ol className="journey-actions">
              {latestResponse.journey.actions.map((item) => {
                const poi = latestResponse.recommendations.find(({ poi }) => poi.id === item.poiId)?.poi;
                return <li key={item.id} className={latestResponse.journey?.revision.changedActionIds.includes(item.id) ? "is-changed" : ""}>
                  <div><span>{item.miniApp}</span><small>Mô phỏng</small></div>
                  <strong title={poi?.name}>{poi?.name ?? item.poiId}</strong>
                  <p>{item.reason}</p>
                  {item.sponsored ? <em>{item.sponsored.label} · {item.sponsored.disclosure}</em> : null}
                  <footer><span><s>{item.originalPriceVnd.toLocaleString("vi-VN")} ₫</s><b>{item.finalPriceVnd.toLocaleString("vi-VN")} ₫</b></span><small>+{item.rewardPoints} điểm mô phỏng</small></footer>
                </li>;
              })}
            </ol>
            <div className="journey-total">
              <span><small>Tiết kiệm mô phỏng {latestResponse.journey.savingsVnd.toLocaleString("vi-VN")} ₫</small><strong>Tổng</strong></span>
              <b>{latestResponse.journey.totalVnd.toLocaleString("vi-VN")} ₫</b>
            </div>
            {receipt ? (
              <article className="receipt-card">
                <ReceiptText size={22} /><div><small>BIÊN NHẬN VETC · MÔ PHỎNG</small><strong>{receipt.id}</strong><span>{receipt.journey.actions.length} dịch vụ · {receipt.journey.totalVnd.toLocaleString("vi-VN")} ₫</span></div><CheckCircle2 size={22} />
              </article>
            ) : (
              <button className="confirm-journey" type="button" onClick={confirmJourney} disabled={isConfirming}>
                <WalletCards size={18} /> {isConfirming ? "Đang xác nhận…" : "Xác nhận bằng ví VETC · Mô phỏng"}
              </button>
            )}
          </section>
        ) : null}

        {latestRecommendations.length ? (
          <div className={`route-theater${isTheaterPlaying ? " is-playing" : ""}`}>
            <div className="route-theater-icon">
              {isTheaterPlaying ? <Volume2 size={18} /> : <Navigation size={18} />}
            </div>
            <div>
              <small>WOW MODE</small>
              <strong>
                {isTheaterPlaying
                  ? `Điểm ${Math.max(1, activeStopIndex + 1)} / ${theaterPois.length}`
                  : "3D AI Route Theater"}
              </strong>
              <span>
                {isTheaterPlaying
                  ? theaterPois[Math.max(0, activeStopIndex)]?.name
                  : "Xem AI biến lý do thành hành động bản đồ"}
              </span>
            </div>
            <button type="button" onClick={playRouteTheater} disabled={isTheaterPlaying}>
              <Play size={15} fill="currentColor" />
              {isTheaterPlaying ? "Đang chạy" : "Trình diễn"}
            </button>
          </div>
        ) : null}

        {selectedPoi ? (
          <article className="poi-detail-card">
            <div className="poi-card-topline">
              <span>{selectedPoi.category}</span>
              <em>
                <Star size={13} fill="currentColor" />
                {selectedPoi.rating.toFixed(1)}
              </em>
            </div>
            <h2>{selectedPoi.name}</h2>
            <p>{selectedPoi.description}</p>
            <div className="poi-tags">
              {selectedPoi.attributes.slice(0, 3).map((attribute) => (
                <span key={attribute}>{attribute}</span>
              ))}
            </div>
            <footer>
              <LocateFixed size={15} />
              <span>{selectedPoi.address}</span>
              <button
                type="button"
                onClick={() => setToast("Điều hướng đang dùng tuyến mô phỏng cho demo.")}
              >
                Đi
                <ChevronRight size={14} />
              </button>
            </footer>
          </article>
        ) : null}

        {toast ? <div className="toast" role="status">{toast}</div> : null}
      </section>
    </main>
  );
}
