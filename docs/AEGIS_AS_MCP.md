# Aegis as an MCP Server — Perspective & Workflow

What it would feel like to use Aegis as an **MCP (Model Context Protocol) server**, and how its **workflow and thought process** can be shared so other agents or humans can see and reuse the same perspective.

---

## 1. What It Would Feel Like

If this project were turned into an MCP server, **Aegis would feel like a callable sub-agent**: you don’t run the loop yourself; you ask the Aegis MCP server to do things and optionally read its state.

| Dimension | Today (HTTP/OpenClaw) | As MCP |
|-----------|------------------------|--------|
| **Who calls** | OpenClaw skill, curl, dashboard | Any MCP client (Cursor, another AI, CLI) |
| **How** | `POST /api/openclaw`, `GET /api/health` | **Tools**: `aegis_status`, `aegis_cycle`, `aegis_report`, … |
| **State** | Dashboard, logs | **Resources**: `aegis://state/health`, `aegis://state/recent-decisions` |
| **Reasoning** | In logs / DB | **Resources** or **Prompts**: “What would Aegis do?” with observations + decision |

So the “feel” is:

- **Tools** = things Aegis can do (status, cycle, sponsor, report, pause, resume, analytics, verify decision, check eligibility).
- **Resources** = read-only snapshots of what Aegis sees and decided (observations summary, last N decisions with reasoning, reserve health, protocol list).
- **Prompts** = templates that encode Aegis’s perspective (e.g. “Given these observations and policy rules, what action and reasoning would Aegis produce?”).

Another agent or a human in Cursor could then:

- Ask: “What’s Aegis’s status?” → call `aegis_status` (tool).
- Ask: “Why didn’t wallet 0x… get sponsored?” → read `aegis://state/recent-decisions` (resource) or call `aegis_verify_decision` (tool).
- Ask: “Run one sponsorship cycle” → call `aegis_cycle` (tool).
- Ask: “What would Aegis do with this observation set?” → use a prompt that takes observations + policy summary and returns the same kind of reasoning the agent uses.

So the product “feels” like **Aegis as a reasoning and execution backend** behind a small, consistent interface (tools + resources + prompts), instead of a closed app you only talk to via HTTP or OpenClaw.

---

## 2. Sharing the Workflow and Thought Process

Aegis’s loop is **ORPEM**: Observe → Reason → Policy → Execute → Memory. To share that workflow and thought process via MCP, you expose it in three ways.

### 2.1 Expose the workflow as tools (one step or full cycle)

- **Per-step tools** (for transparency and reuse of the “thought process”):
  - `aegis_observe` — Run observation only; return a summary of what Aegis sees (chain, gas, low-gas wallets, protocol budgets, reserves). No LLM, no execution.
  - `aegis_reason` — Input: observation summary (or ref to last observe). Output: proposed action, confidence, reasoning (same schema as internal `Decision`). No policy, no execution.
  - `aegis_policy_check` — Input: decision + config. Output: pass/fail + which rules passed/failed. No execution.
  - `aegis_execute` — Input: approved decision (or “run last decision in simulation”). Output: tx hash or simulation result.
  - `aegis_memory_store` — Optional: store a decision + outcome for learning (or keep internal only).

- **High-level tools** (what you already have conceptually via OpenClaw/HTTP):
  - `aegis_status` — Reserve health, runway, balances (reads from same place as “status” command).
  - `aegis_cycle` — Run one full cycle (observe → reason → policy → execute → memory); return summary + decision + outcome.
  - `aegis_report` — Last N actions (same as “report”).
  - `aegis_verify_decision` — Verify a decision hash on-chain + signature (same as dashboard verify).
  - `aegis_check_eligibility` — Given wallet + protocol, return eligibility and which policy rules pass/fail (reuse policy layer only).

So the **workflow** is shared both as:

- A **single full step**: `aegis_cycle` (black box), and  
- **Explicit steps**: observe → reason → policy_check → execute, so another system can “think like Aegis” step by step or only run up to reason/policy.

### 2.2 Expose the perspective as resources

Resources are read-only. They let clients “see what Aegis sees” and “see how Aegis decided,” without calling the loop again.

- **Observations (what Aegis sees)**
  - `aegis://observations/latest` — Summary of last observation run: gas price, low-gas wallet count, protocol budgets, reserve balances, etc. (sanitized, no secrets.)
  - `aegis://observations/gas` — Current gas price and chain.

- **Decisions and reasoning (how Aegis thought)**
  - `aegis://decisions/recent` — Last N decisions: action, confidence, reasoning, policy pass/fail, timestamp. Lets a user or agent inspect “why did Aegis do that?”
  - `aegis://decisions/{decisionHash}` — One decision + signature + on-chain verification status.

