/**
 * Aegis Agent - Endaoment Charity Donations (501(c)(3) on Base)
 *
 * Donate USDC to nonprofits via Endaoment OrgFundFactory.
 * Contract addresses per openclaw-skills/endaoment.
 */

import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { logger } from '../../logger';
import type { DonateParams } from '../reason/schemas';
import type { ExecutionResult } from './index';

const USDC_BASE = '0x833589fCD6eDb6E08f4c7c32D4f71b54bdA02913' as const;
const ORG_FUND_FACTORY_BASE = '0x10fd9348136dcea154f752fe0b6db45fc298a589' as const;

const ERC20_APPROVE_ABI = [
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

const DEPLOY_ORG_AND_DONATE_ABI = [
  {
    inputs: [
      { name: 'orgId', type: 'bytes32' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'deployOrgAndDonate',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

function einToBytes32(ein: string): `0x${string}` {
  const hex = Buffer.from(ein, 'utf8').toString('hex');
  const padded = hex.padEnd(64, '0').slice(0, 64);
  return `0x${padded}` as `0x${string}`;
}

function getRpcUrl(): string {
  return (
    process.env.BASE_RPC_URL ??
    process.env.RPC_URL_BASE ??
    process.env.RPC_URL_8453 ??
    'https://mainnet.base.org'
  );
}

/**
 * Execute DONATE_TO_CHARITY: approve USDC to OrgFundFactory, then deployOrgAndDonate.
 */
export async function executeDonateToCharity(
  params: DonateParams,
  mode: 'LIVE' | 'SIMULATION'
): Promise<ExecutionResult> {
  const amountUsdc6 = BigInt(Math.round(params.amountUsd * 1e6));
  const orgIdBytes32 = einToBytes32(params.ein);

  if (mode === 'SIMULATION') {
    return {
      success: true,
      simulationResult: {
        action: 'DONATE_TO_CHARITY',
        ein: params.ein,
        amountUsd: params.amountUsd,
        amountUsdc6: amountUsdc6.toString(),
        message: 'Simulation: would approve USDC and call deployOrgAndDonate',
      },
    };
  }

  const privateKey = process.env.EXECUTE_WALLET_PRIVATE_KEY ?? process.env.AGENT_PRIVATE_KEY;
  if (!privateKey?.trim()) {
    return { success: false, error: 'EXECUTE_WALLET_PRIVATE_KEY or AGENT_PRIVATE_KEY required for DONATE_TO_CHARITY' };
  }

  const rpcUrl = getRpcUrl();
  const account = privateKeyToAccount(privateKey as `0x${string}`);

  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http(rpcUrl),
  });
  const publicClient = createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  });

  try {
    const approveHash = await walletClient.writeContract({
      address: USDC_BASE,
      abi: ERC20_APPROVE_ABI,
      functionName: 'approve',
      args: [ORG_FUND_FACTORY_BASE, amountUsdc6],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveHash });

    const donateHash = await walletClient.writeContract({
      address: ORG_FUND_FACTORY_BASE,
      abi: DEPLOY_ORG_AND_DONATE_ABI,
      functionName: 'deployOrgAndDonate',
      args: [orgIdBytes32, amountUsdc6],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: donateHash });
    logger.info('[Endaoment] Donation executed', { ein: params.ein, amountUsd: params.amountUsd, txHash: donateHash });
    return {
      success: true,
      transactionHash: donateHash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed,
      simulationResult: { ein: params.ein, amountUsd: params.amountUsd },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('[Endaoment] Donation failed', { ein: params.ein, error: message });
    return { success: false, error: message };
  }
}
