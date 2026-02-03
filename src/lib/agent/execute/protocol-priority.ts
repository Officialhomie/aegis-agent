/**
 * Protocol prioritization for gas sponsorship: score and sort opportunities
 * using reserve state (protocol budgets) and cost/newness.
 */

import { getReserveState } from '../state/reserve-state';
import type { ProtocolBudgetState } from '../state/reserve-state';

export interface SponsorshipOpportunity {
  protocolId: string;
  userAddress: string;
  estimatedCostUSD?: number;
  isNewWallet?: boolean;
}

export interface PrioritizedOpportunity extends SponsorshipOpportunity {
  priorityScore: number;
  reason: string;
}

/**
 * Prioritize sponsorship opportunities: higher budget remaining and lower cost
 * get higher scores. Uses shared reserve state for protocol budget data.
 */
export async function prioritizeOpportunities(
  opportunities: SponsorshipOpportunity[]
): Promise<PrioritizedOpportunity[]> {
  const reserveState = await getReserveState();
  const protocolBudgets = reserveState?.protocolBudgets ?? [];

  return opportunities
    .map((opp) => {
      const budget = protocolBudgets.find((b: ProtocolBudgetState) => b.protocolId === opp.protocolId);
      let score = 50;

      if (budget && budget.estimatedDaysRemaining > 14) score += 20;
      else if (budget && budget.estimatedDaysRemaining > 7) score += 10;

      if (opp.estimatedCostUSD != null && opp.estimatedCostUSD < 0.1) score += 15;
      else if (opp.estimatedCostUSD != null && opp.estimatedCostUSD < 0.25) score += 5;

      if (opp.isNewWallet) score += 10;

      const reason = `Budget days: ${budget?.estimatedDaysRemaining ?? 'unknown'}`;
      return { ...opp, priorityScore: score, reason };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore);
}
