/**
 * Aegis Agent - Governance Observation
 *
 * Tracks active proposals, voting power, and delegation for treasury governance.
 * Integrates with Governor Bravo / OZ Governor contracts via viem.
 */

import { createPublicClient, http } from 'viem';
import { base, baseSepolia, mainnet, sepolia } from 'viem/chains';
import type { Observation } from './index';

const CHAIN_ID_TO_CHAIN = {
  [baseSepolia.id]: baseSepolia,
  [base.id]: base,
  [mainnet.id]: mainnet,
  [sepolia.id]: sepolia,
} as const;

/** Governor Bravo style: proposalCount, proposals(id), state(id), quorumVotes */
const GOVERNOR_ABI = [
  {
    inputs: [],
    name: 'proposalCount',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'proposalId', type: 'uint256' }],
    name: 'proposals',
    outputs: [
      { name: 'id', type: 'uint256' },
      { name: 'proposer', type: 'address' },
      { name: 'startBlock', type: 'uint256' },
      { name: 'endBlock', type: 'uint256' },
      { name: 'forVotes', type: 'uint256' },
      { name: 'againstVotes', type: 'uint256' },
      { name: 'abstainVotes', type: 'uint256' },
      { name: 'canceled', type: 'bool' },
      { name: 'executed', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'proposalId', type: 'uint256' }],
    name: 'state',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'quorumVotes',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const PROPOSAL_STATE: Record<number, GovernanceProposal['status']> = {
  0: 'pending',
  1: 'active',
  2: 'rejected',
  3: 'rejected',
  4: 'passed',
  5: 'passed',
  6: 'rejected',
  7: 'executed',
};

/** Voting token: getCurrentVotes (Governor Bravo) or getVotes (OZ), fallback balanceOf */
const VOTING_TOKEN_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'getCurrentVotes',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'getVotes',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'delegates',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

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

function getSupportedChainIds(): number[] {
  const raw = process.env.SUPPORTED_CHAINS;
  if (!raw?.trim()) return [84532];
  return raw
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !Number.isNaN(n) && n > 0);
}

function getPublicClientForChainId(chainId: number) {
  const chain = CHAIN_ID_TO_CHAIN[chainId as keyof typeof CHAIN_ID_TO_CHAIN];
  if (!chain) return null;
  const rpcKey =
    chainId === 84532 ? 'RPC_URL_BASE_SEPOLIA' : `RPC_URL_${chain.name.toUpperCase().replace(/-/g, '_')}`;
  const rpcUrl = process.env[rpcKey] ?? process.env[`RPC_URL_${chainId}`];
  if (!rpcUrl) return null;
  return createPublicClient({
    chain,
    transport: http(rpcUrl),
  });
}

/**
 * Get active governance proposals from Governor Bravo / OZ Governor contract.
 * Requires GOVERNOR_ADDRESS_<CHAIN_ID> to be set per chain.
 */
export async function getGovernanceProposals(
  _treasuryAddress: string,
  chainId: number
): Promise<GovernanceProposal[]> {
  const governorAddress = process.env[`GOVERNOR_ADDRESS_${chainId}`] as `0x${string}` | undefined;
  if (!governorAddress) return [];

  const client = getPublicClientForChainId(chainId);
  if (!client) return [];

  try {
    const count = await client.readContract({
      address: governorAddress,
      abi: GOVERNOR_ABI,
      functionName: 'proposalCount',
    });
    const num = Number(count);
    if (num === 0) return [];

    let quorum = '0';
    try {
      const q = await client.readContract({
        address: governorAddress,
        abi: GOVERNOR_ABI,
        functionName: 'quorumVotes',
      });
      quorum = q.toString();
    } catch {
      // quorumVotes optional on some governors
    }

    const proposals: GovernanceProposal[] = [];
    for (let i = 1; i <= Math.min(num, 50); i++) {
      try {
        const [id, , , endBlock, forVotes, againstVotes, , canceled] =
          await client.readContract({
            address: governorAddress,
            abi: GOVERNOR_ABI,
            functionName: 'proposals',
            args: [BigInt(i)],
          });
        const stateNum = await client.readContract({
          address: governorAddress,
          abi: GOVERNOR_ABI,
          functionName: 'state',
          args: [BigInt(i)],
        });
        const status = PROPOSAL_STATE[Number(stateNum)] ?? 'pending';
        proposals.push({
          id: id.toString(),
          title: `Proposal ${i}`,
          status: canceled ? 'rejected' : status,
          endBlock: Number(endBlock),
          votesFor: forVotes.toString(),
          votesAgainst: againstVotes.toString(),
          quorum: quorum !== '0' ? quorum : undefined,
        });
      } catch {
        // Skip proposal if read fails (e.g. different ABI)
      }
    }
    return proposals;
  } catch {
    return [];
  }
}

/**
 * Get voting power for an address from governance token (getCurrentVotes / getVotes / balanceOf).
 * Requires VOTING_TOKEN_ADDRESS_<CHAIN_ID> to be set.
 */
export async function getVotingPower(
  address: string,
  chainId: number
): Promise<{ power: string; delegatedTo?: string }> {
  const tokenAddress = process.env[`VOTING_TOKEN_ADDRESS_${chainId}`] as `0x${string}` | undefined;
  if (!tokenAddress) return { power: '0' };

  const client = getPublicClientForChainId(chainId);
  if (!client) return { power: '0' };

  const account = address as `0x${string}`;
  try {
    let power: bigint;
    try {
      power = await client.readContract({
        address: tokenAddress,
        abi: VOTING_TOKEN_ABI,
        functionName: 'getCurrentVotes',
        args: [account],
      });
    } catch {
      try {
        power = await client.readContract({
          address: tokenAddress,
          abi: VOTING_TOKEN_ABI,
          functionName: 'getVotes',
          args: [account],
        });
      } catch {
        power = await client.readContract({
          address: tokenAddress,
          abi: VOTING_TOKEN_ABI,
          functionName: 'balanceOf',
          args: [account],
        });
      }
    }
    let delegatedTo: string | undefined;
    try {
      const delegateAddr = await client.readContract({
        address: tokenAddress,
        abi: VOTING_TOKEN_ABI,
        functionName: 'delegates',
        args: [account],
      });
      if (delegateAddr && delegateAddr !== '0x0000000000000000000000000000000000000000')
        delegatedTo = delegateAddr;
    } catch {
      // delegates optional
    }
    return { power: power.toString(), delegatedTo };
  } catch {
    return { power: '0' };
  }
}

/**
 * Aggregate governance state for a treasury address across configured chains.
 */
export async function getGovernanceState(
  treasuryAddress: string,
  chainIds: number[] = getSupportedChainIds()
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
 * Produce observations for the agent from governance state.
 */
export async function observeGovernance(
  treasuryAddress: string,
  chainIds: number[] = getSupportedChainIds()
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
