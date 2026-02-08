/**
 * Observation Filter - Detect significant changes to skip LLM calls
 *
 * Skip reasoning when observations are stable (no new opportunities, reserves unchanged, etc.)
 * to reduce API costs by 50-60% during quiet periods.
 */

import { logger } from '../../logger';
import { getStateStore } from '../state-store';
import type { Observation } from './index';

const PREVIOUS_OBSERVATIONS_KEY = 'observations:previous';

/**
 * Extract gas price from observations
 */
function extractGasPrice(observations: Observation[]): number | null {
  const gasObs = observations.find(
    (o) => o.data && typeof o.data === 'object' && 'gasPriceGwei' in o.data
  );
  if (gasObs && typeof gasObs.data === 'object' && 'gasPriceGwei' in gasObs.data) {
    const gwei = gasObs.data.gasPriceGwei;
    return gwei ? parseFloat(String(gwei)) : null;
  }
  return null;
}

/**
 * Extract low-gas wallets from observations
 */
function extractLowGasWallets(observations: Observation[]): Set<string> {
  const wallets = new Set<string>();
  for (const obs of observations) {
    if (obs.data && typeof obs.data === 'object' && 'lowGasWallets' in obs.data) {
      const data = obs.data as { lowGasWallets?: Array<{ wallet: string }> };
      if (data.lowGasWallets && Array.isArray(data.lowGasWallets)) {
        data.lowGasWallets.forEach((w) => {
          if (w.wallet) wallets.add(w.wallet.toLowerCase());
        });
      }
    }
  }
  return wallets;
}

/**
 * Extract reserves from observations (ETH and USDC)
 */
