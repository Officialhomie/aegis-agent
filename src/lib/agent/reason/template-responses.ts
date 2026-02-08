/**
 * Template Responses - Pre-defined decisions for deterministic scenarios
 *
 * Skips LLM reasoning for predictable cases to reduce API costs by 20-30% during quiet hours.
 *
 * Handles:
 * - WAIT when gas too high
 * - WAIT when no opportunities
 * - SWAP_RESERVES when reserves critically low (deterministic thresholds)
 */

import { logger } from '../../logger';
import type { Decision } from './schemas';
import type { Observation } from '../observe';

/**
 * Extract gas price from observations
 */
function getGasPrice(observations: Observation[]): number | null {
  for (const obs of observations) {
    if (obs.data && typeof obs.data === 'object' && 'gasPriceGwei' in obs.data) {
      const gwei = (obs.data as { gasPriceGwei?: string }).gasPriceGwei;
      return gwei ? parseFloat(gwei) : null;
    }
  }
  return null;
}

/**
 * Extract low-gas wallets count from observations
 */
function getLowGasWalletsCount(observations: Observation[]): number {
  for (const obs of observations) {
    if (obs.data && typeof obs.data === 'object' && 'lowGasWallets' in obs.data) {
      const data = obs.data as { lowGasWallets?: Array<unknown> };
      if (data.lowGasWallets && Array.isArray(data.lowGasWallets)) {
        return data.lowGasWallets.length;
      }
    }
  }
  return 0;
}

/**
 * Extract agent reserves from observations
 */
function getAgentReserves(observations: Observation[]): { eth: number | null; usdc: number | null } {
  let eth: number | null = null;
  let usdc: number | null = null;

  for (const obs of observations) {
    if (obs.data && typeof obs.data === 'object') {
      // Check for agent reserves
      if ('agentReserves' in obs.data) {
        const data = obs.data as { agentReserves?: { eth?: number; usdc?: number } };
        if (data.agentReserves) {
          eth = data.agentReserves.eth ?? eth;
          usdc = data.agentReserves.usdc ?? usdc;
        }
      }

      // Check for treasury tokens
      if ('tokens' in obs.data) {
        const data = obs.data as { tokens?: Array<{ symbol: string; balance: number }> };
        if (data.tokens && Array.isArray(data.tokens)) {
          data.tokens.forEach((t) => {
            if (t.symbol === 'ETH') eth = t.balance;
            if (t.symbol === 'USDC') usdc = t.balance;
          });
        }
      }
    }
  }

  return { eth, usdc };
}

/**
 * Extract protocol budgets from observations
 */
function getProtocolBudgets(observations: Observation[]): Array<{ protocolId: string; balanceUSD: number }> {
  for (const obs of observations) {
    if (obs.data && typeof obs.data === 'object' && 'protocolBudgets' in obs.data) {
      const data = obs.data as {
        protocolBudgets?: Array<{ protocolId: string; balanceUSD: number }>;
      };
      if (data.protocolBudgets && Array.isArray(data.protocolBudgets)) {
        return data.protocolBudgets;
      }
    }
  }
  return [];
}

/**
 * Get template decision for deterministic scenarios
 *
 * Returns Decision if scenario matches a template, null otherwise.
 */
