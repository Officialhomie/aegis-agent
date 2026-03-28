# Aegis — Control, Responsibility, and Composability (Second Layer)

This document explains **how the system behaves** and **who is in charge when**, not where code lives. For file-level maps, see [AEGIS_ARCHITECTURE_AND_COMPOSABILITY.md](./AEGIS_ARCHITECTURE_AND_COMPOSABILITY.md).

---

## 1. Control layer breakdown

Think of each layer as a **gate** with limited authority. Higher layers cannot override what lower layers cryptographically reject.

### User / delegator

- **Controls:** Whether any delegated automation exists at all; the cryptographic consent they sign (Aegis EIP-712 message or MDF delegation struct); on-chain revocation for MDF (via DelegationManager semantics).
- **Does not control:** Gas price, bundler choice, paymaster approval, protocol budgets, or Aegis policy knobs.
- **Trusts:** Wallet UX, correct chain/domain when signing.
- **Produces:** Signatures and (for MDF) caveat-bearing delegations that downstream layers must treat as opaque commitments.

### Delegation layer (Aegis path vs MDF path)

Same *role* — **scope of “the agent may act for this user”** — two implementations:

- **Aegis path:** Permission is mostly **encoded in what was signed + what’s stored**; enforcement is largely **off-chain** (policy + DB) before Aegis agrees to sponsor.
- **MDF path:** Permission is **encoded in the signed delegation + caveat enforcers**; enforcement is **on-chain** when `redeemDelegations` runs.

- **Controls:** The *meaning* of “allowed targets, time, value, budget-like limits” — either as interpreted by Aegis (Aegis path) or as enforced by contracts (MDF path).
- **Does not control:** Whether the protocol still has budget, whether the agent passes global safety rules, or whether the paymaster signs.
- **Trusts:** Correct addresses in signatures; for MDF, deployed DelegationManager and enforcer contracts.
- **Produces:** A durable **delegation record** Aegis can look up; for MDF, enough data to build **redeem** calldata.

### Aegis orchestration layer

- **Controls:** **Ordering** of the pipeline: when to validate, when to sign the agent decision, when to call the bundler, when to deduct budgets, when to log. It **binds** delegation context to a concrete sponsorship attempt.
- **Does not control:** EntryPoint rules, account implementation internals, or DelegationManager’s final say on MDF redemption.
- **Trusts:** DB state, RPC responses (nonces, revocation reads), configured env (RPC URLs, addresses).
- **Produces:** A **signed agent decision**, a **constructed UserOperation-shaped request** (sender, nonce, callData, gas fields, paymaster fields), and side effects (usage rows, sponsorship records).

### Policy layer

- **Controls:** **Whether this specific sponsorship attempt is allowed to proceed** under Aegis’s rules (protocol onboarding, tiers, rate limits, confidence, whitelists, delegation checks, MDF revocation read when enabled).
- **Does not control:** On-chain execution outcome; cannot force a reverting call to succeed.
- **Trusts:** Observed decision parameters, DB, caches, oracle/price inputs where used.
- **Produces:** Pass/fail **before** paymaster signing and bundler submission (fail-closed where designed).

### Execution layer (transaction / UserOp construction)

- **Controls:** **Shape of `callData`**: either “account, please `execute(target, value, data)`” or “account, please call DelegationManager to **redeem** this delegation with this inner call.” Also nonce selection against EntryPoint.
- **Does not control:** Whether the smart account’s validator accepts the UserOp; whether inner call succeeds; MDF caveat outcome.
- **Trusts:** Whitelist/target resolution rules inside orchestration, serialized delegation blob for MDF.
- **Produces:** The **bytes the sender account will execute** as its top-level call.

### Sponsorship layer (paymaster)

- **Controls:** **Whether Aegis’s paymaster contract will vouch for gas** for this UserOp — via the **backend-produced approval** tied to sender, nonce, callData hash, tier, time window.
- **Does not control:** Account signature, bundler inclusion, or inner business logic.
- **Trusts:** Its own signing key and the encoding rules that match the deployed paymaster contract.
- **Produces:** **Paymaster fields** attached to the UserOp so EntryPoint + paymaster validation can succeed.

### Transport layer (Pimlico / other bundler)

