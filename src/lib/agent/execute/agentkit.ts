/**
 * Aegis Agent - AgentKit Integration
 *
 * Wraps Coinbase AgentKit for safe blockchain execution.
 * AgentKit provides the secure wallet and transaction infrastructure.
 */

import {
  CdpAgentkit,
  TransferAction,
  TradeAction,
} from '@coinbase/cdp-agentkit-core';

import type { Decision } from '../reason/schemas';
import type { TransferParams, SwapParams, ExecuteParams } from '../reason/schemas';
import type { ExecutionResult } from './index';

/**
 * AgentKit configuration
 */
export interface AgentKitConfig {
  cdpApiKeyName?: string;
  cdpApiKeyPrivateKey?: string;
  networkId?: string;
  cdpWalletData?: string;
  mnemonicPhrase?: string;
}

/** CdpAgentkit instance type for execution functions */
export type AgentKitInstance = CdpAgentkit;

const transferAction = new TransferAction();
const tradeAction = new TradeAction();

/**
 * Initialize AgentKit with CDP credentials
 */
export async function initializeAgentKit(
  config?: AgentKitConfig
): Promise<AgentKitInstance> {
  const resolved: AgentKitConfig = {
    cdpApiKeyName: config?.cdpApiKeyName ?? process.env.CDP_API_KEY_NAME ?? '',
    cdpApiKeyPrivateKey:
      config?.cdpApiKeyPrivateKey ?? process.env.CDP_API_KEY_PRIVATE_KEY ?? '',
    networkId: config?.networkId ?? process.env.AGENT_NETWORK_ID ?? 'base-sepolia',
    cdpWalletData: config?.cdpWalletData ?? process.env.CDP_WALLET_DATA,
    mnemonicPhrase: config?.mnemonicPhrase ?? process.env.MNEMONIC_PHRASE,
  };

  if (!resolved.cdpApiKeyName || !resolved.cdpApiKeyPrivateKey) {
    throw new Error(
      'CDP API credentials not configured. Set CDP_API_KEY_NAME and CDP_API_KEY_PRIVATE_KEY.'
    );
  }

  const agentkit = await CdpAgentkit.configureWithWallet({
    cdpApiKeyName: resolved.cdpApiKeyName,
    cdpApiKeyPrivateKey: resolved.cdpApiKeyPrivateKey.replace(/\\n/g, '\n'),
    networkId: resolved.networkId,
    cdpWalletData: resolved.cdpWalletData,
    mnemonicPhrase: resolved.mnemonicPhrase,
  });

  console.log('[AgentKit] Initialized for network:', resolved.networkId);
  return agentkit;
}

/**
 * Execute a decision using AgentKit
 */
export async function executeWithAgentKit(
  decision: Decision,
  mode: 'LIVE' | 'SIMULATION'
): Promise<ExecutionResult> {
  console.log(`[AgentKit] Executing ${decision.action} in ${mode} mode`);

  if (mode === 'SIMULATION') {
    return simulateExecution(decision);
  }

  try {
    const agentkit = await initializeAgentKit();

    switch (decision.action) {
      case 'TRANSFER':
        return await executeTransfer(agentkit, decision);
      case 'SWAP':
        return await executeSwap(agentkit, decision);
      case 'EXECUTE':
        return await executeContractCall(agentkit, decision);
      case 'REBALANCE':
        return await executeRebalance(agentkit, decision);
      default:
        return {
          success: false,
          error: `Unknown action type: ${decision.action}`,
        };
    }
  } catch (error) {
    console.error('[AgentKit] Execution error:', error);
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `AgentKit execution failed: ${message}`,
    };
  }
}

/**
 * Simulate execution without real transactions
 */
function simulateExecution(decision: Decision): ExecutionResult {
  console.log('[AgentKit] Simulating execution:', decision.action);

  return {
    success: true,
    simulationResult: {
      action: decision.action,
      parameters: decision.parameters,
      message: 'Simulation successful - no actual transaction submitted',
    },
  };
}

/**
 * Map token address or symbol to CDP asset ID for the current network
 */
function toAssetId(token: string, networkId: string = 'base-sepolia'): string {
  const lower = token.toLowerCase();
  if (lower === 'eth' || lower === '0x0000000000000000000000000000000000000000') {
    return networkId.includes('base') ? 'eth' : `${networkId}:eth`;
  }
  if (lower.includes('usdc')) return networkId.includes('base') ? 'usdc' : `${networkId}:usdc`;
  if (lower.includes('usdt')) return networkId.includes('base') ? 'usdt' : `${networkId}:usdt`;
  if (lower.startsWith('0x') && lower.length === 42) {
    return token;
  }
  return token;
}

