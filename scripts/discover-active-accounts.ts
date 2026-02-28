/**
 * Multi-Source Active Smart Account Discovery
 *
 * Discovers active smart accounts from multiple intelligence sources:
 * 1. JiffyScan API (if available)
 * 2. Dune Analytics (historical data)
 * 3. Entry Point events (on-chain)
 * 4. Protocol-specific discovery (Blockscout)
 *
 * Usage:
 *   npx tsx scripts/discover-active-accounts.ts --chain base --protocols uniswap-v4,aave-v3
 *   npx tsx scripts/discover-active-accounts.ts --chain base --source jiffyscan --limit 100
 *   npx tsx scripts/discover-active-accounts.ts --chain base --source dune --limit 100
 */

import 'dotenv/config';
import { discoverFromJiffyScan, getDiscoverySourceStatus } from '../src/lib/agent/observe/jiffyscan';
import { discoverFromDune, isDuneAvailable } from '../src/lib/agent/observe/dune-analytics';
import { getActiveSmartAccounts } from '../src/lib/agent/observe/userOp-monitor';
import { observeContractInteractions } from '../src/lib/agent/observe/sponsorship';
import { CONTRACTS } from '../src/lib/agent/contracts/addresses';
import { validateAccount } from '../src/lib/agent/validation/account-validator';
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
  source: 'all' | 'jiffyscan' | 'dune' | 'entryPoint' | 'protocols';
  protocols: string[];
  limit: number;
  minActivity: number;
  days: number;
} {
  const args = process.argv.slice(2);
  let chain: 'base' | 'baseSepolia' = 'base';
  let source: 'all' | 'jiffyscan' | 'dune' | 'entryPoint' | 'protocols' = 'all';
  let protocols: string[] = [];
  let limit = 100;
  let minActivity = 1;
  let days = 7;

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
    } else if (args[i] === '--days' && args[i + 1]) {
      days = parseInt(args[++i], 10) || 7;
    }
  }

  return { chain, source, protocols, limit, minActivity, days };
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

