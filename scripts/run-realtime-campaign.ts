/**
 * Real-Time Sponsorship Campaign with UserOp Monitoring
 *
 * Discovers smart accounts from contract interactions, then monitors Entry Point
 * for their UserOperation activity. Sponsors detected active smart accounts.
 *
 * Usage:
 *   npx tsx scripts/run-realtime-campaign.ts --protocol uniswap-v4 --chain base --limit 10
 */

import 'dotenv/config';
import { getPrisma } from '../src/lib/db';
import { CONTRACTS } from '../src/lib/agent/contracts/addresses';
import { observeContractInteractions, observeGasPrice } from '../src/lib/agent/observe/sponsorship';
import { monitorUserOperations, getActiveSmartAccounts } from '../src/lib/agent/observe/userOp-monitor';
import { validatePolicy } from '../src/lib/agent/policy';
import { sponsorTransaction } from '../src/lib/agent/execute/paymaster';
import {
  createCampaign,
  getCampaign,
  recordSponsorshipInCampaign,
  getCampaignReport,
} from '../src/lib/agent/campaigns';
import type { Decision } from '../src/lib/agent/reason/schemas';
import type { AgentConfig } from '../src/lib/agent';
import type { Address } from 'viem';

const BASE_CHAIN_ID = 8453;
const BASE_SEPOLIA_CHAIN_ID = 84532;
const DELAY_BETWEEN_SPONSORSHIPS_MS = 15 * 1000;
const DEFAULT_ESTIMATED_COST_USD = 0.25;
const MAX_GAS_LIMIT = 200_000;

function parseArgs(): {
  protocol: string;
  chain: string;
  limit: number;
  contracts: string[];
  campaignId: string | null;
  monitorOnly: boolean;
} {
  const args = process.argv.slice(2);
  let protocol = 'uniswap-v4';
  let chain = 'base';
  let limit = 10;
  let contracts: string[] = [];
  let campaignId: string | null = null;
  let monitorOnly = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--protocol' && args[i + 1]) {
      protocol = args[++i];
    } else if (args[i] === '--chain' && args[i + 1]) {
      chain = args[++i];
    } else if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[++i], 10) || 10;
    } else if (args[i] === '--contracts' && args[i + 1]) {
      contracts = args[++i].split(',').map((s) => s.trim()).filter((s) => /^0x[a-fA-F0-9]{40}$/.test(s));
    } else if (args[i] === '--campaign-id' && args[i + 1]) {
      campaignId = args[++i];
    } else if (args[i] === '--monitor-only') {
      monitorOnly = true;
    }
  }

  return { protocol, chain, limit, contracts, campaignId, monitorOnly };
}

function getTargetContracts(chain: string, contractsOverride: string[]): string[] {
  if (contractsOverride.length > 0) return contractsOverride;
  if (chain === 'base') {
    const v4 = CONTRACTS.base.uniswapV4;
    return [
      v4.poolManager,
      v4.positionManager,
      v4.universalRouter,
      v4.quoter,
      v4.stateView,
      v4.permit2,
    ];
  }
  return [];
}