function extractReserves(observations: Observation[]): { eth: number | null; usdc: number | null } {
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
function extractProtocolBudgets(observations: Observation[]): Map<string, number> {
  const budgets = new Map<string, number>();

  for (const obs of observations) {
    if (obs.data && typeof obs.data === 'object' && 'protocolBudgets' in obs.data) {
      const data = obs.data as {
        protocolBudgets?: Array<{ protocolId: string; balanceUSD: number }>;
      };
      if (data.protocolBudgets && Array.isArray(data.protocolBudgets)) {
        data.protocolBudgets.forEach((p) => {
          if (p.protocolId && typeof p.balanceUSD === 'number') {
            budgets.set(p.protocolId, p.balanceUSD);
          }
        });
      }
    }
  }

  return budgets;
}

/**
 * Extract failed transactions count from observations
 */
function extractFailedTransactionsCount(observations: Observation[]): number {
  for (const obs of observations) {
    if (obs.data && typeof obs.data === 'object' && 'failedTransactions' in obs.data) {
      const data = obs.data as { failedTransactions?: Array<unknown> };
      if (data.failedTransactions && Array.isArray(data.failedTransactions)) {
        return data.failedTransactions.length;
      }
    }
  }
  return 0;
}

/**
 * Check if observations have changed significantly
 *
 * Returns true if any of these conditions are met:
 * - New low-gas wallets appeared
 * - Reserve ETH dropped > 10%
 * - Reserve USDC dropped > 10%
 * - Any protocol budget changed > 15%
 * - Gas price changed > 0.5 Gwei
 * - New failed transactions appeared
 */
export async function hasSignificantChange(
  current: Observation[],
  previous: Observation[] | null
): Promise<boolean> {
  // First run - always consider significant
  if (!previous || previous.length === 0) {
    logger.debug('[ObservationFilter] First run - no previous observations');
    return true;
  }

  // Extract current state
  const currentGasPrice = extractGasPrice(current);
  const currentWallets = extractLowGasWallets(current);
  const currentReserves = extractReserves(current);
  const currentBudgets = extractProtocolBudgets(current);
  const currentFailedTxs = extractFailedTransactionsCount(current);

  // Extract previous state
  const previousGasPrice = extractGasPrice(previous);
  const previousWallets = extractLowGasWallets(previous);
  const previousReserves = extractReserves(previous);
  const previousBudgets = extractProtocolBudgets(previous);
  const previousFailedTxs = extractFailedTransactionsCount(previous);

  // Check 1: New low-gas wallets
  const newWallets = Array.from(currentWallets).filter((w) => !previousWallets.has(w));
  if (newWallets.length > 0) {
    logger.info('[ObservationFilter] Significant change: New low-gas wallets', {
      count: newWallets.length,
      newWallets: newWallets.slice(0, 3), // Log first 3 for debugging
    });
    return true;
  }

  // Check 2: Reserve ETH drop > 10%
  if (
    currentReserves.eth !== null &&
    previousReserves.eth !== null &&
    previousReserves.eth > 0
  ) {
    const ethChange = Math.abs(currentReserves.eth - previousReserves.eth) / previousReserves.eth;
    if (currentReserves.eth < previousReserves.eth && ethChange > 0.1) {
      logger.info('[ObservationFilter] Significant change: ETH reserve drop > 10%', {
        previous: previousReserves.eth.toFixed(4),
        current: currentReserves.eth.toFixed(4),
        changePercent: (ethChange * 100).toFixed(1),
      });
      return true;
    }
  }

  // Check 3: Reserve USDC drop > 10%
  if (
    currentReserves.usdc !== null &&
    previousReserves.usdc !== null &&
    previousReserves.usdc > 0
  ) {
    const usdcChange =
      Math.abs(currentReserves.usdc - previousReserves.usdc) / previousReserves.usdc;
    if (currentReserves.usdc < previousReserves.usdc && usdcChange > 0.1) {
      logger.info('[ObservationFilter] Significant change: USDC reserve drop > 10%', {
        previous: previousReserves.usdc.toFixed(2),
        current: currentReserves.usdc.toFixed(2),
        changePercent: (usdcChange * 100).toFixed(1),
      });
      return true;
    }
  }

  // Check 4: Protocol budget change > 15%
  for (const [protocolId, currentBudget] of currentBudgets.entries()) {
    const previousBudget = previousBudgets.get(protocolId);
    if (previousBudget && previousBudget > 0) {
      const budgetChange = Math.abs(currentBudget - previousBudget) / previousBudget;
      if (budgetChange > 0.15) {
        logger.info('[ObservationFilter] Significant change: Protocol budget changed > 15%', {
          protocolId,
          previous: previousBudget.toFixed(2),
          current: currentBudget.toFixed(2),
          changePercent: (budgetChange * 100).toFixed(1),
        });
        return true;
      }
    } else if (!previousBudget && currentBudget > 0) {
      // New protocol with budget
      logger.info('[ObservationFilter] Significant change: New protocol budget', {
        protocolId,
        budget: currentBudget.toFixed(2),
      });
      return true;
    }
  }

  // Check 5: Gas price change > 0.5 Gwei
  if (currentGasPrice !== null && previousGasPrice !== null) {
    const gasChange = Math.abs(currentGasPrice - previousGasPrice);
    if (gasChange > 0.5) {
      logger.info('[ObservationFilter] Significant change: Gas price changed > 0.5 Gwei', {
        previous: previousGasPrice.toFixed(2),
        current: currentGasPrice.toFixed(2),
        change: gasChange.toFixed(2),
      });
      return true;
    }
  }

  // Check 6: New failed transactions
  if (currentFailedTxs > previousFailedTxs) {
    logger.info('[ObservationFilter] Significant change: New failed transactions', {
      previous: previousFailedTxs,
      current: currentFailedTxs,
      new: currentFailedTxs - previousFailedTxs,
    });
    return true;
  }

  logger.debug('[ObservationFilter] No significant changes detected', {
    currentWallets: currentWallets.size,
    previousWallets: previousWallets.size,
    gasPriceCurrent: currentGasPrice?.toFixed(2),
    gasPricePrevious: previousGasPrice?.toFixed(2),
  });

  return false;
}

/**
 * Save observations for next cycle comparison
 */
export async function savePreviousObservations(observations: Observation[]): Promise<void> {
  const store = await getStateStore();
  await store.set(PREVIOUS_OBSERVATIONS_KEY, JSON.stringify(observations));
}

/**
 * Get previously saved observations
 */
export async function getPreviousObservations(): Promise<Observation[] | null> {
  const store = await getStateStore();
  const data = await store.get(PREVIOUS_OBSERVATIONS_KEY);

  if (!data) return null;

  try {
    const parsed = JSON.parse(data) as Observation[];
    // Reconstitute Date objects
    return parsed.map((obs) => ({
      ...obs,
      timestamp: new Date(obs.timestamp),
    }));
  } catch {
    return null;
  }
}
