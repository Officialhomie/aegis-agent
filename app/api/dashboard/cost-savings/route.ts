/**
 * Dashboard cost-savings: Phase 1 optimization metrics (Neynar usage, LLM skips, estimated savings).
 */

import { NextResponse } from 'next/server';
import { getCounterTotal } from '@/src/lib/monitoring/metrics';

export const dynamic = 'force-dynamic';

const METRICS_WINDOW_MS = 60 * 60 * 1000; // 1 hour for in-memory metrics

export async function GET() {
  try {
    let neynar: {
      month: string;
      used: number;
      quota: number;
      byCategory: Record<string, { used: number; budget: number }>;
    } | null = null;

    try {
      const { getNeynarRateLimiter } = await import('@/src/lib/agent/social/neynar-rate-limiter');
      const limiter = await getNeynarRateLimiter();
      const stats = await limiter.getUsageStats();
      neynar = {
        month: stats.month,
        used: stats.total,
        quota: stats.quota,
        byCategory: {
          proof: { used: stats.byCategory.proof.used, budget: stats.byCategory.proof.budget },
          stats: { used: stats.byCategory.stats.used, budget: stats.byCategory.stats.budget },
          health: { used: stats.byCategory.health.used, budget: stats.byCategory.health.budget },
          emergency: { used: stats.byCategory.emergency.used, budget: stats.byCategory.emergency.budget },
        },
      };
    } catch {
      // Rate limiter may be unavailable (e.g. no Redis)
    }

    const filterTotal = getCounterTotal('aegis_observation_filter_total', METRICS_WINDOW_MS);
    const filterSkips = getCounterTotal('aegis_observation_filter_skips', METRICS_WINDOW_MS);
    const templateUsed = getCounterTotal('aegis_template_response_used', METRICS_WINDOW_MS);
    const llmCalls = getCounterTotal('aegis_llm_calls_total', METRICS_WINDOW_MS);

    const totalCycles = filterTotal;
    const skippedByFilter = filterSkips;
    const skippedByTemplate = templateUsed;

    const llm = {
      totalCycles,
      skippedByFilter,
      skippedByTemplate,
      llmCalls,
    };

    const neynarUSD = neynar && neynar.used < neynar.quota ? 199 : 0;
    const anthropicSaved = (skippedByFilter + skippedByTemplate) * 0.0002;
    const anthropicUSD = Math.round(anthropicSaved * 500);
    const estimatedSavings = {
      neynarUSD,
      anthropicUSD: Math.min(anthropicUSD, 108),
      totalUSD: neynarUSD + Math.min(anthropicUSD, 108),
    };

    return NextResponse.json({
      neynar: neynar
        ? {
            month: neynar.month,
            used: neynar.used,
            quota: neynar.quota,
            byCategory: neynar.byCategory,
          }
        : null,
      llm,
      estimatedSavings,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to load cost savings' },
      { status: 500 }
    );
  }
}
