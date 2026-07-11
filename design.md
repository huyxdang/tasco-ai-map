# TASCO Atlas design contract

**Status:** locked for hackathon implementation
**Last updated:** 2026-07-11
**Applies to:** every user-facing TASCO Atlas screen, component, transition, spoken response, map state, checkout state, receipt, and demo path

Decision record: [`docs/decisions/2026-07-11-live-planning-design-contract.md`](docs/decisions/2026-07-11-live-planning-design-contract.md)

This file is the design source of truth for the implementation. Future agents must preserve it unless Edward explicitly approves a design change. Do not redesign the product while implementing it. Do not substitute a generic AI chat interface, the repository's older dark desktop UI, or a new visual system.

The approved Claude Design export is the visual reference:

```text
/Users/edwardtran/Downloads/TASCO Atlas conversational map experience (2)/TASCO Atlas Prototype.dc.html
```

That external file may not exist on another machine, so this contract records the required behavior and design decisions. The implementation must live in the existing Next.js application and translate the approved HTML into React components. Do not ship the exported HTML as an iframe.

## Product in one sentence

TASCO Atlas is a VETC-native Vietnamese conversational map where a group can talk naturally, see Atlas extract constraints, and watch one recommended journey change in place when they interrupt or correct it.

The unforgettable moment is:

> A user interrupts Atlas with “gần hơn và rẻ hơn một chút,” and the recommendation, route, cost, and savings visibly update without leaving the screen.

Everything else supports that moment.

## Authority and conflict resolution

When sources disagree, use this order:

1. This `design.md` for user experience, visual design, interaction behavior, and design scope.
2. `docs/decisions/2026-07-11-journey-checkout-p1.md` for Journey Checkout rules.
3. `docs/architecture.md` and TypeScript tests for deterministic data, pricing, ranking, routing, and revision behavior.
4. The approved Claude HTML for visual measurements or transitions not specified here.
5. Existing source code only where it does not conflict with the sources above.

The current dark desktop interface is implementation history, not the visual target. Preserve its working deterministic logic, MapLibre integration, API routes, and tests while replacing its presentation with this mobile-first design.

## Non-negotiable product rules

- Build one mobile-first responsive Next.js web application. Do not create a React Native application.
- Treat TASCO Atlas as a mini-app inside VETC, entered primarily through the `Đi đâu?` shortcut on the VETC home screen.
- Keep the optional secondary entry under `Tất cả` → `Đi lại` → `TASCO Atlas`.
- Use Vietnamese for all customer-facing copy in the main demo.
- Use one continuous Live Planning screen for the conversation. Do not navigate to a new page after every turn.
- Show one strong journey, not several route alternatives.
- Let users interrupt Atlas while it speaks.
- Keep the map, transcript, extracted constraints, and recommendation synchronized.
- Keep POIs, route facts, prices, offers, availability, totals, and revisions deterministic.
- Clearly label synthetic data, simulated routes, simulated offers, and simulated payments.
- Only parking is prepaid in the default demo. Fuel and dining are paid at the location.
- Keep the final 3D Route Theater as a confirmation payoff, not the main planning surface.
- Require explicit user action to start a microphone session. Ending the session must stop audio capture immediately.
- Do not imply speaker identification, background surveillance, real payment, live inventory, or production navigation.

## Forbidden design drift

Do not introduce any of the following without explicit approval:

- A ground-up redesign of the approved prototype
- A dark, neon, purple-gradient, glassmorphism, or sci-fi AI interface
- The repository's older two-column desktop chat layout as the primary mobile experience
- Camera, AR, face, photo, or video capture
- A generic grid or marketplace of TASCO mini-apps inside Atlas
- A forced onboarding quiz or long preference form
- Large filter sheets or multi-select questionnaires before the conversation
- Multiple competing journey cards or multiple route alternatives
- Hidden sponsored ranking or pay-to-rank recommendations
- A cart that charges the estimated fuel, meal, and parking total together
- Real-payment language or claims that a real booking was created
- Automatic background listening or a wake-word claim
- Claims that Atlas identifies individual speakers in a group
- A separate Three.js world or new 3D asset pipeline
- Invented place photos, prices, discounts, reviews, availability, or building geometry
- Visible model/provider branding such as `GPT`, `OpenAI`, or a model slug in the customer UI
- Silent route, reservation, payment, or receipt changes during driving mode