- **Controls:** **Delivery**: simulation/gas estimation RPC, submission, receipt polling. May reject malformed ops or failing simulations.
- **Does not control:** Policy, delegation semantics, or paymaster cryptography.
- **Trusts:** JSON-RPC and its view of the chain.
- **Produces:** Inclusion or an error — **no semantic** “approval” of the business action.

### On-chain enforcement layer (EntryPoint + account + MDF)

- **EntryPoint:** Orchestrates **4337 validation** and execution ordering; **enforces** paymaster pairing and nonce semantics it understands.
- **Smart account (sender):** **Enforces** “is this UserOp valid for me?” (owner/session keys/module rules).
- **DelegationManager + enforcers (MDF only):** **Enforces** “does this redemption satisfy the signed delegation and caveats?” and drives execution from the **user’s** DeleGator account.

- **Controls:** **Final truth** for anything that must revert on-chain.
- **Does not control:** Off-chain policy or whether Aegis ever submits an op.
- **Trusts:** Cryptography and contract code.
- **Produces:** State changes or reverts.

---

## 2. “Who decides what” table

| Decision | Who decides | Enforced | Bypass? |
|----------|-------------|----------|---------|
| User consents to delegation | User (signature) | Off-chain verification at create/upgrade; MDF also on-chain at redeem | No — without consent, delegation record or redeem path is invalid |
| Agent is the intended delegate | Delegation record (agent address) | Policy + DB | No for delegated flows |
| Sponsorship is allowed this minute (protocol live, tier, limits, etc.) | Aegis policy | Off-chain | Only if someone disables policy or misconfigures — not by end users |
| Call target is acceptable to protocol | Policy + whitelist logic in orchestration | Off-chain | Same |
| Scope / value / time / budget (Aegis path) | Aegis policy (+ DB budget) | Off-chain | Users can’t bypass; operators could misconfigure |
| Scope / value / time / limits (MDF path) | Caveat enforcers | On-chain at redeem | Off-chain policy explicitly *defers* some checks; on-chain still gates |
| Delegation not revoked (MDF) | DelegationManager storage | On-chain (`isDelegationDisabled` read in policy + redeem) | Policy read can be wrong if hash/RPC wrong; **on-chain redeem is final** |
| UserOp is well-formed and payable | EntryPoint + paymaster contract + account | On-chain | No |
| Inner business call succeeds | Target contract + MDF flow | On-chain | No |

**Composable takeaway:** “Allowed” is often **two answers**: Aegis **may** sponsor (off-chain gate), and the chain **may** execute (on-chain gate). Both must succeed.

---

## 3. Runtime flow (mental model)

**Story, from consent to inclusion**

1. The **user** grants capability to an **agent address** — either by signing the Aegis delegation flow, or by signing an MDF struct and (later) upgrading the same logical delegation in Aegis to MDF mode.
2. **Aegis** stores that relationship so future runs can attach a **`delegationId`** to a sponsorship decision.
3. When work needs doing, something produces a **decision**: “sponsor this agent for this protocol, with this estimated cost and optional target.”
4. **Policy** runs first. It answers: “Are we even willing to try?” If no, nothing hits the chain.
5. **Orchestration** picks **inner calldata** (the real protocol call or a safe no-op like logger ping), then wraps it: either **`execute(...)`** on the sender account or **`redeemDelegations(...)`** that eventually performs the inner call from the user’s DeleGator (MDF).
6. **Nonce** is read from the **EntryPoint** view of the sender so the UserOp isn’t replayed or collided.
7. **Sponsorship** asks the paymaster signer: “Bind your approval to this exact sender, nonce, and **outer** `callData`.” The paymaster contract will check that binding on-chain.
8. **Bundler** packages and submits the UserOp; it’s a **messenger**, not a policy authority.
9. **Chain:** EntryPoint runs validation — account says OK, paymaster says OK — then execution. If MDF, **DelegationManager + enforcers** run during that execution and may revert if the inner action violates caveats.

**Where AEGIS vs MDF diverge**

| Stage | AEGIS path | MDF path |
|-------|------------|----------|
| After policy “delegation exists” | Policy also checks scope/value/time/budget against DB | Those checks are mostly **skipped** in policy; caveats are expected to enforce on-chain |
| Revocation | Primarily **DB status** | **On-chain** disabled flag matters; policy may pre-read it |
| Outer `callData` | `execute(target, value, inner)` | `redeemDelegations(...)` with encoded delegation + inner execution |
| Per-delegation gas budget | **Deducted in DB** after success | **Not** deducted that way; limits live in caveat / product design |
| Final authorization | **Aegis policy + DB** heavily involved | **Contracts** heavily involved at redeem |

