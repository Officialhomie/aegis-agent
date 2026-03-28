# Aegis Skills Implementation Plan

**Date:** 2026-02-23
**Status:** Draft - Awaiting Review
**Goal:** Integrate Agent Skills framework to enhance Aegis's AI decision-making capabilities

---

## Executive Summary

This plan integrates the **Agent Skills** framework (inspired by [ETHSkills](https://ethskills.com/) and [Anthropic's Skills](https://github.com/anthropics/skills)) into Aegis to:

1. **Enhance AI Decision-Making** - Give Aegis structured domain knowledge for better sponsorship decisions
2. **Enable External AI Agents** - Create an MCP (Model Context Protocol) server so any AI agent can interact with Aegis
3. **Make Policies Skill-Based** - Replace hardcoded policy rules with readable, maintainable skill modules

**Benefits:**
- Better gas estimation accuracy
- More transparent policy decisions
- Easy knowledge updates without code changes
- External AI agents can use Aegis programmatically

---

## Current State Analysis

### What Aegis Has Now

| Component | Current Implementation | Limitation |
|-----------|----------------------|------------|
| Policy Engine | Hardcoded rules in `sponsorship-rules.ts` | Difficult to update, opaque reasoning |
| Decision Making | LLM-based reasoning in orchestrator | No structured domain knowledge |
| Gas Estimation | Simple calculation in `paymaster.ts` | Lacks chain-specific context |
| Protocol Vetting | Basic database checks | No AI-assisted risk assessment |

### What Skills Would Add

| Component | With Skills | Benefit |
|-----------|-------------|---------|
| Policy Engine | Skill-based rules with clear explanations | Transparent, auditable decisions |
| Decision Making | Domain-specific skills (gas, security, SLA) | More accurate, context-aware |
| Gas Estimation | Multi-chain skill with L2 differences | Better cost predictions |
| Protocol Vetting | Security pattern matching skill | Automated risk detection |

---

## Phase 1: Skills Framework Foundation

### Objective
Create the infrastructure to load, parse, and execute Agent Skills within Aegis.

### 1.1 Directory Structure

```
src/lib/skills/
├── index.ts                    # Public exports
├── types.ts                    # Skill definition types
├── loader.ts                   # SKILL.md parser and loader
├── registry.ts                 # Skill registry and lookup
├── executor.ts                 # Execute skills in context
├── skills/                     # Skill definitions
│   ├── gas-estimation/
│   │   └── SKILL.md
│   ├── protocol-vetting/
│   │   └── SKILL.md
│   ├── sla-optimization/
│   │   └── SKILL.md
│   ├── agent-reputation/
│   │   └── SKILL.md
│   └── breach-detection/
│       └── SKILL.md
└── __tests__/
    ├── loader.test.ts
    └── executor.test.ts
```

### 1.2 Core Types

```typescript
// src/lib/skills/types.ts

export interface SkillMetadata {
  name: string;                    // Unique identifier (e.g., "aegis-gas-estimation")
  description: string;              // What this skill does and when to use it
  version?: string;                 // Semantic version
  author?: string;                  // Creator
  tags?: string[];                  // For categorization
}

export interface Skill {
  metadata: SkillMetadata;
  content: string;                  // Markdown instructions
  examples?: string[];              // Usage examples
  guidelines?: string[];            // Best practices
}

export interface SkillContext {
  agentWallet?: string;
  protocolId?: string;
  estimatedCostUSD?: number;
  currentGasPrice?: bigint;
  chainId?: number;
  guarantee?: any;                  // ExecutionGuarantee
  passport?: any;                   // GasPassport
}

export interface SkillExecutionResult {
  success: boolean;
  decision?: 'APPROVE' | 'REJECT' | 'ESCALATE';
  reasoning: string;
  confidence: number;               // 0-100
  appliedSkills: string[];          // List of skills used
  warnings?: string[];
  metadata?: Record<string, any>;
}
```

### 1.3 Skill Loader

```typescript
// src/lib/skills/loader.ts

import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

/**
 * Load a skill from a SKILL.md file
 */
export async function loadSkill(skillPath: string): Promise<Skill> {
  const content = fs.readFileSync(skillPath, 'utf-8');
  const { data, content: markdown } = matter(content);

  // Validate required fields
  if (!data.name || !data.description) {
    throw new Error(`Invalid skill: ${skillPath} missing name or description`);
  }

  return {
    metadata: {
      name: data.name,
      description: data.description,
      version: data.version,
      author: data.author,
      tags: data.tags || [],
    },
    content: markdown,
    examples: data.examples,
    guidelines: data.guidelines,
  };
}

/**
 * Load all skills from the skills directory
 */
export async function loadAllSkills(): Promise<Map<string, Skill>> {
  const skillsDir = path.join(__dirname, 'skills');
  const skills = new Map<string, Skill>();

  const skillDirs = fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory());

  for (const dir of skillDirs) {
    const skillPath = path.join(skillsDir, dir.name, 'SKILL.md');
    if (fs.existsSync(skillPath)) {
      const skill = await loadSkill(skillPath);
      skills.set(skill.metadata.name, skill);
    }
  }

  return skills;
}
```

### 1.4 Skill Registry

```typescript
// src/lib/skills/registry.ts

let skillRegistry: Map<string, Skill> | null = null;

/**
 * Initialize the skill registry (call on server startup)
 */
export async function initializeSkillRegistry(): Promise<void> {
  skillRegistry = await loadAllSkills();
  logger.info('[Skills] Loaded skills', { count: skillRegistry.size });
}

/**
 * Get a skill by name
 */
export function getSkill(name: string): Skill | null {
  if (!skillRegistry) {
    throw new Error('Skill registry not initialized');
  }
  return skillRegistry.get(name) ?? null;
}

/**
 * Get all skills matching tags
 */
export function getSkillsByTags(tags: string[]): Skill[] {
  if (!skillRegistry) {
    throw new Error('Skill registry not initialized');
  }

  return Array.from(skillRegistry.values()).filter(skill =>
    tags.some(tag => skill.metadata.tags?.includes(tag))
  );
}

/**
 * Reload skills (for hot-reloading in development)
 */
export async function reloadSkills(): Promise<void> {
  await initializeSkillRegistry();
}
```

---

## Phase 2: Initial Aegis Skills

### Objective
Create 5 core skills that enhance Aegis's decision-making capabilities.

### 2.1 Gas Estimation Skill

**File:** `src/lib/skills/skills/gas-estimation/SKILL.md`

```markdown
---
name: aegis-gas-estimation
description: Accurate gas cost estimation for multi-chain ERC-4337 UserOperations
version: 1.0.0
author: Aegis Team
tags: [gas, estimation, erc-4337, l2]
---

# Gas Estimation Skill

Estimate gas costs for ERC-4337 UserOperations across Ethereum mainnet and L2s.

## Key Principles

1. **Base Mainnet**: Highest gas costs, use as baseline
2. **L2s (Arbitrum, Optimism, Base)**: 10-100x cheaper than mainnet
3. **Account Abstraction Overhead**: ~40k-50k gas for bundler processing
4. **Buffer for Volatility**: Add 20-30% safety margin

## Estimation Formula

```
Total Cost = (Verification Gas + Execution Gas + Pre-verification Gas) × Gas Price × ETH/USD
```

### Chain-Specific Multipliers

- **Ethereum Mainnet**: 1.0x (baseline)
- **Base**: 0.01x (100x cheaper)
- **Arbitrum**: 0.02x (50x cheaper)
- **Optimism**: 0.015x (67x cheaper)

### Gas Components

1. **Verification Gas**: 50,000-150,000 gas (validate signature, check balance)
2. **Execution Gas**: Variable (depends on transaction complexity)
3. **Pre-verification Gas**: 21,000-50,000 gas (bundler overhead)

## Examples

### Example 1: Simple Transfer on Base
```
Verification: 100,000 gas
Execution: 21,000 gas
Pre-verification: 30,000 gas
Total: 151,000 gas

Base Gas Price: 0.001 gwei
Cost: 151,000 × 0.001 gwei = 0.000151 ETH
At $2500 ETH: $0.000377
```

### Example 2: Complex Swap on Mainnet
```
Verification: 120,000 gas
Execution: 200,000 gas
Pre-verification: 40,000 gas
Total: 360,000 gas

Mainnet Gas Price: 20 gwei
Cost: 360,000 × 20 gwei = 7,200,000 gwei = 0.0072 ETH
At $2500 ETH: $18.00
```

## Guidelines

1. Always fetch current gas prices from RPC
2. Add 30% buffer for estimation safety
3. Reject if gas price >100 gwei on mainnet (likely spam/attack)
4. For L2s, use optimistic estimation (lower bound)
5. Check guarantee constraints before approving

## Red Flags

- Gas price >200 gwei (potential attack)
- Execution gas >1M (suspiciously complex)
- Cost >$100 for simple transfer (likely misconfigured)
```

### 2.2 Protocol Vetting Skill

**File:** `src/lib/skills/skills/protocol-vetting/SKILL.md`

```markdown
---
name: aegis-protocol-vetting
description: Security and risk assessment for protocols requesting sponsorship
version: 1.0.0
author: Aegis Team
tags: [security, protocol, vetting, risk]
---

# Protocol Vetting Skill

Evaluate protocol safety and trustworthiness before approving sponsorship.

## Risk Categories

### 🟢 LOW RISK (Approve)
- Established protocol (>6 months old)
- Verified contracts on Etherscan
- Large TVL (>$1M)
- Active community and audits

### 🟡 MEDIUM RISK (Review)
- New protocol (<6 months)
- Unverified contracts
- Small TVL (<$100k)
- Limited audit history

### 🔴 HIGH RISK (Reject)
- Anonymous team
- No contract verification
- Suspicious patterns (honeypot indicators)
- Recent security incidents

## Vetting Checklist

1. **Contract Verification**
   - [ ] All contracts verified on Etherscan
   - [ ] Source code matches deployment
   - [ ] No proxy upgrade risks

2. **Security Audit**
   - [ ] Audited by reputable firm (OpenZeppelin, Trail of Bits, Consensys)
   - [ ] Audit <12 months old
   - [ ] Critical issues resolved

3. **Financial Health**
   - [ ] TVL >$100k
   - [ ] Active daily volume
   - [ ] No suspicious drain events

4. **Reputation**
   - [ ] Known team or established DAO
   - [ ] Active GitHub/Discord
   - [ ] No scam reports

## Examples

### Example 1: Uniswap (LOW RISK)
- ✅ Verified contracts
- ✅ Multiple audits
- ✅ $4B+ TVL
- ✅ 4+ years operating
- **Decision:** APPROVE

### Example 2: New DEX (MEDIUM RISK)
- ✅ Verified contracts
- ⚠️ No audit
- ⚠️ $50k TVL
- ⚠️ 2 months old
- **Decision:** ESCALATE (manual review)

### Example 3: Anonymous Fork (HIGH RISK)
- ❌ Unverified contracts
- ❌ No audit
- ❌ Anonymous team
- ❌ Copied code
- **Decision:** REJECT

## Guidelines

1. Default to REJECT if any critical red flag
2. Escalate to manual review if unsure
3. Whitelist approved protocols for faster processing
4. Re-vet protocols every 6 months
```

### 2.3 SLA Optimization Skill

**File:** `src/lib/skills/skills/sla-optimization/SKILL.md`

```markdown
---
name: aegis-sla-optimization
description: Recommend optimal guarantee tier based on agent needs and network conditions
version: 1.0.0
author: Aegis Team
tags: [sla, guarantees, optimization]
---

# SLA Optimization Skill

Recommend the best execution guarantee tier for an agent's needs.

## Tier Selection Matrix

| Use Case | Recommended Tier | Reasoning |
|----------|------------------|-----------|
| MEV Bot | GOLD | Time-critical, needs 99% <2min |
| Trading Bot | SILVER | Important but tolerates 5min |
| Batch Operations | BRONZE | Not time-sensitive, save premium |
| Manual Transactions | SILVER | User expects fast confirmation |

## Decision Factors

### 1. Latency Sensitivity
- **Critical (<30s)**: GOLD (99% in 2min)
- **Important (<5min)**: SILVER (95% in 5min)
- **Flexible (>5min)**: BRONZE (best effort)

### 2. Budget Constraints
- **Premium matters**: BRONZE (0% premium)
- **Balanced**: SILVER (15% premium)
- **Performance critical**: GOLD (30% premium)

### 3. Agent Reputation
- **WHALE/PREMIUM tier**: Recommend GOLD
- **TRUSTED tier**: Recommend SILVER
- **NEWCOMER**: Recommend BRONZE (build history first)

### 4. Network Conditions
- **High congestion**: GOLD (pay for priority)
- **Normal**: SILVER (balanced)
- **Low congestion**: BRONZE (no rush)

## Examples

### Example 1: DEX Arbitrage Bot
```
Profile:
- Agent Tier: PREMIUM
- Use Case: MEV arbitrage
- Latency Need: <30 seconds
- Budget: High value trades ($1000+)

Recommendation: GOLD
Reasoning: Time-critical MEV requires fastest execution.
Premium (30%) worth it for competitive advantage.
```

### Example 2: NFT Minting Bot
```
Profile:
- Agent Tier: ACTIVE
- Use Case: Batch minting
- Latency Need: <5 minutes
- Budget: Moderate ($50/mint)

Recommendation: SILVER
Reasoning: Important to mint before sellout, but not MEV-critical.
15% premium acceptable for 95% success rate.
```

### Example 3: Portfolio Rebalancing
```
Profile:
- Agent Tier: TRUSTED
- Use Case: Monthly rebalance
- Latency Need: Within same day
- Budget: Low priority

Recommendation: BRONZE
Reasoning: Not time-sensitive, can wait for low gas.
Save premium for more critical operations.
```

## Guidelines

1. Default to SILVER for unknown use cases (balanced)
2. Upgrade to GOLD if agent explicitly requests speed
3. Downgrade to BRONZE if network is quiet (<10 gwei)
4. Consider agent's passport tier in recommendation
```

### 2.4 Agent Reputation Skill

**File:** `src/lib/skills/skills/agent-reputation/SKILL.md`

```markdown
---
name: aegis-agent-reputation
description: Compute trust scores from on-chain sponsorship history
version: 1.0.0
author: Aegis Team
tags: [reputation, passport, trust, risk]
---

# Agent Reputation Skill

Evaluate agent trustworthiness based on Gas Passport metrics.

## Trust Score Formula

```
Trust Score = (Success Rate × 40%) +
              (Consistency × 20%) +
              (Protocol Diversity × 20%) +
              (Recency × 10%) +
              (Volume × 10%)
```

### Component Weights

1. **Success Rate (40%)**: Most important - do transactions succeed?
2. **Consistency (20%)**: Regular usage vs burst patterns
3. **Protocol Diversity (20%)**: Single protocol vs ecosystem participant
4. **Recency (10%)**: Active recently vs dormant
5. **Volume (10%)**: Total sponsored value

## Tier Thresholds

| Tier | Trust Score | Criteria |
|------|-------------|----------|
| WHALE | 90-100 | >$10k volume + PREMIUM criteria |
| PREMIUM | 85-100 | 200+ txs, 95%+ success, 5+ protocols |
| TRUSTED | 70-85 | 50+ txs, 90%+ success, 3+ protocols |
| ACTIVE | 50-70 | 5+ txs, 80%+ success |
| NEWCOMER | 0-50 | <5 txs or new account |
| FLAGGED | N/A | Red flags present |

## Red Flags (Auto-Flag)

- **HIGH_FAILURE_RATE**: >20% transactions fail
- **BURST_PATTERN**: >80% txs within 1-hour windows
- **UNUSUAL_TIMING**: Peak activity 2-5 AM UTC
- **VALUE_ANOMALY**: Max value >10x average
- **ASSOCIATED_BLOCK**: Linked to blocked wallets

## Examples

### Example 1: Established Trading Bot
```
Metrics:
- Success Rate: 98% (200/204 txs)
- Consistency: 0.15 (low variance)
- Protocol Diversity: 0.82 (8 protocols)
- Recency: 2 days since last
- Volume: $5,420

Calculation:
Trust = (0.98 × 40) + (0.85 × 20) + (0.82 × 20) + (0.95 × 10) + (0.70 × 10)
Trust = 39.2 + 17 + 16.4 + 9.5 + 7 = 89.1

Tier: PREMIUM
Decision: APPROVE with high confidence
```

### Example 2: New Agent
```
Metrics:
- Success Rate: 100% (3/3 txs)
- Consistency: N/A (insufficient data)
- Protocol Diversity: 0.0 (1 protocol)
- Recency: Today
- Volume: $12

Trust = (1.0 × 40) + (0.5 × 20) + (0.0 × 20) + (1.0 × 10) + (0.01 × 10)
Trust = 40 + 10 + 0 + 10 + 0.1 = 60.1

Tier: NEWCOMER
Decision: APPROVE but with limits
```

### Example 3: Suspicious Pattern
```
Metrics:
- Success Rate: 85% (170/200 txs)
- Consistency: 0.9 (high variance - burst pattern)
- Protocol Diversity: 0.1 (1 protocol)
- Recency: Today
- Volume: $2,200

Red Flags:
- BURST_PATTERN (95% txs in 3-hour windows)
- UNUSUAL_TIMING (peak at 3 AM UTC)

Tier: FLAGGED
Decision: ESCALATE for manual review
```

## Guidelines

1. Always check for red flags first
2. Minimum 5 transactions for reliable score
3. Re-compute score after every 10 transactions
4. Upgrade tier automatically when thresholds crossed
5. Manual review required to clear FLAGGED status
```

### 2.5 Breach Detection Skill

**File:** `src/lib/skills/skills/breach-detection/SKILL.md`

```markdown
---
name: aegis-breach-detection
description: Early detection of SLA breach patterns and preventive actions
version: 1.0.0
author: Aegis Team
tags: [sla, breach, monitoring, prevention]
---

# Breach Detection Skill

Detect SLA breach patterns early and take preventive action.

## Breach Types

### 1. Latency Breach
**Definition**: Execution takes longer than maxLatencyMs

**Common Causes**:
- Network congestion (gas price spike)
- Bundler backlog
- RPC provider slow response
- Chain reorg delays

**Prevention**:
- Monitor gas prices, pause if >100 gwei
- Switch to backup bundler if primary is slow
- Increase gas price by 10% if queue is long

### 2. Execution Failure
**Definition**: Transaction reverts or is dropped

**Common Causes**:
- Insufficient guarantee capacity
- Gas price too low (transaction dropped)
- Contract error (slippage, access control)
- Nonce conflicts

**Prevention**:
- Pre-validate contract call
- Check guarantee remaining budget
- Simulate transaction before submitting

### 3. Budget Overrun
**Definition**: Cost exceeds estimate by >30%

**Common Causes**:
- Gas price spike during execution
- Complex contract interaction (loops, storage)
- L2 fee spikes (base fee + L1 data cost)

**Prevention**:
- Set maxGasPrice on guarantee
- Reject if estimate variance is high
- Monitor L2 fee history

## Pattern Detection

### Early Warning Indicators

1. **Increasing Latency Trend**
   - Last 3 executions took 80%+ of maxLatency
   - **Action**: Alert protocol, recommend capacity increase

2. **Rising Failure Rate**
   - >10% failures in last 20 transactions
   - **Action**: Pause guarantee, investigate root cause

3. **Budget Depletion Approaching**
   - >90% of budget used with >3 days remaining
   - **Action**: Alert protocol to top up or reduce usage

4. **Gas Price Volatility**
   - Gas price >50% above historical average
   - **Action**: Temporarily increase safety buffer

## Refund Calculation

### SILVER Tier (50% refund on breach)
```
Breach Cost: $10
Refund: $10 × 50% = $5
```

### GOLD Tier (100% refund on breach)
```
Breach Cost: $15
Refund: $15 × 100% = $15
```

### Auto-Refund Threshold
- <$100: Automatic refund
- ≥$100: Manual review required

## Examples

### Example 1: Latency Breach (GOLD)
```
Guarantee: GOLD (99% in 2 min)
Submitted: 10:00:00
Included: 10:03:15
Latency: 195 seconds (3min 15sec)

Breach: YES (exceeded 120s limit)
Cost: $25
Refund: $25 × 100% = $25 (auto-approved, <$100)
```

### Example 2: Multiple Breaches (Pattern)
```
Last 5 Executions:
1. 115s - OK
2. 118s - OK
3. 125s - BREACH (5s over)
4. 130s - BREACH (10s over)
5. 140s - BREACH (20s over)

Pattern: Increasing latency trend
Action: Alert protocol + investigate bundler performance
Recommendation: Switch to backup bundler or reduce load
```

### Example 3: Budget Overrun
```
Estimated: $5.00
Actual: $8.50
Variance: 70% (exceeds 30% threshold)

Root Cause: Gas price spike (20 gwei → 40 gwei)
Classification: Not a breach (external factor)
Action: Record variance, adjust future estimates
```

## Guidelines

1. Monitor all active guarantees every 5 minutes
2. Alert protocol if depletion >80% before expiry
3. Auto-pause guarantee if failure rate >15%
4. Investigate if same agent breaches >3 times
5. Refund within 1 hour for auto-approved breaches
```

---

## Phase 3: Skill-Based Policy Engine Integration

### Objective
Replace hardcoded policy rules with skill-based decision making.

### 3.1 Skill Executor

```typescript
// src/lib/skills/executor.ts

import { getSkill } from './registry';
import { Skill, SkillContext, SkillExecutionResult } from './types';
import { logger } from '../logger';

/**
 * Execute a skill with the given context
 */
export async function executeSkill(
  skillName: string,
  context: SkillContext
): Promise<SkillExecutionResult> {
  const skill = getSkill(skillName);

  if (!skill) {
    throw new Error(`Skill not found: ${skillName}`);
  }

  logger.info('[Skills] Executing skill', { skillName, context });

  // In a real implementation, this would:
  // 1. Format the skill content as a prompt
  // 2. Include the context as variables
  // 3. Send to LLM for reasoning
  // 4. Parse the LLM response into SkillExecutionResult

  // For now, return a placeholder
  return {
    success: true,
    decision: 'APPROVE',
    reasoning: `Executed ${skillName} successfully`,
    confidence: 85,
    appliedSkills: [skillName],
  };
}

/**
 * Execute multiple skills and combine results
 */
export async function executeSkillChain(
  skillNames: string[],
  context: SkillContext
): Promise<SkillExecutionResult> {
  const results: SkillExecutionResult[] = [];

  for (const skillName of skillNames) {
    const result = await executeSkill(skillName, context);
    results.push(result);

    // If any skill rejects, return immediately
    if (result.decision === 'REJECT') {
      return result;
    }
  }

  // Combine all results
  return {
    success: true,
    decision: results.some(r => r.decision === 'ESCALATE') ? 'ESCALATE' : 'APPROVE',
    reasoning: results.map(r => r.reasoning).join('\n'),
    confidence: Math.min(...results.map(r => r.confidence)),
    appliedSkills: results.flatMap(r => r.appliedSkills),
  };
}
```

### 3.2 Integrate with Policy Engine

```typescript
// src/lib/agent/policy/skill-based-rules.ts

import { executeSkillChain } from '../../skills/executor';
import { Decision } from '../reason/schemas';
import { logger } from '../../logger';

/**
 * Skill-based sponsorship validation
 */
export async function validateWithSkills(decision: Decision): Promise<{
  approved: boolean;
  reasoning: string;
  appliedSkills: string[];
}> {
  const params = decision.parameters as SponsorParams;

  // Build context from decision
  const context = {
    agentWallet: params.agentWallet,
    protocolId: params.protocolId,
    estimatedCostUSD: params.estimatedCostUSD,
    currentGasPrice: getCurrentGasPriceWei(),
  };

  // Select skills to apply based on decision type
  const skills = [
    'aegis-gas-estimation',      // Validate gas estimate
    'aegis-agent-reputation',    // Check agent trust score
    'aegis-protocol-vetting',    // Verify protocol safety
  ];

  // Execute skill chain
  const result = await executeSkillChain(skills, context);

  logger.info('[Policy] Skill-based validation complete', {
    decision: result.decision,
    confidence: result.confidence,
    skills: result.appliedSkills,
  });

  return {
    approved: result.decision === 'APPROVE',
    reasoning: result.reasoning,
    appliedSkills: result.appliedSkills,
  };
}
```

---

## Phase 4: MCP Server for External AI Agents

### Objective
Enable any AI agent (Claude, GPT, custom agents) to interact with Aegis via Model Context Protocol.

### 4.1 MCP Server Implementation

```typescript
// src/lib/skills/mcp/server.ts

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { aegisTools } from './tools';

/**
 * Aegis MCP Server
 *
 * Exposes Aegis capabilities to external AI agents via MCP protocol.
 */
export class AegisMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'aegis-agent',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: aegisTools,
    }));

    // Execute tool
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'request_sponsorship':
          return await this.requestSponsorship(args);
        case 'check_guarantee_capacity':
          return await this.checkGuaranteeCapacity(args);
        case 'get_protocol_policy':
          return await this.getProtocolPolicy(args);
        case 'estimate_gas_cost':
          return await this.estimateGasCost(args);
        case 'get_agent_passport':
          return await this.getAgentPassport(args);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log('Aegis MCP Server running on stdio');
  }

  // Tool implementations
  private async requestSponsorship(args: any) {
    // Call Aegis sponsorship API
    // Return result in MCP format
  }

  private async checkGuaranteeCapacity(args: any) {
    // Query guarantee status
  }

  private async getProtocolPolicy(args: any) {
    // Fetch protocol configuration
  }

  private async estimateGasCost(args: any) {
    // Use gas-estimation skill
  }

  private async getAgentPassport(args: any) {
    // Fetch Gas Passport data
  }
}

// Start server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new AegisMCPServer();
  server.start();
}
```

### 4.2 Tool Definitions

```typescript
// src/lib/skills/mcp/tools.ts

export const aegisTools = [
  {
    name: 'request_sponsorship',
    description: 'Request gas sponsorship for an ERC-4337 UserOperation',
    inputSchema: {
      type: 'object',
      properties: {
        agentWallet: { type: 'string', description: 'Agent wallet address' },
        protocolId: { type: 'string', description: 'Protocol identifier' },
        targetContract: { type: 'string', description: 'Target contract address' },
        estimatedCostUSD: { type: 'number', description: 'Estimated cost in USD' },
        maxGasLimit: { type: 'number', description: 'Maximum gas limit' },
      },
      required: ['agentWallet', 'protocolId', 'estimatedCostUSD'],
    },
  },
  {
    name: 'check_guarantee_capacity',
    description: 'Check remaining capacity of an execution guarantee',
    inputSchema: {
      type: 'object',
      properties: {
        agentWallet: { type: 'string', description: 'Agent wallet address' },
        protocolId: { type: 'string', description: 'Protocol identifier' },
      },
      required: ['agentWallet', 'protocolId'],
    },
  },
  {
    name: 'get_protocol_policy',
    description: 'Get policy configuration for a protocol',
    inputSchema: {
      type: 'object',
      properties: {
        protocolId: { type: 'string', description: 'Protocol identifier' },
      },
      required: ['protocolId'],
    },
  },
  {
    name: 'estimate_gas_cost',
    description: 'Estimate gas cost for a transaction across chains',
    inputSchema: {
      type: 'object',
      properties: {
        chainId: { type: 'number', description: 'Chain ID' },
        txData: { type: 'string', description: 'Transaction calldata' },
        gasLimit: { type: 'number', description: 'Gas limit' },
      },
      required: ['chainId', 'txData'],
    },
  },
  {
    name: 'get_agent_passport',
    description: 'Get Gas Passport reputation data for an agent',
    inputSchema: {
      type: 'object',
      properties: {
        agentWallet: { type: 'string', description: 'Agent wallet address' },
      },
      required: ['agentWallet'],
    },
  },
];
```

---

## Testing Strategy

### Unit Tests

```typescript
// src/lib/skills/__tests__/loader.test.ts

describe('Skill Loader', () => {
  it('should load skill from SKILL.md file', async () => {
    const skill = await loadSkill('skills/gas-estimation/SKILL.md');
    expect(skill.metadata.name).toBe('aegis-gas-estimation');
    expect(skill.content).toContain('Gas Estimation Skill');
  });

  it('should throw error for invalid skill', async () => {
    await expect(loadSkill('invalid.md')).rejects.toThrow();
  });

  it('should load all skills from directory', async () => {
    const skills = await loadAllSkills();
    expect(skills.size).toBeGreaterThan(0);
    expect(skills.has('aegis-gas-estimation')).toBe(true);
  });
});
```

### Integration Tests

```typescript
// src/lib/skills/__tests__/executor.test.ts

describe('Skill Executor', () => {
  beforeAll(async () => {
    await initializeSkillRegistry();
  });

  it('should execute gas estimation skill', async () => {
    const context = {
      agentWallet: '0x1234...',
      estimatedCostUSD: 5.0,
      currentGasPrice: BigInt(20000000000), // 20 gwei
    };

    const result = await executeSkill('aegis-gas-estimation', context);
    expect(result.success).toBe(true);
    expect(result.appliedSkills).toContain('aegis-gas-estimation');
  });

  it('should execute skill chain', async () => {
    const context = {
      agentWallet: '0x1234...',
      protocolId: 'test-protocol',
      estimatedCostUSD: 10.0,
    };

    const skills = [
      'aegis-gas-estimation',
      'aegis-agent-reputation',
      'aegis-protocol-vetting',
    ];

    const result = await executeSkillChain(skills, context);
    expect(result.appliedSkills.length).toBe(3);
  });
});
```

---

## Implementation Timeline

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| **Phase 1** | 1 week | Skills framework (loader, registry, executor) |
| **Phase 2** | 2 weeks | 5 core skills (gas, protocol, SLA, reputation, breach) |
| **Phase 3** | 1 week | Policy engine integration |
| **Phase 4** | 1 week | MCP server for external agents |
| **Testing** | 1 week | Unit + integration tests |
| **Total** | 6 weeks | Full skills system operational |

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Gas Estimation Accuracy | >95% within 20% of actual | Compare estimates to actual costs |
| Policy Decision Speed | <500ms per request | Measure skill execution time |
| Skill Coverage | 80% of policy rules | Track % of decisions using skills |
| External Agent Adoption | 3+ AI agents using MCP | Count unique MCP clients |
| Knowledge Update Frequency | Weekly skill updates | Track skill version bumps |

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| LLM hallucination in skills | HIGH | Add validation checks, human review for critical decisions |
| Slow skill execution | MEDIUM | Cache skill content, optimize prompt size |
| Skill conflicts | MEDIUM | Define clear precedence rules, skill compatibility matrix |
| MCP security | HIGH | Require API key auth, rate limiting, audit logs |
| Skill maintenance burden | LOW | Community contributions, automated testing |

---

## Next Steps (After Review)

1. **Review this plan** - Please read through and provide feedback
2. **Clarify requirements** - Any changes or additions?
3. **Approve phases** - Which phases should we implement first?
4. **Begin implementation** - Start with Phase 1 (skills framework)

---

## Questions for Discussion

1. **LLM Integration**: Should skills call an LLM (Claude/GPT) for reasoning, or use rule-based logic?
2. **Skill Format**: Is the SKILL.md markdown format sufficient, or do we need executable code?
3. **MCP Priority**: Is the MCP server a must-have for v1, or can it wait for v2?
4. **Skill Authorship**: Should protocols be able to create custom skills for their own policies?
5. **Versioning**: How do we handle skill updates without breaking existing integrations?

---

**Status:** Awaiting review and feedback before implementation.