export function getTemplateDecision(
  observations: Observation[],
  gasPriceMaxGwei: number = 2
): Decision | null {
  const gasPrice = getGasPrice(observations);
  const lowGasWalletsCount = getLowGasWalletsCount(observations);
  const reserves = getAgentReserves(observations);
  const protocolBudgets = getProtocolBudgets(observations);

  // Template 1: WAIT when gas price too high
  if (gasPrice !== null && gasPrice > gasPriceMaxGwei) {
    logger.info('[TemplateResponse] Gas price too high - WAIT', {
      gasPrice: gasPrice.toFixed(2),
      threshold: gasPriceMaxGwei,
    });

    return {
      action: 'WAIT',
      confidence: 1.0,
      reasoning: `Gas price ${gasPrice.toFixed(2)} Gwei exceeds limit of ${gasPriceMaxGwei} Gwei. Waiting for lower gas conditions.`,
      parameters: null,
      preconditions: [],
      expectedOutcome: 'Re-evaluate next cycle when gas price drops',
      metadata: { template: 'gas-too-high', gasPrice, threshold: gasPriceMaxGwei },
    };
  }

  // Template 2: WAIT when no low-gas wallets (no opportunities)
  if (lowGasWalletsCount === 0) {
    const hasAnyProtocols = protocolBudgets.length > 0;

    logger.debug('[TemplateResponse] No low-gas wallets - WAIT', {
      lowGasWalletsCount: 0,
      protocolsAvailable: protocolBudgets.length,
    });

    return {
      action: 'WAIT',
      confidence: 1.0,
      reasoning: hasAnyProtocols
        ? 'No low-gas wallets detected. All eligible users have sufficient gas.'
        : 'No low-gas wallets detected and no protocols registered.',
      parameters: null,
      preconditions: [],
      expectedOutcome: 'Re-evaluate next cycle for new opportunities',
      metadata: { template: 'no-opportunities', lowGasWalletsCount: 0 },
    };
  }

  // Template 3: SWAP_RESERVES when ETH critically low and USDC available
  if (reserves.eth !== null && reserves.usdc !== null) {
    const ethThreshold = 0.05; // Critical low: 0.05 ETH
    const usdcMinimum = 200; // Need at least 200 USDC to swap

    if (reserves.eth < ethThreshold && reserves.usdc >= usdcMinimum) {
      // Deterministic swap: Convert 200 USDC to ETH
      const amountToSwap = Math.min(200, reserves.usdc * 0.5); // Swap up to 50% of USDC or 200, whichever is less

      logger.info('[TemplateResponse] ETH critically low - SWAP_RESERVES', {
        ethBalance: reserves.eth.toFixed(4),
        usdcBalance: reserves.usdc.toFixed(2),
        swapAmount: amountToSwap.toFixed(2),
      });

      return {
        action: 'SWAP_RESERVES',
        confidence: 0.95,
        reasoning: `Agent ETH balance ${reserves.eth.toFixed(4)} below critical threshold ${ethThreshold}. USDC balance ${reserves.usdc.toFixed(2)} available. Swapping ${amountToSwap.toFixed(2)} USDC to restore ETH reserves.`,
        parameters: {
          tokenIn: 'USDC',
          tokenOut: 'ETH',
          amountIn: amountToSwap.toFixed(2),
          slippageTolerance: 0.01, // 1% slippage
        },
        preconditions: [
          'USDC balance sufficient for swap',
          'Slippage within acceptable range',
          'DEX liquidity available',
        ],
        expectedOutcome: `ETH reserves restored above ${ethThreshold} threshold`,
        metadata: {
          template: 'critical-eth-low',
          ethBalance: reserves.eth,
          usdcBalance: reserves.usdc,
          swapAmount: amountToSwap,
        },
      };
    }
  }

  // Template 4: WAIT when reserves healthy and no urgent actions needed
  if (reserves.eth !== null && reserves.usdc !== null) {
    const ethHealthy = reserves.eth >= 0.1; // Healthy: 0.1+ ETH
    const usdcHealthy = reserves.usdc >= 100; // Healthy: 100+ USDC

    if (ethHealthy && usdcHealthy && lowGasWalletsCount > 0 && lowGasWalletsCount < 3) {
      // Reserves healthy, but few opportunities (< 3 wallets)
      logger.debug('[TemplateResponse] Reserves healthy, few opportunities - WAIT', {
        ethBalance: reserves.eth.toFixed(4),
        usdcBalance: reserves.usdc.toFixed(2),
        lowGasWalletsCount,
      });

      return {
        action: 'WAIT',
        confidence: 0.9,
        reasoning: `Reserves healthy (ETH: ${reserves.eth.toFixed(4)}, USDC: ${reserves.usdc.toFixed(2)}). Only ${lowGasWalletsCount} low-gas wallet(s) - evaluating legitimacy before sponsoring.`,
        parameters: null,
        preconditions: [],
        expectedOutcome: 'Monitor for higher-confidence opportunities',
        metadata: {
          template: 'healthy-reserves-few-opportunities',
          ethBalance: reserves.eth,
          usdcBalance: reserves.usdc,
          lowGasWalletsCount,
        },
      };
    }
  }

  // No template matches - return null to invoke LLM
  return null;
}

/**
 * Check if current scenario matches a deterministic template
 *
 * Returns true if template can be used, false if LLM needed.
 */
export function canUseTemplate(observations: Observation[], gasPriceMaxGwei: number = 2): boolean {
  return getTemplateDecision(observations, gasPriceMaxGwei) !== null;
}
