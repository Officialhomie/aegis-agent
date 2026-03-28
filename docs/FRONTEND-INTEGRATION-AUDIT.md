# Frontend Integration Audit

This document inventories all APIs, docs, and implementations in the Aegis app and compares them to what is exposed on the UI. It identifies gaps and recommends where each capability should appear.

---

## 1. Current UI Structure

### 1.1 Navigation (Header)

| Link | Route | Notes |
|------|--------|--------|
| Dashboard | `/dashboard` | Stats, activity, cost optimization, verify |
| Protocols | `/protocols` | List protocols |
| Docs | `/docs` | Documentation hub |
| Register Protocol | `/protocols/register` | CTA button |

**Not in header:** Admin (`/admin`), Delegation, Gas Passport, Health/Status.

### 1.2 Docs Sidebar

| Section | Items |
|---------|--------|
| Introduction | Overview, Getting Started |
| Integration | For Protocols, For AI Agents |
| Reference | API Reference, Architecture |
| Resources | Transparency, FAQ |

**Not in docs:** Delegation, Gas Passport / Reputation (as dedicated pages).

### 1.3 Pages That Consume APIs

| Page | APIs Used |
|------|-----------|
| Home | `/api/dashboard/stats` (Stats component) |
| Dashboard | `/api/dashboard/stats`, `/api/dashboard/activity`, `/api/dashboard/cost-savings`, `/api/dashboard/verify` |
| Protocols list | `GET /api/protocol` |
| Protocol detail `[id]` | `GET /api/protocol/[id]`, `POST /api/protocol/[id]/topup` |
| Protocols register | `POST /api/protocol/register` |
| Admin | `GET /api/agent/status`, `POST /api/agent/cycle` |

**Footer:** Links to Dashboard, Register Protocol, Documentation, API Reference, **Status** (`/status`), Terms.  
**Issue:** `/status` has no page (404). Intended target is unclear (health? agent status?).

---

## 2. Full API Inventory vs UI/Docs Exposure

### 2.1 Protocol APIs

| Method | Path | In API Docs | In UI | In Agent Card |
|--------|------|--------------|-------|----------------|
| POST | `/api/protocol/register` | Yes | Protocols register page | Yes |
| GET | `/api/protocol` | Yes | Protocols list | Yes |
| GET | `/api/protocol/[protocolId]` | Yes | Protocol detail | Yes |
| PATCH | `/api/protocol/[protocolId]` | Yes | No | No |
| POST | `/api/protocol/[protocolId]/topup` | Yes | Protocol detail (top-up) | Yes |
| GET | `/api/protocol/[protocolId]/agents` | Yes | **No** | Yes (apiKey) |
| POST | `/api/protocol/[protocolId]/agents` | Yes | **No** | Yes (apiKey) |
| DELETE | `/api/protocol/[protocolId]/agents` | Yes | **No** | Yes (apiKey) |
| PATCH | `/api/protocol/[protocolId]/agents` | Yes | **No** | Yes (apiKey) |
| POST | `/api/protocol/[protocolId]/deposit-verify` | Yes | **No** | Yes (apiKey) |
| POST | `/api/protocol/webhook` | Yes (webhook) | No (backend) | Yes (webhook) |

**Gaps:** Protocol detail page does not show approved agents or allow approve/revoke/update. No UI for deposit-verify. PATCH protocol not in UI.

### 2.2 Dashboard APIs

| Method | Path | In API Docs | In UI | In Agent Card |
|--------|------|--------------|-------|----------------|
| GET | `/api/dashboard/status` | Yes | **No** | Yes |
| GET | `/api/dashboard/stats` | Yes | Dashboard, Landing stats | Yes |
| GET | `/api/dashboard/activity` | Yes | Dashboard | Yes |
| GET | `/api/dashboard/cost-savings` | **No** | Dashboard | **No** |
| GET | `/api/dashboard/social` | Yes | **No** | Yes |
| POST | `/api/dashboard/verify` | Yes | Dashboard (verify hash) | Yes |

