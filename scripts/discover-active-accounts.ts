/**
 * Multi-Source Active Smart Account Discovery
 *
 * Discovers active smart accounts from multiple intelligence sources:
 * 1. JiffyScan API (if available)
 * 2. Entry Point events (on-chain)
 * 3. Protocol-specific discovery (Blockscout)
 *
 * Usage:
 *   npx tsx scripts/discover-active-accounts.ts --chain base --protocols uniswap-v4,aave-v3
 *   npx tsx scripts/discover-active-accounts.ts --chain base --source jiffyscan --limit 100
 */

import 'dotenv/config';
import { discoverFromJiffyScan, getDiscoverySourceStatus } from '../src/lib/agent/observe/jiffyscan';
import { getActiveSmartAccounts } from '../src/lib/agent/observe/userOp-monitor';
import { observeContractInteractions } from '../src/lib/agent/observe/sponsorship';
import { CONTRACTS } from '../src/lib/agent/contracts/addresses';
import type { Address } from 'viem';

interface DiscoveryResult {
  source: string;
  accounts: {
    address: Address;
    activityCount: number;
    lastActive?: number;
    protocols?: string[];
  }[];
  timestamp: number;
}

function parseArgs(): {
  chain: 'base' | 'baseSepolia';
  source: 'all' | 'jiffyscan' | 'entryPoint' | 'protocols';
  protocols: string[];
  limit: number;
  minActivity: number;
} {
  const args = process.argv.slice(2);
  let chain: 'base' | 'baseSepolia' = 'base';
  let source: 'all' | 'jiffyscan' | 'entryPoint' | 'protocols' = 'all';
  let protocols: string[] = [];
  let limit = 100;
  let minActivity = 1;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--chain' && args[i + 1]) {
      chain = args[++i] as 'base' | 'baseSepolia';
    } else if (args[i] === '--source' && args[i + 1]) {
      source = args[++i] as typeof source;
    } else if (args[i] === '--protocols' && args[i + 1]) {
      protocols = args[++i].split(',').map((s) => s.trim());
    } else if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[++i], 10) || 100;
    } else if (args[i] === '--min-activity' && args[i + 1]) {
      minActivity = parseInt(args[++i], 10) || 1;
    }
  }

  return { chain, source, protocols, limit, minActivity };
}

function getProtocolContracts(protocols: string[], chain: 'base'): Address[] {
  const contracts: Address[] = [];

  for (const protocol of protocols) {
    if (protocol === 'uniswap-v4' && chain === 'base') {
      const v4 = CONTRACTS.base.uniswapV4;
      contracts.push(
        v4.poolManager,
        v4.positionManager,
        v4.universalRouter,
        v4.quoter,
        v4.stateView,
        v4.permit2
      );
    }
    // Add more protocols here
    // else if (protocol === 'aave-v3') { ... }
    // else if (protocol === 'compound-v3') { ... }
  }

  return contracts;
}

async function discoverFromJiffyScanSource(
  chain: 'base' | 'baseSepolia',
  limit: number
): Promise<DiscoveryResult> {
  console.log('[Discovery] Attempting JiffyScan discovery...');

  const result = await discoverFromJiffyScan({
    chain: chain === 'base' ? 'base' : 'mainnet', // Map to JiffyScan chain names
    limit,
    minOps: 1,
    timeframe: '7d',
  });

  if (result.accounts.length === 0) {
    console.log('[Discovery] JiffyScan: No accounts found (API may not be available)');
  } else {
    console.log(`[Discovery] JiffyScan: Found ${result.accounts.length} active accounts`);
  }

  return {
    source: 'jiffyscan',
    accounts: result.accounts.map((acc) => ({
      address: acc.address,
      activityCount: acc.totalOps,
      lastActive: acc.lastSeen,
    })),
    timestamp: Date.now(),
  };
}

async function discoverFromEntryPoint(
  chain: 'base' | 'baseSepolia',
  allSmartAccounts: Address[],
  minActivity: number
): Promise<DiscoveryResult> {
  console.log('[Discovery] Scanning Entry Point events...');

  if (allSmartAccounts.length === 0) {
    console.log('[Discovery] Entry Point: No smart accounts provided for monitoring');
    return {
      source: 'entryPoint',
      accounts: [],
      timestamp: Date.now(),
    };
  }

  const activeAccounts = await getActiveSmartAccounts({
    chainName: chain,
    allSmartAccounts,
    minActivityCount: minActivity,
  });

  console.log(`[Discovery] Entry Point: Found ${activeAccounts.length} active accounts`);

  return {
    source: 'entryPoint',
    accounts: activeAccounts.map((acc) => ({
      address: acc.account,
      activityCount: acc.activityCount,
      lastActive: Date.now(),
    })),
    timestamp: Date.now(),
  };
}

