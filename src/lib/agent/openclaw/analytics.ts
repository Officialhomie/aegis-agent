/**
 * OpenClaw Analytics
 *
 * Prisma aggregation queries for protocol spending analytics:
 * - Top wallets by cost
 * - Spend summaries by period
 * - Transaction counts and success rates
 */

import { getPrisma } from '@/src/lib/db';
import { logger } from '@/src/lib/logger';

const db = getPrisma();

export interface TopWalletStats {
  walletAddress: string;
  totalSpentUSD: number;
  transactionCount: number;
  avgCostUSD: number;
}

export interface PeriodStats {
  totalSpentUSD: number;
  transactionCount: number;
  successCount: number;
  failureCount: number;
  avgCostUSD: number;
  successRate: number;
  period: string;
}

export interface AnalyticsSummary {
  topWallets: TopWalletStats[];
  periodStats: PeriodStats;
  totalProtocolSpend: number;
}

/**
 * Get top wallets by spending for a protocol
 */
export async function getTopWalletsBySpend(
  protocolId: string,
  options: {
    limit?: number;
    sinceDate?: Date;
  } = {}
): Promise<TopWalletStats[]> {
  const limit = options.limit ?? 10;
  const sinceDate = options.sinceDate ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days default

  try {
    const results = await db.sponsorshipRecord.groupBy({
      by: ['userAddress'],
      where: {
        protocolId,
        createdAt: { gte: sinceDate },
        actualCostUSD: { not: null },
      },
      _sum: {
        actualCostUSD: true,
      },
      _count: true,
      _avg: {
        actualCostUSD: true,
      },
      orderBy: {
        _sum: {
          actualCostUSD: 'desc',
        },
      },
      take: limit,
    });

    return results.map((r) => ({
      walletAddress: r.userAddress,
      totalSpentUSD: r._sum.actualCostUSD ?? 0,
      transactionCount: r._count,
      avgCostUSD: r._avg.actualCostUSD ?? 0,
    }));
  } catch (error) {
    logger.error('[Analytics] Failed to get top wallets', { error, protocolId });
    throw new Error('Failed to fetch top wallet statistics');
  }
}

/**
 * Get spending statistics for a time period
 */
export async function getPeriodStats(
  protocolId: string,
  period: 'day' | 'week' | 'month' | string
): Promise<PeriodStats> {
  let sinceDate: Date;
  let periodLabel: string;

  // Parse period
  if (period === 'day') {
    sinceDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    periodLabel = 'Last 24 hours';
  } else if (period === 'week') {
    sinceDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    periodLabel = 'Last 7 days';
  } else if (period === 'month') {
    sinceDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    periodLabel = 'Last 30 days';
  } else if (period.endsWith('days')) {
    // Handle "7days", "14days", etc.
    const days = parseInt(period.replace('days', ''));
    sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    periodLabel = `Last ${days} days`;
  } else {
    sinceDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    periodLabel = 'Last 7 days';
  }

  try {
    const [aggregate, successCount, failureCount] = await Promise.all([
      // Total spending and transaction count
      db.sponsorshipRecord.aggregate({
        where: {
          protocolId,
          createdAt: { gte: sinceDate },
        },
        _sum: {
          actualCostUSD: true,
        },
        _count: true,
        _avg: {
          actualCostUSD: true,
        },
      }),

      // Success count (record has actualCostUSD = bundler succeeded)
      db.sponsorshipRecord.count({
        where: {
          protocolId,
          createdAt: { gte: sinceDate },
          actualCostUSD: { not: null },
        },
      }),

      // Failure count (record created but no actualCostUSD = bundler failed or rejected)
      db.sponsorshipRecord.count({
        where: {
          protocolId,
          createdAt: { gte: sinceDate },
          actualCostUSD: null,
        },
      }),
    ]);

    const totalCount = aggregate._count;
    const successRate = totalCount > 0 ? (successCount / totalCount) * 100 : 0;

    return {
      totalSpentUSD: aggregate._sum.actualCostUSD ?? 0,
      transactionCount: totalCount,
      successCount,
      failureCount,
      avgCostUSD: aggregate._avg.actualCostUSD ?? 0,
      successRate,
      period: periodLabel,
    };
  } catch (error) {
    logger.error('[Analytics] Failed to get period stats', { error, protocolId, period });
    throw new Error('Failed to fetch period statistics');
  }
}