async function main() {
  const {
    protocol,
    chain,
    limit,
    contracts: contractsOverride,
    campaignId: existingCampaignId,
    monitorOnly,
  } = parseArgs();
  const targetContracts = getTargetContracts(chain, contractsOverride);

  if (targetContracts.length === 0) {
    console.error('No target contracts. Set --contracts or use --chain base for Uniswap V4.');
    process.exit(1);
  }

  const chainId = chain === 'base' ? BASE_CHAIN_ID : BASE_SEPOLIA_CHAIN_ID;
  const chainName = chain === 'base' ? ('base' as const) : ('baseSepolia' as const);

  let campaign: Awaited<ReturnType<typeof createCampaign>>;

  if (existingCampaignId) {
    campaign = await getCampaign(existingCampaignId);
    if (!campaign || campaign.status !== 'active') {
      console.error('Campaign not found or not active:', existingCampaignId);
      process.exit(1);
    }
    console.log('[Campaign] Resuming existing campaign:', {
      campaignId: campaign.id,
      protocol: campaign.protocolId,
      limit: campaign.maxSponsorships,
    });
  } else {
    const db = getPrisma();
    const protocolRecord = await db.protocolSponsor.findUnique({
      where: { protocolId: protocol },
    });
    if (!protocolRecord) {
      console.error(`Protocol "${protocol}" not found. Run: npx tsx scripts/setup-uniswap-v4-protocol.ts`);
      process.exit(1);
    }
    if ((protocolRecord.whitelistedContracts?.length ?? 0) === 0) {
      console.error(`Protocol "${protocol}" has no whitelisted contracts. Run setup script.`);
      process.exit(1);
    }

    campaign = await createCampaign({
      protocolId: protocol,
      chainId,
      chainName,
      targetContracts,
      maxSponsorships: limit,
    });
  }

  console.log('[Campaign] Configuration:', {
    protocol: campaign.protocolId,
    chain,
    chainId,
    limit: campaign.maxSponsorships,
    targetContracts: targetContracts.length,
    mode: monitorOnly ? 'MONITOR_ONLY' : 'SPONSOR',
  });

  // Step 1: Discover smart accounts from contract interactions
  console.log('\n=== Phase 1: Discovery ===');
  const observations = await observeContractInteractions(targetContracts, chainName);
  const smartAccounts = observations
    .filter((o) => (o.data as { agentWallet?: string }).agentWallet)
    .map((o) => (o.data as { agentWallet: string }).agentWallet as Address);

  console.log('[Discovery] Smart accounts found:', smartAccounts.length);

  if (smartAccounts.length === 0) {
    console.error('[Discovery] No smart accounts found. Campaign cannot proceed.');
    process.exit(1);
  }

  // Step 2: Monitor Entry Point for recent UserOp activity
  console.log('\n=== Phase 2: UserOp Activity Monitoring ===');
  const activeAccounts = await getActiveSmartAccounts({
    chainName,
    allSmartAccounts: smartAccounts,
    minActivityCount: 1, // At least 1 UserOp in last ~3 hours
  });

  console.log('[Monitor] Active accounts (with recent UserOps):', activeAccounts.length);

  if (activeAccounts.length === 0) {
    console.log('[Monitor] No recent UserOp activity detected.');
    console.log('[Monitor] Falling back to all discovered smart accounts...');
  }

  // Prioritize active accounts, then fall back to all smart accounts
  const prioritizedAccounts =
    activeAccounts.length > 0
      ? activeAccounts.map((a) => a.account)
      : smartAccounts;

  console.log('[Monitor] Prioritized sponsorship candidates:', prioritizedAccounts.length);

  // Log activity summary
  if (activeAccounts.length > 0) {
    console.log('\nTop 5 most active accounts:');
    activeAccounts.slice(0, 5).forEach((acc, idx) => {
      console.log(
        `  ${idx + 1}. ${acc.account.slice(0, 10)}... - ${acc.activityCount} UserOps (last nonce: ${acc.lastNonce})`
      );
    });
  }

  // Monitor-only mode: exit after showing discovery
  if (monitorOnly) {
    console.log('\n[Monitor] --monitor-only flag set. Exiting without sponsorship.');
    await getPrisma().$disconnect();
    process.exit(0);
  }

  // Step 3: Sponsor UserOps for prioritized accounts
  console.log('\n=== Phase 3: Sponsorship Execution ===');

  const gasObs = await observeGasPrice();
  const gasData = gasObs[0]?.data as { gasPriceGwei?: string } | undefined;
  const currentGasPriceGwei =
    gasData?.gasPriceGwei != null ? parseFloat(String(gasData.gasPriceGwei)) : undefined;

  const config: AgentConfig = {
    confidenceThreshold: 0.8,
    maxTransactionValueUsd: 100,
    executionMode: 'LIVE',
    currentGasPriceGwei,
    gasPriceMaxGwei: 2,
  };

  let completed = 0;
  const candidates = prioritizedAccounts.slice(0, campaign.maxSponsorships);

  for (const agentWallet of candidates) {
    if (completed >= campaign.maxSponsorships) break;

    const targetContract = targetContracts[0];

    const decision: Decision = {
      action: 'SPONSOR_TRANSACTION',
      confidence: 0.95,
      reasoning: `Real-time campaign: sponsor next UserOp for ${agentWallet} on ${campaign.protocolId} (${targetContract})`,
      parameters: {
        agentWallet,
        protocolId: campaign.protocolId,
        maxGasLimit: MAX_GAS_LIMIT,
        estimatedCostUSD: DEFAULT_ESTIMATED_COST_USD,
        targetContract,
      },
      preconditions: ['Policy checks pass', 'Account has recent UserOp activity'],
      expectedOutcome: 'Gas sponsored for next UserOperation',
      metadata: { reason: 'realtime-campaign' },
    };

    const policyResult = await validatePolicy(decision, config);
    if (!policyResult.passed) {
      console.warn('[Campaign] Policy rejected:', agentWallet.slice(0, 10) + '...', policyResult.errors);
      continue;
    }

    try {
      const result = await sponsorTransaction(decision, 'LIVE');
      if (!result.success) {
        console.warn('[Campaign] Execution failed:', agentWallet.slice(0, 10) + '...', result.error);
        continue;
      }

      const sim = result.simulationResult as
        | { onChainTxHash?: string; userOpHash?: string; actualGasUsed?: string }
        | undefined;
      const txHash = result.transactionHash ?? sim?.onChainTxHash ?? '';
      const userOpHash = result.sponsorshipHash ?? sim?.userOpHash ?? '';
      const gasUsedStr = sim?.actualGasUsed;
      const gasUsed = gasUsedStr ? BigInt(gasUsedStr) : BigInt(0);
      const ethPriceUSD = Number(process.env.ETH_PRICE_USD ?? '2500');
      const gasPriceGwei = currentGasPriceGwei ?? 1;
      const costUSD = gasUsedStr
        ? (Number(gasUsed) * gasPriceGwei * 1e9 * ethPriceUSD) / 1e18
        : DEFAULT_ESTIMATED_COST_USD;

      await recordSponsorshipInCampaign({
        campaignId: campaign.id,
        txHash,
        userOpHash,
        gasUsed,
        costUSD: typeof costUSD === 'number' ? costUSD : DEFAULT_ESTIMATED_COST_USD,
        targetContract,
      });
      completed += 1;
      console.log(`[Campaign] Sponsored ${completed}/${campaign.maxSponsorships}`, {
        txHash: txHash.slice(0, 18) + '...',
        agentWallet: agentWallet.slice(0, 10) + '...',
      });

      if (completed < campaign.maxSponsorships) {
        await new Promise((r) => setTimeout(r, DELAY_BETWEEN_SPONSORSHIPS_MS));
      }
    } catch (err) {
      console.warn('[Campaign] Error sponsoring:', agentWallet.slice(0, 10) + '...', err);
    }
  }

  const report = await getCampaignReport(campaign.id);
  if (report) {
    console.log('\n--- Campaign Report (JSON) ---');
    console.log(JSON.stringify(report, null, 2));
    console.log('\n--- Summary ---');
    console.log('Completed:', report.campaign.completed, '/', report.campaign.limit);
    console.log('Total gas used:', report.totals.totalGasUsed);
    console.log('Total cost USD:', report.totals.totalCostUSD.toFixed(4));
    console.log('Transaction hashes:', report.transactions.map((t) => t.txHash).join('\n  '));
  }

  if (!existingCampaignId) {
    await getPrisma().$disconnect();
  }
  process.exit(completed >= campaign.maxSponsorships ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
