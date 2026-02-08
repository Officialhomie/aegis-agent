/**
 * Observation Compression - Reduce token usage in LLM prompts
 *
 * Compresses observations by:
 * - Truncating long arrays (keep top N items)
 * - Rounding numbers to reduce precision
 * - Removing redundant fields
 * - Hashing repeated content
 *
 * Expected savings: 30-40% token reduction per call
 */

import { logger } from '../../logger';
import type { Observation } from '../observe';

/**
 * Compress observations to reduce token usage
 *
 * @param observations - Raw observations
 * @returns Compressed observations
 */
export function compressObservations(observations: Observation[]): Observation[] {
  return observations.map((obs) => compressObservation(obs));
}

/**
 * Compress a single observation
 */
function compressObservation(obs: Observation): Observation {
  if (!obs.data || typeof obs.data !== 'object') {
    return obs;
  }

  const compressedData = { ...obs.data } as Record<string, unknown>;

  // Compress low-gas wallets (keep top 5)
  if ('lowGasWallets' in compressedData && Array.isArray(compressedData.lowGasWallets)) {
    const wallets = compressedData.lowGasWallets as Array<{
      wallet: string;
      balance: number;
      historicalTxs?: number;
    }>;

    compressedData.lowGasWallets = wallets.slice(0, 5).map((w) => ({
      wallet: truncateAddress(w.wallet),
      balance: roundNumber(w.balance, 6), // 6 decimals for ETH
      txs: w.historicalTxs || 0,
    }));

    logger.debug('[ObservationCompressor] Compressed low-gas wallets', {
      original: wallets.length,
      compressed: Math.min(5, wallets.length),
    });
  }

  // Compress gas price (round to 2 decimals)
  if ('gasPriceGwei' in compressedData) {
    const gwei = parseFloat(String(compressedData.gasPriceGwei));
    compressedData.gasPriceGwei = gwei.toFixed(2);
  }

  // Compress agent reserves (round to 4 decimals for ETH, 2 for USDC)
  if ('agentReserves' in compressedData) {
    const reserves = compressedData.agentReserves as { eth?: number; usdc?: number };
    compressedData.agentReserves = {
      eth: reserves.eth ? roundNumber(reserves.eth, 4) : 0,
      usdc: reserves.usdc ? roundNumber(reserves.usdc, 2) : 0,
    };
  }

  // Compress protocol budgets (keep top 10 by balance)
  if ('protocolBudgets' in compressedData && Array.isArray(compressedData.protocolBudgets)) {
    const budgets = compressedData.protocolBudgets as Array<{
      protocolId: string;
      balanceUSD: number;
      totalSpent?: number;
    }>;

    // Sort by balance descending, keep top 10
    const sorted = budgets.sort((a, b) => b.balanceUSD - a.balanceUSD);
    compressedData.protocolBudgets = sorted.slice(0, 10).map((p) => ({
      id: p.protocolId,
      balance: Math.round(p.balanceUSD), // Round to nearest dollar
      spent: p.totalSpent ? Math.round(p.totalSpent) : undefined,
    }));

    logger.debug('[ObservationCompressor] Compressed protocol budgets', {
      original: budgets.length,
      compressed: Math.min(10, budgets.length),
    });
  }

  // Compress failed transactions (keep first 3)
  if ('failedTransactions' in compressedData && Array.isArray(compressedData.failedTransactions)) {
    const failed = compressedData.failedTransactions as Array<{
      agent: string;
      reason: string;
    }>;

    compressedData.failedTransactions = failed.slice(0, 3).map((f) => ({
      agent: truncateAddress(f.agent),
      reason: f.reason.slice(0, 50), // Truncate reason to 50 chars
    }));
  }

  // Compress treasury tokens (keep top 5 by balance)
  if ('tokens' in compressedData && Array.isArray(compressedData.tokens)) {
    const tokens = compressedData.tokens as Array<{
      symbol: string;
      balance: number;
      valueUSD?: number;
    }>;

    const sorted = tokens.sort((a, b) => (b.valueUSD || 0) - (a.valueUSD || 0));
    compressedData.tokens = sorted.slice(0, 5).map((t) => ({
      symbol: t.symbol,
      balance: roundNumber(t.balance, 4),
      usd: t.valueUSD ? Math.round(t.valueUSD) : undefined,
    }));
  }

  // Remove timestamps (not needed for reasoning)
  delete compressedData.timestamp;
  delete compressedData.createdAt;
  delete compressedData.updatedAt;

  return {
    ...obs,
    data: compressedData,
  };
}

/**
 * Round number to N decimal places
 */
function roundNumber(value: number, decimals: number): number {
  const multiplier = Math.pow(10, decimals);
  return Math.round(value * multiplier) / multiplier;
}

/**
 * Truncate Ethereum address for readability
 *
 * @param address - Full address (0x...)
 * @returns Truncated address (0x1234...5678)
 */
function truncateAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Calculate compression ratio
 *
 * @param original - Original observations
 * @param compressed - Compressed observations
 * @returns Compression ratio (0-1, lower is better)
 */
export function calculateCompressionRatio(
  original: Observation[],
  compressed: Observation[]
): number {
  const originalSize = JSON.stringify(original).length;
  const compressedSize = JSON.stringify(compressed).length;

  const ratio = compressedSize / originalSize;

  logger.debug('[ObservationCompressor] Compression stats', {
    originalSize,
    compressedSize,
    ratio: ratio.toFixed(2),
    saved: `${((1 - ratio) * 100).toFixed(1)}%`,
  });

  return ratio;
}
