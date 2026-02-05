/**
 * Gas Sponsorship mode definition (demand side).
 * Reads shared reserve state; skips observation when health low or emergency;
 * uses adaptive confidence threshold when health score &lt; 50.
 */

import { getConfigNumber } from '../../config';
import { logger } from '../../logger';
import { observeBaseSponsorshipOpportunities } from '../observe/sponsorship';
import { reasonAboutSponsorship } from '../reason';
import { getReserveState } from '../state/reserve-state';
import type { AgentMode } from '../types';

const BASE_CONFIDENCE = 0.8;
const DEGRADED_CONFIDENCE = 0.9;
const HEALTH_SKIP_THRESHOLD = getConfigNumber('GAS_SPONSORSHIP_HEALTH_SKIP_THRESHOLD', 10, 0, 100);
const HEALTH_DEGRADED_THRESHOLD = 50;

export const gasSponsorshipMode: AgentMode = {
  id: 'gas-sponsorship',
  name: 'Gas Sponsorship',
  config: {
    confidenceThreshold: BASE_CONFIDENCE,
    maxTransactionValueUsd: 100,
    executionMode: 'LIVE',
    mode: 'gas-sponsorship',
    gasPriceMaxGwei: 2,
    maxActionsPerWindow: 10,
    rateLimitWindowMs: 3600_000,
  },
  observe: async () => {
    const state = await getReserveState();
    if (state) {
      if (state.emergencyMode) {
        logger.info('[GasSponsorship] Skipping observation: emergency mode active');
        return [];
      }
      if (state.healthScore < HEALTH_SKIP_THRESHOLD) {
        logger.info('[GasSponsorship] Skipping observation: health score below threshold', {
          healthScore: state.healthScore,
          threshold: HEALTH_SKIP_THRESHOLD,
        });
        return [];
      }
    }
    return observeBaseSponsorshipOpportunities();
  },
  reason: (observations, memories) => reasonAboutSponsorship(observations, memories),
};

/**
 * Get config with adaptive confidence threshold based on current reserve state.
 * When healthScore < 50, confidence threshold is raised to 0.9.
 * Call this from the orchestrator before validate/execute.
 */
export async function getAdaptiveGasSponsorshipConfig(): Promise<AgentMode['config']> {
  const state = await getReserveState();
  const confidenceThreshold =
    state && state.healthScore < HEALTH_DEGRADED_THRESHOLD && !state.emergencyMode
      ? DEGRADED_CONFIDENCE
      : BASE_CONFIDENCE;
  return {
    ...gasSponsorshipMode.config,
    confidenceThreshold,
  };
}
