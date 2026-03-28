# Aegis — Hackathon pitch (30-second clarity)

Use this when judges are tired and you need **impact first**, details second. Pair with live demo.

---

## 1. One-line explanation

**Aegis lets AI agents run real on-chain actions with someone else paying the gas—after the user delegates permission, Aegis checks safety and business rules, then sponsors the transaction through a paymaster while the chain makes the final call on what actually executes.**

---

## 2. Three-layer mental model

| Layer | Who | What they control |
|-------|-----|-------------------|
| **User** | The human | *Whether* automation is allowed, *who* the agent is, and (with the advanced path) *hard limits* baked into what they sign. |
| **Aegis** | Your product | *Whether this specific run is OK right now*—protocol rules, budgets, rate limits, safety checks—and *whether to attach paid gas* so it can go on-chain. |
| **Blockchain** | The network + contracts | *Whether the transaction is valid and final*—signatures, account rules, and (in the advanced path) *automatic enforcement of those limits* so nobody can cheat at execution time. |

**In one breath:** The user sets the **permission**, Aegis sets the **go/no-go and the gas**, the chain sets the **truth**.

---

## 3. Why this wins

- **Not just “delegate”** — Most demos stop at “a wallet signed something.” Aegis adds a **real operations layer**: who’s allowed to spend whose budget, when, and under what rules—*before* anything hits the chain.

- **Not just “free gas”** — Sponsored gas alone is a coupon. Aegis ties sponsorship to **intent + policy**, so you’re demoing **governed automation**, not a faucet.

- **Two trust modes, one product** — You can show **fast, flexible checks** (off-chain policy) *and* **tamper-resistant limits** (on-chain enforcement) without building two separate apps. That’s rare in MDF hackathon projects.

- **Composable by design** — Gas payment, rule checking, and “who executes what” are **separate concerns**. Judges who’ve seen brittle monoliths will recognize this as **grown-up architecture** even if you don’t say “ERC-4337.”

- **Story-shaped demo** — User delegates → agent acts → transaction lands with **clear cause and effect**. Easy to remember after twenty other pitches.

---

## 4. Demo flow narrative (story)

1. **You** introduce a user who wants an agent to do something on-chain—swap, log activity, call a protocol—without micromanaging every click.

2. **The user** says “yes” once: they **delegate** the agent—like handing over a scoped key card, not the master key.

3. **Aegis wakes up** when the agent tries to act. It doesn’t blindly pay gas. It asks: *Is this protocol in good standing? Is this within limits? Is this delegation still valid?* Only if the answers are right does it **green-light sponsorship**.

4. **On-chain**, the network runs the transaction. In the **advanced** path, **built-in guards** on the chain double-check the action matches what the user allowed—so even if something upstream misbehaved, **the chain is the referee**.

5. **Everyone sees** a real transaction, real state change, and a clear line: **user intent → policy → gas → execution.**

*Optional closing line:* “Same product, two strength levels: **fast rules** off-chain, **hard rules** on-chain when you need them.”

---

## 5. Visual simplification (5 boxes)

Plain roles, arrows only:

```text
┌─────────┐     ┌─────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────┐
│  User   │────▶│  Agent  │────▶│    Aegis     │────▶│  Gas payer  │────▶│   Chain   │
│ intent  │     │ tries   │     │ rules + OK? │     │ (sponsor)   │     │ final OK  │
└─────────┘     └─────────┘     └──────────────┘     └─────────────┘     └──────────┘
```

**Read aloud:** “User intent flows to the agent; the agent asks Aegis; Aegis decides and funds gas; the chain has the last word.”

---

## 6. Tagline

**“Governed gas for autonomous agents.”**

Alternates (pick one voice):

- **“Permission first. Policy second. Gas when it’s right.”**
- **“The control plane for sponsored agent transactions.”**
- **“Delegate once. Aegis decides every run. The chain finishes the job.”**

---

*Keep the technical deep-dives in other docs; open with this file when the clock is ticking.*
