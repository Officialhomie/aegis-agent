/**
 * Periodic Farcaster health summaries for transparency.
 */

import { getReserveState, updateReserveState } from '../state/reserve-state';
import { postToFarcaster } from '../social/farcaster';
import type { ReserveState } from '../state/reserve-state';

const FARCASTER_UPDATE_INTERVAL_MS = 4 * 60 * 60 * 1000; // Every 4 hours

/**
 * Post a health summary to Farcaster if enough time has passed since last post.
 */
export async function maybePostFarcasterUpdate(): Promise<void> {
  const state = await getReserveState();
  if (!state) return;

  const lastPost = state.lastFarcasterPost ? new Date(state.lastFarcasterPost).getTime() : 0;
  if (Date.now() - lastPost < FARCASTER_UPDATE_INTERVAL_MS) return;

  const message = buildHealthSummary(state);
  await postToFarcaster(message);
  await updateReserveState({ lastFarcasterPost: new Date().toISOString() });
}

function buildHealthSummary(state: ReserveState): string {
  const statusEmoji = state.healthScore > 70 ? '🟢' : state.healthScore > 40 ? '🟡' : '🔴';
  return `${statusEmoji} Aegis Status Update

Health: ${state.healthScore}/100
ETH Reserves: ${state.ethBalance.toFixed(4)} ETH
Runway: ${state.runwayDays.toFixed(1)} days
Sponsorships (24h): ${state.sponsorshipsLast24h}
Burn Rate: ${state.dailyBurnRateETH.toFixed(6)} ETH/day

Serving ${state.protocolBudgets.length} protocols on Base.`;
}
