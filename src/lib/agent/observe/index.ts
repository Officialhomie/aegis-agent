/**
 * Aegis Agent - Observation Layer
 * 
 * Responsible for gathering state from various sources:
 * - Blockchain state (balances, contract data)
 * - Oracle data (prices, market conditions)
 * - Events (governance proposals, transfers)
 */

import { logger } from '../../logger';
import { getDefaultChainName } from './chains';
import { observeBlockchainState } from './blockchain';
import { observeOraclePrices } from './oracles';
import { observeBotchanRequests } from './botchan';
import type { GovernanceState } from './governance';
import type { DeFiPosition } from './defi';
import type { TokenBalance } from './treasury';

/** Union of observation payloads from different sources */
export type ObservationData =
  | { blockNumber?: string; gasPrice?: string; gasPriceGwei?: string }
  | { treasuryAddress: string; chainName?: string; tokens: TokenBalance[] }
  | { pair: string; price: string; source?: string }
  | GovernanceState
  | { treasuryAddress: string; positions: DeFiPosition[] }
  | Record<string, unknown>;

export interface Observation {
  id: string;
  timestamp: Date;
  source: 'blockchain' | 'oracle' | 'api' | 'event';
  chainId?: number;
  blockNumber?: bigint;
  data: ObservationData;
  context?: string;
}

/**
 * Main observation function - gathers state from all sources
 */
export async function observe(): Promise<Observation[]> {
  const observations: Observation[] = [];

  try {
    const blockchainState = await observeBlockchainState();
    observations.push(...blockchainState);

    const defaultChain = getDefaultChainName();
    const oracleObs = await observeOraclePrices(['ETH/USD'], defaultChain);
    observations.push(...oracleObs);

    const botchanObs = await observeBotchanRequests();
    observations.push(...botchanObs);
  } catch (error) {
    logger.error('[Observe] Error gathering observations', { error: error instanceof Error ? error.message : String(error) });
  }

  return observations;
}

export { observeBlockchainState } from './blockchain';
export {
  observeTreasuryState,
  getTokenBalances,
  getTokenBalancesForChain,
  type TreasuryState,
  type TokenBalance,
  type RiskMetrics,
} from './treasury';
export {
  observeOraclePrices,
  getPrice,
  getChainlinkPrice,
  getCoinGeckoPrice,
  type PriceFeedResult,
} from './oracles';
export {
  getDeFiPositions as getDeFiPositionsFromDefi,
  observeDeFiPositions,
  type DeFiPosition,
  type LendingPosition,
  type LiquidityPosition,
} from './defi';
export {
  getGovernanceState as getGovernanceStateFromGov,
  observeGovernance,
  type GovernanceState,
  type GovernanceProposal,
} from './governance';
export {
  observeBaseSponsorshipOpportunities,
  observeLowGasWallets,
  observeFailedTransactions,
  observeNewWalletActivations,
  observeProtocolBudgets,
  observeAgentReserves,
  observeGasPrice,
  getOnchainTxCount,
  getProtocolBudget,
  getProtocolBudgets,
  getAgentWalletBalance,
} from './sponsorship';
export {
  observeReservePipeline,
  observeBurnRate,
  observeRunway,
  observePendingPayments,
  observeForecastedBurnRate,
} from './reserve-pipeline';
export { observeBotchanRequests } from './botchan';