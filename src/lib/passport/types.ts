/**
 * Gas Passport V2 - Type Definitions
 *
 * Comprehensive types for the user reputation and trust scoring system.
 */

export type PassportTier =
  | 'NEWCOMER'
  | 'ACTIVE'
  | 'TRUSTED'
  | 'PREMIUM'
  | 'WHALE'
  | 'FLAGGED';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type RiskFlag =
  | 'HIGH_FAILURE_RATE'
  | 'HIGH_REJECTION_RATE'
  | 'GAS_PRICE_ABUSE'
  | 'BURST_PATTERN'
  | 'UNUSUAL_TIMING'
  | 'ASSOCIATED_BLOCKED_WALLET'
  | 'RAPID_PROTOCOL_SWITCHING'
  | 'VALUE_ANOMALY';

/**
 * Core activity metrics derived from SponsorshipRecord
 */
export interface ActivityMetrics {
  sponsorshipCount: number;
  successRateBps: number; // Basis points (0-10000)
  protocolCount: number;
  totalValueSponsoredUSD: number;
  avgSponsorshipValueUSD: number;
  maxSponsorshipValueUSD: number;
  firstSponsorshipAt: Date | null;
  lastSponsorshipAt: Date | null;
}

/**
 * Behavioral patterns computed from temporal analysis
 */
export interface BehavioralMetrics {
  avgSponsorshipsPerWeek: number;
  consistencyScore: number; // 0-1, lower = more consistent
  recencyDays: number; // Days since last activity
  peakActivityHour: number | null; // UTC hour 0-23
  burstinessScore: number; // Higher = more bursty/suspicious
}

/**
 * Risk indicators for abuse detection
 */
export interface RiskMetrics {
  failureRateBps: number; // Basis points
  rejectionRateBps: number; // Basis points (policy rejections)
  flags: RiskFlag[];
  flagCount: number;
  riskLevel: RiskLevel;
}

/**
 * External identity signals (fetched asynchronously)
 */
export interface IdentitySignals {
  ensName: string | null;
  basename: string | null;
  farcasterFid: number | null;
  farcasterFollowers: number | null;
  onChainTxCount: number | null;
  isContractDeployer: boolean;
  accountAgeOnChainDays: number | null;
}

/**
 * Component scores for trust calculation
 */
export interface ComponentScores {
  activityScore: number; // 0-1000
  successScore: number; // 0-1000
  valueScore: number; // 0-1000
  diversityScore: number; // 0-1000
  identityScore: number; // 0-1000
  recencyScore: number; // 0-1000
}

/**
 * Full Gas Passport data
 */
export interface GasPassport {
  // Core identification
  walletAddress: string;
  tier: PassportTier;
  trustScore: number; // 0-1000
  riskLevel: RiskLevel;

  // Activity metrics
  activity: ActivityMetrics;

  // Behavioral patterns
  behavior: BehavioralMetrics;

  // Risk indicators
  risk: RiskMetrics;

  // Identity signals (may be null if not yet fetched)
  identity: IdentitySignals;

  // Percentile rankings
  valuePercentile: number; // 0-100

  // Component scores (for transparency)
  componentScores: ComponentScores;

  // Attestation
  reputationHash: string | null;

  // Metadata
  computedAt: Date;
  dataVersion: string; // Schema version for migrations
}

/**
 * Simplified passport for fast queries
 */
export interface PassportSummary {
  walletAddress: string;
  tier: PassportTier;
  trustScore: number;
  riskLevel: RiskLevel;
  sponsorshipCount: number;
  successRateBps: number;
  computedAt: Date;
}

/**
 * Configuration for passport computation
 */
export interface PassportConfig {
  // Tier thresholds
  tiers: {
    active: { minSponsorships: number; minSuccessRate: number };
    trusted: { minSponsorships: number; minSuccessRate: number; minProtocols: number };
    premium: {
      minSponsorships: number;
      minSuccessRate: number;
      minProtocols: number;
      maxConsistency: number;
    };
    whale: { minValueUSD: number };
    flagged: { maxFailureRate: number; maxRejectionRate: number };
  };

  // Scoring weights
  weights: {
    activity: number;
    success: number;
    value: number;
    diversity: number;
    identity: number;
    recency: number;
  };

  // Risk thresholds
  risk: {
    highFailureRateBps: number;
    highRejectionRateBps: number;
    burstinessThreshold: number;
    recencyDecayDays: number; // 0 score after this many days
  };

  // Cache settings
  cache: {
    ttlSeconds: number;
    refreshOnAccess: boolean;
  };
}

/**
 * Default passport configuration
 */
export const DEFAULT_PASSPORT_CONFIG: PassportConfig = {
  tiers: {
    active: { minSponsorships: 5, minSuccessRate: 8000 }, // 80%
    trusted: { minSponsorships: 50, minSuccessRate: 9000, minProtocols: 3 }, // 90%
    premium: {
      minSponsorships: 200,
      minSuccessRate: 9500,
      minProtocols: 5,
      maxConsistency: 0.5,
    },
    whale: { minValueUSD: 1000 },
    flagged: { maxFailureRate: 2000, maxRejectionRate: 3000 }, // 20%, 30%
  },
  weights: {
    activity: 0.25,
    success: 0.3,
    value: 0.15,
    diversity: 0.1,
    identity: 0.1,
    recency: 0.1,
  },
  risk: {
    highFailureRateBps: 2000, // 20%
    highRejectionRateBps: 3000, // 30%
    burstinessThreshold: 0.8,
    recencyDecayDays: 30,
  },
  cache: {
    ttlSeconds: 3600, // 1 hour
    refreshOnAccess: true,
  },
};

/**
 * Display format for human-readable passport
 */
export interface PassportDisplay {
  header: {
    wallet: string;
    shortWallet: string;
    tier: PassportTier;
    tierEmoji: string;
    trustScore: number;
    riskLevel: RiskLevel;
    riskEmoji: string;
  };
  activity: {
    sponsorships: string;
    successRate: string;
    protocols: string;
    activeSince: string;
    lastActivity: string;
  };
  value: {
    totalSponsored: string;
    averagePerTx: string;
    largestTx: string;
    percentile: string;
  };
  identity: {
    ens: string;
    farcaster: string;
    onChainAge: string;
  };
  trust: {
    consistency: string;
    loyalty: string;
    flags: string;
  };
}