/**
 * Get comprehensive analytics summary
 */
export async function getAnalyticsSummary(
  protocolId: string,
  options: {
    topWalletsLimit?: number;
    period?: 'day' | 'week' | 'month' | string;
  } = {}
): Promise<AnalyticsSummary> {
  const period = options.period ?? 'week';
  const topWalletsLimit = options.topWalletsLimit ?? 10;

  try {
    // Calculate since date based on period
    let sinceDate: Date;
    if (period === 'day') {
      sinceDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    } else if (period === 'month') {
      sinceDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    } else if (period.endsWith('days')) {
      const days = parseInt(period.replace('days', ''));
      sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    } else {
      sinceDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    }

    const [topWallets, periodStats, totalSpendResult] = await Promise.all([
      getTopWalletsBySpend(protocolId, { limit: topWalletsLimit, sinceDate }),
      getPeriodStats(protocolId, period),

      // Total protocol spend (all time)
      db.sponsorshipRecord.aggregate({
        where: {
          protocolId,
          actualCostUSD: { not: null },
        },
        _sum: {
          actualCostUSD: true,
        },
      }),
    ]);

    return {
      topWallets,
      periodStats,
      totalProtocolSpend: totalSpendResult._sum.actualCostUSD ?? 0,
    };
  } catch (error) {
    logger.error('[Analytics] Failed to get analytics summary', { error, protocolId });
    throw new Error('Failed to fetch analytics summary');
  }
}

/**
 * Format analytics for OpenClaw response
 */
export function formatAnalyticsMessage(summary: AnalyticsSummary): string {
  const { topWallets, periodStats, totalProtocolSpend } = summary;

  let message = `📊 Analytics Summary (${periodStats.period})\n\n`;

  // Period stats
  message += `💰 Period Spending: $${periodStats.totalSpentUSD.toFixed(2)}\n`;
  message += `📈 Transactions: ${periodStats.transactionCount} (${periodStats.successCount} success, ${periodStats.failureCount} failed)\n`;
  message += `✅ Success Rate: ${periodStats.successRate.toFixed(1)}%\n`;
  message += `📊 Avg Cost: $${periodStats.avgCostUSD.toFixed(4)}\n\n`;

  // Top wallets
  if (topWallets.length > 0) {
    message += `🏆 Top ${topWallets.length} Users by Spend:\n\n`;
    topWallets.forEach((wallet, index) => {
      const shortAddr = `${wallet.walletAddress.slice(0, 6)}...${wallet.walletAddress.slice(-4)}`;
      message += `${index + 1}. ${shortAddr}\n`;
      message += `   💵 Spent: $${wallet.totalSpentUSD.toFixed(2)}\n`;
      message += `   📊 Txs: ${wallet.transactionCount} (avg $${wallet.avgCostUSD.toFixed(4)})\n\n`;
    });
  } else {
    message += `No transactions in this period.\n\n`;
  }

  // Total protocol spend
  message += `💎 Total Protocol Spend (All Time): $${totalProtocolSpend.toFixed(2)}`;

  return message;
}

/**
 * Get recent failed transactions for debugging
 */
export async function getRecentFailures(
  protocolId: string,
  limit: number = 5
): Promise<Array<{ userAddress: string; reason: string; createdAt: Date }>> {
  try {
    const failures = await db.sponsorshipRecord.findMany({
      where: {
        protocolId,
        actualCostUSD: null,
      },
      select: {
        userAddress: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });

    return failures.map((f) => ({
      userAddress: f.userAddress,
      reason: 'Bundler did not complete (no cost recorded)',
      createdAt: f.createdAt,
    }));
  } catch (error) {
    logger.error('[Analytics] Failed to get recent failures', { error, protocolId });
    return [];
  }
}
