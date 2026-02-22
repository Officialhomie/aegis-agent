/**
 * Gas Passport V2 - Core Computation
 *
 * Aggregates sponsorship history into rich passport metrics.
 */

import { getPrisma } from '../db';
import { logger } from '../logger';
import type {
  ActivityMetrics,
  BehavioralMetrics,
  RiskMetrics,
  RiskFlag,
  RiskLevel,
} from './types';

const db = getPrisma();

/**
 * Compute activity metrics from SponsorshipRecord
 */
export async function computeActivityMetrics(
  walletAddress: string
): Promise<ActivityMetrics> {
  const normalized = walletAddress.toLowerCase();

  try {
    const records = await db.sponsorshipRecord.findMany({
      where: { userAddress: normalized },
      select: {
        protocolId: true,
        estimatedCostUSD: true,
        actualCostUSD: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    if (records.length === 0) {
      return {
        sponsorshipCount: 0,
        successRateBps: 0,
        protocolCount: 0,
        totalValueSponsoredUSD: 0,
        avgSponsorshipValueUSD: 0,
        maxSponsorshipValueUSD: 0,
        firstSponsorshipAt: null,
        lastSponsorshipAt: null,
      };
    }

    const sponsorshipCount = records.length;
    const successfulRecords = records.filter((r) => r.actualCostUSD !== null);
    const successRateBps = Math.round(
      (successfulRecords.length / sponsorshipCount) * 10000
    );

    const uniqueProtocols = new Set(records.map((r) => r.protocolId));
    const protocolCount = uniqueProtocols.size;

    const values = records.map((r) => r.actualCostUSD ?? r.estimatedCostUSD);
    const totalValueSponsoredUSD = values.reduce((sum, v) => sum + v, 0);
    const avgSponsorshipValueUSD = totalValueSponsoredUSD / sponsorshipCount;
    const maxSponsorshipValueUSD = Math.max(...values);

    const firstSponsorshipAt = records[0].createdAt;
    const lastSponsorshipAt = records[records.length - 1].createdAt;

    return {
      sponsorshipCount,
      successRateBps,
      protocolCount,
      totalValueSponsoredUSD,
      avgSponsorshipValueUSD,
      maxSponsorshipValueUSD,
      firstSponsorshipAt,
      lastSponsorshipAt,
    };
  } catch (error) {
    logger.error('[Passport] Failed to compute activity metrics', {
      error,
      walletAddress: normalized,
    });

    return {
      sponsorshipCount: 0,
      successRateBps: 0,
      protocolCount: 0,
      totalValueSponsoredUSD: 0,
      avgSponsorshipValueUSD: 0,
      maxSponsorshipValueUSD: 0,
      firstSponsorshipAt: null,
      lastSponsorshipAt: null,
    };
  }
}

/**
 * Compute behavioral patterns from temporal analysis
 */
export async function computeBehavioralMetrics(
  walletAddress: string
): Promise<BehavioralMetrics> {
  const normalized = walletAddress.toLowerCase();

  try {
    const records = await db.sponsorshipRecord.findMany({
      where: { userAddress: normalized },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    if (records.length === 0) {
      return {
        avgSponsorshipsPerWeek: 0,
        consistencyScore: 1, // Worst (no data)
        recencyDays: 999,
        peakActivityHour: null,
        burstinessScore: 0,
      };
    }

    // Calculate average sponsorships per week
    const firstDate = records[0].createdAt;
    const lastDate = records[records.length - 1].createdAt;
    const weeksDiff = Math.max(
      1,
      (lastDate.getTime() - firstDate.getTime()) / (7 * 24 * 60 * 60 * 1000)
    );
    const avgSponsorshipsPerWeek = records.length / weeksDiff;

    // Calculate recency
    const now = new Date();
    const recencyDays = Math.floor(
      (now.getTime() - lastDate.getTime()) / (24 * 60 * 60 * 1000)
    );

    // Calculate consistency (standard deviation of inter-sponsorship times)
    const interTimes: number[] = [];
    for (let i = 1; i < records.length; i++) {
      const diff = records[i].createdAt.getTime() - records[i - 1].createdAt.getTime();
      interTimes.push(diff);
    }

    let consistencyScore = 1; // Default to worst
    if (interTimes.length >= 2) {
      const mean = interTimes.reduce((a, b) => a + b, 0) / interTimes.length;
      const variance =
        interTimes.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / interTimes.length;
      const stdDev = Math.sqrt(variance);
      // Normalize: lower std dev = better consistency
      // CV (coefficient of variation) = stdDev / mean
      const cv = mean > 0 ? stdDev / mean : 0;
      consistencyScore = Math.min(1, cv); // Cap at 1
    }

    // Calculate peak activity hour
    const hourCounts = new Array(24).fill(0);
    for (const record of records) {
      const hour = record.createdAt.getUTCHours();
      hourCounts[hour]++;
    }
    const peakActivityHour = hourCounts.indexOf(Math.max(...hourCounts));

    // Calculate burstiness (cluster detection)
    // High burstiness = many sponsorships in short time periods
    const oneHourMs = 60 * 60 * 1000;
    let burstCount = 0;
    for (let i = 1; i < records.length; i++) {
      const diff = records[i].createdAt.getTime() - records[i - 1].createdAt.getTime();
      if (diff < oneHourMs) {
        burstCount++;
      }
    }
    const burstinessScore = records.length > 1 ? burstCount / (records.length - 1) : 0;

    return {
      avgSponsorshipsPerWeek,
      consistencyScore,
      recencyDays,
      peakActivityHour,
      burstinessScore,
    };
  } catch (error) {
    logger.error('[Passport] Failed to compute behavioral metrics', {
      error,
      walletAddress: normalized,
    });

    return {
      avgSponsorshipsPerWeek: 0,
      consistencyScore: 1,
      recencyDays: 999,
      peakActivityHour: null,
      burstinessScore: 0,
    };
  }
}

/**
 * Compute risk indicators and flags
 */
export async function computeRiskMetrics(
  walletAddress: string,
  activityMetrics: ActivityMetrics,
  behavioralMetrics: BehavioralMetrics
): Promise<RiskMetrics> {
  const normalized = walletAddress.toLowerCase();
  const flags: RiskFlag[] = [];

  // Calculate failure rate
  const failureRateBps =
    activityMetrics.sponsorshipCount > 0
      ? 10000 - activityMetrics.successRateBps
      : 0;

  // For rejection rate, we'd need to track policy rejections
  // For now, estimate based on failure rate
  const rejectionRateBps = Math.min(failureRateBps * 0.5, 10000);

  // Check for high failure rate
  if (failureRateBps > 2000) {
    // > 20%
    flags.push('HIGH_FAILURE_RATE');
  }

  // Check for high rejection rate
  if (rejectionRateBps > 3000) {
    // > 30%
    flags.push('HIGH_REJECTION_RATE');
  }

  // Check for burst patterns
  if (behavioralMetrics.burstinessScore > 0.8) {
    flags.push('BURST_PATTERN');
  }

  // Check for unusual timing (most activity between 2-5 AM UTC)
  const peakHour = behavioralMetrics.peakActivityHour;
  if (peakHour !== null && peakHour >= 2 && peakHour <= 5) {
    flags.push('UNUSUAL_TIMING');
  }

  // Check for value anomalies (very high avg vs median)
  if (
    activityMetrics.maxSponsorshipValueUSD > activityMetrics.avgSponsorshipValueUSD * 10 &&
    activityMetrics.sponsorshipCount > 5
  ) {
    flags.push('VALUE_ANOMALY');
  }

  // TODO: Check for association with blocked wallets (requires cross-reference)

  // Determine risk level based on flags
  let riskLevel: RiskLevel = 'LOW';
  if (flags.length >= 3 || flags.includes('HIGH_FAILURE_RATE')) {
    riskLevel = 'HIGH';
  } else if (flags.length >= 2) {
    riskLevel = 'MEDIUM';
  } else if (flags.length === 1) {
    riskLevel = 'MEDIUM';
  }

  // Critical if multiple severe flags
  if (
    (flags.includes('HIGH_FAILURE_RATE') && flags.includes('BURST_PATTERN')) ||
    flags.length >= 4
  ) {
    riskLevel = 'CRITICAL';
  }

  return {
    failureRateBps,
    rejectionRateBps: Math.round(rejectionRateBps),
    flags,
    flagCount: flags.length,
    riskLevel,
  };
}

/**
 * Compute value percentile compared to all users
 */
export async function computeValuePercentile(
  totalValueUSD: number
): Promise<number> {
  try {
    // Get all users' total values
    const allValues = await db.sponsorshipRecord.groupBy({
      by: ['userAddress'],
      _sum: {
        actualCostUSD: true,
      },
    });

    if (allValues.length === 0) {
      return 50; // Default to median if no data
    }

    const values = allValues
      .map((v) => v._sum.actualCostUSD ?? 0)
      .filter((v) => v > 0)
      .sort((a, b) => a - b);

    if (values.length === 0) {
      return 50;
    }

    // Find position
    const position = values.filter((v) => v < totalValueUSD).length;
    const percentile = Math.round((position / values.length) * 100);

    return Math.min(100, Math.max(0, percentile));
  } catch (error) {
    logger.error('[Passport] Failed to compute value percentile', { error });
    return 50;
  }
}

/**
 * Compute protocol diversity score (Gini coefficient)
 */
export async function computeProtocolDiversity(
  walletAddress: string
): Promise<{ protocolDistribution: Record<string, number>; diversityScore: number }> {
  const normalized = walletAddress.toLowerCase();

  try {
    const protocolCounts = await db.sponsorshipRecord.groupBy({
      by: ['protocolId'],
      where: { userAddress: normalized },
      _count: true,
    });

    if (protocolCounts.length === 0) {
      return { protocolDistribution: {}, diversityScore: 0 };
    }

    const distribution: Record<string, number> = {};
    const counts = protocolCounts.map((p) => {
      distribution[p.protocolId] = p._count;
      return p._count;
    });

    // Calculate Gini coefficient (0 = perfectly equal, 1 = perfectly unequal)
    const n = counts.length;
    const total = counts.reduce((a, b) => a + b, 0);
    const sortedCounts = [...counts].sort((a, b) => a - b);

    let giniSum = 0;
    for (let i = 0; i < n; i++) {
      giniSum += (2 * (i + 1) - n - 1) * sortedCounts[i];
    }

    const gini = n > 0 && total > 0 ? giniSum / (n * total) : 0;

    // Invert so higher = more diverse
    const diversityScore = 1 - Math.max(0, Math.min(1, gini));

    return { protocolDistribution: distribution, diversityScore };
  } catch (error) {
    logger.error('[Passport] Failed to compute protocol diversity', {
      error,
      walletAddress: normalized,
    });
    return { protocolDistribution: {}, diversityScore: 0 };
  }
}
