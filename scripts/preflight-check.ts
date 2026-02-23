/**
 * Pre-flight checks before running a targeted campaign or agent.
 * Validates: RPC, bundler, keystore, DB, protocol, target contracts, paymaster reachability.
 *
 * Usage: npx tsx scripts/preflight-check.ts [--protocol uniswap-v4] [--json]
 */

import 'dotenv/config';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { getPrisma } from '../src/lib/db';
import { checkBundlerHealth } from '../src/lib/agent/execute/bundler-client';
import { getAgentWalletBalance } from '../src/lib/agent/observe/sponsorship';
import { getKeystoreAccount } from '../src/lib/keystore';

const BASE_CHAIN_ID = 8453;

export interface PreflightCheckResult {
  name: string;
  passed: boolean;
  message: string;
  detail?: string;
}

export interface PreflightReport {
  ok: boolean;
  checks: PreflightCheckResult[];
  summary: string;
}

async function runChecks(protocolId?: string): Promise<PreflightReport> {
  const checks: PreflightCheckResult[] = [];

  const rpcUrl = process.env.BASE_RPC_URL ?? process.env.RPC_URL_BASE ?? process.env.RPC_URL_8453;
  if (!rpcUrl) {
    checks.push({ name: 'rpc_url', passed: false, message: 'BASE_RPC_URL or RPC_URL_BASE not set' });
  } else {
    try {
      const client = createPublicClient({
        chain: base,
        transport: http(rpcUrl, { timeout: 10_000 }),
      });
      const chainId = await client.getChainId();
      const block = await client.getBlockNumber();
      if (chainId !== BASE_CHAIN_ID) {
        checks.push({ name: 'rpc_chain', passed: false, message: `RPC returned chain ${chainId}, expected ${BASE_CHAIN_ID}` });
      } else {
        checks.push({
          name: 'rpc_connectivity',
          passed: true,
          message: `Base mainnet (${BASE_CHAIN_ID}) reachable`,
          detail: `block ${block}`,
        });
      }
    } catch (e) {
      checks.push({
        name: 'rpc_connectivity',
        passed: false,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  try {
    const health = await checkBundlerHealth();
    if (health.available) {
      checks.push({
        name: 'bundler_health',
        passed: true,
        message: 'Bundler/paymaster reachable',
        detail: health.latencyMs != null ? `${health.latencyMs}ms` : undefined,
      });
    } else {
      checks.push({
        name: 'bundler_health',
        passed: false,
        message: health.error ?? 'Bundler unavailable',
      });
    }
  } catch (e) {
    checks.push({
      name: 'bundler_health',
      passed: false,
      message: e instanceof Error ? e.message : String(e),
    });
  }

  try {
    const balance = await getAgentWalletBalance();
    const minEth = parseFloat(process.env.RESERVE_THRESHOLD_ETH ?? '0.01');
    if (balance.ETH >= minEth) {
      checks.push({
        name: 'smart_wallet_balance',
        passed: true,
        message: `Agent wallet has ${balance.ETH.toFixed(4)} ETH`,
        detail: `min ${minEth} required`,
      });
    } else {
      checks.push({
        name: 'smart_wallet_balance',
        passed: false,
        message: `Agent wallet low: ${balance.ETH.toFixed(4)} ETH (min ${minEth})`,
      });
    }
  } catch (e) {
    checks.push({
      name: 'smart_wallet_balance',
      passed: false,
      message: e instanceof Error ? e.message : String(e),
    });
  }

  try {
    const account = await getKeystoreAccount();
    checks.push({
      name: 'keystore_signing',
      passed: true,
      message: `Keystore ready: ${account.address.slice(0, 10)}...`,
    });
  } catch (e) {
    checks.push({
      name: 'keystore_signing',
      passed: false,
      message: e instanceof Error ? e.message : String(e),
    });
  }

  try {
    const db = getPrisma();
    await db.$queryRaw`SELECT 1`;
    checks.push({ name: 'database', passed: true, message: 'Database connected' });
  } catch (e) {
    checks.push({
      name: 'database',
      passed: false,
      message: e instanceof Error ? e.message : String(e),
    });
  }

  if (protocolId) {
    try {
      const db = getPrisma();
      const protocol = await db.protocolSponsor.findUnique({
        where: { protocolId },
      });
      if (!protocol) {
        checks.push({ name: 'protocol_exists', passed: false, message: `Protocol "${protocolId}" not found` });
      } else {
        const hasBudget = protocol.balanceUSD > 0;
        const hasWhitelist = (protocol.whitelistedContracts?.length ?? 0) > 0;
        checks.push({
          name: 'protocol_exists',
          passed: true,
          message: `Protocol "${protocolId}" found`,
          detail: `balance $${protocol.balanceUSD}, whitelist ${protocol.whitelistedContracts?.length ?? 0} contracts`,
        });
        if (!hasBudget) {
          checks.push({ name: 'protocol_budget', passed: false, message: 'Protocol balance is 0' });
        } else {
          checks.push({ name: 'protocol_budget', passed: true, message: `Budget: $${protocol.balanceUSD}` });
        }
        if (!hasWhitelist) {
          checks.push({ name: 'protocol_whitelist', passed: false, message: 'No whitelisted contracts' });
        }
      }
    } catch (e) {
      checks.push({
        name: 'protocol_exists',
        passed: false,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const targetContracts = protocolId === 'uniswap-v4'
    ? [
        '0x498581fF718922c3f8e6A244956aF099B2652b2b',
        '0x6fF5693b99212Da76ad316178A184AB56D299b43',
      ]
    : [];
  if (targetContracts.length > 0 && rpcUrl) {
    try {
      const client = createPublicClient({
        chain: base,
        transport: http(rpcUrl!, { timeout: 8_000 }),
      });
      for (const addr of targetContracts.slice(0, 2)) {
        const code = await client.getBytecode({ address: addr as `0x${string}` });
        checks.push({
          name: `contract_${addr.slice(0, 10)}`,
          passed: !!code && code.length > 2,
          message: code && code.length > 2 ? 'Contract has code' : 'No code at address',
          detail: addr,
        });
      }
    } catch (e) {
      checks.push({
        name: 'target_contracts',
        passed: false,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const allPassed = checks.filter((c) => !c.passed).length === 0;
  return {
    ok: allPassed,
    checks,
    summary: allPassed
      ? 'All preflight checks passed.'
      : `${checks.filter((c) => !c.passed).length} check(s) failed.`,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const jsonOut = args.includes('--json');
  const protocolIdx = args.indexOf('--protocol');
  const protocolId = protocolIdx >= 0 && args[protocolIdx + 1] ? args[protocolIdx + 1] : undefined;

  const report = await runChecks(protocolId);

  if (jsonOut) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('[Preflight]', report.summary);
    for (const c of report.checks) {
      console.log(`  ${c.passed ? 'OK' : 'FAIL'} ${c.name}: ${c.message}${c.detail ? ` (${c.detail})` : ''}`);
    }
  }

  await getPrisma().$disconnect();
  process.exit(report.ok ? 0 : 1);
}

main().catch((e) => {
  console.error('Preflight failed:', e);
  process.exit(1);
});