## Visual foundation

### Design character

The product should feel like an existing VETC service: useful, calm, practical, and trustworthy. AI behavior should be visible through state changes, not through futuristic decoration.

Use:

- Light blue-gray page and map surfaces
- White cards and bottom sheets
- Dark navy text
- Restrained VETC green for primary actions and active states
- Red only for `Mới`, destructive actions, urgent warnings, or recording-related danger
- Large Vietnamese labels
- Clean outlined icons
- Rounded, friendly mobile surfaces
- Generous spacing and touch targets

### Color tokens

Use these tokens as the starting point. Small contrast adjustments are allowed only when required for accessibility.

```css
:root {
  --atlas-canvas: #e4eaef;
  --atlas-app-bg: #f1f5f8;
  --atlas-surface: #ffffff;
  --atlas-surface-soft: #f1f6f3;
  --atlas-surface-green: #e9f5ee;
  --atlas-text: #16232c;
  --atlas-text-strong: #0b1f2a;
  --atlas-text-secondary: #5b6b76;
  --atlas-text-muted: #7a8791;
  --atlas-text-faint: #98a4ad;
  --atlas-green: #12934f;
  --atlas-green-dark: #0f7a45;
  --atlas-green-border: #bfe3cc;
  --atlas-border: #dce4ea;
  --atlas-border-soft: #e5ebef;
  --atlas-red: #e23744;
  --atlas-blue: #2e6fe8;
  --atlas-amber: #b45309;
  --atlas-warning-bg: #fdf6e8;
  --atlas-map-ground: #ecefe8;
  --atlas-map-road: #ffffff;
  --atlas-map-arterial: #fbf0ce;
  --atlas-map-arterial-edge: #e8dcae;
  --atlas-map-river: #c7dfee;
  --atlas-map-park: #d7ead1;
  --atlas-tower-light: #f0f4f7;
  --atlas-tower-mid: #c7d3dc;
  --atlas-tower-dark: #b6c4ce;
  --atlas-tower-highlight-light: #dcefe4;
  --atlas-tower-highlight-mid: #a9cdba;
  --atlas-tower-highlight-dark: #96bfa9;
}
```

Do not reuse the old dark tokens such as near-black panels or lime accents for the redesigned customer experience.

### Typography

- Required typeface: `Be Vietnam Pro`, weights 400, 500, 600, 700, and 800.
- Use Geist and then the system sans-serif stack only as loading fallbacks. Do not intentionally substitute Inter, Roboto, or another product font.
- Default body text: 13–14 px on the 402 px reference viewport, with 1.45–1.6 line height.
- Primary screen titles: 20–22 px, 700–800 weight.
- Card titles: 14–16 px, 700 weight.
- Supporting labels: 10–12 px, 500–700 weight.
- Prices and timers use tabular numerals.
- Never use tiny technical metadata in the customer experience merely because it appears in the engineering demo rail.

### Shape, spacing, and elevation

- Reference mobile viewport: 402 × 874 px.
- White content cards: 16–20 px radius.
- Bottom sheets: 22–26 px top radius.
- Compact controls and chips: 10–14 px radius or full pill.
- Primary buttons: 16 px radius and approximately 54 px high.
- Minimum touch target: 44 × 44 px.
- Standard horizontal mobile padding: 14–16 px.
- Card gaps: 8–12 px.
- Standard card shadow: `0 1px 4px rgba(15,35,50,.05)`.
- Floating-control shadow: `0 2px 8px rgba(15,35,50,.14)` through `0 2px 12px rgba(15,35,50,.12)`.
- Bottom-sheet shadow: `0 -8px 30px rgba(15,35,50,.10)` through `rgba(15,35,50,.14)`.
- Green primary-action shadow: `0 4px 14px rgba(18,147,79,.3)`.
- Bottom sheets use a centered 38 × 4 px `#e1e8ed` grab handle where the sheet is draggable.
- Avoid heavy floating glass effects and excessive blur.

