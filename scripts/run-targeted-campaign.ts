/**
 * Run a targeted sponsorship campaign: sponsor up to N transactions for a protocol on a chain.
 * Uses observeContractInteractions for discovery, then validate + execute per candidate.
 *
 * Usage:
 *   npx tsx scripts/run-targeted-campaign.ts --protocol uniswap-v4 --chain base --limit 10
 *   npx tsx scripts/run-targeted-campaign.ts --protocol uniswap-v4 --chain base --limit 10 --contracts 0x498581fF...,0x6fF5693b...
 */

import 'dotenv/config';
import { getPrisma } from '../src/lib/db';
import { CONTRACTS } from '../src/lib/agent/contracts/addresses';
import { observeContractInteractions, observeGasPrice } from '../src/lib/agent/observe/sponsorship';
import { validatePolicy } from '../src/lib/agent/policy';
import { sponsorTransaction } from '../src/lib/agent/execute/paymaster';
import {
  createCampaign,
  recordSponsorshipInCampaign,
  getCampaignReport,
} from '../src/lib/agent/campaigns';
import type { Decision } from '../src/lib/agent/reason/schemas';
import type { AgentConfig } from '../src/lib/agent';

const BASE_CHAIN_ID = 8453;
const BASE_SEPOLIA_CHAIN_ID = 84532;
/** Delay between sponsorships to respect per-protocol rate limit (5/min) */
const DELAY_BETWEEN_SPONSORSHIPS_MS = 15 * 1000;
const DEFAULT_ESTIMATED_COST_USD = 0.25;
const MAX_GAS_LIMIT = 200_000;

function parseArgs(): { protocol: string; chain: string; limit: number; contracts: string[] } {
  const args = process.argv.slice(2);
  let protocol = 'uniswap-v4';
  let chain = 'base';
  let limit = 10;
  let contracts: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--protocol' && args[i + 1]) {
      protocol = args[++i];
    } else if (args[i] === '--chain' && args[i + 1]) {
      chain = args[++i];
    } else if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[++i], 10) || 10;
    } else if (args[i] === '--contracts' && args[i + 1]) {
      contracts = args[++i].split(',').map((s) => s.trim()).filter((s) => /^0x[a-fA-F0-9]{40}$/.test(s));
    }
  }

  return { protocol, chain, limit, contracts };
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
  const { protocol, chain, limit, contracts: contractsOverride } = parseArgs();
  const targetContracts = getTargetContracts(chain, contractsOverride);

  if (targetContracts.length === 0) {
    console.error('No target contracts. Set --contracts or use --chain base for Uniswap V4.');
    process.exit(1);
  }

  const chainId = chain === 'base' ? BASE_CHAIN_ID : BASE_SEPOLIA_CHAIN_ID;
  const chainName = chain === 'base' ? 'base' : 'baseSepolia';

  console.log('[Campaign] Configuration:', { protocol, chain, chainId, limit, targetContracts: targetContracts.length });

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

  const campaign = await createCampaign({
    protocolId: protocol,
    chainId,
    chainName,
    targetContracts,
    maxSponsorships: limit,
  });

  const gasObs = await observeGasPrice();
  const gasData = gasObs[0]?.data as { gasPriceGwei?: string } | undefined;
  const currentGasPriceGwei = gasData?.gasPriceGwei != null ? parseFloat(String(gasData.gasPriceGwei)) : undefined;

  const config: AgentConfig = {
    confidenceThreshold: 0.8,
    maxTransactionValueUsd: 100,
    executionMode: 'LIVE',
    currentGasPriceGwei,
    gasPriceMaxGwei: 2,
  };

  let completed = 0;
  const observations = await observeContractInteractions(targetContracts, chainName);
  const candidates = observations
    .filter((o) => (o.data as { agentWallet?: string }).agentWallet)
    .slice(0, limit * 2);

  console.log('[Campaign] Candidates from contract interactions:', candidates.length);

  for (const obs of candidates) {
    if (completed >= limit) break;
    const data = obs.data as { agentWallet?: string; targetContract?: string };
    const agentWallet = data.agentWallet;
    const targetContract = data.targetContract ?? targetContracts[0];
    if (!agentWallet || !/^0x[a-fA-F0-9]{40}$/.test(agentWallet)) continue;

    const decision: Decision = {
      action: 'SPONSOR_TRANSACTION',
      confidence: 0.95,
      reasoning: `Targeted campaign: sponsor next tx for ${agentWallet} on ${protocol} (${targetContract})`,
      parameters: {
        agentWallet,
        protocolId: protocol,
        maxGasLimit: MAX_GAS_LIMIT,
        estimatedCostUSD: DEFAULT_ESTIMATED_COST_USD,
        targetContract,
      },
      preconditions: ['Policy checks pass'],
      expectedOutcome: 'Gas sponsored for Uniswap V4 interaction',
      metadata: { reason: 'targeted-campaign' },
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

      const sim = result.simulationResult as { onChainTxHash?: string; userOpHash?: string; actualGasUsed?: string } | undefined;
      const txHash = result.transactionHash ?? sim?.onChainTxHash ?? '';
      const userOpHash = result.sponsorshipHash ?? sim?.userOpHash ?? '';
      const gasUsedStr = sim?.actualGasUsed;
      const gasUsed = gasUsedStr ? BigInt(gasUsedStr) : BigInt(0);
      const ethPriceUSD = Number(process.env.ETH_PRICE_USD ?? '2500');
const gasPriceGwei = currentGasPriceGwei ?? 1;
const costUSD = gasUsedStr
  ? (Number(gasUsed) * gasPriceGwei * 1e9) / 1e18 * ethPriceUSD
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
      console.log(`[Campaign] Sponsored ${completed}/${limit}`, { txHash: txHash.slice(0, 18) + '...', agentWallet: agentWallet.slice(0, 10) + '...' });

      if (completed < limit) {
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

  await db.$disconnect();
  process.exit(completed >= limit ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
