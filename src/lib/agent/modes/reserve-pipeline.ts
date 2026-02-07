/**
 * Reserve Pipeline mode definition (supply side).
 */

import { observeReservePipeline } from '../observe/reserve-pipeline';
import { reasonAboutReserves } from '../reason/reserve-reasoning';
import { getKeyGuardState } from '../../key-guard';
import { logger } from '../../logger';
import type { AgentMode } from '../types';

export const reservePipelineMode: AgentMode = {
  id: 'reserve-pipeline',
  name: 'Reserve Pipeline',
  config: {
    confidenceThreshold: 0.85,
    maxTransactionValueUsd: 500,
    executionMode: 'LIVE',
    mode: 'reserve-pipeline',
    gasPriceMaxGwei: 5,
    maxActionsPerWindow: 10,
    rateLimitWindowMs: 3600_000,
  },
  observe: () => observeReservePipeline(),
  reason: (observations, memories) => reasonAboutReserves(observations, memories),
  async onStart() {
    const { getAgentWalletBalance } = await import('../observe/sponsorship');
    const reserves = await getAgentWalletBalance();
    const { updateReserveState } = await import('../state/reserve-state');
    await updateReserveState({
      ethBalance: reserves.ETH,
      usdcBalance: reserves.USDC,
      chainId: reserves.chainId,
    });
  },
};

/**
 * Get config respecting KeyGuard state - cannot run LIVE without signing capability.
 */
export function getReservePipelineConfig(): AgentMode['config'] {
  const keyGuardState = getKeyGuardState();
  const effectiveMode = keyGuardState.mode as 'LIVE' | 'SIMULATION' | 'READONLY';

  if (!keyGuardState.canSign && effectiveMode === 'LIVE') {
    logger.warn('[ReservePipeline] LIVE mode requested but no signing key, forcing SIMULATION');
  }

  return {
    ...reservePipelineMode.config,
    executionMode: effectiveMode,
  };
}
