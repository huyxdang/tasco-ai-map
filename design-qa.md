# TASCO Atlas first mobile redesign — design QA

- Source visual truth: `/Users/edwardtran/Downloads/TASCO Atlas conversational map experience (2)/TASCO Atlas Prototype.dc.html`
- Source captures: `/tmp/reference-home-frame.png`, `/tmp/reference-start-frame.png`
- Implementation captures: `/tmp/tasco-home-final.png`, `/tmp/tasco-start-final.png`, `/tmp/tasco-fixed-step4.png`, `/tmp/tasco-step5-production-three-stops.png`, `/tmp/tasco-step6-production-fallback.png`
- Viewport: 402 × 874 px
- States: VETC home, explicit session start, live planning with budget, interruption/revision, Journey Checkout, parking confirmation, receipt, and 3D Route Theater payoff

**Full-view comparison evidence**

The rendered source and implementation were captured at the same 402 × 874 phone size. The final implementation preserves the source composition: mint VETC header, floating white two-row service card, `Đi đâu? / TASCO AI` entry with `Mới`, supporting account/vehicle modules, persistent map, white rounded bottom sheets, centered green voice orb, live-state header, and restrained green interaction states.

**Focused-region comparison evidence**

- VETC service card: four equal columns, two rows, outlined green icons, red `Mới` badges, and the Atlas entry in the primary grid.
- Session sheet: 22–25 px top radius, grab handle, explicit green microphone control, title/consent copy, text fallback, and privacy disclosure.
- Live revision: transcript remains in place; interruption status, constraints, replacement recommendation, distance, estimated cost, savings, and `Đã thay đổi` are visible together without horizontal overflow.
- Checkout and receipt: the ordered deterministic journey separates full estimated cost from the parking-only prepaid amount; one simulated receipt remains visible while the same map switches to 3D.

**Findings and comparison history**

1. Earlier P1 — the first implementation used a generic green wallet home instead of the approved VETC frame.
   - Fix: replaced it with the mint header and two-row VETC service card, retained the exact Atlas entry hierarchy, and restored the reference document/vehicle/content modules.
   - Post-fix evidence: `/tmp/tasco-home-final.png` compared with `/tmp/reference-home-frame.png`.
2. Earlier P2 — WebGL-unavailable browser QA showed the legacy dark map fallback behind the light sheet.
   - Fix: scoped the MapLibre unavailable state to the Atlas light canvas while keeping the deterministic planning sheet usable.
   - Post-fix evidence: `/tmp/tasco-start-final.png`.
3. Earlier P2 — the interruption replacement was captured mid-transition and appeared overly faded.
   - Fix: verified the 400 ms transition settles to full opacity; reduced-motion users receive the final state without animation.
4. Sign-off P0 — the first mobile port removed the reachable Journey Checkout, receipt, 2D/3D toggle, and Route Theater.
   - Fix: restored the engine-backed checkout into the light sheet, made `Xem hành trình đề xuất` compose/revise through `/api/chat`, confirmed only parking idempotently, rendered one receipt, and restored the same-canvas 3D payoff.
   - Post-fix evidence: `/tmp/tasco-fixed-step5.png`, `/tmp/tasco-fixed-step6-receipt.png`, and `/tmp/tasco-fixed-step6-3d.png`.
5. Sign-off P0 — live-planning context polluted the canonical commerce query and reduced the journey to two stops.
   - Fix: compose the golden request with a clean journey context, retain the session identity, then apply the cheaper revision only with the newly returned journey context.
   - Post-fix evidence: `/tmp/tasco-step5-production-three-stops.png` and DOM assertion `fuel → dining → parking`, count `3`.
6. Sign-off P0 — WebGL-unavailable QA entered a false `Đang trình diễn tuyến 3D` state.
   - Fix: restore `onReadyChange`, gate mode/theater state on MapLibre readiness, preserve the receipt, and show the locked non-blocking fallback.
   - Post-fix evidence: `/tmp/tasco-step6-production-fallback.png`; both 3D and theater controls were disabled and the fallback was visible.
7. Sign-off P1 — screenshots contained a black circular `N`.
   - Finding: the coordinate resolved to `NEXTJS-PORTAL`, Next.js's development indicator, not an Atlas element. Production-mode DOM reported `portal:false` and the production screenshots contain no `N`.

**Required fidelity surfaces**

- Fonts and typography: `Be Vietnam Pro` 400–800 loads first, with Geist/system fallbacks; mobile title, body, label, price, and chip hierarchy match the contract.
- Spacing and layout rhythm: 14–16 px horizontal rhythm, 16–25 px card/sheet radii, 44 px minimum controls, and fixed safe-area-aware actions fit 402 × 874 without horizontal overflow.
- Colors and visual tokens: light blue-gray canvas, white surfaces, navy text, VETC green, amber interruption, and red-only badges/end actions follow `design.md`.
- Image and asset fidelity: no fake photography or new imagery was introduced; existing MapLibre is the visual canvas and Lucide provides outlined UI icons.
- Copy and content: Vietnamese consent, privacy, live-state, transcript, canonical cost/distance/savings, and simulation disclosures match the locked contract.

**Primary interactions tested**

- Open `Đi đâu?` from VETC home.
- Enter text fallback without microphone permission.
- Run the scripted opening request and budget constraint.
- Interrupt with `gần hơn và rẻ hơn`, retaining the same screen and updating the recommendation in place.
- Open the deterministic journey and verify the ordered checkout.
- Confirm only the displayed parking amount and verify one simulated receipt.
- Start Route Theater and verify the 3D mode toggle becomes active while the receipt remains available.
- Mute and end controls remain reachable.
- Browser console checked; the app produced no runtime exception. The source artifact's temporary local renderer produced only its own missing-file history before its supporting files were served.
- Credentialed Realtime attempt: the QA browser remained at `Đang kết nối phiên âm thanh…` because microphone permission did not resolve, and no `/api/realtime/session` request was emitted. The attempt was ended and returned to the explicit-start screen; credentialed audio is not claimed as verified.

**Follow-up polish**

- P3: production TASCO/VETC assets can replace the text `vetc` lockup when licensed brand files are supplied.
- P3: validate the available branch on a hardware WebGL browser; the pure readiness seam is tested for both `canPlay:true` and `canPlay:false`, while this QA environment exercised the rendered non-WebGL fallback.

final result: passed
