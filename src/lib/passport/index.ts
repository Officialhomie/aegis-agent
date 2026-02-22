/**
 * Gas Passport V2 - Public API
 *
 * Comprehensive user reputation and trust scoring system.
 *
 * Features:
 * - Rich activity metrics from sponsorship history
 * - Behavioral pattern analysis
 * - Risk indicator detection
 * - External identity signals (ENS, Farcaster, etc.)
 * - Tier classification with benefits
 * - Trust score calculation (0-1000)
 */

import { getPrisma } from '../db';
import { logger } from '../logger';
import {
  computeActivityMetrics,
  computeBehavioralMetrics,
  computeRiskMetrics,
  computeValuePercentile,
} from './compute';
import { calculateTrustScore } from './scoring';
import { classifyTier, getTierDisplayInfo, getNextTierRequirements } from './tier-classification';
import { fetchAllIdentitySignals, EMPTY_IDENTITY_SIGNALS } from './external-signals';
import type {
  GasPassport,
  PassportSummary,
  PassportDisplay,
  PassportTier,
  RiskLevel,
  IdentitySignals,
} from './types';

const db = getPrisma();

// Cache for passports (in-memory, 1 hour TTL)
const passportCache = new Map<string, { passport: GasPassport; expiresAt: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Get full Gas Passport for an address
 *
 * Returns cached data if available and fresh.
 * Computes fresh data if cache is stale or missing.
 */
export async function getGasPassport(
  walletAddress: string,
  options: { forceRefresh?: boolean; includeIdentity?: boolean } = {}
): Promise<GasPassport> {
  const normalized = walletAddress.toLowerCase();
  const now = Date.now();

  // Check cache first (unless force refresh)
  if (!options.forceRefresh) {
    const cached = passportCache.get(normalized);
    if (cached && cached.expiresAt > now) {
      logger.debug('[Passport] Cache hit', { wallet: normalized });
      return cached.passport;
    }
  }

  logger.info('[Passport] Computing passport', { wallet: normalized });

  // Compute all metrics in parallel
  const [activityMetrics, behavioralMetrics] = await Promise.all([
    computeActivityMetrics(normalized),
    computeBehavioralMetrics(normalized),
  ]);

  // Compute risk metrics (depends on activity and behavioral)
  const riskMetrics = await computeRiskMetrics(
    normalized,
    activityMetrics,
    behavioralMetrics
  );

  // Fetch identity signals (optional, can be slow)
  let identitySignals: IdentitySignals = EMPTY_IDENTITY_SIGNALS;
  if (options.includeIdentity !== false) {
    // Check if we have cached identity in DB
    const existingSnapshot = await db.gasPassportSnapshot.findUnique({
      where: { walletAddress: normalized },
    });

    if (existingSnapshot?.ensName || existingSnapshot?.farcasterFid) {
      // Use cached identity signals
      identitySignals = {
        ensName: existingSnapshot.ensName,
        basename: existingSnapshot.basename,
        farcasterFid: existingSnapshot.farcasterFid,
        farcasterFollowers: existingSnapshot.farcasterFollowers,
        onChainTxCount: existingSnapshot.onChainTxCount,
        isContractDeployer: existingSnapshot.isContractDeployer,
        accountAgeOnChainDays: existingSnapshot.accountAgeOnChainDays,
      };
    } else {
      // Fetch fresh identity signals
      identitySignals = await fetchAllIdentitySignals(normalized);
    }
  }

  // Calculate trust score
  const { trustScore, componentScores } = calculateTrustScore(
    activityMetrics,
    behavioralMetrics,
    riskMetrics,
    identitySignals
  );

  // Classify tier
  const tier = classifyTier(activityMetrics, behavioralMetrics, riskMetrics);

  // Compute value percentile
  const valuePercentile = await computeValuePercentile(
    activityMetrics.totalValueSponsoredUSD
  );

  // Build passport object
  const passport: GasPassport = {
    walletAddress: normalized,
    tier,
    trustScore,
    riskLevel: riskMetrics.riskLevel,

    activity: activityMetrics,
    behavior: behavioralMetrics,
    risk: riskMetrics,
    identity: identitySignals,

    valuePercentile,
    componentScores,

    reputationHash: null, // TODO: Implement Merkle root

    computedAt: new Date(),
    dataVersion: '2.0.0',
  };

  // Save to cache
  passportCache.set(normalized, {
    passport,
    expiresAt: now + CACHE_TTL_MS,
  });

  // Save snapshot to database (async, don't wait)
  savePassportSnapshot(passport).catch((err) => {
    logger.error('[Passport] Failed to save snapshot', { error: err });
  });

  return passport;
}

/**
 * Get passport summary (fast, minimal data)
 */
export async function getPassportSummary(
  walletAddress: string
): Promise<PassportSummary> {
  const passport = await getGasPassport(walletAddress, { includeIdentity: false });

  return {
    walletAddress: passport.walletAddress,
    tier: passport.tier,
    trustScore: passport.trustScore,
    riskLevel: passport.riskLevel,
    sponsorshipCount: passport.activity.sponsorshipCount,
    successRateBps: passport.activity.successRateBps,
    computedAt: passport.computedAt,
  };
}

/**
 * Save passport snapshot to database
 */
async function savePassportSnapshot(passport: GasPassport): Promise<void> {
  try {
    await db.gasPassportSnapshot.upsert({
      where: { walletAddress: passport.walletAddress },
      create: {
        walletAddress: passport.walletAddress,
        sponsorshipCount: passport.activity.sponsorshipCount,
        successRateBps: passport.activity.successRateBps,
        protocolCount: passport.activity.protocolCount,
        totalValueSponsoredUSD: passport.activity.totalValueSponsoredUSD,
        trustScore: passport.trustScore,
        tier: passport.tier,
        riskLevel: passport.riskLevel,
        avgSponsorshipsPerWeek: passport.behavior.avgSponsorshipsPerWeek,
        consistencyScore: passport.behavior.consistencyScore,
        recencyDays: passport.behavior.recencyDays,
        peakActivityHour: passport.behavior.peakActivityHour,
        avgSponsorshipValueUSD: passport.activity.avgSponsorshipValueUSD,
        maxSponsorshipValueUSD: passport.activity.maxSponsorshipValueUSD,
        valuePercentile: passport.valuePercentile,
        failureRateBps: passport.risk.failureRateBps,
        rejectionRateBps: passport.risk.rejectionRateBps,
        flagCount: passport.risk.flagCount,
        flags: passport.risk.flags,
        ensName: passport.identity.ensName,
        basename: passport.identity.basename,
        farcasterFid: passport.identity.farcasterFid,
        farcasterFollowers: passport.identity.farcasterFollowers,
        onChainTxCount: passport.identity.onChainTxCount,
        isContractDeployer: passport.identity.isContractDeployer,
        accountAgeOnChainDays: passport.identity.accountAgeOnChainDays,
        reputationHash: passport.reputationHash,
        lastSponsorshipAt: passport.activity.lastSponsorshipAt,
        firstSponsorshipAt: passport.activity.firstSponsorshipAt,
      },
      update: {
        sponsorshipCount: passport.activity.sponsorshipCount,
        successRateBps: passport.activity.successRateBps,
        protocolCount: passport.activity.protocolCount,
        totalValueSponsoredUSD: passport.activity.totalValueSponsoredUSD,
        trustScore: passport.trustScore,
        tier: passport.tier,
        riskLevel: passport.riskLevel,
        avgSponsorshipsPerWeek: passport.behavior.avgSponsorshipsPerWeek,
        consistencyScore: passport.behavior.consistencyScore,
        recencyDays: passport.behavior.recencyDays,
        peakActivityHour: passport.behavior.peakActivityHour,
        avgSponsorshipValueUSD: passport.activity.avgSponsorshipValueUSD,
        maxSponsorshipValueUSD: passport.activity.maxSponsorshipValueUSD,
        valuePercentile: passport.valuePercentile,
        failureRateBps: passport.risk.failureRateBps,
        rejectionRateBps: passport.risk.rejectionRateBps,
        flagCount: passport.risk.flagCount,
        flags: passport.risk.flags,
        ensName: passport.identity.ensName,
        basename: passport.identity.basename,
        farcasterFid: passport.identity.farcasterFid,
        farcasterFollowers: passport.identity.farcasterFollowers,
        onChainTxCount: passport.identity.onChainTxCount,
        isContractDeployer: passport.identity.isContractDeployer,
        accountAgeOnChainDays: passport.identity.accountAgeOnChainDays,
        lastSponsorshipAt: passport.activity.lastSponsorshipAt,
        firstSponsorshipAt: passport.activity.firstSponsorshipAt,
        computedAt: new Date(),
      },
    });

    logger.debug('[Passport] Snapshot saved', {
      wallet: passport.walletAddress,
      tier: passport.tier,
      trustScore: passport.trustScore,
    });
  } catch (error) {
    logger.error('[Passport] Failed to save snapshot', {
      error,
      wallet: passport.walletAddress,
    });
  }
}

/**
 * Format passport for human-readable display
 */
export function formatPassportDisplay(passport: GasPassport): PassportDisplay {
  const tierInfo = getTierDisplayInfo(passport.tier);
  const riskEmoji =
    passport.riskLevel === 'LOW'
      ? '🟢'
      : passport.riskLevel === 'MEDIUM'
        ? '🟡'
        : passport.riskLevel === 'HIGH'
          ? '🟠'
          : '🔴';

  const shortWallet = `${passport.walletAddress.slice(0, 6)}...${passport.walletAddress.slice(-4)}`;

  const formatDate = (date: Date | null): string => {
    if (!date) return 'Never';
    const days = Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000));
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 30) return `${days} days ago`;
    return date.toLocaleDateString();
  };

  const formatConsistency = (score: number): string => {
    if (score < 0.2) return 'Excellent';
    if (score < 0.4) return 'Good';
    if (score < 0.6) return 'Fair';
    if (score < 0.8) return 'Poor';
    return 'Inconsistent';
  };

  return {
    header: {
      wallet: passport.walletAddress,
      shortWallet,
      tier: passport.tier,
      tierEmoji: tierInfo.emoji,
      trustScore: passport.trustScore,
      riskLevel: passport.riskLevel,
      riskEmoji,
    },
    activity: {
      sponsorships: passport.activity.sponsorshipCount.toString(),
      successRate: `${(passport.activity.successRateBps / 100).toFixed(1)}%`,
      protocols: passport.activity.protocolCount.toString(),
      activeSince: formatDate(passport.activity.firstSponsorshipAt),
      lastActivity: formatDate(passport.activity.lastSponsorshipAt),
    },
    value: {
      totalSponsored: `$${passport.activity.totalValueSponsoredUSD.toFixed(2)}`,
      averagePerTx: `$${passport.activity.avgSponsorshipValueUSD.toFixed(4)}`,
      largestTx: `$${passport.activity.maxSponsorshipValueUSD.toFixed(2)}`,
      percentile: `Top ${100 - passport.valuePercentile}%`,
    },
    identity: {
      ens: passport.identity.ensName || 'Not set',
      farcaster: passport.identity.farcasterFid
        ? `FID ${passport.identity.farcasterFid} (${passport.identity.farcasterFollowers || 0} followers)`
        : 'Not linked',
      onChainAge: passport.identity.accountAgeOnChainDays
        ? `${passport.identity.accountAgeOnChainDays} days`
        : 'Unknown',
    },
    trust: {
      consistency: formatConsistency(passport.behavior.consistencyScore),
      loyalty: passport.activity.protocolCount > 5 ? 'Diverse' : 'Focused',
      flags: passport.risk.flagCount > 0 ? passport.risk.flags.join(', ') : 'None',
    },
  };
}

