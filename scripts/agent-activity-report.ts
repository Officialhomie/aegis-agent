/**
 * Agent activity report: sponsorships, recent decisions, and critical alerts.
 *
 * Usage: npx tsx scripts/agent-activity-report.ts
 *        npx tsx scripts/agent-activity-report.ts --limit 20
 *
 * Requires: DATABASE_URL, and (optional) same state store as running agent for reserve state.
 */

import 'dotenv/config';
import { getPrisma } from '../src/lib/db';

const DEFAULT_DECISION_LIMIT = 30;

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith('--limit'));
  const limitNum = limitArg ? parseInt(limitArg.split('=')[1] ?? limitArg.split(' ')[1] ?? '0', 10) : DEFAULT_DECISION_LIMIT;
  const limit = Math.min(limitNum || DEFAULT_DECISION_LIMIT, 100);

  const db = getPrisma();

  // ---- 1. Sponsorships (actual executed SPONSOR_TRANSACTION) ----
  const allSponsorships = await db.sponsorshipRecord.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const sponsorshipsToday = allSponsorships.filter((r) => r.createdAt >= todayStart);

  console.log('\n========== SPONSORSHIPS (executed SPONSOR_TRANSACTION) ==========\n');
  if (allSponsorships.length === 0) {
    console.log('  No sponsorships yet. The agent has not executed any SPONSOR_TRANSACTION.');
    console.log('  Decisions may be WAIT (no eligible user), below confidence, or policy rejected.\n');
  } else {
    console.log(`  Total (all time): ${allSponsorships.length}`);
    console.log(`  Today:           ${sponsorshipsToday.length}\n`);
    allSponsorships.slice(0, 15).forEach((r, i) => {
      console.log(
        `  ${i + 1}. ${r.createdAt.toISOString()} | ${r.userAddress.slice(0, 10)}... | ${r.protocolId} | $${r.estimatedCostUSD} | tx: ${r.txHash ?? 'N/A'}`
      );
    });
    if (allSponsorships.length > 15) console.log(`  ... and ${allSponsorships.length - 15} more.\n`);
  }

  // ---- 2. Recent decisions (from Memory, type DECISION) ----
  const agentId = 'default-agent';
  const memories = await db.memory.findMany({
    where: { agentId, type: 'DECISION' },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  console.log('\n========== RECENT DECISIONS (last ' + limit + ') ==========\n');
  if (memories.length === 0) {
    console.log('  No decision memories in DB. Run the agent to populate.\n');
  } else {
    memories.forEach((m, i) => {
      const meta = (m.metadata as Record<string, unknown>) ?? {};
      const decision = meta.decision as { action?: string; confidence?: number } | undefined;
      const outcome = meta.outcome as Record<string, unknown> | undefined;
      const action = decision?.action ?? '?';
      const confidence = decision?.confidence ?? 0;
      const policyErrors = (meta.policyErrors as string[] | undefined) ?? [];
      const outcomeStr = outcome
        ? outcome.success !== undefined
          ? (outcome.success ? 'success' : 'failed')
          : outcome.error
            ? String(outcome.error).slice(0, 40)
            : '—'
        : '—';
      const ts = m.createdAt.toISOString();
      const extra =
        action === 'WAIT' ? '' : policyErrors.length ? ` | policy errors: ${policyErrors.length}` : ` | ${outcomeStr}`;
      console.log(`  ${i + 1}. ${ts} | ${action} | confidence ${confidence}${extra}`);
    });
    console.log('');
  }

  // ---- 3. Reserve state & critical alerts ----
  let reserveState: Awaited<ReturnType<typeof import('../src/lib/agent/state/reserve-state').getReserveState>> = null;
  try {
    const { getReserveState } = await import('../src/lib/agent/state/reserve-state');
    reserveState = await getReserveState();
  } catch (e) {
    console.log('  (Reserve state not available – state store may differ or not initialized.)\n');
  }

  console.log('\n========== RESERVE STATE & CRITICAL ALERTS ==========\n');
  if (reserveState) {
    console.log(`  ETH balance:        ${reserveState.ethBalance.toFixed(4)} ETH`);
    console.log(`  USDC balance:       ${reserveState.usdcBalance.toFixed(2)}`);
    console.log(`  Health score:       ${reserveState.healthScore}/100`);
    console.log(`  Runway:             ${reserveState.runwayDays.toFixed(1)} days`);
    console.log(`  Sponsorships (24h): ${reserveState.sponsorshipsLast24h}`);
    console.log(`  Emergency mode:     ${reserveState.emergencyMode ? 'YES – sponsorship halted' : 'No'}`);
    console.log(`  Critical threshold: ${reserveState.criticalThresholdETH} ETH`);
    if (reserveState.emergencyMode) {
      console.log('\n  ⚠️  CRITICAL: Emergency mode is ON. Fund the agent wallet to resume sponsorship.\n');
    }
  } else {
    console.log('  Reserve state: not available (run agent once to initialize, or check state store).\n');
  }

  console.log('========== WHAT TO WATCH IN LOGS ==========\n');
  console.log('  • [MultiMode] Policy rejected     → decision blocked by policy (see policyErrors)');
  console.log('  • [MultiMode] Below confidence   → decision not executed (confidence < threshold)');
  console.log('  • [Emergency] Mode changed       → emergencyMode toggled (reserves critical)');
  console.log('  • [CircuitBreaker] Health check failed → cycle skipped (e.g. reserve below critical)');
  console.log('  • [GasSponsorship] Skipping      → health score low or emergency mode');
  console.log('  • [ERC-8004] ensureAgentRegistered failed → agent wallet needs gas for registration');
  console.log('  • [Reason] Reserve pipeline reasoning failed → LLM/schema issue, fallback to WAIT\n');
}

main().catch((e) => {
  console.error('Report failed:', e);
  process.exit(1);
});