### Icons and imagery

- Use `lucide-react` or the closest existing outlined icon for implementation.
- Icons use dark navy strokes with green accents where appropriate.
- Do not use emoji as product icons.
- Do not create fake restaurant photography. Use a neutral media treatment or omit the image when the dataset has no licensed asset.
- The map and generated 3D geometry are the visual imagery of the prototype.

## Responsive layout

### Mobile, up to 720 px

Mobile is the primary and judged experience.

- Fill the viewport with the phone experience. Do not show the engineering rail or annotations.
- Respect safe-area insets.
- Use the map as the persistent background/canvas.
- Present planning content as a white bottom sheet that can grow with the conversation.
- Keep the primary voice state and the most recent conversation visible without forcing horizontal scrolling.
- Keep fixed actions above the browser safe area.
- Do not reproduce the old `53dvh` dark chat panel.

### Tablet and desktop

- Center a mobile-width Atlas experience or use a wider map with the same phone interaction hierarchy.
- A demo rail may exist only behind an explicit development/demo flag.
- Engineering annotations never ship to the customer-facing route.
- Do not turn the experience back into a desktop chat sidebar with a separate map application.

## Information hierarchy

Every planning state follows this priority:

1. What Atlas currently understands
2. Whether Atlas is listening, thinking, speaking, muted, or interrupted
3. The map and current ordered route
4. The single recommended place or journey
5. What changed after the latest correction
6. One primary confirmation action
7. Receipt
8. 3D celebration

If a new element competes with a higher item, remove or demote it.

## Locked seven-step demo flow

The prototype has seven numbered steps for the judge/demo operator. The rail is not part of the customer product.

### Step 1: VETC home entry

**Health:** locked.

Show a VETC-like home screen with a white rounded service card over a light background. Add one main shortcut:

```text
Đi đâu?
TASCO AI
```

The shortcut uses a location-pin/AI accent icon and may carry a red `Mới` badge. It belongs in the main service grid rather than being hidden only under `Tất cả`.

Preserve the surrounding VETC visual language so the integration feels native. Do not redesign unrelated VETC wallet, vehicle, notification, or content modules.

### Step 2: Start Atlas session

**Health:** locked.

Open TASCO Atlas on the map with a white bottom sheet. Before audio capture, show:

```text
Bắt đầu phiên trò chuyện
Hãy cùng nhau nói về chuyến đi. Bạn có thể ngắt lời Atlas bất cứ lúc nào.
```

Required controls:

- One large green microphone/orb button
- Back button
- Text fallback: `Không dùng giọng nói? Nhập bằng chữ`
- Concise privacy copy explaining that the microphone is used only during the active session

The microphone must not activate until the user presses the start control. A browser permission rejection must keep the text fallback usable.

### Step 3: Continuous Live Planning

**Health:** locked and highest implementation priority.

Remain on the same map and bottom sheet. Do not transition into a traditional message list page.

The live screen contains:

- Header: `TASCO Atlas`
- Small `Phiên trực tiếp` state badge
- Current voice state with text and icon
- Large orb/microphone state control
- Mute control
- `Kết thúc` control
- Live partial transcript
- Neutral group label: `Cuộc trò chuyện`
- Extracted constraint chips
- One evolving recommendation card
- One evolving route on the map
- One journey confirmation action after enough constraints exist

Use this scripted input for the main demo:

```text
Tối nay bốn người muốn ăn món Việt gần trung tâm, dễ đỗ xe.
```

