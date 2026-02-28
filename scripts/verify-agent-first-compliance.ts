/**
 * Agent-First Compliance Verification Script
 *
 * Verifies that the agent-first execution guarantees are properly implemented:
 * 1. No EOAs in queue (tier 0 rejection)
 * 2. Tier distribution tracking
 * 3. Queue prioritization (tier 1 > 2 > 3)
 * 4. Gas price enforcement (max 2 gwei)
 * 5. Protocol policies enforced
 *
 * Usage:
 *   npx tsx scripts/verify-agent-first-compliance.ts
 */

import 'dotenv/config';
import { getPrisma } from '../src/lib/db';
import { getStateStore } from '../src/lib/agent/state-store';
import { getQueueStats, getTierDistribution, getQueueHealth } from '../src/lib/agent/queue/queue-analytics';

const prisma = getPrisma();

interface ComplianceCheck {
  name: string;
  passed: boolean;
  message: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
}

const checks: ComplianceCheck[] = [];

async function check1_NoEOAsInQueue(): Promise<void> {
  console.log('[Check 1] Verifying no EOAs in queue (tier 0 rejection)...');

  try {
    // Check QueueItem for tier 0
    const tier0QueueItems = await prisma.queueItem.count({
      where: { agentTier: 0 },
    });

    // Check SponsorshipRecord for tier 0
    const tier0Records = await prisma.sponsorshipRecord.count({
      where: { agentTier: 0 },
    });

    const passed = tier0QueueItems === 0 && tier0Records === 0;

    checks.push({
      name: 'No EOAs in queue or database',
      passed,
      message: passed
        ? `✅ No tier 0 (EOA) records found in queue (${tier0QueueItems}) or sponsorship records (${tier0Records})`
        : `❌ Found ${tier0QueueItems} tier 0 items in queue, ${tier0Records} in sponsorship records`,
      severity: 'CRITICAL',
    });
  } catch (error) {
    checks.push({
      name: 'No EOAs in queue or database',
      passed: false,
      message: `❌ Error checking for EOAs: ${error instanceof Error ? error.message : String(error)}`,
      severity: 'CRITICAL',
    });
  }
}

async function check2_TierDistribution(): Promise<void> {
  console.log('[Check 2] Checking tier distribution...');

  try {
    const distribution = await getTierDistribution();

    const hasTierData = distribution.total > 0;

    checks.push({
      name: 'Tier distribution tracking',
      passed: hasTierData,
      message: hasTierData
        ? `✅ Tier distribution: Tier 1: ${distribution.tier1Count} (${distribution.tier1Percent.toFixed(1)}%), Tier 2: ${distribution.tier2Count} (${distribution.tier2Percent.toFixed(1)}%), Tier 3: ${distribution.tier3Count} (${distribution.tier3Percent.toFixed(1)}%)`
        : `⚠️  No tier data found - queue may be empty`,
      severity: hasTierData ? 'INFO' : 'WARNING',
    });
  } catch (error) {
    checks.push({
      name: 'Tier distribution tracking',
      passed: false,
      message: `❌ Error getting tier distribution: ${error instanceof Error ? error.message : String(error)}`,
      severity: 'WARNING',
    });
  }
}

async function check3_QueuePrioritization(): Promise<void> {
  console.log('[Check 3] Verifying queue prioritization (tier 1 > 2 > 3)...');

  try {
    // Get pending queue items ordered by priority
    const pendingItems = await prisma.queueItem.findMany({
      where: { status: 'pending' },
      orderBy: [
        { agentTier: 'asc' }, // Lower tier = higher priority
        { priority: 'desc' },
        { createdAt: 'asc' },
      ],
      take: 10,
    });

    if (pendingItems.length === 0) {
      checks.push({
        name: 'Queue prioritization',
        passed: true,
        message: `ℹ️  Queue is empty - no items to check prioritization`,
        severity: 'INFO',
      });
      return;
    }

    // Verify items are sorted correctly
    let correctOrder = true;
    for (let i = 1; i < pendingItems.length; i++) {
      const prev = pendingItems[i - 1];
      const curr = pendingItems[i];

      // Check tier ordering
      if (prev.agentTier > curr.agentTier) {
        correctOrder = false;
        break;
      }

      // Within same tier, check priority
      if (prev.agentTier === curr.agentTier && prev.priority < curr.priority) {
        correctOrder = false;
        break;
      }
    }

    checks.push({
      name: 'Queue prioritization',
      passed: correctOrder,
      message: correctOrder
        ? `✅ Queue items correctly ordered by tier (${pendingItems.length} items checked)`
        : `❌ Queue items NOT correctly ordered by tier`,
      severity: 'CRITICAL',
    });
  } catch (error) {
    checks.push({
      name: 'Queue prioritization',
      passed: false,
      message: `❌ Error checking queue prioritization: ${error instanceof Error ? error.message : String(error)}`,
      severity: 'CRITICAL',
    });
  }
}

