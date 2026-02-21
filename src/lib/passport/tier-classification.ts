/**
 * Gas Passport V2 - Tier Classification
 *
 * Assigns passport tiers based on activity, success rate, and risk.
 */

import type {
  PassportTier,
  ActivityMetrics,
  BehavioralMetrics,
  RiskMetrics,
  PassportConfig,
} from './types';
import { DEFAULT_PASSPORT_CONFIG } from './types';

const config = DEFAULT_PASSPORT_CONFIG;

/**
 * Classify user into a passport tier
 *
 * Tiers (in priority order):
 * 1. FLAGGED - High risk indicators
 * 2. WHALE - High value + PREMIUM criteria
 * 3. PREMIUM - 200+ sponsorships, 95%+ success, 5+ protocols, consistent
 * 4. TRUSTED - 50-200 sponsorships, 90%+ success, 3+ protocols
 * 5. ACTIVE - 5-50 sponsorships, 80%+ success
 * 6. NEWCOMER - Default (< 5 sponsorships or new account)
 */
export function classifyTier(
  activity: ActivityMetrics,
  behavior: BehavioralMetrics,
  risk: RiskMetrics
): PassportTier {
  const { sponsorshipCount, successRateBps, protocolCount, totalValueSponsoredUSD } =
    activity;
  const { consistencyScore } = behavior;
  const { flagCount, failureRateBps, rejectionRateBps } = risk;

  // Check for FLAGGED tier first (highest priority - risk)
  if (
    failureRateBps > config.tiers.flagged.maxFailureRate ||
    rejectionRateBps > config.tiers.flagged.maxRejectionRate ||
    flagCount >= 3
  ) {
    return 'FLAGGED';
  }

  // Check for WHALE tier (highest value)
  if (
    totalValueSponsoredUSD >= config.tiers.whale.minValueUSD &&
    sponsorshipCount >= config.tiers.premium.minSponsorships &&
    successRateBps >= config.tiers.premium.minSuccessRate &&
    protocolCount >= config.tiers.premium.minProtocols
  ) {
    return 'WHALE';
  }

  // Check for PREMIUM tier
  if (
    sponsorshipCount >= config.tiers.premium.minSponsorships &&
    successRateBps >= config.tiers.premium.minSuccessRate &&
    protocolCount >= config.tiers.premium.minProtocols &&
    consistencyScore <= config.tiers.premium.maxConsistency
  ) {
    return 'PREMIUM';
  }

  // Check for TRUSTED tier
  if (
    sponsorshipCount >= config.tiers.trusted.minSponsorships &&
    successRateBps >= config.tiers.trusted.minSuccessRate &&
    protocolCount >= config.tiers.trusted.minProtocols
  ) {
    return 'TRUSTED';
  }

  // Check for ACTIVE tier
  if (
    sponsorshipCount >= config.tiers.active.minSponsorships &&
    successRateBps >= config.tiers.active.minSuccessRate
  ) {
    return 'ACTIVE';
  }

  // Default to NEWCOMER
  return 'NEWCOMER';
}

/**
 * Get tier display info
 */
export function getTierDisplayInfo(tier: PassportTier): {
  label: string;
  emoji: string;
  color: string;
  description: string;
} {
  switch (tier) {
    case 'WHALE':
      return {
        label: 'Whale',
        emoji: '🐳',
        color: '#8b5cf6', // purple-500
        description: 'Top-tier user with significant value and excellent history',
      };
    case 'PREMIUM':
      return {
        label: 'Premium',
        emoji: '💎',
        color: '#3b82f6', // blue-500
        description: 'Highly trusted user with consistent excellent performance',
      };
    case 'TRUSTED':
      return {
        label: 'Trusted',
        emoji: '✅',
        color: '#22c55e', // green-500
        description: 'Established user with strong track record',
      };
    case 'ACTIVE':
      return {
        label: 'Active',
        emoji: '🌱',
        color: '#84cc16', // lime-500
        description: 'Regular user building reputation',
      };
    case 'NEWCOMER':
      return {
        label: 'Newcomer',
        emoji: '👋',
        color: '#6b7280', // gray-500
        description: 'New user, limited history',
      };
    case 'FLAGGED':
      return {
        label: 'Flagged',
        emoji: '⚠️',
        color: '#ef4444', // red-500
        description: 'User has risk indicators requiring review',
      };
    default:
      return {
        label: 'Unknown',
        emoji: '❓',
        color: '#6b7280',
        description: 'Tier not determined',
      };
  }
}