As the request is understood, add these chips in place:

```text
4 người
Món Việt
Gần trung tâm
Dễ đỗ xe
```

Then accept:

```text
Nhưng đừng mắc quá. Khoảng một triệu thôi.
```

Add:

```text
Ngân sách khoảng 1.000.000 ₫
```

When speech confidence is low, ask one short confirmation instead of guessing:

```text
Tôi nghe là ngân sách khoảng một triệu đồng, đúng không?
```

Atlas responses should be short enough to interrupt. Do not render paragraphs of assistant prose.

### Step 4: Interruption and in-place revision

**Health:** locked; this is the wow moment.

While Atlas is speaking, the user says:

```text
Không, chỗ đó xa quá. Gần hơn và rẻ hơn một chút.
```

Required behavior:

1. Stop Atlas audio immediately.
2. Preserve the already-heard portion of its response.
3. Mark it with `Đã dừng nói khi bạn ngắt lời`.
4. Show `Đã nghe yêu cầu mới`.
5. Send the structured revision to the deterministic journey engine.
6. Fade the old recommendation without reloading the screen.
7. Replace it with the valid new recommendation.
8. Redraw the route in place.
9. Animate the updated cost and savings.
10. Mark the changed stop with text and icon: `Đã thay đổi`.

The new result must be strictly cheaper when the command contains `rẻ hơn`. If no valid cheaper result exists, keep the current journey and say so. Never fake a reduction in the UI.

Suggested short reply:

```text
Tôi đã đổi sang một nơi gần hơn, rẻ hơn 120.000 ₫ và vẫn có chỗ đỗ xe thuận tiện.
```

The exact amount and place must come from deterministic output, not from this example copy.

### Step 5: Confirm journey and prepaid parking

**Health:** locked.

The user says:

```text
Chốt đi.
```

Show one ordered journey. Default stops:

1. Fuel
2. Dinner
3. Parking

Each stop must explain its commercial treatment:

- Fuel: Loyalty benefit, paid at station
- Dinner: estimated cost for four people and partner offer, paid at restaurant
- Parking: reservation duration and exact simulated prepayment

Default demo values may use:

```text
Nhận 2x điểm Loyalty
Ước tính cho 4 người: 880.000 ₫
Ưu đãi đối tác 15%
Đặt trước 2 giờ · 60.000 ₫
```

Values displayed by the app must still come from the deterministic engine.

Separate these concepts visually:

- `Chi phí ước tính`
- `Thanh toán tại địa điểm`
- `Thanh toán ngay`

Only the parking amount enters confirmation. Required confirmation copy:

```text
Xác nhận đặt chỗ đỗ xe trong 2 giờ với giá 60.000 ₫?
```

Primary action:

```text
Xác nhận 60.000 ₫
```

Secondary action:

```text
Chưa, để tôi chỉnh lại
```

Disable the primary action while processing. Repeated activation must not create multiple receipts.

### Step 6: Receipt and 3D Route Theater

**Health:** locked.

After confirmation, show one receipt with:

- `Biên nhận VETC — Mô phỏng`
- Journey/receipt ID
- Confirmation time
- Exactly what was prepaid
- Estimated pay-at-location items shown separately
- Loyalty outcome
- Persistent simulation disclosure
- Primary action: `Bắt đầu dẫn đường`

Keep the receipt available while the same MapLibre canvas moves into the 3D Route Theater.

The 3D view uses generated extrusions and route order. It does not depict real buildings. Show:

```text
Tuyến và công trình 3D là hình ảnh mô phỏng.
```

If reduced motion is enabled, do not autoplay. Show:

```text
Xem tuyến 3D
```

If WebGL/3D is unavailable, preserve the receipt and journey. Never block confirmation on the visual payoff.

### Step 7: Driving mode

**Health:** visually approved, behavior corrected by audit.

Driving mode is a short safety epilogue, not the main demo and not a second planning interface.

Required visual hierarchy:

