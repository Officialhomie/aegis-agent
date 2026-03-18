/**
 * Discover ERC-8004 Registered Agents and Sponsor Them
 *
 * Usage:
 *   npx tsx scripts/discover-and-sponsor-agents.ts
 *   npx tsx scripts/discover-and-sponsor-agents.ts --dry-run
 *   npx tsx scripts/discover-and-sponsor-agents.ts --quick          (last 2000 blocks, 1 chunk, fast)
 *   npx tsx scripts/discover-and-sponsor-agents.ts --max 5
 *   npx tsx scripts/discover-and-sponsor-agents.ts --blocks 20000
 *
 * Chunk strategy: Uses public Base RPC for eth_getLogs (no block range limit).
 * Alchemy free tier limits eth_getLogs to 10 blocks; public RPC has no such restriction.
 * Default 50k blocks = 5 sequential chunks (no sleep). --quick = 2k blocks = 1 chunk.
 */

import 'dotenv/config';
import { createPublicClient, http, parseAbiItem } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { ERC8004_ADDRESSES } from '../src/lib/agent/identity/constants';
import { validateAccount } from '../src/lib/agent/validation/account-validator';
import type { Address } from 'viem';

const AGENT_WALLET = process.env.AGENT_WALLET_ADDRESS ?? '0x7B9763b416F89aB9A2468d8E9f041C4542B5612f';
const DEFAULT_CHUNK_SIZE = 10000;
const QUICK_BLOCKS = 2000;

// Public RPCs with no block-range restrictions on eth_getLogs (Alchemy free tier = 10 blocks max)
const PUBLIC_SCAN_RPCS: Record<string, string> = {
  base: 'https://mainnet.base.org',
  'base-sepolia': 'https://sepolia.base.org',
};

function getChain() {
  const networkId = process.env.AGENT_NETWORK_ID ?? 'base-sepolia';
  return networkId === 'base' ? base : baseSepolia;
}