**Gaps:** `cost-savings` is used by Dashboard but not documented in API Reference. `dashboard/status` and `dashboard/social` are documented but not used on any page (optional for future widgets).

### 2.3 Agent APIs

| Method | Path | In API Docs | In UI | In Agent Card |
|--------|------|--------------|-------|----------------|
| GET | `/api/agent/status` | Yes | Admin only | Yes (apiKey) |
| POST | `/api/agent/cycle` | Yes | Admin only | Yes (apiKey) |
| GET | `/api/agent/price` | Yes | No | Yes |
| POST | `/api/agent/register` | Yes | No | Yes (apiKey) |
| GET | `/api/agent/request-status/[requestId]` | Yes | No | Yes |
| POST | `/api/agent/request-status/[requestId]` (cancel) | Yes | No | Yes (apiKey) |
| GET | `/api/agent/[agentAddress]/delegations` | **No** | **No** | **No** |

**Gaps:** Agent cycle/status only on Admin; Admin is not linked from main nav. No UI for price, register, or request-status. **Agent delegations API is not documented and has no UI.**

### 2.4 Delegation APIs

| Method | Path | In API Docs | In UI | In Agent Card |
|--------|------|--------------|-------|----------------|
| POST | `/api/delegation` | **No** | **No** | **No** |
| GET | `/api/delegation` | **No** | **No** | **No** |
| GET | `/api/delegation/[delegationId]` | **No** | **No** | **No** |
| DELETE | `/api/delegation/[delegationId]` | **No** | **No** | **No** |
| GET | `/api/delegation/[delegationId]/usage` | **No** | **No** | **No** |

**Gaps:** Full delegation surface (create, list, get, revoke, usage) is **not in API Reference**, **not in agent card**, and **has no UI** (no “Delegation” page or section).

### 2.5 v1 APIs

| Method | Path | In API Docs | In UI | In Agent Card |
|--------|------|--------------|-------|----------------|
| GET | `/api/v1/protocol/[id]/stats` | Yes (v1 tab) | **No** | Yes |
| POST | `/api/v1/sponsorship/check-eligibility` | Yes (v1 tab) | No | Yes |
| POST | `/api/v1/sponsorship/request` | Yes (v1 tab) | No | Yes (apiKey) |
| GET | `/api/v1/passport` | **No** | **No** | **No** |

**Gaps:** **Gas Passport** (`GET /api/v1/passport?agent=0x...` or `?agentOnChainId=...`) is **not documented**, **not in agent card**, and **has no UI** (no lookup tool or doc section). v1 protocol stats could enrich Protocol detail page.

### 2.6 Health & Other

| Method | Path | In API Docs | In UI | In Agent Card |
|--------|------|--------------|-------|----------------|
| GET | `/api/health` | Yes | No | Yes |
| GET | `/api/health/deep` | Yes | No | Yes |
| GET | `/api/health/redis` | Yes | No | Yes |
| POST | `/api/reactive/event` | Yes (webhook) | No | Yes (apiKey) |
| POST | `/api/botchan/webhook` | Yes (webhook) | No | Yes (webhook) |
| GET | `/.well-known/agent-card.json` | Yes (agent tab) | No | N/A (is the card) |

**Gaps:** No public “Status” or “Health” page. Footer “Status” links to `/status`, which **does not exist** (404).

---

## 3. Documentation Content Gaps