1. Current maneuver and distance
2. ETA
3. Next confirmed stop
4. Map and route
5. One large microphone control
6. Pause and end controls

Do not show suggestion chips such as `Rẻ hơn một chút` or `Đặt thêm bàn ở chỗ khác`. They encourage reading and tapping while moving.

Allowed command contract:

| Command type | Example | Required behavior |
| --- | --- | --- |
| Read-only | `Đọc điểm dừng tiếp theo` | Speak the confirmed next stop without changing state. |
| Read-only | `Mấy giờ đến?` | Speak the current deterministic ETA. |
| Read-only | `Lặp lại chỉ dẫn` | Repeat the current maneuver. |
| Low-risk proposal | `Tìm cây xăng gần nhất` | Find one valid option, speak distance/detour, and ask a short yes/no before changing the route. |
| Planning change | `Rẻ hơn một chút` | Defer until parked. Do not change a paid reservation, receipt, or route. |
| Transaction | `Đặt thêm bàn ở chỗ khác` | Defer until parked. Do not browse or book while driving. |

Use this deferral copy:

```text
Tôi có thể giúp bạn lập kế hoạch chi tiết khi xe đã dừng. Hiện tại tôi sẽ giữ tuyến đường an toàn.
```

Never silently add a fuel stop. Never silently change parking from B2 to B3 after B2 has been paid. Any accepted route change requires spoken confirmation and a deterministic state update. A transaction-affecting change remains blocked until parked.

## Canonical hackathon demo data

Use these values for the scripted judge path so the UI, spoken reply, route, checkout, receipt, and 3D sequence remain consistent. They are demo fixtures, not real operational claims.

### Synthetic profile

```text
Gia đình • Ưu tiên tiết kiệm • Dễ đỗ xe
Biển số mô phỏng: 50A-123.45
Vị trí mô phỏng: Q.1, TP.HCM
```

### Initial rejected recommendation

```text
Nhà hàng Sông Quê, Thảo Điền
Ước tính cho 4 người: 1.000.000 ₫
Khoảng cách: 4,5 km
Reason for revision: xa trung tâm và vượt ưu tiên mới của nhóm
```

### Confirmed revised journey

1. **Petrolimex Võ Văn Kiệt**
   - Fuel stop
   - Approximately 1,2 km and on route
   - `Nhận 2x điểm Loyalty`
   - `Thanh toán tại trạm`
2. **Quán Bụi, Lý Tự Trọng**
   - Vietnamese dinner for four
   - Estimated cost: `880.000 ₫`
   - Simulated partner offer: `15%`
   - `Thanh toán tại quán`
3. **Vincom Đồng Khởi, hầm B2**
   - Approximately 350 m walk
   - Reserved for two hours
   - Simulated prepaid amount: `60.000 ₫`
   - The only prepaid item

### Revision result

```text
1.000.000 ₫ → 880.000 ₫
Tiết kiệm 120.000 ₫
4,5 km → 800 m
```

Never mix these values with the frozen v1 prototype's legacy `743.000 ₫ → 732.000 ₫` example. The active Live Planning demo uses the canonical values above.

Required disclosure near partner offers:

```text
Ưu đãi mô phỏng — không ảnh hưởng thứ tự đề xuất.
```

Required disclosure near totals:

```text
Giá mô phỏng từ dữ liệu demo — không phải báo giá hoặc giữ chỗ thực tế.
```

## Voice-state system

The voice UI must always communicate state through text plus icon/animation. Color alone is insufficient.

