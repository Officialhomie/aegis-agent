# Moltbook Heartbeat Change Specification

## Issue Summary

The current Moltbook heartbeat posts **treasury insights** (gas prices, ETH/USD, portfolio balances), which **do not reflect what Aegis actually does**. Aegis is a **gas sponsorship agent** that sponsors transactions for legitimate users on Base. The Moltbook posts should communicate this core purpose.

---

## Current Behavior (Problem)

**File:** `src/lib/agent/social/heartbeat.ts`

**Current post content:**
```
Aegis treasury update:

Gas: 0.001 Gwei (chain 8453)
ETH/USD: $2,400
Portfolio: ETH: 1.5, USDC: 5000

(autonomous agent, observe-reason-execute loop)
```

**Why this is misleading:**
1. Makes Aegis look like a treasury management bot
2. Does not mention sponsorships (the core purpose)
3. Does not provide value to the Moltbook community
4. Misrepresents the agent's identity and purpose

---

## Desired Behavior

**New post content: Sponsorship Activity Summaries**

Posts should summarize actual sponsorship activity:
```
Aegis Sponsorship Activity

Transactions sponsored: 12
Protocols served: 5 (Uniswap, Aave, Compound, ...)
Unique users helped: 8
Total gas saved: ~1.2M units
Total cost: $6.24

Active on Base | Autonomous gas sponsorship agent
```

---

## Files to Modify

### Primary File
**`src/lib/agent/social/heartbeat.ts`**

Replace `buildTreasuryInsight()` function with `buildActivitySummary()`:

1. Query `SponsorshipRecord` table for recent activity
2. Aggregate: count, unique users, unique protocols, total cost
3. Format as human-readable summary

### Supporting Changes

**`src/lib/agent/social/heartbeat.ts`**
- Import Prisma client
- Add function to fetch sponsorship stats
- Update log messages from "treasury" to "activity"

---

## Implementation Details

### Data Source

Query from `SponsorshipRecord` table:

```typescript
interface SponsorshipStats {
  totalSponsorships: number;
  uniqueUsers: number;
  uniqueProtocols: number;
  totalCostUSD: number;
  protocolNames: string[];
}
```

### Time Window Options

Choose one approach:

| Option | Period | Use Case |
|--------|--------|----------|
| A | Last 24 hours | Daily activity snapshot |
| B | Since last post | Delta since last Moltbook update |
| C | Cumulative all-time | Lifetime stats (simpler) |

**Recommendation:** Option A (24 hours) - provides consistent, comparable metrics.

### Post Title

Change from: `"Aegis Treasury Update"`
To: `"Aegis Sponsorship Activity"` or `"Aegis Activity Report"`

### Post Format

```typescript
function buildActivitySummary(stats: SponsorshipStats): string {
  const lines: string[] = [];

  lines.push('Aegis Sponsorship Activity (24h)');
  lines.push('');
  lines.push(`Transactions sponsored: ${stats.totalSponsorships}`);

  if (stats.uniqueProtocols > 0) {
    const protocolList = stats.protocolNames.slice(0, 3).join(', ');
    const more = stats.uniqueProtocols > 3 ? ` +${stats.uniqueProtocols - 3} more` : '';
    lines.push(`Protocols: ${stats.uniqueProtocols} (${protocolList}${more})`);
  }

  lines.push(`Unique users: ${stats.uniqueUsers}`);
  lines.push(`Total cost: $${stats.totalCostUSD.toFixed(2)}`);
  lines.push('');
  lines.push('Active on Base | Autonomous gas sponsorship agent');

  return lines.join('\n');
}
```

### Edge Case: No Activity

If no sponsorships in the time window:

```
Aegis Sponsorship Activity (24h)

No sponsorships in the last 24 hours.
Monitoring Base for eligible users...

Active on Base | Autonomous gas sponsorship agent
```

---

## Database Query

```typescript
import { prisma } from '../../prisma';

async function getSponsorshipStats(hoursBack = 24): Promise<SponsorshipStats> {
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

  const records = await prisma.sponsorshipRecord.findMany({
    where: {
      createdAt: { gte: since },
      txHash: { not: null }, // Only count executed sponsorships
    },
    select: {
      userAddress: true,
      protocolId: true,
      estimatedCostUSD: true,
    },
  });

  const uniqueUsers = new Set(records.map(r => r.userAddress)).size;
  const protocolSet = new Set(records.map(r => r.protocolId));
  const uniqueProtocols = protocolSet.size;
  const protocolNames = Array.from(protocolSet);
  const totalCostUSD = records.reduce((sum, r) => sum + r.estimatedCostUSD, 0);

  return {
    totalSponsorships: records.length,
    uniqueUsers,
    uniqueProtocols,
    totalCostUSD,
    protocolNames,
  };
}
```

---

## Code Changes Summary

### Remove

```typescript
// DELETE this function
function buildTreasuryInsight(observations: ...) { ... }
```

### Add

```typescript
// ADD these
import { prisma } from '../../prisma';

interface SponsorshipStats {
  totalSponsorships: number;
  uniqueUsers: number;
  uniqueProtocols: number;
  totalCostUSD: number;
  protocolNames: string[];
}

async function getSponsorshipStats(hoursBack = 24): Promise<SponsorshipStats> {
  // ... query implementation
}

function buildActivitySummary(stats: SponsorshipStats): string {
  // ... format implementation
}
```

### Modify

In `runMoltbookHeartbeat()`:

```typescript
// BEFORE
const observations = await observe();
const insight = buildTreasuryInsight(observations);
await postToMoltbook(submolt, 'Aegis Treasury Update', { content: insight });

// AFTER
const stats = await getSponsorshipStats(24);
const summary = buildActivitySummary(stats);
await postToMoltbook(submolt, 'Aegis Sponsorship Activity', { content: summary });
```

---

## Testing

1. **Unit test:** `buildActivitySummary()` with mock stats
2. **Integration test:** `getSponsorshipStats()` with test DB
3. **Manual test:** Run `runMoltbookHeartbeatNow()` and verify post on Moltbook

---

## Acceptance Criteria

- [ ] Moltbook posts show sponsorship activity, not treasury data
- [ ] Post includes: count, protocols, users, cost
- [ ] Edge case handled when no sponsorships exist
- [ ] Log messages updated from "treasury" to "activity"
- [ ] Documentation updated (FRONTEND_AND_VERIFYING_AGENT_ACTIVITY.md)

---

## Related Files

| File | Purpose |
|------|---------|
| `src/lib/agent/social/heartbeat.ts` | Heartbeat logic (PRIMARY CHANGE) |
| `src/lib/agent/social/moltbook.ts` | Moltbook API client (no changes needed) |
| `prisma/schema.prisma` | SponsorshipRecord model (reference only) |
| `docs/FRONTEND_AND_VERIFYING_AGENT_ACTIVITY.md` | Update after implementation |

---

## Priority

**HIGH** - Moltbook posts are public and currently misrepresent the agent's purpose.
