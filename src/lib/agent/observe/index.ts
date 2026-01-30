/**
 * Aegis Agent - Observation Layer
 * 
 * Responsible for gathering state from various sources:
 * - Blockchain state (balances, contract data)
 * - Oracle data (prices, market conditions)
 * - Events (governance proposals, transfers)
 */

import { observeBlockchainState } from './blockchain';
import { observeTreasury } from './treasury';
import { observeOraclePrices } from './oracles';

export interface Observation {
  id: string;
  timestamp: Date;
  source: 'blockchain' | 'oracle' | 'api' | 'event';
  chainId?: number;
  blockNumber?: bigint;
  data: unknown;
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

    const treasuryAddress = process.env.TREASURY_ADDRESS;
    if (treasuryAddress) {
      const treasuryObs = await observeTreasury(treasuryAddress);
      observations.push(...treasuryObs);
    }

    const oracleObs = await observeOraclePrices(['ETH/USD'], 'baseSepolia');
    observations.push(...oracleObs);
  } catch (error) {
    console.error('[Observe] Error gathering observations:', error);
  }

  return observations;
}

export { observeBlockchainState } from './blockchain';
export {
  observeTreasury,
  observeTreasuryState,
  getTokenBalances,
  getTokenBalancesForChain,
  type TreasuryState,
  type TokenBalance,
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