| State | Required label | Visual treatment |
| --- | --- | --- |
| Idle | `Bắt đầu phiên trò chuyện` | Large green mic, no audio capture |
| Listening | `Atlas đang nghe` | Green orb with restrained pulse |
| User speaking | `Đang nghe bạn nói…` | Blue active state and partial transcript |
| Thinking | `Atlas đang tìm…` | Neutral gray state and three progress dots |
| Speaking | `Atlas đang nói` | Green waveform; invite interruption |
| Clarifying | `Atlas hỏi lại để chắc chắn` | Green waveform and one short question |
| Interrupted | `Đã nghe yêu cầu mới` | Amber state while journey recomputes |
| Muted | `Đã tắt mic` | Neutral gray; no audio sent |
| Ended | `Phiên đã kết thúc` | Remove live indicators and stop media tracks |
| Error | `Không thể kết nối giọng nói` | Preserve text input and current journey |

`gpt-realtime-2.1` manages streaming voice, turn detection, barge-in, short spoken replies, and structured function requests. The customer UI must not expose the model name.

## Structured constraint model

The interface may display only constraints that the system has extracted or the user has confirmed. The minimum shared shape is:

```ts
type PlanningConstraints = {
  groupSize?: number;
  cuisine?: string;
  budgetVnd?: number;
  area?: string;
  parkingRequired?: boolean;
  familySuitable?: boolean;
  dietaryRequirements?: string[];
  change?: "cheaper" | "closer" | "quieter" | "faster";
};
```

Constraint chips are removable during parked planning. Removing a chip recomputes the journey; it must not merely hide the chip.

## Deterministic boundary

The voice model may:

- Hold a natural Vietnamese conversation
- Stream speech and transcripts
- Detect interruption
- Extract structured constraints
- Ask one necessary clarification
- Explain deterministic results briefly
- Request an allowlisted tool call

The voice model may not invent or mutate:

- Place IDs or coordinates
- Ranking order
- Route geometry or ETA
- Prices or totals
- Discounts or Loyalty rewards
- Availability
- Reservation/payment status
- Receipt contents
- Whether a cheaper revision succeeded

Use narrow tool boundaries such as:

```text
compose_journey(constraints)
revise_journey(direction)
propose_route_change(kind)
confirm_route_change(proposalId)
confirm_action(actionId)
read_navigation_state()
```

Tool outputs are the source of truth. Spoken prose must reflect them exactly.

## Motion and state transitions

Motion explains state change; it is not decoration.

- Constraint chip entrance: no more than 300 ms.
- Partial transcript: stream progressively; do not wait for the full utterance.
- Recommendation replacement: old card fades/desaturates, then new card replaces it in the same slot.
- Route change: redraw the existing line; do not reload the map.
- Cost/savings: count to the deterministic value over roughly 600–700 ms using tabular numerals.
- Interruption: stop audio immediately and switch to the amber interrupted state.
- Bottom sheet entrance: short upward transition around 300–350 ms.
- Respect `prefers-reduced-motion`: remove pulses, count animations, automatic camera flights, and nonessential transitions.

Do not promise exact network or model latency in customer copy. The UI must remain understandable when a response takes longer than the ideal demo timing.

## Content rules

- Speak and write concise natural Vietnamese.
- Use one question at a time.
- Do not present a wall of text while the user is driving.
- Do not overuse technical terms such as AI, NLU, VAD, tool call, deterministic, API, or model.
- Use `Mô phỏng` wherever money, booking, offers, routes, receipts, or customer context could be mistaken for real data.
- Use `Ước tính` for non-payable planning costs.
- Use `Thanh toán tại địa điểm` for fuel and dining.
- Use `Thanh toán ngay` only for the simulated parking amount.
- Sponsored content, if ever shown, must be separate and explicitly labeled. It must not affect organic ordering.

## Accessibility requirements

- Minimum touch target: 44 × 44 px.
- Maintain visible keyboard focus styles.
- All icon-only buttons require Vietnamese accessible labels.
- Announce voice-state, journey revision, confirmation, and error changes through an `aria-live` region without reading the entire screen again.
- Do not rely on color alone for live, changed, paid, error, or muted states.
- Keep text contrast at WCAG AA where possible.
- Support browser zoom and text resizing without clipping primary actions.
- Dialogs and bottom sheets must trap focus when modal, restore focus on close, and close with Escape.
- Microphone permission rejection must expose the text fallback immediately.
- Reduced motion must preserve the complete journey and receipt.

