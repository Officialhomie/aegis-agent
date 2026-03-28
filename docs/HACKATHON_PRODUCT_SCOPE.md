# Aeg-control — Hackathon product scope (honest split)

**Aeg-control** is the user-facing **policy-governed sponsorship console** built on top of existing Aegis + OpenClaw infrastructure. This document separates what predates the product layer from what the hackathon submission adds.

## Existing infrastructure (not claimed as new)

- **OpenClaw** — Natural-language parsing and command execution (`src/lib/agent/openclaw/command-handler.ts`, `POST /api/openclaw`).
- **Aegis agent loop** — Observe → Reason → Policy → Execute, paymaster signing, bundler integration (`src/lib/agent/`, `docs/AEGIS_SPONSORSHIP_ARCHITECTURE.md`).
- **Sponsorship safety policy** — Protocol budgets, rate limits, tiers, abuse checks (`src/lib/agent/policy/sponsorship-rules.ts` and related rules).
- **Delegation & MDF** — Delegation services, MDF types and calldata (`src/lib/delegation/`, `src/lib/mdf/`).
- **Session → protocol binding** — OpenClaw sessions in Redis (`src/lib/agent/openclaw/session-manager.ts`).
- **Operator dashboard** — Protocol-centric metrics and delegation UI (`app/dashboard/`, `app/delegation/`).
- **OpenClaw audit schema** — `OpenClawAudit` model; **DB audit on every command** is enforced by wiring `executeWithAudit` through the shared HTTP runner (`src/lib/agent/openclaw/http-runner.ts`).

## New hackathon product work (Aeg-control)

- **Product module** — `src/lib/product/` (FSM, policy service, entitlement service, audit/summaries, policy gate).
- **Product API** — `app/api/control/*` (gated execution proxy, onboarding FSM, policy CRUD, activity, methods catalog, entitlement).
- **Product UI** — `app/control/*` (landing, onboarding wizard, chat → gated execute, activity feed, settings for policy/revocation/tier).
- **Product data model** — Prisma: `SponsoredMethod`, `UserAgentPolicy`, `PolicySnapshot`, `ProductExecutionRecord`, `Entitlement`, `ControlOnboardingState`.
- **Sponsored-method catalog** — Seeded from `CommandName` / `ALL_COMMAND_NAMES` with risk tier and premium flags.
- **Human-readable summaries** — `buildSummary()` for post-action receipts in the UI.
- **Policy bypass mitigation** — The product chat uses `POST /api/control/execute` with `ProductPolicyGate`; raw `POST /api/openclaw` remains for external integrations and is not linked from the product UI.

## Git tag (optional)

Tag `synthesis-control` may be applied to commits that touch `app/control/`, `app/api/control/`, `src/lib/product/`, and product-related docs/seeds for reviewer clarity.