async function discoverFromDuneSource(
  chain: 'base' | 'baseSepolia',
  limit: number,
  days: number
): Promise<DiscoveryResult> {
  console.log('[Discovery] Attempting Dune Analytics discovery...');

  const result = await discoverFromDune({
    chain: chain === 'base' ? 'base' : 'ethereum',
    days,
    minOps: 1,
    limit,
  });

  if (result.accounts.length === 0) {
    console.log('[Discovery] Dune: No accounts found (API may not be available or no data)');
  } else {
    console.log(`[Discovery] Dune: Found ${result.accounts.length} active accounts`);
  }

  return {
    source: 'dune',
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

/**
 * Enrich discovered accounts with tier data for agent-first prioritization.
 * Filters out tier 0 (EOAs) and adds tier/type metadata.
 */
async function enrichWithTierData(
  accounts: Array<{
    address: Address;
    sources: string[];
    totalActivity: number;
    protocols?: string[];
  }>,
  chain: 'base' | 'baseSepolia'
): Promise<Array<{
  address: Address;
  sources: string[];
  totalActivity: number;
  protocols?: string[];
  agentTier: number;
  agentType: 'ERC8004_AGENT' | 'ERC4337_ACCOUNT' | 'SMART_CONTRACT' | 'EOA' | 'UNKNOWN';
  isERC8004: boolean;
  isERC4337: boolean;
}>> {
  const enriched: Array<{
    address: Address;
    sources: string[];
    totalActivity: number;
    protocols?: string[];
    agentTier: number;
    agentType: 'ERC8004_AGENT' | 'ERC4337_ACCOUNT' | 'SMART_CONTRACT' | 'EOA' | 'UNKNOWN';
    isERC8004: boolean;
    isERC4337: boolean;
  }> = [];

  console.log(`\n[Enrichment] Classifying ${accounts.length} accounts with tier data...`);

  let processed = 0;
  for (const account of accounts) {
    processed++;
    if (processed % 10 === 0 || processed === accounts.length) {
      process.stdout.write(`\r[Enrichment] Classified ${processed}/${accounts.length} accounts...`);
    }

    try {
      const validation = await validateAccount(account.address, chain);

      // ENFORCE: Filter out tier 0 (EOAs) - Agent-first execution guarantee
      if (!validation.isValid || validation.agentTier === 0) {
        console.log(`\n[Enrichment] Rejected EOA: ${account.address.slice(0, 10)}...`);
        continue;
      }

      enriched.push({
        ...account,
        agentTier: validation.agentTier,
        agentType: validation.agentType,
        isERC8004: validation.isERC8004Registered ?? false,
        isERC4337: validation.isERC4337Compatible ?? false,
      });
    } catch (error) {
      console.log(`\n[Enrichment] Validation error for ${account.address.slice(0, 10)}..., defaulting to tier 3`);
      // Default to tier 3 on error
      enriched.push({
        ...account,
        agentTier: 3,
        agentType: 'UNKNOWN',
        isERC8004: false,
        isERC4337: false,
      });
    }
  }

  console.log('\n');
  return enriched;
}

async function main() {
  const { chain, source, protocols, limit, minActivity, days } = parseArgs();

  console.log('=== Multi-Source Active Smart Account Discovery ===\n');
  console.log('Configuration:', {
    chain,
    source,
    protocols: protocols.length > 0 ? protocols : 'none',
    limit,
    minActivity,
    days,
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

  // Source 2: Dune Analytics
  if (source === 'all' || source === 'dune') {
    const duneResult = await discoverFromDuneSource(chain, limit, days);
    results.push(duneResult);
  }

  // Source 3: Protocol-specific discovery (needed for Entry Point monitoring)
  let protocolAccounts: Address[] = [];
  if (source === 'all' || source === 'protocols' || source === 'entryPoint') {
    const defaultProtocols = protocols.length > 0 ? protocols : ['uniswap-v4'];
    const protocolResult = await discoverFromProtocols(defaultProtocols, chain);
    results.push(protocolResult);
    protocolAccounts = protocolResult.accounts.map((a) => a.address);
  }

  // Source 4: Entry Point events (requires smart accounts from protocol discovery)
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

  // Enrich with tier data - Agent-first execution guarantee
  const enrichedAccounts = await enrichWithTierData(Array.from(allAccounts.values()), chain);

  // Sort by tier-based priority (1 > 2 > 3), then multi-source, then activity
  const rankedAccounts = enrichedAccounts.sort((a, b) => {
    // Tier 1 (ERC-8004) has highest priority
    if (a.agentTier !== b.agentTier) {
      return a.agentTier - b.agentTier; // Lower tier number = higher priority
    }
    // Within same tier, prioritize accounts found by multiple sources
    if (a.sources.length !== b.sources.length) {
      return b.sources.length - a.sources.length;
    }
    // Then by activity count
    return b.totalActivity - a.totalActivity;
  });

  // Calculate tier distribution
  const tierStats = {
    tier1: rankedAccounts.filter((a) => a.agentTier === 1).length,
    tier2: rankedAccounts.filter((a) => a.agentTier === 2).length,
    tier3: rankedAccounts.filter((a) => a.agentTier === 3).length,
  };

  console.log('=== Aggregated Rankings (All Sources) ===\n');
  console.log(`Total Unique Accounts: ${rankedAccounts.length}`);
  console.log(`Multi-Source Accounts: ${rankedAccounts.filter((a) => a.sources.length > 1).length}`);
  console.log();
  console.log('Tier Distribution:');
  console.log(`  Tier 1 (ERC-8004 Agents):    ${tierStats.tier1}`);
  console.log(`  Tier 2 (ERC-4337 Accounts):  ${tierStats.tier2}`);
  console.log(`  Tier 3 (Smart Contracts):    ${tierStats.tier3}`);
  console.log();

  if (rankedAccounts.length > 0) {
    console.log('Top 10 Accounts (Tier-Prioritized):');
    rankedAccounts.slice(0, 10).forEach((acc, idx) => {
      const tierLabel =
        acc.agentTier === 1 ? 'T1 (ERC-8004)' :
        acc.agentTier === 2 ? 'T2 (ERC-4337)' :
        'T3 (Smart)';
      console.log(
        `${idx + 1}. ${acc.address.slice(0, 10)}... - ` +
        `${tierLabel} - ` +
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