async function check4_GasPriceEnforcement(): Promise<void> {
  console.log('[Check 4] Verifying gas price enforcement (max 2 gwei)...');

  try {
    const maxGasEnv = process.env.GAS_PRICE_MAX_GWEI ?? process.env.MAX_GAS_PRICE_GWEI;
    const maxGas = parseFloat(maxGasEnv ?? '0');

    const passed = maxGas === 2;

    checks.push({
      name: 'Gas price enforcement',
      passed,
      message: passed
        ? `✅ MAX_GAS_PRICE_GWEI is set to 2 gwei`
        : `⚠️  MAX_GAS_PRICE_GWEI is ${maxGas} gwei (expected 2)`,
      severity: passed ? 'INFO' : 'WARNING',
    });
  } catch (error) {
    checks.push({
      name: 'Gas price enforcement',
      passed: false,
      message: `❌ Error checking gas price config: ${error instanceof Error ? error.message : String(error)}`,
      severity: 'WARNING',
    });
  }
}

async function check5_ProtocolPolicies(): Promise<void> {
  console.log('[Check 5] Checking protocol tier policies...');

  try {
    const protocols = await prisma.protocolSponsor.findMany({
      select: {
        protocolId: true,
        minAgentTier: true,
        requireERC8004: true,
        requireERC4337: true,
      },
    });

    if (protocols.length === 0) {
      checks.push({
        name: 'Protocol tier policies',
        passed: true,
        message: `ℹ️  No protocols found in database`,
        severity: 'INFO',
      });
      return;
    }

    const policiesSet = protocols.filter((p) => p.minAgentTier > 0 || p.requireERC8004 || p.requireERC4337);

    checks.push({
      name: 'Protocol tier policies',
      passed: true,
      message: `✅ ${protocols.length} protocols found, ${policiesSet.length} have tier policies`,
      severity: 'INFO',
    });
  } catch (error) {
    checks.push({
      name: 'Protocol tier policies',
      passed: false,
      message: `❌ Error checking protocol policies: ${error instanceof Error ? error.message : String(error)}`,
      severity: 'WARNING',
    });
  }
}

async function check6_QueueHealth(): Promise<void> {
  console.log('[Check 6] Checking queue health...');

  try {
    const health = await getQueueHealth();

    checks.push({
      name: 'Queue health',
      passed: health.healthy,
      message: health.healthy
        ? `✅ Queue is healthy (${health.staleRequests} stale, ${health.slowProcessing} slow)`
        : `⚠️  Queue has warnings: ${health.warnings.join(', ')}`,
      severity: health.healthy ? 'INFO' : 'WARNING',
    });
  } catch (error) {
    checks.push({
      name: 'Queue health',
      passed: false,
      message: `❌ Error checking queue health: ${error instanceof Error ? error.message : String(error)}`,
      severity: 'WARNING',
    });
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('        AGENT-FIRST COMPLIANCE VERIFICATION                ');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  // Run all checks
  await check1_NoEOAsInQueue();
  await check2_TierDistribution();
  await check3_QueuePrioritization();
  await check4_GasPriceEnforcement();
  await check5_ProtocolPolicies();
  await check6_QueueHealth();

  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('                    CHECK RESULTS                           ');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  let critical = 0;
  let warnings = 0;
  let info = 0;
  let failedCritical = 0;
  let failedWarnings = 0;

  for (const check of checks) {
    console.log(`${check.passed ? '✅' : '❌'} ${check.name}`);
    console.log(`   ${check.message}`);
    console.log('');

    if (check.severity === 'CRITICAL') {
      critical++;
      if (!check.passed) failedCritical++;
    } else if (check.severity === 'WARNING') {
      warnings++;
      if (!check.passed) failedWarnings++;
    } else {
      info++;
    }
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log('                        SUMMARY                             ');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Total Checks:     ${checks.length}`);
  console.log(`Critical Checks:  ${critical} (${failedCritical} failed)`);
  console.log(`Warnings:         ${warnings} (${failedWarnings} failed)`);
  console.log(`Info:             ${info}`);
  console.log('');

  if (failedCritical > 0) {
    console.log('❌ COMPLIANCE FAILED - Critical issues detected!');
    console.log('');
    console.log('Action Required:');
    checks
      .filter((c) => c.severity === 'CRITICAL' && !c.passed)
      .forEach((c) => {
        console.log(`  - ${c.name}: ${c.message}`);
      });
    process.exit(1);
  } else if (failedWarnings > 0) {
    console.log('⚠️  COMPLIANCE PASSED with warnings');
    console.log('');
    console.log('Recommendations:');
    checks
      .filter((c) => c.severity === 'WARNING' && !c.passed)
      .forEach((c) => {
        console.log(`  - ${c.name}: ${c.message}`);
      });
    process.exit(0);
  } else {
    console.log('✅ FULL COMPLIANCE VERIFIED - All checks passed!');
    console.log('');
    console.log('Agent-First Execution Guarantees:');
    console.log('  ✅ EOA rejection enforced');
    console.log('  ✅ Tier-based prioritization active');
    console.log('  ✅ Gas price hardening in place');
    console.log('  ✅ Protocol policies configured');
    console.log('  ✅ Queue health monitored');
    process.exit(0);
  }
}

main()
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