async function discoverFromProtocols(
  protocols: string[],
  chain: 'base' | 'baseSepolia'
): Promise<DiscoveryResult> {
  console.log('[Discovery] Protocol-specific discovery...');

  if (protocols.length === 0) {
    console.log('[Discovery] Protocols: No protocols specified');
    return {
      source: 'protocols',
      accounts: [],
      timestamp: Date.now(),
    };
  }

  const contractAddresses = getProtocolContracts(protocols, chain);

  if (contractAddresses.length === 0) {
    console.log('[Discovery] Protocols: No contracts found for specified protocols');
    return {
      source: 'protocols',
      accounts: [],
      timestamp: Date.now(),
    };
  }

  console.log(`[Discovery] Protocols: Scanning ${contractAddresses.length} contracts`);

  const observations = await observeContractInteractions(contractAddresses, chain);
  const smartAccounts = observations
    .filter((o) => (o.data as { agentWallet?: string }).agentWallet)
    .map((o) => (o.data as { agentWallet: string }).agentWallet as Address);

  // Remove duplicates
  const uniqueAccounts = Array.from(new Set(smartAccounts.map((a) => a.toLowerCase()))).map(
    (a) => a as Address
  );

  console.log(`[Discovery] Protocols: Found ${uniqueAccounts.length} smart accounts`);

  return {
    source: 'protocols',
    accounts: uniqueAccounts.map((address) => ({
      address,
      activityCount: 1, // From Blockscout, we don't have activity count
      protocols: protocols,
    })),
    timestamp: Date.now(),
  };
}

async function main() {
  const { chain, source, protocols, limit, minActivity } = parseArgs();

  console.log('=== Multi-Source Active Smart Account Discovery ===\n');
  console.log('Configuration:', {
    chain,
    source,
    protocols: protocols.length > 0 ? protocols : 'none',
    limit,
    minActivity,
  });
  console.log();

  // Check discovery source availability
  const sourceStatus = await getDiscoverySourceStatus();
  console.log('Discovery Source Status:', {
    jiffyscan: sourceStatus.jiffyscan ? '✓ Available' : '✗ Unavailable',
    entryPoint: sourceStatus.entryPoint ? '✓ Available' : '✗ Unavailable',
    dune: sourceStatus.dune ? '✓ Available' : '✗ Unavailable (requires API key)',
    recommended: sourceStatus.recommended,
  });
  console.log();

  const results: DiscoveryResult[] = [];

  // Source 1: JiffyScan
  if (source === 'all' || source === 'jiffyscan') {
    const jiffyResult = await discoverFromJiffyScanSource(chain, limit);
    results.push(jiffyResult);
  }

  // Source 2: Protocol-specific discovery (needed for Entry Point monitoring)
  let protocolAccounts: Address[] = [];
  if (source === 'all' || source === 'protocols' || source === 'entryPoint') {
    const defaultProtocols = protocols.length > 0 ? protocols : ['uniswap-v4'];
    const protocolResult = await discoverFromProtocols(defaultProtocols, chain);
    results.push(protocolResult);
    protocolAccounts = protocolResult.accounts.map((a) => a.address);
  }

  // Source 3: Entry Point events (requires smart accounts from protocol discovery)
  if (source === 'all' || source === 'entryPoint') {
    if (protocolAccounts.length > 0) {
      const entryPointResult = await discoverFromEntryPoint(chain, protocolAccounts, minActivity);
      results.push(entryPointResult);
    } else {
      console.log('[Discovery] Entry Point: Skipping (no smart accounts from protocol discovery)');
    }
  }

  // Aggregate results
  console.log('\n=== Discovery Results ===\n');

  const allAccounts = new Map<string, {
    address: Address;
    sources: string[];
    totalActivity: number;
    protocols?: string[];
  }>();

  for (const result of results) {
    console.log(`Source: ${result.source}`);
    console.log(`  Accounts: ${result.accounts.length}`);

    if (result.accounts.length > 0) {
      const top5 = result.accounts.slice(0, 5);
      console.log('  Top 5:');
      top5.forEach((acc, idx) => {
        console.log(`    ${idx + 1}. ${acc.address.slice(0, 10)}... (${acc.activityCount} ops)`);
      });
    }
    console.log();

    // Aggregate into combined map
    for (const account of result.accounts) {
      const key = account.address.toLowerCase();
      const existing = allAccounts.get(key);

      if (!existing) {
        allAccounts.set(key, {
          address: account.address,
          sources: [result.source],
          totalActivity: account.activityCount,
          protocols: account.protocols,
        });
      } else {
        existing.sources.push(result.source);
        existing.totalActivity += account.activityCount;
        if (account.protocols) {
          existing.protocols = [...(existing.protocols || []), ...account.protocols];
        }
      }
    }
  }

  // Sort by total activity and multi-source validation
  const rankedAccounts = Array.from(allAccounts.values())
    .sort((a, b) => {
      // Prioritize accounts found by multiple sources
      if (a.sources.length !== b.sources.length) {
        return b.sources.length - a.sources.length;
      }
      // Then by activity count
      return b.totalActivity - a.totalActivity;
    });

  console.log('=== Aggregated Rankings (All Sources) ===\n');
  console.log(`Total Unique Accounts: ${rankedAccounts.length}`);
  console.log(`Multi-Source Accounts: ${rankedAccounts.filter((a) => a.sources.length > 1).length}`);
  console.log();

  if (rankedAccounts.length > 0) {
    console.log('Top 10 Accounts:');
    rankedAccounts.slice(0, 10).forEach((acc, idx) => {
      console.log(
        `${idx + 1}. ${acc.address.slice(0, 10)}... - ` +
        `${acc.totalActivity} ops - ` +
        `Sources: ${acc.sources.join(', ')}`
      );
    });
  }

  console.log('\n=== Next Steps ===\n');
  console.log('Run sponsorship campaign:');
  console.log(`  npx tsx scripts/run-realtime-campaign.ts \\`);
  console.log(`    --protocol ${protocols[0] || 'uniswap-v4'} \\`);
  console.log(`    --chain ${chain} \\`);
  console.log(`    --limit ${Math.min(rankedAccounts.length, 10)}`);

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