/**
 * Execute a token transfer using AgentKit
 */
async function executeTransfer(
  agentkit: AgentKitInstance,
  decision: Decision
): Promise<ExecutionResult> {
  const params = decision.parameters as TransferParams | null;
  if (!params) {
    return { success: false, error: 'Transfer requires parameters' };
  }

  const networkId = process.env.AGENT_NETWORK_ID || 'base-sepolia';
  const assetId = toAssetId(params.token, networkId);

  try {
    const result = await agentkit.run(transferAction, {
      assetId,
      destination: params.recipient,
      amount: params.amount,
      gasless: networkId.includes('base') && assetId.toLowerCase() === 'usdc',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CDP run() expects schema type at compile time but inferred type at runtime
} as any);

    const txHash = extractTxHash(result);
    return {
      success: !result.startsWith('Error'),
      transactionHash: txHash ?? undefined,
      simulationResult: result,
      ...(result.startsWith('Error') && { error: result }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Transfer failed: ${message}` };
  }
}

/**
 * Execute a token swap using AgentKit Trade action
 */
async function executeSwap(
  agentkit: AgentKitInstance,
  decision: Decision
): Promise<ExecutionResult> {
  const params = decision.parameters as SwapParams | null;
  if (!params) {
    return { success: false, error: 'Swap requires parameters' };
  }

  const networkId = process.env.AGENT_NETWORK_ID || 'base-sepolia';
  const fromId = toAssetId(params.tokenIn, networkId);
  const toId = toAssetId(params.tokenOut, networkId);

  try {
    const result = await agentkit.run(tradeAction, {
      fromAssetId: fromId,
      toAssetId: toId,
      amount: params.amountIn,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CDP run() expects schema type at compile time but inferred type at runtime
} as any);

    const txHash = extractTxHash(result);
    return {
      success: !result.startsWith('Error'),
      transactionHash: txHash ?? undefined,
      simulationResult: result,
      ...(result.startsWith('Error') && { error: result }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Swap failed: ${message}` };
  }
}

/**
 * Execute a generic contract call. CDP AgentKit does not expose a generic
 * invoke_contract action; we use deploy_contract only for deployment.
 * For arbitrary contract calls we return a clear error and suggest using
 * EXECUTE with a dedicated integration (e.g. viem + wallet from AgentKit).
 */
async function executeContractCall(
  _agentkit: AgentKitInstance,
  decision: Decision
): Promise<ExecutionResult> {
  const params = decision.parameters as ExecuteParams | null;
  if (!params) {
    return { success: false, error: 'Contract call requires parameters' };
  }

  return {
    success: false,
    error:
      'EXECUTE (contract call) is not supported by CDP AgentKit actions. Use TRANSFER or SWAP for treasury operations, or extend with a viem-based contract invocation layer. Requested: ' +
      params.functionName +
      ' at ' +
      params.contractAddress,
  };
}

/**
 * Execute a rebalance operation (multiple swaps to reach target allocation)
 */
async function executeRebalance(
  agentkit: AgentKitInstance,
  decision: Decision
): Promise<ExecutionResult> {
  const params = decision.parameters as SwapParams | null;
  if (!params) {
    return {
      success: false,
      error: 'Rebalance requires parameters (use swap-like params for first leg)',
    };
  }

  const networkId = process.env.AGENT_NETWORK_ID || 'base-sepolia';
  try {
    const result = await agentkit.run(tradeAction, {
      fromAssetId: toAssetId(params.tokenIn, networkId),
      toAssetId: toAssetId(params.tokenOut, networkId),
      amount: params.amountIn,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CDP run() expects schema type at compile time but inferred type at runtime
} as any);

    const txHash = extractTxHash(result);
    return {
      success: !result.startsWith('Error'),
      transactionHash: txHash ?? undefined,
      simulationResult: { message: 'Rebalance step executed', raw: result },
      ...(result.startsWith('Error') && { error: result }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Rebalance failed: ${message}` };
  }
}

function extractTxHash(message: string): string | null {
  const match = message.match(/Transaction hash[:\s]+(0x[a-fA-F0-9]{64})/i);
  return match ? match[1] : null;
}