- **State and config (context)**
  - `aegis://state/health` — Same as `aegis_status`: reserves, runway, mode (live/simulation/paused).
  - `aegis://state/policy-rules` — List of policy rule names and thresholds (e.g. max gas 2 Gwei, 3/user/day). So “the thought process” is interpretable: “Aegis uses these rules.”

- **Protocol and eligibility (what Aegis is allowed to do)**
  - `aegis://protocols/list` — Protocol IDs, balances, onboarding status (read-only).
  - `aegis://eligibility/{wallet}/{protocol}` — Cached or on-demand eligibility + which rules passed/failed (again sharing the “thought process” of policy).

So the **thought process** is shared by:

- Giving access to **inputs** (observations),
- Giving access to **outputs** (decisions + reasoning),
- Giving access to **rules** (policy summary),

all as readable resources, not only as tool return values.

### 2.3 Encode the reasoning template as prompts

MCP prompts are parameterized templates. You can expose Aegis’s reasoning style so another model can “reason like Aegis” (e.g. for explanations or dry runs).

- **Prompt: “aegis_reason_from_observations”**
  - Inputs: `observations_summary` (text), `policy_rules_summary` (text), optional `memories_summary`.
  - Template: “You are Aegis. Given these observations and policy rules, output a single proposed action (e.g. SPONSOR_TRANSACTION, WAIT), confidence (0–1), and short reasoning. Format: JSON with action, confidence, reasoning.”
  - This doesn’t run Aegis’s real LLM; it gives another agent the **same format and perspective** so it can simulate or explain Aegis’s reasoning.

- **Prompt: “aegis_explain_decision”**
  - Input: `decision_hash` or `decision_json`.
  - Template: “Given this Aegis decision (action, confidence, reasoning), write a 2–3 sentence explanation for a non-technical user about what Aegis did and why.”

- **Prompt: “aegis_eligibility_summary”**
  - Input: `wallet`, `protocol`, `policy_results` (which rules passed/failed).
  - Template: “Summarize in one paragraph why this wallet is or isn’t eligible for sponsorship from Aegis for this protocol.”

So the **workflow in the thought process** is shared not only by running Aegis (tools) and reading its state (resources), but by **naming and parameterizing** how Aegis reasons (prompts), so that perspective can be reused elsewhere.

---

## 3. Minimal MCP Surface (Sketch)

A minimal Aegis MCP server could look like this.

**Tools**

| Tool | Description | Inputs |
|------|-------------|--------|
| `aegis_status` | Reserve health, runway, balances | — |
| `aegis_cycle` | Run one full ORPEM cycle | `mode?: 'gas-sponsorship' \| 'reserve-pipeline'` |
| `aegis_report` | Last N activity entries | `limit?: number` |
| `aegis_observe` | Run observe only; return summary | `mode?: string` |
| `aegis_verify_decision` | Verify decision hash on-chain | `decisionHash: string` |
| `aegis_check_eligibility` | Check wallet + protocol eligibility | `wallet: string`, `protocolId: string` |
| `aegis_pause` / `aegis_resume` | Pause/resume autonomous loop | — |

**Resources** (URIs)

| URI | Description |
|-----|-------------|
| `aegis://state/health` | Current health (reserves, runway, mode). |
| `aegis://observations/latest` | Last observation summary (sanitized). |
| `aegis://decisions/recent` | Last N decisions with action, confidence, reasoning. |
| `aegis://state/policy-rules` | Policy rule names and thresholds. |

**Prompts**

| Name | Purpose |
|------|---------|
| `aegis_reason_from_observations` | Given observations + policy summary, output action, confidence, reasoning (Aegis-style). |
| `aegis_explain_decision` | Turn a decision JSON into a short user-facing explanation. |

---

## 4. Summary

- **What it would feel like:** Aegis as an MCP server feels like a **callable sub-agent** with **tools** (do something), **resources** (read what Aegis sees and decided), and **prompts** (reason or explain like Aegis).
- **How the workflow is shared:** The ORPEM loop is exposed as both a **single tool** (`aegis_cycle`) and as **step-wise tools** (`aegis_observe`, `aegis_reason`, `aegis_policy_check`, `aegis_execute`), so the thought process can be run end-to-end or step-by-step.
- **How the perspective is shared:** **Resources** expose observations, recent decisions, and policy rules so others can see “what Aegis saw” and “how Aegis decided.” **Prompts** encode the reasoning format and explanation style so another agent or human can reuse that perspective without running the real Aegis backend.

This keeps the same workflow and thought process you have in the app today, but makes them **composable** for any MCP client (Cursor, another AI, or a script).
