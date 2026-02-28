/**
 * Queue Analytics - Tier-Based Queue Health Monitoring
 *
 * Provides analytics and insights into tier-based queue performance:
 * - Queue statistics (counts by tier, average wait times)
 * - Tier distribution analysis
 * - Queue health monitoring (stale requests, processing times)
 */

import { getStateStore } from '../state-store';
import { logger } from '../../logger';
import type { SponsorshipRequest } from './sponsorship-queue';

interface QueueStats {
  totalPending: number;
  totalProcessing: number;
  totalCompleted: number;
  totalFailed: number;
  byTier: {
    tier1: { pending: number; processing: number; avgWaitMs: number };
    tier2: { pending: number; processing: number; avgWaitMs: number };
    tier3: { pending: number; processing: number; avgWaitMs: number };
  };
  averageWaitTimeMs: number;
  oldestRequestAge: number;
}

interface TierDistribution {
  tier1Count: number;
  tier1Percent: number;
  tier2Count: number;
  tier2Percent: number;
  tier3Count: number;
  tier3Percent: number;
  total: number;
}

interface QueueHealth {
  healthy: boolean;
  warnings: string[];
  staleRequests: number; // Pending > 1 hour
  slowProcessing: number; // Processing > 5 min
  avgProcessingTimeMs: number;
}

const QUEUE_PREFIX = 'aegis:queue:v1';
const STALE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour
const SLOW_PROCESSING_MS = 5 * 60 * 1000; // 5 minutes

function getQueueKeys() {
  return {
    pending: `${QUEUE_PREFIX}:pending`,
    processing: `${QUEUE_PREFIX}:processing`,
    completed: `${QUEUE_PREFIX}:completed`,
    failed: `${QUEUE_PREFIX}:failed`,
    request: (id: string) => `${QUEUE_PREFIX}:request:${id}`,
  };
}