| Doc Page | What's Covered | What's Missing |
|----------|----------------|----------------|
| **Docs Overview** | Getting Started, Protocols, Agents, API, Architecture, Transparency, FAQ | No mention of Delegation or Gas Passport; no links to those flows. |
| **For AI Agents** | Eligibility, flow, ERC-8004 reputation, Moltbook, Botchan | **Gas Passport** (reputation primitive, passport lookup, preferential sponsorship) not mentioned. **Delegation** (user delegates to agent, budget, scoped permissions) not mentioned. |
| **For Protocols** | Register, whitelist, top-up, webhook | Approved agents CRUD and deposit-verify only in API Reference, not in protocol narrative. |
| **API Reference** | Protocol, Dashboard, Agent, Webhooks, v1 (protocol stats, check-eligibility, request), Health | **Delegation** (all 5 endpoints) missing. **GET /api/v1/passport** missing. **GET /api/dashboard/cost-savings** missing. v1 paths in doc show `/v1/...` but base is `/api` (minor). |
| **Architecture** | ORAE, ActivityLogger, etc. | Optional: where Delegation and Passport sit in the stack. |
| **Transparency** | On-chain verification, Farcaster | No change needed. |
| **FAQ** | Eligibility, verify, etc. | Optional: one FAQ each for “What is Gas Passport?” and “How does user-to-agent delegation work?” |

---

## 4. Summary: What Is NOT There Yet

### 4.1 Not on Frontend at All

1. **Gas Passport**
   - No doc page (e.g. “Gas Passport” or “Reputation” under Docs).
   - No API Reference entry for `GET /api/v1/passport`.
   - No UI to look up a passport (e.g. by agent address or agentOnChainId).
   - Not listed in agent card.

2. **Delegation**
   - No doc page (e.g. “User-to-Agent Delegation”).
   - No API Reference section for delegation endpoints.
   - No UI: no “Delegation” in nav, no page to create/list/revoke delegations or view usage.
   - Not listed in agent card.

3. **Admin**
   - Page exists at `/admin` (agent status, run cycle) but **not linked** in header or footer.

4. **Status / Health**
   - Footer “Status” points to `/status`; **no `/status` page** (404). No public health/status dashboard.

5. **Protocol: Approved Agents**
   - APIs exist and are documented under Protocol, but **protocol detail page does not show approved agents** or allow approve/revoke/update.

6. **Dashboard / API Reference**
   - **GET /api/dashboard/cost-savings** is used by Dashboard but **not documented** in API Reference.

### 4.2 Partially Exposed

- **Agent APIs:** Only status/cycle on Admin; price, register, request-status have no UI (could stay API-only or get minimal UI later).
- **v1 protocol stats:** Documented and in agent card; could be used on Protocol detail page for richer stats.

---

## 5. Recommended Integration Plan

### 5.1 Fix Broken Link and Optional Status Page

- **Option A:** Change footer “Status” from `/status` to a valid target (e.g. `/docs/api#health` or a new `/status` page that calls `GET /api/health` and displays status).
- **Option B:** Add a simple `/status` page that fetches `/api/health` (and optionally `/api/health/deep`) and shows healthy/unhealthy and key metrics.

### 5.2 Gas Passport

- **Docs**
  - Add a **“Gas Passport”** (or “Reputation”) item under Docs (e.g. under Integration or Reference) describing what it is, how it’s computed, and preferential sponsorship.
  - In **API Reference**, add a **v1** subsection (or extend v1 tab) with **GET /api/v1/passport** (query params `agent` and `agentOnChainId`, response shape).
  - Optionally mention Gas Passport in **For AI Agents** (reputation and priority).
- **UI**
  - Add a **Passport lookup** experience: either a small tool on a new **“Gas Passport”** doc page, or a section on Dashboard / Docs that allows entering an agent address (or on-chain ID) and displays passport (sponsorCount, successRateBps, protocolCount, firstSponsorTime, totalValueSponsored).
- **Agent card**
  - Add to `endpoints.v1`: `passport: '/api/v1/passport'` and include in `authentication.publicEndpoints`.

### 5.3 Delegation

- **Docs**
  - Add a **“Delegation”** (or “User-to-Agent Delegation”) doc page: what it is, flow (create, use, revoke), permissions, budget, and link to API.
  - In **API Reference**, add a **“Delegation”** tab (or section) documenting POST/GET `/api/delegation`, GET/DELETE `/api/delegation/[id]`, GET `/api/delegation/[id]/usage`, and GET `/api/agent/[agentAddress]/delegations`.
  - Optionally add a short “Delegation” section in **For AI Agents** and **For Protocols**.
