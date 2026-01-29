/**
 * Aegis Agent - Observation Layer
 * 
 * Responsible for gathering state from various sources:
 * - Blockchain state (balances, contract data)
 * - Oracle data (prices, market conditions)
 * - Events (governance proposals, transfers)
 */

import { observeBlockchainState } from './blockchain';

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
    // Observe blockchain state
    const blockchainState = await observeBlockchainState();
    observations.push(...blockchainState);

    // TODO: Add oracle observations (price feeds, etc.)
    // TODO: Add event monitoring (governance, transfers, etc.)
    // TODO: Add external API observations (market data, etc.)

  } catch (error) {
    console.error('[Observe] Error gathering observations:', error);
  }

  return observations;
}

export { observeBlockchainState } from './blockchain';
