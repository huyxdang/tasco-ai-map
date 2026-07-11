import { NextResponse } from "next/server";

export const runtime = "nodejs";

const SESSION_CONFIG = {
  type: "realtime",
  model: "gpt-realtime-2.1",
  instructions: [
    "Bạn là TASCO Atlas, trợ lý lập kế hoạch hành trình bằng tiếng Việt.",
    "Trả lời ngắn để người dùng có thể ngắt lời.",
    "Không tự tạo địa điểm, giá, tuyến, ưu đãi, đặt chỗ hay thanh toán.",
    "Giao diện và API /api/chat quyết định mọi dữ liệu và hành động có cấu trúc.",
    "Không tuyên bố đây là dịch vụ thật; mọi dữ liệu thương mại và tuyến đều là mô phỏng."
  ].join(" "),
  audio: {
    input: { transcription: { model: "gpt-4o-mini-transcribe", language: "vi" }, turn_detection: { type: "semantic_vad", eagerness: "high", create_response: false, interrupt_response: false } },
    output: { voice: "marin" }
  }
};

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Realtime is not configured." }, { status: 503 });
  const sdp = await request.text();
  if (!sdp.trim()) return NextResponse.json({ error: "Missing SDP offer." }, { status: 400 });
  const form = new FormData();
  form.set("sdp", sdp);
  form.set("session", JSON.stringify(SESSION_CONFIG));
  const sessionId = request.headers.get("x-tasco-session") ?? "anonymous-demo";
  const upstream = await fetch("https://api.openai.com/v1/realtime/calls", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "OpenAI-Safety-Identifier": sessionId.slice(0, 128) },
    body: form,
    cache: "no-store"
  });
  const body = await upstream.text();
  return new Response(body, { status: upstream.status, headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/sdp", "Cache-Control": "no-store" } });
}
