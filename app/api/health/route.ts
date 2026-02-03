/**
 * Health dashboard API - reserve state and status for monitoring.
 */

import { getReserveState } from '../../../src/lib/agent/state/reserve-state';

export async function GET(): Promise<Response> {
  const state = await getReserveState();

  if (!state) {
    return Response.json(
      { status: 'initializing', message: 'Reserve state not yet available' },
      { status: 503 }
    );
  }

  const status = state.emergencyMode
    ? 'emergency'
    : state.healthScore > 50
      ? 'healthy'
      : 'degraded';

  return Response.json({
    status,
    healthScore: state.healthScore,
    ethBalance: state.ethBalance,
    usdcBalance: state.usdcBalance,
    runwayDays: state.runwayDays,
    forecastedRunwayDays: state.forecastedRunwayDays,
    dailyBurnRateETH: state.dailyBurnRateETH,
    sponsorshipsLast24h: state.sponsorshipsLast24h,
    emergencyMode: state.emergencyMode,
    protocolBudgets: state.protocolBudgets.map((b) => ({
      protocolId: b.protocolId,
      balanceUSD: b.balanceUSD,
      estimatedDaysRemaining: b.estimatedDaysRemaining,
    })),
    lastUpdated: state.lastUpdated,
  });
}
