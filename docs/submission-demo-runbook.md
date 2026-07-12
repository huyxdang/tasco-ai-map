# Submission demo recording runbook

Use this one recording path for the hackathon. The presenter speaks all four
user turns through the real microphone; the internal speech stack transcribes
them and speaks Atlas's fixed replies. The flow does not require BigSet, a
live language model, browser automation, or an external booking website.
Typed input is only the failure fallback.

## Locked product story

1. User asks: **“Tìm chỗ ăn tối cho 3 người ở Quận 1, sau đó đến một
   quán cà phê yên tĩnh để làm việc.”**
2. Atlas asks one short question: **“Mọi người muốn ăn món gì?”**
3. User says **“Món Ý.”** through the microphone.
4. Atlas proposes exactly two destinations—**Pizza 4P's Hai Bà Trưng → Trung
   Nguyên Legend Café Lý Tự Trọng**—then asks what time to book Pizza 4P's.
5. User says **“Khoảng 7 giờ tối.”**
6. Atlas states the exact slot—**19:00 ngày 12 tháng 7**—and says Trung Nguyên
   is expected to be quiet enough that it does not need a reservation.
7. User says **“Chốt đi.”** through the microphone. Other positive phrases such
   as “được”, “ổn”, “ok”, or “yes” also work; negatives do not advance.
8. Atlas says it is starting the booking work, shows a four-second loading
   state, then confirms the table and reveals the fixed journey.
9. Parking is attached to Pizza 4P's, not a third route destination. The VETC
   offer reduces 60.000 ₫ to 45.000 ₫.
10. The operator confirms the parking payment through **Ví VETC** and ends on
   the receipt.
11. The car visualization is optional B-roll after the receipt. Do not delay the
   core take for it.

## Before recording

1. Use a 375 x 812 mobile viewport and reload once.
2. Verify the VETC home screen shows **Đi đâu?**.
3. Tap **Đi đâu?** and verify **Bắt đầu bằng giọng nói** is visible.
4. Keep browser audio enabled. If spoken playback is unavailable, blocked, or
   slow, continue with on-screen narration instead of debugging it.
5. Allow microphone access, then start a fresh screen recording before the
   first spoken line.

## 70-second rehearsal

| Time | Operator action | Expected visible beat |
| --- | --- | --- |
| 0:00–0:04 | Show VETC home, then tap **Đi đâu?**. | Atlas opens inside the VETC shell. |
| 0:04–0:08 | Tap **Bắt đầu bằng giọng nói** once. | The mic enters a live listening state; no user request is pre-rendered. |
| 0:08–0:17 | Say: **“Tụi mình có ba người muốn ăn tối ở Quận 1, ăn xong đi cà phê yên tĩnh để làm việc.”** | The actual committed transcript appears with the label **Bạn · phiên âm trực tiếp**. |
| 0:17–0:23 | Let Atlas ask what cuisine the group wants. | Atlas speaks the same clarification shown on screen. |
| 0:23–0:26 | Say: **“Món Ý.”** | Atlas proposes Pizza 4P's, then Trung Nguyên, and asks what time to book. |
| 0:26–0:29 | Say: **“Khoảng 7 giờ tối.”** | Atlas states **12 tháng 7 lúc 19:00**, says Trung Nguyên needs no reservation, and asks for confirmation. |
| 0:29–0:33 | Say: **“Ừ, chốt đi.”** | The fourth real transcript starts the booking sequence. |
| 0:33–0:43 | Let Atlas speak and wait. | The booking line appears, followed by a visible four-second loading state. |
| 0:43–0:50 | Let the confirmed result appear. | Pizza 4P's is first; Trung Nguyên is second; the table is held for three people at 19:00 on July 12. |
| 0:50–0:56 | Tap **Chốt hành trình**. | Checkout shows three service rows but only two route destinations: Pizza table, Pizza parking, Trung Nguyên. |
| 0:56–1:03 | Pause over the parking offer, then confirm. | **60.000 ₫ → giảm 15.000 ₫ → 45.000 ₫**, paid through **Ví VETC**. |
| 1:03–1:10 | Hold on the receipt. | Parking is paid 45.000 ₫; dining and café remain pay-at-venue. |

Optional B-roll: after the receipt, open **Bắt đầu dẫn đường** and hold on the
seam-repaired driving video for 5–8 seconds. It autoplays silently, loops in
place, and uses the static car scene as its loading/error poster.

## Presenter line

> Atlas asks one useful follow-up, confirms Pizza 4P's then Trung Nguyên with
> the user, and coordinates the table, parking, route, and VETC payment in one
> continuous flow.

## Failure policy

- Wrong or missing destination: abort the take. The fixture fails loudly if
  `POI004` or `POI017` is absent.
- Speech recognition mishears or omits a required fact: repeat the opening line. Rejected
  speech does not change the map or advance the locked voice stage.
- Microphone permission or STT fails: use **Dùng nhập chữ dự phòng** and enter
  the same four lines; do not switch to the unrestricted chat path.
- GPS denied or slow: the optional driving screen uses the disclosed Quận 1
  fallback. The core planning-to-receipt path does not wait for GPS.
- Spoken playback fails: use visible copy and continue. Audio is an enhancement.
- Map tiles/WebGL fail: continue through checkout and receipt; car B-roll is
  optional.
- Any browser/external booking page opens: abort. The locked fixture contains no
  URL and must never leave the app.

## Mechanical check

```bash
pnpm exec vitest run tests/submission-demo.test.ts --reporter=verbose
```

The test locks the four-stage voice classifier, rejected alternate
destinations, clarification, Italian choice, 19:00 time, positive confirmation, exact
destination order, deduplicated two-leg route, table hold, attached parking
service, discount, wallet label, and totals.