- **UI**
  - Add **“Delegation”** to main nav (or under Dashboard as a sub-section).
  - **Delegation page(s):**
    - List delegations (filter by delegator or agent) using GET `/api/delegation`.
    - Create delegation (form → POST `/api/delegation`).
    - Delegation detail: show delegation + usage (GET `/api/delegation/[id]` + GET `/api/delegation/[id]/usage`), with revoke (DELETE).
  - Optionally, on Protocol detail or a dedicated “Agent” view: link to “Delegations for this agent” using GET `/api/agent/[agentAddress]/delegations`.
- **Agent card**
  - Add delegation endpoints to `endpoints` and `authentication` (public vs apiKey as appropriate).

### 5.4 Protocol Detail: Approved Agents and v1 Stats

- On **Protocol detail** (`/protocols/[id]`):
  - Add a section **“Approved Agents”**: list (GET `/api/protocol/[id]/agents`), with actions (approve/revoke/update) if auth is available (or doc link + API key note).
  - Optionally use **GET /api/v1/protocol/[id]/stats** to show richer stats (if different from current protocol response).

### 5.5 API Reference and Agent Card Completeness

- **API Reference**
  - Document **GET /api/dashboard/cost-savings** (Dashboard tab).
  - Ensure all v1 paths are shown with `/api` prefix (e.g. `/api/v1/...`).
- **Agent card**
  - Add **passport** and **delegation** endpoints and list them in `publicEndpoints` or `apiKeyEndpoints` as appropriate.

### 5.6 Admin Link (Optional)

- If Admin is intended for ops only: keep it unlinked or add a small “Admin” link in footer (or header for admins).
- If it should be discoverable: add “Admin” to header or footer with a clear label (e.g. “Agent Admin”).

---

## 6. Priority Order

| Priority | Item | Rationale |
|----------|------|-----------|
| 1 | Fix Status link or add `/status` page | Footer link is broken. |
| 2 | Document and expose Gas Passport (docs + API ref + agent card + lookup UI) | Core primitive; already implemented backend. |
| 3 | Document and expose Delegation (docs + API ref + agent card + UI) | Core feature; no current surface. |
| 4 | Add GET /api/v1/passport and GET /api/dashboard/cost-savings to API Reference; add passport (and delegation) to agent card | Completeness. |
| 5 | Protocol detail: approved agents section (and optional v1 stats) | Better protocol management. |
| 6 | Admin link (footer/header) or explicit “no link” decision | Discoverability vs ops-only. |

---

## 7. File Reference (for implementation)

| Change | Files to Touch |
|--------|----------------|
| Status link / page | `components/landing/footer.tsx` (href), optionally `app/status/page.tsx` (new). |
| Gas Passport docs | New `app/docs/gas-passport/page.tsx` (or `reputation`), `components/docs/sidebar.tsx` (nav), `app/docs/agents/page.tsx` (mention). |
| Gas Passport API doc | `app/docs/api/page.tsx` (v1 tab: add passport endpoint). |
| Passport lookup UI | New section in `app/docs/gas-passport/page.tsx` or Dashboard or new `app/passport/page.tsx`. |
| Agent card | `app/.well-known/agent-card.json/route.ts` (add passport + delegation endpoints). |
| Delegation docs | New `app/docs/delegation/page.tsx`, `components/docs/sidebar.tsx`. |
| Delegation API doc | `app/docs/api/page.tsx` (new Delegation tab or section). |
| Delegation UI | New `app/delegation/page.tsx` (list/create), `app/delegation/[id]/page.tsx` (detail + usage + revoke); optional link from protocol or agent. |
| Cost-savings in API ref | `app/docs/api/page.tsx` (Dashboard tab). |
| Protocol detail agents | `app/protocols/[id]/page.tsx` (approved agents section; optional v1 stats). |
| Admin link | `components/layout/header.tsx` or `components/landing/footer.tsx`. |

This audit gives a single checklist so that every backend capability (APIs, docs, delegation, Gas Passport) has a defined place on the frontend and in docs.
