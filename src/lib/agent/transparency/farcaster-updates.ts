/**
 * Periodic Farcaster health summaries for transparency.
 */

import { logger } from '../../logger';
import { getReserveState, updateReserveState } from '../state/reserve-state';
import { postToFarcaster } from '../social/farcaster';
import type { ReserveState } from '../state/reserve-state';

const DEFAULT_FARCASTER_UPDATE_INTERVAL_MS = 15 * 60 * 1000; // 15 min (configurable for proof-of-work)
const FARCASTER_UPDATE_INTERVAL_MS =
  Number(process.env.FARCASTER_UPDATE_INTERVAL_MS) || DEFAULT_FARCASTER_UPDATE_INTERVAL_MS;

const DASHBOARD_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? process.env.AEGIS_DASHBOARD_URL ?? 'https://aegis.example.com';
const WARPCAST_CAST_URL = 'https://warpcast.com/~/conversations';

/**
 * Post a health summary to Farcaster if enough time has passed since last post.
 */
export async function maybePostFarcasterUpdate(): Promise<void> {
  const state = await getReserveState();
  if (!state) return;

  const lastPost = state.lastFarcasterPost ? new Date(state.lastFarcasterPost).getTime() : 0;
  if (Date.now() - lastPost < FARCASTER_UPDATE_INTERVAL_MS) return;

  const message = buildHealthSummary(state);
  const result = await postToFarcaster(message);
  await updateReserveState({ lastFarcasterPost: new Date().toISOString() });

  if (result.success && result.castHash) {
    const verifyUrl = `${WARPCAST_CAST_URL}/${result.castHash}`;
    logger.info('[Farcaster] Health update published – verify link', {
      castHash: result.castHash,
      verifyUrl,
    });
  }
}

function buildHealthSummary(state: ReserveState): string {
  const statusEmoji = state.healthScore > 70 ? '🟢' : state.healthScore > 40 ? '🟡' : '🔴';
  return `${statusEmoji} Aegis Status Update

Health: ${state.healthScore}/100
ETH Reserves: ${state.ethBalance.toFixed(4)} ETH
Runway: ${state.runwayDays.toFixed(1)} days
Sponsorships (24h): ${state.sponsorshipsLast24h}
Burn Rate: ${state.dailyBurnRateETH.toFixed(6)} ETH/day

Serving ${state.protocolBudgets.length} protocols on Base.

🔗 Dashboard: ${DASHBOARD_URL}
#BasePaymaster #AutonomousAgent #BuildOnBase`;
}
