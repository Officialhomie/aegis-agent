/**
 * Reserve Pipeline policy rules: min USDC buffer, max replenish amount, emergency halt.
 */

import { getConfigNumber } from '../../config';
import { getReserveState } from '../state/reserve-state';
import type { Decision } from '../reason/schemas';
import type { ReplenishParams } from '../reason/schemas';
import type { PolicyRule, RuleResult } from './rules';

const MAX_REPLENISH_USDC = getConfigNumber('MAX_REPLENISH_USDC', 500, 10, 10000);
const MIN_USDC_BUFFER_RATIO = 0.2;

function isReplenishDecision(
  decision: Decision
): decision is Decision & { action: 'REPLENISH_RESERVES'; parameters: ReplenishParams } {
  return decision.action === 'REPLENISH_RESERVES' && decision.parameters != null;
}

/**
 * Reserve pipeline policy rules (applied when action is REPLENISH_RESERVES, etc.).
 */
export const reservePolicyRules: PolicyRule[] = [
  {
    name: 'min-usdc-buffer',
    description: 'Maintain minimum USDC buffer (20%) after replenishment',
    severity: 'ERROR',
    validate: async (decision): Promise<RuleResult> => {
      if (!isReplenishDecision(decision)) {
        return { ruleName: 'min-usdc-buffer', passed: true, message: 'N/A', severity: 'ERROR' };
      }
      const reserveState = await getReserveState();
      if (!reserveState) {
        return { ruleName: 'min-usdc-buffer', passed: true, message: 'No state', severity: 'ERROR' };
      }
      const params = decision.parameters;
      const swapAmount = parseFloat(params.amountIn) / 1e6;
      const remainingUSDC = reserveState.usdcBalance - swapAmount;
      const totalValue = reserveState.ethBalance + reserveState.usdcBalance;
      const usdcRatio = totalValue > 0 ? remainingUSDC / totalValue : 0;
      const passed = usdcRatio >= MIN_USDC_BUFFER_RATIO;
      return {
        ruleName: 'min-usdc-buffer',
        passed,
        message: passed
          ? 'USDC buffer maintained'
          : `USDC ratio would drop to ${(usdcRatio * 100).toFixed(1)}% (min ${MIN_USDC_BUFFER_RATIO * 100}%)`,
        severity: 'ERROR',
      };
    },
  },
  {
    name: 'max-replenish-amount',
    description: 'Cap single replenishment to prevent over-swapping',
    severity: 'ERROR',
    validate: async (decision): Promise<RuleResult> => {
      if (!isReplenishDecision(decision)) {
        return { ruleName: 'max-replenish-amount', passed: true, message: 'N/A', severity: 'ERROR' };
      }
      const params = decision.parameters;
      const amount = parseFloat(params.amountIn) / 1e6;
      const passed = amount <= MAX_REPLENISH_USDC;
      return {
        ruleName: 'max-replenish-amount',
        passed,
        message: passed
          ? 'Replenish amount within limit'
          : `Replenish amount $${amount.toFixed(2)} exceeds max $${MAX_REPLENISH_USDC}`,
        severity: 'ERROR',
      };
    },
  },
  {
    name: 'emergency-halt',
    description: 'Block replenishment when emergency mode is active',
    severity: 'ERROR',
    validate: async (decision): Promise<RuleResult> => {
      if (decision.action !== 'REPLENISH_RESERVES') {
        return { ruleName: 'emergency-halt', passed: true, message: 'N/A', severity: 'ERROR' };
      }
      const reserveState = await getReserveState();
      const inEmergency = reserveState?.emergencyMode === true;
      return {
        ruleName: 'emergency-halt',
        passed: !inEmergency,
        message: inEmergency
          ? 'Replenishment blocked: emergency mode active'
          : 'Emergency mode not active',
        severity: 'ERROR',
      };
    },
  },
];
