/**
 * Discover ERC-8004 Registered Agents and Sponsor Them
 *
 * Scans the ERC-8004 Identity Registry on Base for recently registered agents,
 * validates their account type and tier, and sponsors eligible ones.
 *
 * Usage:
 *   npx tsx scripts/discover-and-sponsor-agents.ts
 *   npx tsx scripts/discover-and-sponsor-agents.ts --dry-run
 *   npx tsx scripts/discover-and-sponsor-agents.ts --max 5
 */

import 'dotenv/config';
import { createPublicClient, http, parseAbiItem } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { ERC8004_ADDRESSES } from '../src/lib/agent/identity/constants';
import { validateAccount } from '../src/lib/agent/validation/account-validator';
import type { Address } from 'viem';

const AGENT_WALLET = process.env.AGENT_WALLET_ADDRESS ?? '0x7B9763b416F89aB9A2468d8E9f041C4542B5612f';

function getChain() {
  const networkId = process.env.AGENT_NETWORK_ID ?? 'base-sepolia';
  return networkId === 'base' ? base : baseSepolia;
}

function getRpcUrl(): string {
  return (
    process.env.BASE_RPC_URL ??
    process.env.RPC_URL_BASE ??
    process.env.RPC_URL_BASE_SEPOLIA ??
    'https://sepolia.base.org'
  );
}

function getRegistryAddress(): `0x${string}` {
  const network = (process.env.ERC8004_NETWORK ?? process.env.AGENT_NETWORK_ID ?? 'base-sepolia') as keyof typeof ERC8004_ADDRESSES;
  return ERC8004_ADDRESSES[network]?.identityRegistry as `0x${string}`;
}

interface DiscoveredAgent {
  address: Address;
  agentId: bigint;
  blockNumber: bigint;
  tier: number;
  accountType: string;
}

async function discoverRegisteredAgents(maxBlocks: number = 50000): Promise<DiscoveredAgent[]> {
  const chain = getChain();
  const rpcUrl = getRpcUrl();
  const client = createPublicClient({ chain, transport: http(rpcUrl) });
  const registryAddress = getRegistryAddress();

  console.log(`\nScanning ERC-8004 Identity Registry: ${registryAddress}`);
  console.log(`Chain: ${chain.name} (${chain.id})`);

  const currentBlock = await client.getBlockNumber();
  const fromBlock = currentBlock - BigInt(maxBlocks);

  console.log(`Scanning blocks ${fromBlock} to ${currentBlock} (${maxBlocks} blocks)...`);

  // Query Registered events
  const registeredEvent = parseAbiItem('event Registered(uint256 indexed agentId, address indexed owner, string agentURI)');

  const logs = await client.getLogs({
    address: registryAddress,
    event: registeredEvent,
    fromBlock,
    toBlock: currentBlock,
  });

  console.log(`Found ${logs.length} registration events`);

  const agents: DiscoveredAgent[] = [];

  for (const log of logs) {
    const owner = log.args.owner;
    const agentId = log.args.agentId;
    if (!owner || agentId === undefined) continue;

    // Skip our own agent
    if (owner.toLowerCase() === AGENT_WALLET.toLowerCase()) {
      console.log(`  Skipping self: ${owner}`);
      continue;
    }

    try {
      const validation = await validateAccount(owner as Address);
      agents.push({
        address: owner as Address,
        agentId,
        blockNumber: log.blockNumber,
        tier: validation.tier,
        accountType: validation.accountType,
      });
      console.log(`  Found: ${owner} | Tier ${validation.tier} | ${validation.accountType} | Agent #${agentId}`);
    } catch (error) {
      console.log(`  Error validating ${owner}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return agents;
}

async function sponsorAgent(agent: DiscoveredAgent, dryRun: boolean): Promise<boolean> {
  if (agent.tier === 0) {
    console.log(`  SKIP (EOA): ${agent.address}`);
    return false;
  }

  if (dryRun) {
    console.log(`  DRY RUN - would sponsor: ${agent.address} (Tier ${agent.tier})`);
    return true;
  }

  try {
    // Use the existing sponsorship cycle endpoint
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const apiKey = process.env.AEGIS_API_KEY;

    const response = await fetch(`${baseUrl}/api/v1/sponsorship/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        agentWallet: agent.address,
        protocolId: 'aegis-discovery',
        reason: `Aegis discovered ERC-8004 agent #${agent.agentId} and is sponsoring its next transaction`,
      }),
    });

    const data = await response.json();
    if (response.ok) {
      console.log(`  SPONSORED: ${agent.address} | Request ID: ${data.requestId}`);
      return true;
    } else {
      console.log(`  FAILED: ${agent.address} | ${data.error ?? 'Unknown error'}`);
      return false;
    }
  } catch (error) {
    console.log(`  ERROR: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const maxIndex = args.indexOf('--max');
  const maxSponsors = maxIndex >= 0 ? parseInt(args[maxIndex + 1], 10) || 10 : 10;
  const blocksIndex = args.indexOf('--blocks');
  const maxBlocks = blocksIndex >= 0 ? parseInt(args[blocksIndex + 1], 10) || 50000 : 50000;

  console.log('=== Aegis Multi-Agent Discovery & Sponsorship ===');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Max sponsors: ${maxSponsors}`);
  console.log(`Agent wallet: ${AGENT_WALLET}`);

  const agents = await discoverRegisteredAgents(maxBlocks);

  if (agents.length === 0) {
    console.log('\nNo eligible agents found.');
    return;
  }

  // Sort by tier (higher tier = higher priority)
  const sorted = [...agents].sort((a, b) => b.tier - a.tier);

  console.log(`\n--- Sponsorship Phase ---`);
  console.log(`Eligible agents: ${sorted.length}`);

  let sponsored = 0;
  for (const agent of sorted) {
    if (sponsored >= maxSponsors) {
      console.log(`\nReached max sponsors (${maxSponsors}). Stopping.`);
      break;
    }

    const success = await sponsorAgent(agent, dryRun);
    if (success) sponsored++;
  }

  console.log(`\n=== Summary ===`);
  console.log(`Discovered: ${agents.length} agents`);
  console.log(`Sponsored: ${sponsored}`);
  console.log(`Tier 1 (ERC-8004): ${agents.filter(a => a.tier === 1).length}`);
  console.log(`Tier 2 (ERC-4337): ${agents.filter(a => a.tier === 2).length}`);
  console.log(`Tier 3 (Smart Contract): ${agents.filter(a => a.tier === 3).length}`);
  console.log(`Tier 0 (EOA - rejected): ${agents.filter(a => a.tier === 0).length}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