The **sponsorship and bundler story is the same**; only **authorization shape and where it bites** changes.

---

## 4. Composability insight

**Why MDF does not break the paymaster**  
The paymaster commits to **hash(sender, nonce, callData, …)** — it does not parse `callData`. Whether `callData` is `execute` or `redeemDelegations` is irrelevant to that contract interface. Same wallet: different **payload**.

**Why Pimlico does not need to know about delegation**  
The bundler sees a **standard UserOp**: sender, callData, gas, paymaster fields. It simulates and forwards. Delegation semantics live **inside** `callData` (or entirely off-chain for Aegis path). No special Pimlico feature required.

**Why Aegis can support both delegation systems**  
Delegation is a **pluggable authorization story** in front of the same **sponsorship pipeline**. Orchestration chooses **how to build `callData`** based on stored mode; policy chooses **which off-chain checks apply**. The paymaster and bundler stay dumb pipes.

**Replaceability**  
- Swap bundler URL / provider → same ops, different transport.  
- Swap paymaster contract + signer schema → must match encoding, but still callData-agnostic.  
- Swap MDF deployment addresses → same code paths, different `verifyingContract` / manager.  
- Tight coupling to watch: **paymaster signing layout ↔ deployed paymaster** (must stay in lockstep).

**What breaks if you remove each piece**

| Remove | Effect |
|--------|--------|
| User consent / delegation | No legitimate delegated sponsorship tied to that user |
| Aegis policy | You can still submit UserOps if something drives the pipeline — but you lose **governance, safety, and business rules** (dangerous). |
| Orchestration / builder | No coherent UserOp; paymaster can’t sign meaningfully |
| Paymaster / signer | UserOp won’t pass paymaster validation; **no Aegis-sponsored gas** |
| Bundler | UserOp never reaches the chain (unless you use another submission path) |
| EntryPoint / chain | Nothing executes |
| MDF (conceptually) | Lose **on-chain caveat enforcement** path; Aegis-only delegation still possible |
| Aegis delegation (conceptually) | Lose **simple off-chain-scoped** model; MDF-only or no delegation |
| DelegationManager (MDF runtime) | MDF `callData` **reverts** — authorization layer missing |

---

## 5. Simplified system model (five buckets)

| Bucket | What it is | Maps to (conceptually) |
|--------|------------|---------------------------|
| **1. Permission system** | Who may cause what on behalf of whom | User consent; delegation record; Aegis vs MDF semantics; on-chain caveat enforcement |
| **2. Decision engine** | Should *we* attempt this sponsorship now? | Policy + protocol/budget state + (for MDF) revocation read |
| **3. Transaction builder** | What exact UserOp shape are we asking the chain to run? | Nonce + `callData` construction (`execute` vs `redeemDelegations`) + gas fields |
| **4. Gas sponsor** | Will *our* paymaster vouch for this op? | Paymaster signing + paymaster contract validation |
| **5. Execution layer** | What actually runs on-chain and succeeds or reverts? | EntryPoint, smart account, target contracts, DelegationManager + enforcers |

Everything else (DB, queues, IPFS, dashboards) **supports** these five; it doesn’t replace them.

---

## 6. Hackathon narrative (~30 seconds)

“Aegis lets agents run on-chain actions with **someone else paying gas**. The user **delegates** the agent once; **Aegis** runs safety and business rules before it signs its **paymaster** approval. The **bundler** is just delivery. Under the hood we support **two trust styles**: classic **Aegis-scoped** delegation checked in our policy layer, or **MetaMask’s delegation framework**, where **smart-contract caveats** enforce limits **on-chain** — same sponsorship pipe, stronger cryptographic enforcement where users want it.”

---

## 7. Final mental model (one paragraph)

**Aegis is a system where the *user* controls *whether and how an agent is authorized* (Aegis-signed permissions or MDF on-chain caveats), while *Aegis policy and economics* enforce *whether sponsorship is allowed to proceed*, and *the paymaster + EntryPoint + (for MDF) DelegationManager* ensure *only UserOps that match those commitments can execute and spend sponsored gas*.**

---

*End of second-layer document.*
