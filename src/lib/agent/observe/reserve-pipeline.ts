/**
 * Reserve Pipeline observations: burn rate, runway, pending x402 payments, forecasting.
 * Used by the supply-side mode to decide REPLENISH_RESERVES, ALLOCATE_BUDGET, ALERT_LOW_RUNWAY.
 */

import { logger } from '../../logger';
import { getPrisma } from '../../db';
import { getDefaultChainName } from './chains';
import { getReserveState } from '../state/reserve-state';
import type { Observation } from './index';

/** Average ETH burned per sponsorship (approx 200k gas at low gwei on Base) */
const AVG_GAS_COST_ETH = 0.00005;

/**
 * Calculate burn rate from recent sponsorship history (Decision table, last 24h).
 */
export async function observeBurnRate(): Promise<Observation[]> {
  try {
    const db = getPrisma();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const recentSponsorships = await db.decision.count({
      where: {
        action: 'SPONSOR_TRANSACTION',
        createdAt: { gte: since },
        status: 'EXECUTED',
      },
    });

    const dailyBurnETH = recentSponsorships * AVG_GAS_COST_ETH;

    return [
      {
        id: `burn-rate-${Date.now()}`,
        timestamp: new Date(),
        source: 'api',
        data: {
          sponsorshipsLast24h: recentSponsorships,
          avgGasCostETH: AVG_GAS_COST_ETH,
          dailyBurnRateETH: dailyBurnETH,
        },
        context: `Burn rate: ${recentSponsorships} sponsorships/24h, ~${dailyBurnETH.toFixed(6)} ETH/day`,
      },
    ];
  } catch (error) {
    // #region agent log
    const e = error as { code?: string; message?: string; name?: string };
    fetch('http://127.0.0.1:7248/ingest/d6915d2c-7cdc-4e4d-9879-2c5523431d83',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'reserve-pipeline.ts:observeBurnRate catch',message:'burn rate DB error',data:{errCode:e?.code,errMessage:e?.message?.slice(0,200),errName:e?.name},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H3'})}).catch(()=>{});
    // #endregion
    logger.error('[ReservePipeline] Error observing burn rate', { error });
    return [];
  }
}

/**
 * Calculate runway: days of sponsorship remaining at current burn rate.
 */
export async function observeRunway(): Promise<Observation[]> {
  const reserveState = await getReserveState();
  const { getAgentWalletBalance } = await import('./sponsorship');
  const reserves = await getAgentWalletBalance();

  const dailyBurn = reserveState?.dailyBurnRateETH ?? 0;
  const runwayDays = dailyBurn > 0 ? reserves.ETH / dailyBurn : 999;

  const thresholdDays = Number(process.env.RUNWAY_ALERT_DAYS) || 7;

  return [
    {
      id: `runway-${Date.now()}`,
      timestamp: new Date(),
      source: 'api',
      data: {
        runwayDays: runwayDays >= 999 ? 999 : Math.round(runwayDays * 10) / 10,
        ethBalance: reserves.ETH,
        usdcBalance: reserves.USDC,
        dailyBurnRateETH: dailyBurn,
        belowThreshold: runwayDays < thresholdDays,
        thresholdDays,
      },
      context:
        runwayDays < thresholdDays
          ? `RUNWAY LOW: ${runwayDays.toFixed(1)} days remaining (threshold: ${thresholdDays})`
          : `Runway: ${runwayDays >= 999 ? '∞' : runwayDays.toFixed(1)} days at current burn rate`,
    },
  ];
}

/**
 * Observe pending x402 payment records (CONFIRMED, not yet allocated).
 */
export async function observePendingPayments(): Promise<Observation[]> {
  try {
    const db = getPrisma();

    const pending = await db.paymentRecord.findMany({
      where: { status: 'CONFIRMED' },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    if (pending.length === 0) return [];

    return [
      {
        id: `pending-payments-${Date.now()}`,
        timestamp: new Date(),
        source: 'api',
        data: {
          pendingCount: pending.length,
          payments: pending.map((p) => ({
            paymentHash: p.paymentHash,
            amount: p.amount.toString(),
            currency: p.currency,
            requester: p.requester,
          })),
        },
        context: `${pending.length} pending x402 payments awaiting budget allocation`,
      },
    ];
  } catch (error) {
    logger.error('[ReservePipeline] Error observing pending payments', { error });
    return [];
  }
}

/**
 * Forecast burn rate from last 7 days of history (weighted moving average).
 */
export async function observeForecastedBurnRate(): Promise<Observation[]> {
  const reserveState = await getReserveState();
  const history = reserveState?.burnRateHistory ?? [];

  if (history.length < 7) {
    return [
      {
        id: `forecast-${Date.now()}`,
        timestamp: new Date(),
        source: 'api',
        data: {
          forecastedBurnRate7d: reserveState?.dailyBurnRateETH ?? 0,
          confidence: 'low',
        },
        context: 'Insufficient history for forecasting',
      },
    ];
  }

  const last7 = history.slice(-7);
  const weights = last7.map((_, i) => i + 1);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const forecastedRate = last7.reduce(
    (sum, snap, i) => sum + (snap.ethBurned * weights[i]) / totalWeight,
    0
  );

  return [
    {
      id: `forecast-${Date.now()}`,
      timestamp: new Date(),
      source: 'api',
      data: { forecastedBurnRate7d: forecastedRate, confidence: 'medium' },
      context: `7-day weighted forecast: ${forecastedRate.toFixed(6)} ETH/day`,
    },
  ];
}

/**
 * Aggregate all Reserve Pipeline observations for supply-side decisions.
 */
export async function observeReservePipeline(): Promise<Observation[]> {
  const [
    reserves,
    budgets,
    burnRate,
    runway,
    pendingPayments,
    gasPrice,
    prices,
    forecast,
  ] = await Promise.all([
    import('./sponsorship').then((m) => m.observeAgentReserves()),
    import('./sponsorship').then((m) => m.observeProtocolBudgets()),
    observeBurnRate(),
    observeRunway(),
    observePendingPayments(),
    import('./sponsorship').then((m) => m.observeGasPrice()),
    import('./oracles').then((m) =>
      m.observeOraclePrices(['ETH/USD'], getDefaultChainName())
    ),
    observeForecastedBurnRate(),
  ]);

  return [
    ...reserves,
    ...budgets,
    ...burnRate,
    ...runway,
    ...pendingPayments,
    ...gasPrice,
    ...prices,
    ...forecast,
  ];
}
