/**
 * Discovery Capacity Diagnostic Script
 *
 * Checks API key configuration and estimates daily discovery capacity.
 *
 * Usage:
 *   npx tsx scripts/check-discovery-capacity.ts
 */

import 'dotenv/config';
import { getDiscoverySourceStatus } from '../src/lib/agent/observe/jiffyscan';
import { isDuneAvailable } from '../src/lib/agent/observe/dune-analytics';

interface CapacityEstimate {
  source: string;
  status: 'active' | 'disabled' | 'error';
  dailyCapacity: string;
  cost: string;
  requiresApiKey: boolean;
  apiKeyConfigured: boolean;
  setupUrl?: string;
}

async function checkDiscoveryCapacity() {
  console.log('=== Aegis Discovery Capacity Diagnostic ===\n');

  // Check environment variables
  const jiffyscanKey = process.env.JIFFYSCAN_API_KEY;
  const duneKey = process.env.DUNE_API_KEY;
  const rpcUrl = process.env.RPC_URL_BASE;

  // Discovery source status
  const sourceStatus = await getDiscoverySourceStatus();
  const duneAvailable = await isDuneAvailable();

  console.log('Environment Configuration:');
  console.log(`  RPC URL (Base): ${rpcUrl ? '✓ Configured' : '✗ Missing'}`);
  console.log(`  JiffyScan API Key: ${jiffyscanKey && jiffyscanKey !== '' ? '✓ Configured' : '✗ Empty or missing'}`);
  console.log(`  Dune API Key: ${duneKey && duneKey !== '' ? '✓ Configured' : '✗ Empty or missing'}`);
  console.log();

  // Capacity estimates
  const estimates: CapacityEstimate[] = [
    {
      source: 'Entry Point (On-Chain)',
      status: sourceStatus.entryPoint ? 'active' : 'disabled',
      dailyCapacity: '10-50 accounts',
      cost: 'FREE (uses RPC)',
      requiresApiKey: false,
      apiKeyConfigured: true,
    },
    {
      source: 'Protocol Discovery (Blockscout)',
      status: 'active',
      dailyCapacity: '10-30 accounts',
      cost: 'FREE (public API)',
      requiresApiKey: false,
      apiKeyConfigured: true,
    },
    {
      source: 'JiffyScan API',
      status: sourceStatus.jiffyscan ? 'active' : 'disabled',
      dailyCapacity: '500-800 accounts',
      cost: 'FREE (100 req/hr)',
      requiresApiKey: true,
      apiKeyConfigured: !!(jiffyscanKey && jiffyscanKey !== ''),
      setupUrl: 'https://dashboard.jiffyscan.xyz/',
    },
    {
      source: 'Dune Analytics',
      status: duneAvailable ? 'active' : 'disabled',
      dailyCapacity: '100-200 accounts',
      cost: 'FREE (100 queries/month)',
      requiresApiKey: true,
      apiKeyConfigured: !!(duneKey && duneKey !== ''),
      setupUrl: 'https://dune.com/settings/api',
    },
  ];

  console.log('Discovery Source Status:\n');
  console.log('┌─────────────────────────────────┬──────────┬──────────────────┬──────────────────┐');
  console.log('│ Source                          │ Status   │ Daily Capacity   │ Cost             │');
  console.log('├─────────────────────────────────┼──────────┼──────────────────┼──────────────────┤');

  for (const est of estimates) {
    const statusIcon = est.status === 'active' ? '✓ ACTIVE ' : '✗ DISABLED';
    const source = est.source.padEnd(31);
    const status = statusIcon.padEnd(8);
    const capacity = est.dailyCapacity.padEnd(16);
    const cost = est.cost.padEnd(16);

    console.log(`│ ${source} │ ${status} │ ${capacity} │ ${cost} │`);
  }
  console.log('└─────────────────────────────────┴──────────┴──────────────────┴──────────────────┘');
  console.log();

  // Calculate total capacity
  const activeEstimates = estimates.filter((e) => e.status === 'active');
  const totalMinCapacity = activeEstimates.reduce((sum, est) => {
    const min = parseInt(est.dailyCapacity.split('-')[0], 10) || 0;
    return sum + min;
  }, 0);
  const totalMaxCapacity = activeEstimates.reduce((sum, est) => {
    const max = parseInt(est.dailyCapacity.split('-')[1]?.split(' ')[0] || '0', 10) || 0;
    return sum + max;
  }, 0);

  console.log(`Total Estimated Daily Capacity: ${totalMinCapacity}-${totalMaxCapacity} accounts/day`);
  console.log(`Active Sources: ${activeEstimates.length}/${estimates.length}`);
  console.log();

  // Action items
  const disabledSources = estimates.filter(
    (e) => e.requiresApiKey && !e.apiKeyConfigured
  );

  if (disabledSources.length > 0) {
    console.log('🔧 Action Required:\n');
    console.log('The following sources are DISABLED due to missing API keys:\n');

    for (const source of disabledSources) {
      console.log(`  ❌ ${source.source}`);
      console.log(`     • Potential: ${source.dailyCapacity}`);
      console.log(`     • Cost: ${source.cost}`);
      console.log(`     • Setup: ${source.setupUrl}`);
      console.log(`     • .env var: ${source.source.includes('JiffyScan') ? 'JIFFYSCAN_API_KEY' : 'DUNE_API_KEY'}`);
      console.log();
    }

    const potentialIncrease = disabledSources.reduce((sum, est) => {
      const min = parseInt(est.dailyCapacity.split('-')[0], 10) || 0;
      return sum + min;
    }, 0);

    console.log(`📈 Unlock ${potentialIncrease}+ additional accounts/day by adding API keys!`);
    console.log();
  } else {
    console.log('✅ All discovery sources are ACTIVE!\n');
  }

  // Recommendations
  console.log('📋 Recommendations:\n');

  if (!jiffyscanKey || jiffyscanKey === '') {
    console.log('  1. Get JiffyScan API key (FREE, 5 min):');
    console.log('     → https://dashboard.jiffyscan.xyz/');
    console.log('     → Add to .env: JIFFYSCAN_API_KEY="your_key"');
    console.log('     → Impact: +500-800 accounts/day');
    console.log();
  }

  if (!duneKey || duneKey === '') {
    console.log('  2. Get Dune Analytics API key (FREE, 5 min):');
    console.log('     → https://dune.com/settings/api');
    console.log('     → Add to .env: DUNE_API_KEY="your_key"');
    console.log('     → Impact: +100-200 accounts/day');
    console.log();
  }

  if (activeEstimates.length === estimates.length) {
    console.log('  ✅ All sources active! Next steps:');
    console.log('     1. Run discovery: npx tsx scripts/discover-active-accounts.ts --chain base');
    console.log('     2. Test sponsorship: npx tsx scripts/run-realtime-campaign.ts --limit 10');
    console.log();
  }

  // Week 2-3 expansion preview
  console.log('🚀 Week 2-3 Expansion Potential (with additional integrations):\n');
  console.log('  Week 2: +Wallet APIs (Biconomy, Safe, Alchemy)');
  console.log('    • Estimated: 2,000-3,000 accounts/day');
  console.log('    • Implementation: 8-12 hours');
  console.log();
  console.log('  Week 3: +Social Protocols (Farcaster, Friend.tech)');
  console.log('    • Estimated: 4,000-5,000 accounts/day');
  console.log('    • Implementation: 12-16 hours');
  console.log();
  console.log('  See DISCOVERY_EXPANSION_2026.md for details.');
  console.log();

  // Summary
  console.log('=== Summary ===\n');
  console.log(`Current Capacity: ${totalMinCapacity}-${totalMaxCapacity} accounts/day`);
  console.log(`Potential Capacity (Week 1): 620-1,080 accounts/day (with API keys)`);
  console.log(`Potential Capacity (Week 2-3): 4,000+ accounts/day (with expansions)`);
  console.log();

  if (disabledSources.length > 0) {
    console.log('⚠️  Status: LIMITED (missing API keys)');
    console.log('📝 Next Action: Add API keys to unlock full capacity');
  } else {
    console.log('✅ Status: READY (all sources active)');
    console.log('📝 Next Action: Run discovery and start sponsoring');
  }

  console.log();
  console.log('📄 Full Report: DISCOVERY_CAPACITY_REPORT.md');
  console.log('📖 Setup Guide: SETUP_DISCOVERY_APIS.md');
  console.log();

  process.exit(0);
}

checkDiscoveryCapacity().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
