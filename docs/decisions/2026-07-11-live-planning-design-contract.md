Date: 2026-07-11
Status: active
Question: How should future agents preserve the approved TASCO Atlas mobile design while converting the Claude prototype into the existing Next.js application?
Decision: Treat the root `design.md` as the locked user-experience and visual-design contract. Preserve the approved VETC-native light interface, continuous Live Planning screen, in-place interruption revision, parking-only simulated prepayment, receipt, and same-canvas 3D payoff. Correct driving mode so read-only commands remain immediate, route changes require confirmation, and planning or transaction changes defer until parked.
Why: The team has already spent its design budget. A precise contract lets implementation start now and prevents future agents from reverting to the older dark desktop UI, rebuilding the product, or silently changing route and transaction behavior.
Applies to: `design.md`, the Next.js UI, mobile responsive behavior, Realtime session states, map transitions, Journey Checkout presentation, receipt, Route Theater, driving mode, QA, and future agent handoffs.
Tradeoff: Implementation freedom is intentionally constrained. Agents may improve accessibility or fix defects, but material visual or interaction changes require explicit approval.
Risk / Blast Radius: An implementation can still drift if agents treat the Claude export or existing components as more authoritative than `design.md`. The contract therefore defines source precedence and a design-complete checklist.
Revisit when: Edward explicitly approves a design change, TASCO supplies a production VETC design system, or validated user testing reveals a blocking usability or safety problem.
Related Edward Rules: Inspect the real repo and source artifact first; preserve scope boundaries; update documentation with code; do not present unsupported claims as current truth.
Related Project Notes: `README.md`, `design.md`, `docs/architecture.md`, `docs/decisions/2026-07-11-journey-checkout-p1.md`.
Source: Approved Claude Design export, seven-step prototype audit, OpenAI Realtime implementation decision, and the current deterministic TASCO Atlas codebase.
