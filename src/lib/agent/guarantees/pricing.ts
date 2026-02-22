/**
 * Execution Guarantees - Pricing Module
 *
 * Calculates premiums, refunds, and cancellation fees.
 */

import { ServiceTier, TIER_CONFIGS } from './types';

/**
 * Calculate premium for a guarantee
 *
 * @param budgetUsd - The budget amount in USD
 * @param tier - Service tier (BRONZE, SILVER, GOLD)
 * @returns Premium amount in USD
 */
export function calculatePremium(budgetUsd: number, tier: ServiceTier): number {
  const config = TIER_CONFIGS[tier];
  return budgetUsd * config.premiumRate;
}

/**
 * Calculate total locked amount (budget + premium)
 *
 * @param budgetUsd - The budget amount in USD
 * @param tier - Service tier
 * @returns Total amount to lock from protocol balance
 */
export function calculateTotalLocked(budgetUsd: number, tier: ServiceTier): number {
  const premium = calculatePremium(budgetUsd, tier);
  return budgetUsd + premium;
}

/**
 * Calculate refund for SLA breach
 *
 * @param costUsd - Cost of the breached transaction
 * @param tier - Service tier
 * @returns Refund amount in USD
 */
export function calculateBreachRefund(costUsd: number, tier: ServiceTier): number {
  const config = TIER_CONFIGS[tier];
  return costUsd * (config.breachPenalty / 100);
}

/**
 * Calculate refund for cancellation
 *
 * Cancellation refunds unused budget minus a cancellation fee.
 * Cancellation fee is 10% of unused budget or $1, whichever is greater.
 *
 * @param unusedBudgetUsd - Remaining unused budget
 * @param premiumPaid - Original premium paid
 * @returns Object with refund amount and cancellation fee
 */
export function calculateCancellationRefund(
  unusedBudgetUsd: number,
  premiumPaid: number
): { refundAmount: number; cancellationFee: number } {
  // Cancellation fee: 10% of unused or $1 minimum
  const cancellationFee = Math.max(unusedBudgetUsd * 0.1, 1);

  // Refund is unused budget minus cancellation fee
  // Premium is NOT refunded
  const refundAmount = Math.max(0, unusedBudgetUsd - cancellationFee);

  return { refundAmount, cancellationFee };
}

/**
 * Calculate refund for expired guarantee
 *
 * Expired guarantees return full unused budget (no fee).
 *
 * @param unusedBudgetUsd - Remaining unused budget
 * @returns Refund amount in USD
 */
export function calculateExpirationRefund(unusedBudgetUsd: number): number {
  return unusedBudgetUsd;
}

/**
 * Calculate reserve buffer for a guarantee
 *
 * We maintain a 50% buffer of the guarantee amount for potential refunds.
 *
 * @param budgetUsd - The budget amount
 * @param tier - Service tier
 * @returns Reserve buffer amount in USD
 */
export function calculateReserveBuffer(budgetUsd: number, tier: ServiceTier): number {
  const config = TIER_CONFIGS[tier];

  // BRONZE has no SLA, so no reserve needed
  if (tier === 'BRONZE') {
    return 0;
  }

  // Reserve 50% of budget for potential refunds
  return budgetUsd * 0.5;
}

/**
 * Validate protocol has sufficient balance for guarantee
 *
 * @param protocolBalanceUsd - Current protocol balance
 * @param budgetUsd - Requested guarantee budget
 * @param tier - Service tier
 * @returns Object with validation result and required amounts
 */
export function validateProtocolBalance(
  protocolBalanceUsd: number,
  budgetUsd: number,
  tier: ServiceTier
): {
  valid: boolean;
  requiredAmount: number;
  premium: number;
  reserve: number;
  shortfall: number;
} {
  const premium = calculatePremium(budgetUsd, tier);
  const reserve = calculateReserveBuffer(budgetUsd, tier);
  const requiredAmount = budgetUsd + premium + reserve;

  const valid = protocolBalanceUsd >= requiredAmount;
  const shortfall = valid ? 0 : requiredAmount - protocolBalanceUsd;

  return {
    valid,
    requiredAmount,
    premium,
    reserve,
    shortfall,
  };
}

/**
 * Get tier display information
 */
export function getTierDisplayInfo(tier: ServiceTier): {
  label: string;
  description: string;
  premiumPct: string;
  slaTarget: string;
  maxLatency: string;
} {
  const config = TIER_CONFIGS[tier];

  const formatLatency = (ms: number): string => {
    if (ms === 0) return 'No SLA';
    if (ms < 60000) return `${ms / 1000}s`;
    return `${ms / 60000} min`;
  };

  return {
    label: tier,
    description:
      tier === 'BRONZE'
        ? 'Best effort, no guarantees'
        : tier === 'SILVER'
          ? '95% execution within 5 minutes'
          : '99% execution within 2 minutes',
    premiumPct: `${config.premiumRate * 100}%`,
    slaTarget: config.slaTargetPct > 0 ? `${config.slaTargetPct}%` : 'None',
    maxLatency: formatLatency(config.maxLatencyMs),
  };
}