/**
 * Get tier benefits
 */
export function getTierBenefits(tier: PassportTier): string[] {
  switch (tier) {
    case 'WHALE':
      return [
        'Highest daily sponsorship limits',
        'Priority processing queue',
        'Dedicated support channel',
        'No historical tx requirement',
        'Custom policy configurations',
      ];
    case 'PREMIUM':
      return [
        'Increased daily sponsorship limits',
        'Priority processing',
        'Relaxed historical tx requirement',
        'Early access to new features',
      ];
    case 'TRUSTED':
      return [
        'Higher daily limits than Active',
        'Faster processing',
        'Reduced scrutiny',
      ];
    case 'ACTIVE':
      return [
        'Relaxed historical tx requirement',
        'Standard daily limits',
      ];
    case 'NEWCOMER':
      return [
        'Standard policy rules apply',
        'Build history for upgrades',
      ];
    case 'FLAGGED':
      return [
        'Enhanced scrutiny',
        'Reduced limits',
        'Review required for tier upgrade',
      ];
    default:
      return [];
  }
}

/**
 * Get requirements to reach next tier
 */
export function getNextTierRequirements(
  currentTier: PassportTier,
  activity: ActivityMetrics,
  behavior: BehavioralMetrics
): { nextTier: PassportTier | null; requirements: string[] } {
  switch (currentTier) {
    case 'NEWCOMER':
      return {
        nextTier: 'ACTIVE',
        requirements: [
          `Need ${Math.max(0, config.tiers.active.minSponsorships - activity.sponsorshipCount)} more sponsorships`,
          `Maintain ${config.tiers.active.minSuccessRate / 100}% success rate`,
        ],
      };
    case 'ACTIVE':
      return {
        nextTier: 'TRUSTED',
        requirements: [
          `Need ${Math.max(0, config.tiers.trusted.minSponsorships - activity.sponsorshipCount)} more sponsorships`,
          `Maintain ${config.tiers.trusted.minSuccessRate / 100}% success rate`,
          `Use ${Math.max(0, config.tiers.trusted.minProtocols - activity.protocolCount)} more protocols`,
        ],
      };
    case 'TRUSTED':
      return {
        nextTier: 'PREMIUM',
        requirements: [
          `Need ${Math.max(0, config.tiers.premium.minSponsorships - activity.sponsorshipCount)} more sponsorships`,
          `Maintain ${config.tiers.premium.minSuccessRate / 100}% success rate`,
          `Use ${Math.max(0, config.tiers.premium.minProtocols - activity.protocolCount)} more protocols`,
          `Improve consistency score (current: ${behavior.consistencyScore.toFixed(2)})`,
        ],
      };
    case 'PREMIUM':
      return {
        nextTier: 'WHALE',
        requirements: [
          `Sponsor $${Math.max(0, config.tiers.whale.minValueUSD - activity.totalValueSponsoredUSD).toFixed(2)} more value`,
          `Maintain PREMIUM criteria`,
        ],
      };
    case 'WHALE':
      return {
        nextTier: null,
        requirements: ['You are at the highest tier!'],
      };
    case 'FLAGGED':
      return {
        nextTier: 'ACTIVE',
        requirements: [
          'Reduce failure rate below 20%',
          'Address flagged issues',
          'Contact support for review',
        ],
      };
    default:
      return { nextTier: null, requirements: [] };
  }
}