function getScanRpcUrl(): string {
  const networkId = process.env.AGENT_NETWORK_ID ?? 'base-sepolia';
  return PUBLIC_SCAN_RPCS[networkId] ?? 'https://sepolia.base.org';
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

const REGISTERED_EVENT = parseAbiItem('event Registered(uint256 indexed agentId, address indexed owner, string agentURI)');

type RegisteredLog = {
  args: { agentId?: bigint; owner?: Address; agentURI?: string };
  blockNumber: bigint | null;
};

async function discoverRegisteredAgents(
  maxBlocks: number = 50000,
  chunkSize: number = DEFAULT_CHUNK_SIZE
): Promise<DiscoveredAgent[]> {
  const chain = getChain();
  // Use public RPC for eth_getLogs — Alchemy free tier caps at 10 blocks per call
  const scanRpcUrl = getScanRpcUrl();
  const client = createPublicClient({ chain, transport: http(scanRpcUrl) });
  const registryAddress = getRegistryAddress();

  console.log(`\nScanning ERC-8004 Identity Registry: ${registryAddress}`);
  console.log(`Chain: ${chain.name} (${chain.id}) | Scan RPC: ${scanRpcUrl}`);

  const currentBlock = await client.getBlockNumber();
  const fromBlock = currentBlock - BigInt(maxBlocks);
  const totalChunks = Math.ceil(maxBlocks / chunkSize);

  console.log(`Scanning blocks ${fromBlock} to ${currentBlock} (${maxBlocks} blocks, ${totalChunks} chunk${totalChunks > 1 ? 's' : ''})...`);

  const logs: RegisteredLog[] = [];
  let chunkNum = 0;

  for (let from = fromBlock; from <= currentBlock; from += BigInt(chunkSize)) {
    const to = from + BigInt(chunkSize) - 1n > currentBlock ? currentBlock : from + BigInt(chunkSize) - 1n;
    try {
      const chunk = await client.getLogs({ address: registryAddress, event: REGISTERED_EVENT, fromBlock: from, toBlock: to });
      logs.push(...(chunk as RegisteredLog[]));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('block range') || msg.includes('too many') || msg.includes('limit')) {
        const mid = from + (to - from) / 2n;
        console.log(`\n  Splitting chunk (range too large for RPC)...`);
        const [a, b] = await Promise.all([
          client.getLogs({ address: registryAddress, event: REGISTERED_EVENT, fromBlock: from, toBlock: mid }),
          client.getLogs({ address: registryAddress, event: REGISTERED_EVENT, fromBlock: mid + 1n, toBlock: to }),
        ]);
        logs.push(...(a as RegisteredLog[]), ...(b as RegisteredLog[]));
      } else {
        throw err;
      }
    }
    chunkNum++;
    const pct = Math.round((chunkNum / totalChunks) * 100);
    process.stdout.write(`\r  Chunk ${chunkNum}/${totalChunks} (${pct}%) | ${logs.length} events found   `);
  }
  console.log(`\nFound ${logs.length} registration events`);

  const agents: DiscoveredAgent[] = [];

  for (const log of logs) {
    const owner = log.args.owner;
    const agentId = log.args.agentId;
    if (!owner || agentId === undefined) continue;

    if (owner.toLowerCase() === AGENT_WALLET.toLowerCase()) {
      console.log(`  Skipping self: ${owner}`);
      continue;
    }

    try {
      const validation = await validateAccount(owner as Address);
      const blockNumber = log.blockNumber ?? 0n;
      agents.push({ address: owner as Address, agentId, blockNumber, tier: validation.agentTier, accountType: validation.agentType });
      console.log(`  Found: ${owner} | Tier ${validation.agentTier} | ${validation.agentType} | Agent #${agentId}`);
    } catch (error) {
      console.log(`  Error validating ${owner}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return agents;
}

async function sponsorAgent(agent: DiscoveredAgent, dryRun: boolean): Promise<boolean> {
  if (agent.tier === 0) { console.log(`  SKIP (EOA): ${agent.address}`); return false; }

  if (dryRun) {
    console.log(`  DRY RUN - would sponsor: ${agent.address} (Tier ${agent.tier})`);
    return true;
  }

  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const apiKey = process.env.AEGIS_API_KEY;
    const response = await fetch(`${baseUrl}/api/v1/sponsorship/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
      body: JSON.stringify({ agentWallet: agent.address, protocolId: 'aegis-discovery', reason: `Aegis discovered ERC-8004 agent #${agent.agentId}` }),
    });
    const data = await response.json();
    if (response.ok) { console.log(`  SPONSORED: ${agent.address} | Request ID: ${data.requestId}`); return true; }
    console.log(`  FAILED: ${agent.address} | ${data.error ?? 'Unknown error'}`);
    return false;
  } catch (error) {
    console.log(`  ERROR: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const quick = args.includes('--quick');
  const maxIndex = args.indexOf('--max');
  const maxSponsors = maxIndex >= 0 ? parseInt(args[maxIndex + 1], 10) || 10 : 10;
  const blocksIndex = args.indexOf('--blocks');
  const maxBlocks = quick ? QUICK_BLOCKS : (blocksIndex >= 0 ? parseInt(args[blocksIndex + 1], 10) || 50000 : 50000);
  const chunkIndex = args.indexOf('--chunk-size');
  const chunkSize = chunkIndex >= 0 ? parseInt(args[chunkIndex + 1], 10) || DEFAULT_CHUNK_SIZE : DEFAULT_CHUNK_SIZE;

  console.log('=== Aegis Multi-Agent Discovery & Sponsorship ===');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'} | Scan: ${quick ? 'QUICK' : 'FULL'} (${maxBlocks} blocks, ${chunkSize}/chunk)`);
  console.log(`Max sponsors: ${maxSponsors} | Agent wallet: ${AGENT_WALLET}`);

  const agents = await discoverRegisteredAgents(maxBlocks, chunkSize);

  if (agents.length === 0) {
    console.log('\nNo eligible agents found in scanned range.');
    console.log('Try: --quick (last 2k blocks) or --blocks 200000 (wider scan)');
    return;
  }

  const sorted = [...agents].sort((a, b) => b.tier - a.tier);
  console.log(`\n--- Sponsorship Phase (${sorted.length} eligible) ---`);

  let sponsored = 0;
  for (const agent of sorted) {
    if (sponsored >= maxSponsors) { console.log(`\nReached max (${maxSponsors}).`); break; }
    const success = await sponsorAgent(agent, dryRun);
    if (success) sponsored++;
  }

  console.log(`\n=== Summary ===`);
  console.log(`Discovered: ${agents.length} | Sponsored: ${sponsored}`);
  console.log(`T1 ERC-8004: ${agents.filter(a => a.tier === 1).length} | T2 ERC-4337: ${agents.filter(a => a.tier === 2).length} | T3 SC: ${agents.filter(a => a.tier === 3).length} | T0 EOA: ${agents.filter(a => a.tier === 0).length}`);
}

main().catch((err) => { console.error('Fatal error:', err); process.exit(1); });
