/**
 * Emergency mode: halt sponsorship when reserves are critically low.
 * Updates shared reserve state and optionally posts to Farcaster.
 */

import { logger } from '../logger';
import { getReserveState, updateReserveState } from './state/reserve-state';
import { postToFarcaster } from './social/farcaster';

/**
 * Check reserve state and set emergencyMode when:
 * - ethBalance < criticalThresholdETH, or
 * - runwayDays < 1, or
 * - forecastedRunwayDays < 3 and healthScore < 20
 * Returns true if emergency mode is active (after update).
 */
export async function checkAndUpdateEmergencyMode(): Promise<boolean> {
  const state = await getReserveState();
  if (!state) return false;

  const shouldBeEmergency =
    state.ethBalance < state.criticalThresholdETH ||
    state.runwayDays < 1 ||
    (state.forecastedRunwayDays < 3 && state.healthScore < 20);

  if (shouldBeEmergency !== state.emergencyMode) {
    await updateReserveState({ emergencyMode: shouldBeEmergency });
    logger.warn('[Emergency] Mode changed', { emergencyMode: shouldBeEmergency });

    if (shouldBeEmergency) {
      await postToFarcaster(
        `EMERGENCY: Aegis reserves critically low. ETH: ${state.ethBalance.toFixed(4)}, Runway: ${state.runwayDays.toFixed(1)} days. Sponsorship halted.`
      );
    }
  }

  return shouldBeEmergency;
}