## Component boundaries for implementation

Use components that mirror the product states rather than one giant demo component. Suggested boundaries:

```text
VetcHomeEntry
AtlasShell
AtlasMap
LiveSessionStart
LivePlanningSheet
VoiceStatusOrb
LiveTranscript
ConstraintChips
RecommendationCard
JourneySummary
ParkingConfirmation
SimulatedReceipt
RouteTheater
DrivingMode
SimulationDisclosure
```

Do not duplicate journey math or fabricate UI-only data inside these components. Components receive typed state from the deterministic engine and Realtime session controller.

## Implementation sequence

Future agents should implement in this order:

1. Add the light VETC visual tokens and mobile shell.
2. Port steps 1 and 2 from the approved HTML.
3. Build the continuous step 3 live-planning state machine with deterministic mock events first.
4. Build the step 4 interruption/revision transition against the existing journey engine.
5. Port step 5 checkout and connect only parking to confirmation.
6. Port step 6 receipt and reuse the same MapLibre canvas for Route Theater.
7. Connect `gpt-realtime-2.1` over WebRTC through a server-created session.
8. Add the corrected, minimal step 7 driving mode.
9. Run mobile visual QA, keyboard/accessibility checks, and deterministic journey tests.

Do not block the visual/state implementation on Realtime connectivity. The demo must have a deterministic scripted fallback that produces the same approved state transitions if voice or network access fails.

## Definition of design-complete

An implementation is not ready merely because every screen exists. It must pass all of these checks.

### Visual consistency

- [ ] Customer-facing screens use the light VETC palette and white rounded surfaces.
- [ ] Mobile 402 × 874 is polished with no clipped controls or horizontal overflow.
- [ ] Typography, radii, spacing, icons, and shadows remain consistent across all seven steps.
- [ ] No old dark desktop styling leaks into the primary experience.
- [ ] Engineering rail and annotations are absent from the customer route.

### Core interaction

- [ ] Microphone capture starts only after explicit activation.
- [ ] Text input remains available when voice is unavailable.
- [ ] Partial transcript and voice state update during the live session.
- [ ] Constraint chips represent real structured state.
- [ ] The map, recommendation, and route update together.
- [ ] The user can interrupt Atlas while it speaks.
- [ ] `Gần hơn và rẻ hơn một chút` changes the result in place.
- [ ] A cheaper revision strictly lowers the deterministic total or honestly reports no valid option.

### Commerce truthfulness

- [ ] Fuel and dinner remain pay-at-location items.
- [ ] Only parking enters the simulated payment confirmation.
- [ ] Confirmation is explicit and idempotent.
- [ ] Receipt contents exactly match confirmed deterministic state.
- [ ] Every commercial surface is labeled simulated or estimated correctly.

### Driving safety

- [ ] Driving mode shows no suggestion-chip menu.
- [ ] Read-only commands do not mutate the journey.
- [ ] A proposed gas stop requires yes/no confirmation before route mutation.
- [ ] Cheaper requests, reservations, and purchases defer until parked.
- [ ] No paid reservation or receipt changes silently.

### Resilience and accessibility

- [ ] Voice failure preserves text planning.
- [ ] Map/3D failure preserves checkout and receipt.
- [ ] Reduced motion prevents automatic 3D playback.
- [ ] State changes are announced through text and assistive technology.
- [ ] Primary controls meet the minimum touch target.

## Change control

Before changing this contract or implementing a conflicting pattern, an agent must:

1. Name the exact section being changed.
2. Explain which user problem the change solves.
3. Show why the existing approved design cannot solve it.
4. Describe the impact on the demo, deterministic engine, checkout, accessibility, and driving safety.
5. Obtain Edward's explicit approval.

“This looks cleaner,” “this is more modern,” or “the component library made it easier” are not sufficient reasons to drift.
