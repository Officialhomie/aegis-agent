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

/**
 * Calculate health score 0-100 with testnet-aware logic.
 *
 * The score is a weighted combination of:
 * - 40% Balance ratio (vs adaptive target)
 * - 40% Runway health (days of operation remaining)
 * - 20% Activity bonus (reward for being active)
 *
 * On testnet, targets are lower because gas is scarce.
 */
function calculateHealthScore(state: ReserveState): number {
  if (state.ethBalance <= 0) return 0;

  // Adaptive target: lower on testnet (Base Sepolia = 84532)
  const isTestnet = state.chainId === 84532 || process.env.TESTNET_MODE === 'true';
  const adaptiveTarget = isTestnet
    ? Math.max(0.01, state.targetReserveETH * 0.05) // 5% of target on testnet (e.g., 0.025 ETH)
    : state.targetReserveETH;

  // 1. Balance ratio (40% weight) - capped at 100%
  const balanceRatio = Math.min(state.ethBalance / adaptiveTarget, 1);
  const balanceScore = balanceRatio * 40;

  // 2. Runway health (40% weight) - based on days of operation
  // Great: 30+ days, Good: 7+ days, Fair: 1+ days, Low: <1 day
  let runwayScore = 0;
  const effectiveRunway = state.forecastedRunwayDays > 0
    ? state.forecastedRunwayDays
    : state.runwayDays;

  if (effectiveRunway >= 30) {
    runwayScore = 40;
  } else if (effectiveRunway >= 7) {
    runwayScore = 25 + (effectiveRunway - 7) / 23 * 15; // 25-40
  } else if (effectiveRunway >= 1) {
    runwayScore = 10 + (effectiveRunway - 1) / 6 * 15; // 10-25
  } else if (effectiveRunway > 0) {
    runwayScore = effectiveRunway * 10; // 0-10
  }

  // 3. Activity bonus (20% weight) - reward for being active
  // More sponsorships = healthier ecosystem
  let activityScore = 0;
  if (state.sponsorshipsLast24h >= 50) {
    activityScore = 20;
  } else if (state.sponsorshipsLast24h >= 10) {
    activityScore = 12 + (state.sponsorshipsLast24h - 10) / 40 * 8; // 12-20
  } else if (state.sponsorshipsLast24h >= 1) {
    activityScore = 5 + (state.sponsorshipsLast24h - 1) / 9 * 7; // 5-12
  } else {
    // No activity but has balance = minimum baseline
    activityScore = state.ethBalance > 0 ? 3 : 0;
  }

  const totalScore = Math.round(balanceScore + runwayScore + activityScore);
  return Math.min(100, Math.max(0, totalScore));
}
