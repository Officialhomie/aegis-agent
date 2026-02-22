/**
 * Execution Guarantees - Public API
 *
 * SLA-backed gas sponsorship with budget reservation and refunds.
 *
 * Service Tiers:
 * - BRONZE: Best effort, no SLA, no premium
 * - SILVER: 95% within 5 min, 15% premium, 50% refund on breach
 * - GOLD: 99% within 2 min, 30% premium, 100% refund on breach
 *
 * Guarantee Types:
 * - GAS_BUDGET: Reserve $X for a specific agent
 * - TX_COUNT: Reserve N transactions
 * - TIME_WINDOW: Execute within X ms or refund
 */

// Types
export type {
  GuaranteeType,
  GuaranteeStatus,
  ServiceTier,
  BreachType,
  RefundStatus,
  TierConfig,
  CreateGuaranteeRequest,
  CreateGuaranteeResult,
  CancelGuaranteeResult,
  ExecutionGuarantee,
  GuaranteeUsageRecord,
  GuaranteeBreachRecord,
  GuaranteeDetails,
  GuaranteeUsageSummary,
  GuaranteeSlaSummary,
  GuaranteeFinancialSummary,
} from './types';

export { TIER_CONFIGS } from './types';

// Lifecycle management
export {
  createGuarantee,
  activateGuarantee,
  expireGuarantee,
  cancelGuarantee,
  depleteGuarantee,
  findActiveGuarantee,
  getGuaranteeDetails,
  listGuarantees,
} from './lifecycle';

// Pricing
export {
  calculatePremium,
  calculateTotalLocked,
  calculateBreachRefund,
  calculateCancellationRefund,
  calculateExpirationRefund,
  calculateReserveBuffer,
  validateProtocolBalance,
  getTierDisplayInfo,
} from './pricing';

// Usage tracking
export {
  recordGuaranteeUsage,
  getGuaranteeUsageHistory,
  checkGuaranteeCapacity,
  checkGasPriceConstraint,
  getDepletionPercentage,
} from './usage';

// Breach handling
export {
  handleSlaBreach,
  approveBreachRefund,
  rejectBreachRefund,
  getPendingBreaches,
  getGuaranteeBreaches,
  checkSlaCompliance,
} from './breach-handler';
