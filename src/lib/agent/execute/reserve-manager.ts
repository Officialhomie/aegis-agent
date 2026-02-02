/**
 * Aegis Agent - Reserve Manager
 *
 * Autonomously maintains ETH reserves via USDC→ETH swaps when below threshold.
 * Uses AgentKit TradeAction for execution.
 */

import { getAgentWalletBalance } from '../observe/sponsorship';
import { getPrice } from '../observe/oracles';
import { getDefaultChainName } from '../observe/chains';
import type { Decision } from '../reason/schemas';
import type { SwapReservesParams } from '../reason/schemas';
import { executeWithAgentKit } from './agentkit';
import type { ExecutionResult } from './index';

const RESERVE_THRESHOLD_ETH = Number(process.env.RESERVE_THRESHOLD_ETH) || 0.1;
const TARGET_RESERVE_ETH = Number(process.env.TARGET_RESERVE_ETH) || 0.5;
const MIN_USDC_FOR_SWAP = Number(process.env.MIN_USDC_FOR_SWAP) || 100;

/**
 * Check reserves and return a SWAP_RESERVES decision if ETH is below threshold and USDC sufficient.
 */
export async function manageReserves(): Promise<Decision | null> {
  const reserves = await getAgentWalletBalance();

  if (reserves.ETH >= RESERVE_THRESHOLD_ETH) {
    return null;
  }

  if (reserves.USDC < MIN_USDC_FOR_SWAP) {
    return null;
  }

  const ethPriceResult = await getPrice('ETH/USD', getDefaultChainName());
  const ethUsd = ethPriceResult ? parseFloat(ethPriceResult.price) : 2000;
  const ethNeeded = TARGET_RESERVE_ETH - reserves.ETH;
  const usdcToSwap = Math.min(reserves.USDC, ethNeeded * ethUsd);

  if (usdcToSwap <= 0) {
    return null;
  }

  const decision: Decision = {
    action: 'SWAP_RESERVES',
    confidence: 0.95,
    reasoning: `Reserve ETH at ${reserves.ETH.toFixed(4)} (below ${RESERVE_THRESHOLD_ETH}). Swapping ${usdcToSwap.toFixed(2)} USDC → ETH to reach target ${TARGET_RESERVE_ETH} ETH.`,
    parameters: {
      tokenIn: 'USDC',
      tokenOut: 'ETH',
      amountIn: String(Math.floor(usdcToSwap * 1e6)), // USDC 6 decimals
      slippageTolerance: 0.01,
    } as SwapReservesParams,
  };

  return decision;
}

/**
 * Execute SWAP_RESERVES decision via AgentKit (USDC→ETH).
 */
export async function executeReserveSwap(
  decision: Decision,
  mode: 'LIVE' | 'SIMULATION'
): Promise<ExecutionResult> {
  if (decision.action !== 'SWAP_RESERVES') {
    return {
      success: false,
      error: `Expected SWAP_RESERVES, got ${decision.action}`,
    };
  }

  return executeWithAgentKit(
    {
      ...decision,
      action: 'SWAP',
      parameters: decision.parameters,
    },
    mode
  );
}
