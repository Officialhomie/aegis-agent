/**
 * Shared logic for updating reserve state after a successful sponsorship.
 * Used by both runSponsorshipCycle (index.ts) and MultiModeAgent (gas sponsorship).
 */

import type { ExecutionResult } from './index';

export async function updateReservesAfterSponsorship(
  executionResult: ExecutionResult & { gasUsed?: bigint },
  currentGasPriceGwei?: number
): Promise<void> {
  const { getAgentWalletBalance } = await import('../observe/sponsorship');
  const { getReserveState, updateReserveState } = await import('../state/reserve-state');

  const reserves = await getAgentWalletBalance();
  const current = await getReserveState();

  let updates: Parameters<typeof updateReserveState>[0] = {
    ethBalance: reserves.ETH,
    usdcBalance: reserves.USDC,
    chainId: reserves.chainId,
    sponsorshipsLast24h: (current?.sponsorshipsLast24h ?? 0) + 1,
  };

  if (executionResult.gasUsed != null) {
    const gasPriceGwei = currentGasPriceGwei ?? 0.001;
    const ethBurned = (Number(executionResult.gasUsed) * gasPriceGwei) / 1e9;
    const snapshot = { timestamp: new Date().toISOString(), sponsorships: 1, ethBurned };
    const history = [...(current?.burnRateHistory ?? []).slice(-29), snapshot];
    updates = { ...updates, burnRateHistory: history };
  }

  await updateReserveState(updates);
}
