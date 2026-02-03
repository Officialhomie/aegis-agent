/**
 * Aegis Agent - Clanker Token Deployment (ERC20 + Uniswap V4 LP on Base)
 *
 * Optional integration: deploy tokens via Clanker SDK when installed.
 * Policy limits deployment to 1/week; requires DEPLOY_TOKEN_ALLOWED=true.
 */

import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { logger } from '../../logger';
import { getStateStore } from '../state-store';
import type { DeployTokenParams } from '../reason/schemas';
import type { ExecutionResult } from './index';

const DEPLOY_TOKEN_KEY = 'aegis:deploy_token_last';
const DEPLOY_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

function getRpcUrl(): string {
  return (
    process.env.BASE_RPC_URL ??
    process.env.RPC_URL_BASE ??
    process.env.RPC_URL_8453 ??
    'https://mainnet.base.org'
  );
}

/**
 * Execute DEPLOY_TOKEN via Clanker SDK (optional dependency).
 * Returns error if clanker-sdk not installed or rate limit exceeded.
 */
export async function executeDeployToken(
  params: DeployTokenParams,
  mode: 'LIVE' | 'SIMULATION'
): Promise<ExecutionResult> {
  if (mode === 'SIMULATION') {
    return {
      success: true,
      simulationResult: {
        action: 'DEPLOY_TOKEN',
        name: params.name,
        symbol: params.symbol,
        message: 'Simulation: would deploy token via Clanker SDK',
      },
    };
  }

  if (process.env.DEPLOY_TOKEN_ALLOWED !== 'true') {
    return { success: false, error: 'DEPLOY_TOKEN_ALLOWED is not set to true' };
  }

  const store = await getStateStore();
  const lastRaw = await store.get(DEPLOY_TOKEN_KEY);
  const last = lastRaw ? Number(lastRaw) : 0;
  if (Date.now() - last < DEPLOY_COOLDOWN_MS) {
    return {
      success: false,
      error: `DEPLOY_TOKEN rate limit: one deployment per week. Last at ${new Date(last).toISOString()}`,
    };
  }

  const privateKey = process.env.EXECUTE_WALLET_PRIVATE_KEY ?? process.env.AGENT_PRIVATE_KEY;
  if (!privateKey?.trim()) {
    return { success: false, error: 'EXECUTE_WALLET_PRIVATE_KEY or AGENT_PRIVATE_KEY required for DEPLOY_TOKEN' };
  }

  try {
    const sdkModule = 'clanker-sdk';
    const { Clanker } = await import(/* @vite-ignore */ sdkModule);
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    const rpcUrl = getRpcUrl();
    const publicClient = createPublicClient({
      chain: base,
      transport: http(rpcUrl),
    });
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http(rpcUrl),
    });

    const clanker = new Clanker({
      wallet: walletClient as unknown,
      publicClient: publicClient as unknown,
    });

    const image = params.image ?? 'ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';
    const deployResult = await clanker.deploy({
      name: params.name,
      symbol: params.symbol,
      image,
      tokenAdmin: account.address,
      metadata: { description: params.description ?? `${params.name} token` },
      context: { interface: 'Aegis Agent' },
      vanity: true,
    });

    const txHash = deployResult?.txHash ?? (deployResult as { hash?: string })?.hash;
    if (txHash) {
      await store.set(DEPLOY_TOKEN_KEY, String(Date.now()));
    }
    logger.info('[Clanker] Token deployed', { name: params.name, symbol: params.symbol, txHash });
    return {
      success: !deployResult?.error,
      transactionHash: typeof txHash === 'string' ? txHash : undefined,
      error: deployResult?.error as string | undefined,
      simulationResult: deployResult,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("Cannot find module 'clanker-sdk'") || message.includes("clanker-sdk")) {
      return {
        success: false,
        error: 'clanker-sdk not installed. Add it as a dependency to use DEPLOY_TOKEN.',
      };
    }
    logger.error('[Clanker] Deploy failed', { name: params.name, error: message });
    return { success: false, error: message };
  }
}
