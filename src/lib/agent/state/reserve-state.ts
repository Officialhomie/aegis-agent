/**
 * Shared reserve state - read/written by both Reserve Pipeline and Gas Sponsorship.
 * Persisted to Redis/memory store for coordination across modes.
 */

import { getStateStore } from '../state-store';
import { logger } from '../../logger';

const RESERVE_STATE_KEY = 'aegis:reserve_state';

export interface BurnRateSnapshot {
  timestamp: string;
  sponsorships: number;
  ethBurned: number;
}

export interface ProtocolBudgetState {
  protocolId: string;
  balanceUSD: number;
  totalSpent: number;
  burnRateUSDPerDay: number;
  estimatedDaysRemaining: number;
}

export interface ReserveState {
  /** Current ETH balance for sponsorship */
  ethBalance: number;
  /** Current USDC balance (convertible to ETH) */
  usdcBalance: number;
  /** Chain ID where reserves are held */
  chainId: number;
  /** Average ETH burned per sponsorship (rolling 24h) */
  avgBurnPerSponsorship: number;
  /** Total sponsorships in last 24h */
  sponsorshipsLast24h: number;
  /** Daily burn rate in ETH */
  dailyBurnRateETH: number;
  /** Estimated runway in days at current burn rate */
  runwayDays: number;
  /** Target ETH reserve level */
  targetReserveETH: number;
  /** Critical ETH threshold (below = emergency) */
  criticalThresholdETH: number;
  /** Health score 0-100 (100 = fully funded, 0 = depleted) */
  healthScore: number;
  /** Per-protocol budget status */
  protocolBudgets: ProtocolBudgetState[];
  /** Last updated timestamp */
  lastUpdated: string;
  /** Emergency mode active - sponsorship halted */
  emergencyMode: boolean;
  /** 7-day forecasted burn rate (ETH/day) */
  forecastedBurnRate7d: number;
  /** Runway days based on forecasted burn rate */
  forecastedRunwayDays: number;
  /** Last Farcaster health post timestamp */
  lastFarcasterPost: string | null;
  /** History for burn rate forecasting */
  burnRateHistory: BurnRateSnapshot[];
}

function getDefaults(): ReserveState {
  return {
    ethBalance: 0,
    usdcBalance: 0,
    chainId: 8453,
    avgBurnPerSponsorship: 0,
    sponsorshipsLast24h: 0,
    dailyBurnRateETH: 0,
    runwayDays: 0,
    targetReserveETH: Number(process.env.TARGET_RESERVE_ETH) || 0.5,
    criticalThresholdETH: Number(process.env.RESERVE_CRITICAL_ETH) || 0.05,
    healthScore: 0,
    protocolBudgets: [],
    lastUpdated: new Date().toISOString(),
    emergencyMode: false,
    forecastedBurnRate7d: 0,
    forecastedRunwayDays: 0,
    lastFarcasterPost: null,
    burnRateHistory: [],
  };
}

/** Read current reserve state from store */
export async function getReserveState(): Promise<ReserveState | null> {
  const store = await getStateStore();
  const raw = await store.get(RESERVE_STATE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ReserveState;
    // Ensure enhancement fields exist for backward compatibility
    return {
      ...getDefaults(),
      ...parsed,
      emergencyMode: parsed.emergencyMode ?? false,
      forecastedBurnRate7d: parsed.forecastedBurnRate7d ?? 0,
      forecastedRunwayDays: parsed.forecastedRunwayDays ?? 0,
      lastFarcasterPost: parsed.lastFarcasterPost ?? null,
      burnRateHistory: Array.isArray(parsed.burnRateHistory) ? parsed.burnRateHistory : [],
    };
  } catch {
    logger.warn('[ReserveState] Failed to parse stored state');
    return null;
  }
}

/** Write updated reserve state to store */
export async function setReserveState(state: ReserveState): Promise<void> {
  const store = await getStateStore();
  const updated = { ...state, lastUpdated: new Date().toISOString() };
  await store.set(RESERVE_STATE_KEY, JSON.stringify(updated));
}

/** Update specific fields without overwriting entire state */
export async function updateReserveState(updates: Partial<ReserveState>): Promise<ReserveState> {
  const current = await getReserveState();
  const defaults = getDefaults();
  const merged = { ...(current ?? defaults), ...updates } as ReserveState;

  if (merged.dailyBurnRateETH > 0) {
    merged.runwayDays = merged.ethBalance / merged.dailyBurnRateETH;
  }
  if (merged.forecastedBurnRate7d > 0) {
    merged.forecastedRunwayDays = merged.ethBalance / merged.forecastedBurnRate7d;
  }
  merged.healthScore = calculateHealthScore(merged);

  await setReserveState(merged);
  return merged;
}

function calculateHealthScore(state: ReserveState): number {
  if (state.ethBalance <= 0) return 0;
  if (state.ethBalance >= state.targetReserveETH) return 100;
  const ratio = state.ethBalance / state.targetReserveETH;
  return Math.round(ratio * 100);
}
