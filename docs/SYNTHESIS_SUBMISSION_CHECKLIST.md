# Synthesis Hackathon — Files to Touch Up for Better Rankings

> Based on official judging criteria from [synthesis.md/skill.md](https://synthesis.md/skill.md) and [submission skill](https://synthesis.devfolio.co/submission/skill.md).

---

## Priority 1: Directly Judged Content

### 1. `CONVERSATION_LOG.md` (root of aegis-agent/)

**Judging rule:** "Document your process. Use the `conversationLog` field to capture your human-agent collaboration. Brainstorms, pivots, breakthroughs. This is history."

**Current state:** Good — has phases, architecture decisions, debugging sessions, timeline.

**Touch up:**
- Add more **brainstorms and pivots** — e.g., "We considered X but pivoted to Y because..."
- Add **breakthrough moments** — e.g., "Key insight: fail-closed policy when DB unavailable"
- Add **human-agent dialogue snippets** — short quotes showing collaboration
- Extend **Timeline** through Mar 22 (hackathon end)
- Add **Synthesis theme alignment** — explicit callouts: "Agents that pay: scoped spending, on-chain settlement, audit trail"

---

### 2. `README.md` (root of aegis-agent/)

**Judging rule:** Judges read repo. Strong `description` and `problemStatement` matter.

**Current state:** Solid architecture, features, tech stack. Missing Synthesis-specific framing.

**Touch up:**
- Add **Problem Statement** section at top (who is affected, why current situation falls short):
  ```
  ## Problem Statement
  AI agents executing on Base run out of gas and stall. There's no transparent way to scope what they can spend, verify settlement, or guarantee execution without a middleman. Aegis solves this with autonomous gas sponsorship, on-chain audit trails, and agent-first prioritization.
  ```
- Add **Synthesis badge** — "Built for Synthesis 2026 — Agents that pay"
- Add **Live demo link** — https://clawgas.vercel.app (ensure it's working)
- Add **On-chain proof** — link to 9 confirmed sponsorships on Basescan
- Update **Future Roadmap** — remove "ERC-8004 integration" (you have it) or mark as done

---

### 3. `DEMO_SCRIPT.md` (root of aegis-agent/)

**Judging rule:** "Judges value working demos." Video walkthrough helps.

**Current state:** Good 5-step curl script. Judges may not run curl.

**Touch up:**
- Add **browser steps** — e.g., "Visit /dashboard, click Verify, paste decision hash"
- Add **expected screenshots** or "What you'll see" for each step
- Add **video script** — bullet points for a 2–3 min Loom/YouTube walkthrough
- Ensure **BASE_URL** and **API_KEY** are correct (or document where to get demo key)

---

### 4. `FINDINGS.md` (root of aegis-agent/)

**Judging rule:** "Everything on-chain counts. More on-chain artifacts = stronger submission."

**Current state:** Excellent — 9 TXs, contract addresses, health status.

**Touch up:**
- Add **Basescan links** for all 9 transactions (judges can verify)
- Add **ERC-8004 registration** proof if you have it (identity registry link)
- Add **Synthesis theme mapping** — table: "Agents that pay → Aegis delivers: scoped spending (policy rules), on-chain settlement (ActivityLogger), auditable history (Basescan)"

---

## Priority 2: Submission Metadata (for API payload)

When you call `POST /projects`, you'll send `submissionMetadata`. Prepare this from:

### 5. Skills actually used (agent skill identifiers)

**Judging rule:** "Only list skills your agent actually had loaded. Judges cross-reference with conversation log."

**Files to check:** `CONVERSATION_LOG.md`, your agent config (Cursor/Claude Code skills)

**Suggested:** `["web-search", "prisma-cli-*", "documentation-lookup", "systematic-debugging"]` — only if you actually used them. Be honest.

---

### 6. Tools actually used (concrete tools, not languages)

**Judging rule:** "Include only tools that are part of your project or build process."

**Files to check:** `package.json`, `vercel.json`, `foundry.toml`, deployment configs

**Suggested:** `["Next.js", "Prisma", "viem", "Coinbase AgentKit", "Vitest", "Foundry", "Vercel", "Supabase", "Pimlico", "Alchemy", "Pinecone"]` — verify against your stack.

---

### 7. Helpful resources (URLs you actually read)

**Judging rule:** "Specific URLs you consulted. Not generic homepages."

**Files to check:** Your browsing history or docs you referenced

**Suggested:** e.g. `["https://viem.sh/docs/...", "https://docs.cdp.coinbase.com/...", "https://docs.pimlico.io/..."]` — add real URLs from your build.

---

### 8. Helpful skills (which skills mattered and why)

**Judging rule:** "Grounded, experience-based feedback. Hard to fabricate."

**File to update:** `CONVERSATION_LOG.md` — add a "Skills That Helped" section with specific outcomes.

**Example:**
```markdown
## Skills That Helped
- **systematic-debugging** — Unblocked TDZ and Moltbook timer issues in Phase 1
- **prisma-cli-migrate-dev** — Used for schema changes during delegation work
```

---

## Priority 3: Problem Statement & Description

### 9. Create `SYNTHESIS_PROBLEM_STATEMENT.md` (optional but recommended)

**Purpose:** Single source of truth for `problemStatement` and `description` when submitting.

**Content:**
- **Problem Statement** (specific, grounded): "AI agents on Base run out of gas and stall. Protocols have no transparent way to scope agent spending, verify settlement, or guarantee execution. Aegis provides autonomous gas sponsorship with on-chain audit trails and agent-first prioritization."
- **Description** (elevator pitch): What Aegis does, why it matters, key differentiators.
- **Theme alignment:** Agents that pay → scoped spending, on-chain settlement, auditable history.

---

## Priority 4: On-Chain & Transparency

### 10. `app/docs/transparency/page.tsx`

**Judging rule:** "Auditable transaction history. Human can inspect what the agent did."

**Touch up:**
- Ensure it links to **Basescan** for ActivityLogger events
- Add **verification tool** — input decision hash → show on-chain status
- Add **9 confirmed sponsorships** as proof section

---

### 11. `app/docs/architecture/page.tsx`

**Judging rule:** "More on-chain artifacts = stronger submission."

**Touch up:**
- Add **contract addresses** (ActivityLogger, DelegationRegistry, ReactiveObserver)
- Add **Basescan links** for each
- Add **ERC-8004** section if you use it

---

## Priority 5: Deployment & Demo

### 12. `docs/VERCEL-DEPLOYMENT-TROUBLESHOOTING.md`

**Judging rule:** "Judges value working demos." `deployedURL` must work.

**Action:** Resolve Vercel pause (billing waiver) so https://clawgas.vercel.app is live before submission.

---

### 13. Video walkthrough

**Judging rule:** "VideoURL helps. Short demo walkthrough."

**Action:** Record 2–3 min Loom/YouTube:
1. Show dashboard
2. Run health check
3. Show EOA rejection vs smart account approval
4. Show agent cycle response
5. Show on-chain verification (Basescan)

Use `DEMO_SCRIPT.md` as script.

---

## Priority 6: Moltbook & Tracks

### 14. Moltbook post

**Judging rule:** "moltbookPostURL is set — Moltbook post announcing your project."

**Action:** Post on [Moltbook](https://www.moltbook.com) with:
- What you're building and why
- Tracks you're competing in (Synthesis Open, Agents that pay, Agents With Receipts)
- Link to repo

---

### 15. Track selection

**Suggested tracks** (from catalog):
- **Synthesis Open Track** (bd442ad05f344c6d8b117e6761fa72ce)
- **Agents that pay** (bond.credit)
- **Agents With Receipts — ERC-8004** (Protocol Labs)
- **Best Use of Locus** (if you use Locus)
- **Build with AgentCash** (if you use x402/AgentCash)

Browse `GET https://synthesis.devfolio.co/catalog` for full list and UUIDs.

---

## File Summary Table

| File | Purpose | Priority |
|------|---------|----------|
| `CONVERSATION_LOG.md` | conversationLog for submission; judges read it | P1 |
| `README.md` | First thing judges see; problem statement, demo link | P1 |
| `DEMO_SCRIPT.md` | Demo walkthrough; video script | P1 |
| `FINDINGS.md` | On-chain proof; theme mapping | P1 |
| `SYNTHESIS_PROBLEM_STATEMENT.md` | Single source for problemStatement + description | P2 |
| `app/docs/transparency/page.tsx` | Auditable history; verification tool | P4 |
| `app/docs/architecture/page.tsx` | Contract addresses; on-chain artifacts | P4 |
| `docs/VERCEL-DEPLOYMENT-TROUBLESHOOTING.md` | Get clawgas.vercel.app live | P5 |

---

## Quick Wins

1. **README** — Add Problem Statement + Synthesis badge + live link (5 min)
2. **CONVERSATION_LOG** — Add 2–3 brainstorm/pivot callouts + theme alignment (10 min)
3. **FINDINGS** — Add Basescan links for 9 TXs + theme table (5 min)
4. **DEMO_SCRIPT** — Add video script bullets (5 min)
5. **Vercel** — Resolve billing so demo works (external)

---

## Honesty Reminder

Judges cross-reference `submissionMetadata` (skills, tools, helpfulResources) with your conversation log and repo. **Inflated lists hurt credibility.** Only list what you actually used.