async function getQueueList(storeValue: string | null): Promise<string[]> {
  if (!storeValue) return [];
  try {
    const parsed = JSON.parse(storeValue);
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

async function loadRequests(requestIds: string[]): Promise<SponsorshipRequest[]> {
  const store = await getStateStore();
  const keys = getQueueKeys();
  const requests: SponsorshipRequest[] = [];

  for (const requestId of requestIds) {
    const requestData = await store.get(keys.request(requestId));
    if (requestData) {
      try {
        const request = JSON.parse(requestData) as SponsorshipRequest;
        requests.push(request);
      } catch (error) {
        logger.debug('[QueueAnalytics] Failed to parse request', { requestId });
      }
    }
  }

  return requests;
}

/**
 * Get comprehensive queue statistics.
 */
export async function getQueueStats(): Promise<QueueStats> {
  const store = await getStateStore();
  const keys = getQueueKeys();

  // Load queue lists
  const pendingIds = await getQueueList(await store.get(keys.pending));
  const processingIds = await getQueueList(await store.get(keys.processing));
  const completedIds = await getQueueList(await store.get(keys.completed));
  const failedIds = await getQueueList(await store.get(keys.failed));

  // Load request details for pending and processing
  const pendingRequests = await loadRequests(pendingIds);
  const processingRequests = await loadRequests(processingIds);

  const now = Date.now();

  // Calculate tier-based stats
  const tier1Pending = pendingRequests.filter((r) => r.agentTier === 1);
  const tier2Pending = pendingRequests.filter((r) => r.agentTier === 2);
  const tier3Pending = pendingRequests.filter((r) => r.agentTier === 3);

  const tier1Processing = processingRequests.filter((r) => r.agentTier === 1);
  const tier2Processing = processingRequests.filter((r) => r.agentTier === 2);
  const tier3Processing = processingRequests.filter((r) => r.agentTier === 3);

  const calcAvgWait = (requests: SponsorshipRequest[]) => {
    if (requests.length === 0) return 0;
    const totalWait = requests.reduce((sum, r) => sum + (now - r.requestedAt), 0);
    return totalWait / requests.length;
  };

  const allWaitTimes = [...pendingRequests, ...processingRequests].map((r) => now - r.requestedAt);
  const averageWaitTimeMs = allWaitTimes.length > 0 ? allWaitTimes.reduce((a, b) => a + b, 0) / allWaitTimes.length : 0;
  const oldestRequestAge = Math.max(...allWaitTimes, 0);

  return {
    totalPending: pendingRequests.length,
    totalProcessing: processingRequests.length,
    totalCompleted: completedIds.length,
    totalFailed: failedIds.length,
    byTier: {
      tier1: {
        pending: tier1Pending.length,
        processing: tier1Processing.length,
        avgWaitMs: calcAvgWait(tier1Pending),
      },
      tier2: {
        pending: tier2Pending.length,
        processing: tier2Processing.length,
        avgWaitMs: calcAvgWait(tier2Pending),
      },
      tier3: {
        pending: tier3Pending.length,
        processing: tier3Processing.length,
        avgWaitMs: calcAvgWait(tier3Pending),
      },
    },
    averageWaitTimeMs,
    oldestRequestAge,
  };
}

/**
 * Get tier distribution breakdown.
 */
export async function getTierDistribution(): Promise<TierDistribution> {
  const store = await getStateStore();
  const keys = getQueueKeys();

  const pendingIds = await getQueueList(await store.get(keys.pending));
  const processingIds = await getQueueList(await store.get(keys.processing));

  const allRequests = await loadRequests([...pendingIds, ...processingIds]);

  const tier1Count = allRequests.filter((r) => r.agentTier === 1).length;
  const tier2Count = allRequests.filter((r) => r.agentTier === 2).length;
  const tier3Count = allRequests.filter((r) => r.agentTier === 3).length;
  const total = allRequests.length;

  return {
    tier1Count,
    tier1Percent: total > 0 ? (tier1Count / total) * 100 : 0,
    tier2Count,
    tier2Percent: total > 0 ? (tier2Count / total) * 100 : 0,
    tier3Count,
    tier3Percent: total > 0 ? (tier3Count / total) * 100 : 0,
    total,
  };
}

/**
 * Get queue health assessment.
 */
export async function getQueueHealth(): Promise<QueueHealth> {
  const store = await getStateStore();
  const keys = getQueueKeys();

  const pendingIds = await getQueueList(await store.get(keys.pending));
  const processingIds = await getQueueList(await store.get(keys.processing));

  const pendingRequests = await loadRequests(pendingIds);
  const processingRequests = await loadRequests(processingIds);

  const now = Date.now();
  const warnings: string[] = [];

  // Check for stale requests (pending > 1 hour)
  const staleRequests = pendingRequests.filter((r) => now - r.requestedAt > STALE_THRESHOLD_MS).length;
  if (staleRequests > 0) {
    warnings.push(`${staleRequests} requests pending for over 1 hour`);
  }

  // Check for slow processing (processing > 5 min)
  const slowProcessing = processingRequests.filter(
    (r) => r.processingStartedAt && now - r.processingStartedAt > SLOW_PROCESSING_MS
  ).length;
  if (slowProcessing > 0) {
    warnings.push(`${slowProcessing} requests processing for over 5 minutes`);
  }

  // Calculate average processing time
  const processingTimes = processingRequests
    .filter((r) => r.processingStartedAt)
    .map((r) => now - r.processingStartedAt!);
  const avgProcessingTimeMs = processingTimes.length > 0 ? processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length : 0;

  // Check for tier 3 starvation (tier 3 requests waiting > 30 min while tier 1/2 exist)
  const tier3Pending = pendingRequests.filter((r) => r.agentTier === 3);
  const tier12Pending = pendingRequests.filter((r) => r.agentTier === 1 || r.agentTier === 2);
  const tier3Starved = tier3Pending.filter((r) => now - r.requestedAt > 30 * 60 * 1000);
  if (tier3Starved.length > 0 && tier12Pending.length > 10) {
    warnings.push(`${tier3Starved.length} tier-3 requests starved (waiting >30min with ${tier12Pending.length} tier-1/2 ahead)`);
  }

  return {
    healthy: warnings.length === 0,
    warnings,
    staleRequests,
    slowProcessing,
    avgProcessingTimeMs,
  };
}

/**
 * Print formatted queue report to console.
 */
export async function printQueueReport(): Promise<void> {
  const stats = await getQueueStats();
  const distribution = await getTierDistribution();
  const health = await getQueueHealth();

  console.log('═══════════════════════════════════════════════════════════');
  console.log('                    QUEUE STATUS REPORT                    ');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log('Overall Queue:');
  console.log(`  Pending:    ${stats.totalPending}`);
  console.log(`  Processing: ${stats.totalProcessing}`);
  console.log(`  Completed:  ${stats.totalCompleted}`);
  console.log(`  Failed:     ${stats.totalFailed}`);
  console.log('');
  console.log('Tier Distribution:');
  console.log(`  Tier 1 (ERC-8004): ${distribution.tier1Count} (${distribution.tier1Percent.toFixed(1)}%)`);
  console.log(`  Tier 2 (ERC-4337): ${distribution.tier2Count} (${distribution.tier2Percent.toFixed(1)}%)`);
  console.log(`  Tier 3 (Smart):    ${distribution.tier3Count} (${distribution.tier3Percent.toFixed(1)}%)`);
  console.log('');
  console.log('Tier 1 Stats:');
  console.log(`  Pending:    ${stats.byTier.tier1.pending}`);
  console.log(`  Processing: ${stats.byTier.tier1.processing}`);
  console.log(`  Avg Wait:   ${(stats.byTier.tier1.avgWaitMs / 1000).toFixed(1)}s`);
  console.log('');
  console.log('Tier 2 Stats:');
  console.log(`  Pending:    ${stats.byTier.tier2.pending}`);
  console.log(`  Processing: ${stats.byTier.tier2.processing}`);
  console.log(`  Avg Wait:   ${(stats.byTier.tier2.avgWaitMs / 1000).toFixed(1)}s`);
  console.log('');
  console.log('Tier 3 Stats:');
  console.log(`  Pending:    ${stats.byTier.tier3.pending}`);
  console.log(`  Processing: ${stats.byTier.tier3.processing}`);
  console.log(`  Avg Wait:   ${(stats.byTier.tier3.avgWaitMs / 1000).toFixed(1)}s`);
  console.log('');
  console.log('Health:');
  console.log(`  Status:     ${health.healthy ? '✅ HEALTHY' : '⚠️  WARNINGS'}`);
  console.log(`  Stale:      ${health.staleRequests} requests`);
  console.log(`  Slow:       ${health.slowProcessing} requests`);
  console.log(`  Avg Proc:   ${(health.avgProcessingTimeMs / 1000).toFixed(1)}s`);
  if (health.warnings.length > 0) {
    console.log('');
    console.log('Warnings:');
    health.warnings.forEach((warning) => {
      console.log(`  ⚠️  ${warning}`);
    });
  }
  console.log('═══════════════════════════════════════════════════════════');
}
