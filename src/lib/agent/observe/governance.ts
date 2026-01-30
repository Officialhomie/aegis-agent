/**
 * Aegis Agent - Governance Observation
 *
 * Tracks active proposals, voting power, and delegation for treasury governance.
 */

import type { Observation } from './index';

export interface GovernanceProposal {
  id: string;
  title: string;
  description?: string;
  status: 'active' | 'passed' | 'rejected' | 'executed' | 'pending';
  endBlock?: number;
  endTime?: number;
  votesFor?: string;
  votesAgainst?: string;
  quorum?: string;
}

export interface GovernanceState {
  proposals: GovernanceProposal[];
  votingPower: string;
  delegatedTo?: string;
  chainId: number;
}

/**
 * Get active governance proposals (stub; integrate with Governor Bravo/Tally subgraph or contracts)
 */
export async function getGovernanceProposals(
  _treasuryAddress: string,
  _chainId: number
): Promise<GovernanceProposal[]> {
  return [];
}

/**
 * Get voting power for an address (stub; integrate with voting token balance or delegation)
 */
export async function getVotingPower(
  _address: string,
  _chainId: number
): Promise<{ power: string; delegatedTo?: string }> {
  return { power: '0' };
}

/**
 * Aggregate governance state for a treasury address
 */
export async function getGovernanceState(
  treasuryAddress: string,
  chainIds: number[] = [84532]
): Promise<GovernanceState[]> {
  const states: GovernanceState[] = [];
  for (const chainId of chainIds) {
    const [proposals, { power, delegatedTo }] = await Promise.all([
      getGovernanceProposals(treasuryAddress, chainId),
      getVotingPower(treasuryAddress, chainId),
    ]);
    states.push({
      proposals,
      votingPower: power,
      delegatedTo,
      chainId,
    });
  }
  return states;
}

/**
 * Produce observations for the agent from governance state
 */
export async function observeGovernance(
  treasuryAddress: string,
  chainIds: number[] = [84532]
): Promise<Observation[]> {
  const states = await getGovernanceState(treasuryAddress, chainIds);
  const observations: Observation[] = [];

  for (const state of states) {
    if (state.proposals.length > 0 || state.votingPower !== '0') {
      observations.push({
        id: `governance-${state.chainId}-${treasuryAddress.slice(0, 10)}`,
        timestamp: new Date(),
        source: 'event',
        chainId: state.chainId,
        data: state,
        context: `Governance: ${state.proposals.length} proposals, voting power ${state.votingPower}`,
      });
    }
  }
  return observations;
}