/**
 * Format passport as text for OpenClaw/messaging
 */
export function formatPassportText(passport: GasPassport): string {
  const display = formatPassportDisplay(passport);
  const tierInfo = getTierDisplayInfo(passport.tier);

  return [
    `${tierInfo.emoji} AEGIS GAS PASSPORT`,
    ``,
    `Wallet: ${display.header.shortWallet}`,
    `Tier: ${display.header.tier}`,
    `Trust Score: ${display.header.trustScore}/1000`,
    `Risk: ${display.header.riskEmoji} ${display.header.riskLevel}`,
    ``,
    `ACTIVITY`,
    `- Sponsorships: ${display.activity.sponsorships}`,
    `- Success Rate: ${display.activity.successRate}`,
    `- Protocols: ${display.activity.protocols}`,
    `- Active Since: ${display.activity.activeSince}`,
    `- Last Activity: ${display.activity.lastActivity}`,
    ``,
    `VALUE`,
    `- Total Sponsored: ${display.value.totalSponsored}`,
    `- Average/Tx: ${display.value.averagePerTx}`,
    `- Largest Tx: ${display.value.largestTx}`,
    `- Percentile: ${display.value.percentile}`,
    ``,
    `IDENTITY`,
    `- ENS: ${display.identity.ens}`,
    `- Farcaster: ${display.identity.farcaster}`,
    `- On-Chain Age: ${display.identity.onChainAge}`,
    ``,
    `TRUST SIGNALS`,
    `- Consistency: ${display.trust.consistency}`,
    `- Protocol Loyalty: ${display.trust.loyalty}`,
    `- Risk Flags: ${display.trust.flags}`,
  ].join('\n');
}

/**
 * Clear passport cache (for testing)
 */
export function clearPassportCache(): void {
  passportCache.clear();
}

// Re-export types
export type { GasPassport, PassportSummary, PassportDisplay, PassportTier, RiskLevel };
export { getTierDisplayInfo, getNextTierRequirements };
