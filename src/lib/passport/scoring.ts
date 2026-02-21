/**
 * Gas Passport V2 - Trust Score Calculation
 *
 * Calculates composite trust score from component metrics.
 */

import type {
  ActivityMetrics,
  BehavioralMetrics,
  RiskMetrics,
  IdentitySignals,
  ComponentScores,
  PassportConfig,
  DEFAULT_PASSPORT_CONFIG,
} from './types';

const config = DEFAULT_PASSPORT_CONFIG;

/**
 * Calculate activity score (0-1000)
 * Based on sponsorship count, capped at 100 sponsorships for max score
 */
export function calculateActivityScore(activity: ActivityMetrics): number {
  const countScore = Math.min(activity.sponsorshipCount / 100, 1) * 1000;
  return Math.round(countScore);
}

/**
 * Calculate success score (0-1000)
 * Directly maps success rate to score
 */
export function calculateSuccessScore(activity: ActivityMetrics): number {
  // successRateBps is 0-10000, divide by 10 to get 0-1000
  return Math.round(activity.successRateBps / 10);
}

/**
 * Calculate value score (0-1000)
 * Based on total value sponsored, capped at $500 for max score
 */
export function calculateValueScore(activity: ActivityMetrics): number {
  const valueScore = Math.min(activity.totalValueSponsoredUSD / 500, 1) * 1000;
  return Math.round(valueScore);
}

/**
 * Calculate diversity score (0-1000)
 * Based on protocol count, capped at 10 protocols for max score
 */
export function calculateDiversityScore(activity: ActivityMetrics): number {
  const diversityScore = Math.min(activity.protocolCount / 10, 1) * 1000;
  return Math.round(diversityScore);
}

/**
 * Calculate identity score (0-1000)
 * Based on presence of identity signals
 */
export function calculateIdentityScore(identity: IdentitySignals): number {
  let score = 0;

  // ENS name: +300
  if (identity.ensName) {
    score += 300;
  }

  // Farcaster account: +300 (with follower bonus)
  if (identity.farcasterFid) {
    score += 200;
    // Bonus for followers (up to 100 more)
    if (identity.farcasterFollowers) {
      const followerBonus = Math.min(identity.farcasterFollowers / 1000, 1) * 100;
      score += followerBonus;
    }
  }

  // Basename: +200
  if (identity.basename) {
    score += 200;
  }

  // Contract deployer: +200 (developer signal)
  if (identity.isContractDeployer) {
    score += 200;
  }

  // On-chain maturity bonus (up to 100)
  if (identity.accountAgeOnChainDays && identity.accountAgeOnChainDays > 0) {
    const ageBonus = Math.min(identity.accountAgeOnChainDays / 365, 1) * 100;
    score += ageBonus;
  }

  return Math.round(Math.min(score, 1000));
}

/**
 * Calculate recency score (0-1000)
 * Decays linearly over 30 days, 0 after 30 days inactive
 */
export function calculateRecencyScore(behavior: BehavioralMetrics): number {
  const decayDays = config.risk.recencyDecayDays; // 30 days
  if (behavior.recencyDays >= decayDays) {
    return 0;
  }

  const recencyScore = Math.max(0, 1000 - behavior.recencyDays * (1000 / decayDays));
  return Math.round(recencyScore);
}

/**
 * Calculate risk multiplier (0.2 - 1.0)
 * Reduces score based on risk level
 */
export function calculateRiskMultiplier(risk: RiskMetrics): number {
  switch (risk.riskLevel) {
    case 'LOW':
      return 1.0;
    case 'MEDIUM':
      return 0.8;
    case 'HIGH':
      return 0.5;
    case 'CRITICAL':
      return 0.2;
    default:
      return 1.0;
  }
}

/**
 * Calculate all component scores
 */
export function calculateComponentScores(
  activity: ActivityMetrics,
  behavior: BehavioralMetrics,
  identity: IdentitySignals
): ComponentScores {
  return {
    activityScore: calculateActivityScore(activity),
    successScore: calculateSuccessScore(activity),
    valueScore: calculateValueScore(activity),
    diversityScore: calculateDiversityScore(activity),
    identityScore: calculateIdentityScore(identity),
    recencyScore: calculateRecencyScore(behavior),
  };
}

/**
 * Calculate composite trust score (0-1000)
 *
 * Formula:
 * trustScore = (
 *   activityScore * 0.25 +
 *   successScore * 0.30 +
 *   valueScore * 0.15 +
 *   diversityScore * 0.10 +
 *   identityScore * 0.10 +
 *   recencyScore * 0.10
 * ) * riskMultiplier
 */
export function calculateTrustScore(
  activity: ActivityMetrics,
  behavior: BehavioralMetrics,
  risk: RiskMetrics,
  identity: IdentitySignals
): { trustScore: number; componentScores: ComponentScores } {
  const componentScores = calculateComponentScores(activity, behavior, identity);
  const riskMultiplier = calculateRiskMultiplier(risk);

  const weights = config.weights;

  const rawScore =
    componentScores.activityScore * weights.activity +
    componentScores.successScore * weights.success +
    componentScores.valueScore * weights.value +
    componentScores.diversityScore * weights.diversity +
    componentScores.identityScore * weights.identity +
    componentScores.recencyScore * weights.recency;

  const trustScore = Math.round(rawScore * riskMultiplier);

  return {
    trustScore: Math.max(0, Math.min(1000, trustScore)),
    componentScores,
  };
}

/**
 * Get trust score label for display
 */
export function getTrustScoreLabel(trustScore: number): string {
  if (trustScore >= 900) return 'Excellent';
  if (trustScore >= 750) return 'Very Good';
  if (trustScore >= 600) return 'Good';
  if (trustScore >= 400) return 'Fair';
  if (trustScore >= 200) return 'Poor';
  return 'Very Poor';
}

/**
 * Get trust score color for display
 */
export function getTrustScoreColor(trustScore: number): string {
  if (trustScore >= 900) return '#22c55e'; // green-500
  if (trustScore >= 750) return '#84cc16'; // lime-500
  if (trustScore >= 600) return '#eab308'; // yellow-500
  if (trustScore >= 400) return '#f97316'; // orange-500
  if (trustScore >= 200) return '#ef4444'; // red-500
  return '#7f1d1d'; // red-900
}
