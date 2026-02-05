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
import { createPublicClient, createWalletClient, http, parseAbiItem } from 'viem';
import { baseSepolia } from 'viem/chains';

import { getKeystoreAccount } from '../../keystore';
import { logger } from '../../logger';
import type { ExecutableDecision } from '../reason/schemas';
import type { TransferParams, SwapParams, ExecuteParams } from '../reason/schemas';
import type { ExecutionResult } from './index';

const ERC20_TRANSFER_ABI = [
  parseAbiItem('function transfer(address to, uint256 amount) returns (bool)'),
] as const;

/** Minimal ABI for common contract calls used in simulation */
const MINIMAL_CALL_ABI = [
  parseAbiItem('function transfer(address to, uint256 amount) returns (bool)'),
  parseAbiItem('function approve(address spender, uint256 amount) returns (bool)'),
] as const;

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

/** Input shape for CDP TransferAction.run() */
interface TransferRunInput {
  assetId: string;
  destination: string;
  amount: string;
  gasless?: boolean;
}

/** Input shape for CDP TradeAction.run() */
interface TradeRunInput {
  fromAssetId: string;
  toAssetId: string;
  amount: string;
}

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

  logger.info('[AgentKit] Initialized for network', { networkId: resolved.networkId });
  return agentkit;
}

let cachedAgentKit: AgentKitInstance | null = null;

/**
 * Execute a decision using AgentKit (reuses cached instance when available)
 */
export async function executeWithAgentKit(
  decision: ExecutableDecision,
  mode: 'LIVE' | 'SIMULATION'
): Promise<ExecutionResult> {
  logger.info('[AgentKit] Executing', { action: decision.action, mode });

  if (mode === 'SIMULATION') {
    return await simulateExecution(decision);
  }

  try {
    if (!cachedAgentKit) cachedAgentKit = await initializeAgentKit();
    const agentkit = cachedAgentKit;

    switch (decision.action) {
      case 'TRANSFER':
        return await executeTransfer(agentkit, decision as ExecutableDecision & { action: 'TRANSFER' });
      case 'SWAP':
        return await executeSwap(agentkit, decision as ExecutableDecision & { action: 'SWAP' });
      case 'EXECUTE':
        return await executeContractCall(agentkit, decision as ExecutableDecision & { action: 'EXECUTE' });
      case 'REBALANCE':
        return await executeRebalance(agentkit, decision as ExecutableDecision & { action: 'REBALANCE' });
      default:
        return {
          success: false,
          error: `Unknown action type: ${decision.action}`,
        };
    }
  } catch (error) {
    logger.error('[AgentKit] Execution error', { error: error instanceof Error ? error.message : String(error) });
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `AgentKit execution failed: ${message}`,
    };
  }
}

function getSimulationClient() {
  const rpcUrl = process.env.RPC_URL_BASE_SEPOLIA ?? process.env.RPC_URL_84532;
  if (!rpcUrl?.trim()) {
    throw new Error('RPC_URL_BASE_SEPOLIA or RPC_URL_84532 must be configured for simulation');
  }
  return createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl),
  });
}

/**
 * Simulate execution using viem simulateContract / eth_call.
 * Validates reverts, estimates gas where possible.
 */
async function simulateExecution(decision: ExecutableDecision): Promise<ExecutionResult> {
  logger.info('[AgentKit] Simulating execution', { action: decision.action });

  if (decision.action === 'TRANSFER') {
    const params = decision.parameters as TransferParams | null;
    if (!params) {
      return { success: false, error: 'Transfer requires parameters' };
    }
    try {
      const client = getSimulationClient();
      const tokenAddress = params.token.startsWith('0x')
        ? (params.token as `0x${string}`)
        : undefined;
      if (!tokenAddress) {
        return {
          success: true,
          simulationResult: {
            action: 'TRANSFER',
            parameters: params,
            message: 'Simulation skipped - token is symbol, not address',
          },
        };
      }
      const { result } = await client.simulateContract({
        address: tokenAddress,
        abi: ERC20_TRANSFER_ABI,
        functionName: 'transfer',
        args: [params.recipient as `0x${string}`, BigInt(params.amount)],
        account: '0x0000000000000000000000000000000000000000' as `0x${string}`,
      });
      const gas = await client.estimateContractGas({
        address: tokenAddress,
        abi: ERC20_TRANSFER_ABI,
        functionName: 'transfer',
        args: [params.recipient as `0x${string}`, BigInt(params.amount)],
        account: '0x0000000000000000000000000000000000000000' as `0x${string}`,
      });
      return {
        success: result === true,
        simulationResult: {
          action: 'TRANSFER',
          parameters: params,
          result,
          gasEstimate: gas.toString(),
          message: 'Simulation successful (eth_call + gas estimate)',
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const revertMatch = message.match(/revert|rejected|insufficient/i);
      return {
        success: false,
        error: revertMatch ? `Simulation reverted: ${message}` : message,
        simulationResult: {
          action: 'TRANSFER',
          parameters: decision.parameters,
          revertReason: message,
        },
      };
    }
  }

  if (decision.action === 'EXECUTE') {
    const params = decision.parameters as ExecuteParams | null;
    if (!params) {
      return { success: false, error: 'EXECUTE requires parameters' };
    }
    try {
      const client = getSimulationClient();
      const contractAddress = params.contractAddress as `0x${string}`;
      const fn = params.functionName.toLowerCase();
      const isTransfer = fn.includes('transfer') && params.args && params.args.length >= 2;
      const isApprove = fn.includes('approve') && params.args && params.args.length >= 2;
      if (isTransfer) {
        const [to, amount] = params.args as [string, string];
        const { result } = await client.simulateContract({
          address: contractAddress,
          abi: ERC20_TRANSFER_ABI,
          functionName: 'transfer',
          args: [to as `0x${string}`, BigInt(amount)],
          account: '0x0000000000000000000000000000000000000000' as `0x${string}`,
        });
        const gas = await client.estimateContractGas({
          address: contractAddress,
          abi: ERC20_TRANSFER_ABI,
          functionName: 'transfer',
          args: [to as `0x${string}`, BigInt(amount)],
          account: '0x0000000000000000000000000000000000000000' as `0x${string}`,
        });
        return {
          success: result === true,
          simulationResult: {
            action: 'EXECUTE',
            functionName: params.functionName,
            gasEstimate: gas.toString(),
            message: 'Simulation successful (eth_call + gas estimate)',
          },
        };
      }
      if (isApprove && params.args && params.args.length >= 2) {
        const [spender, amount] = params.args as [string, string];
        const { result } = await client.simulateContract({
          address: contractAddress,
          abi: MINIMAL_CALL_ABI,
          functionName: 'approve',
          args: [spender as `0x${string}`, BigInt(amount)],
          account: '0x0000000000000000000000000000000000000000' as `0x${string}`,
        });
        const gas = await client.estimateContractGas({
          address: contractAddress,
          abi: MINIMAL_CALL_ABI,
          functionName: 'approve',
          args: [spender as `0x${string}`, BigInt(amount)],
          account: '0x0000000000000000000000000000000000000000' as `0x${string}`,
        });
        return {
          success: result === true,
          simulationResult: {
            action: 'EXECUTE',
            functionName: params.functionName,
            gasEstimate: gas.toString(),
            message: 'Simulation successful (eth_call + gas estimate)',
          },
        };
      }
      return {
        success: true,
        simulationResult: {
          action: 'EXECUTE',
          parameters: params,
          message: 'Simulation skipped - only transfer/approve supported for eth_call',
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `Simulation reverted: ${message}`,
        simulationResult: {
          action: 'EXECUTE',
          parameters: decision.parameters,
          revertReason: message,
        },
      };
    }
  }

  if (decision.action === 'SWAP' || decision.action === 'REBALANCE') {
    const params = decision.parameters as SwapParams | null;
    if (!params) {
      return {
        success: false,
        error: 'SWAP/REBALANCE requires parameters',
      };
    }
    return {
      success: true,
      simulationResult: {
        action: decision.action,
        parameters: params,
        message:
          'Simulation validated parameters - actual swap/rebalance would be executed via AgentKit',
      },
    };
  }

  return {
    success: true,
    simulationResult: {
      action: decision.action,
      parameters: decision.parameters,
      message: 'Simulation successful - no transaction submitted',
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
  decision: ExecutableDecision & { action: 'TRANSFER' }
): Promise<ExecutionResult> {
  const params = decision.parameters as TransferParams | null;
  if (!params) {
    return { success: false, error: 'Transfer requires parameters' };
  }

  const networkId = process.env.AGENT_NETWORK_ID || 'base-sepolia';
  const assetId = toAssetId(params.token, networkId);

  try {
    const input: TransferRunInput = {
      assetId,
      destination: params.recipient,
      amount: params.amount,
      gasless: networkId.includes('base') && assetId.toLowerCase() === 'usdc',
    };
    // CDP run() expects schema type at compile time; runtime accepts this input shape
    const result = await agentkit.run(transferAction, input as unknown as Parameters<AgentKitInstance['run']>[1]);

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
  decision: ExecutableDecision & { action: 'SWAP' | 'REBALANCE' }
): Promise<ExecutionResult> {
  const params = decision.parameters as SwapParams | null;
  if (!params) {
    return { success: false, error: 'Swap requires parameters' };
  }

  const networkId = process.env.AGENT_NETWORK_ID || 'base-sepolia';
  const fromId = toAssetId(params.tokenIn, networkId);
  const toId = toAssetId(params.tokenOut, networkId);

  try {
    const input: TradeRunInput = {
      fromAssetId: fromId,
      toAssetId: toId,
      amount: params.amountIn,
    };
    const result = await agentkit.run(tradeAction, input as unknown as Parameters<AgentKitInstance['run']>[1]);

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

function getExecuteAllowlist(): string[] {
  const raw = process.env.ALLOWED_CONTRACT_ADDRESSES;
  if (!raw?.trim()) return [];
  return raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/**
 * Execute a contract call using viem writeContract.
 * Validates contract address against ALLOWED_CONTRACT_ADDRESSES.
 * Supports agent wallet from Foundry keystore or EXECUTE_WALLET_PRIVATE_KEY.
 */
async function executeContractCall(
  _agentkit: AgentKitInstance,
  decision: ExecutableDecision & { action: 'EXECUTE' }
): Promise<ExecutionResult> {
  const params = decision.parameters as ExecuteParams | null;
  if (!params) {
    return { success: false, error: 'Contract call requires parameters' };
  }

  let account;
  try {
    account = await getKeystoreAccount();
  } catch {
    return {
      success: false,
      error:
        'EXECUTE requires KEYSTORE_ACCOUNT+KEYSTORE_PASSWORD or EXECUTE_WALLET_PRIVATE_KEY. Use TRANSFER or SWAP for AgentKit-backed execution.',
    };
  }

  const allowlist = getExecuteAllowlist();
  const contractLower = params.contractAddress.toLowerCase();
  if (allowlist.length > 0 && !allowlist.includes(contractLower)) {
    return {
      success: false,
      error: `Contract ${params.contractAddress} is not in ALLOWED_CONTRACT_ADDRESSES`,
    };
  }

  const rpcUrl = process.env.RPC_URL_BASE_SEPOLIA ?? process.env.RPC_URL_84532;
  if (!rpcUrl) {
    return { success: false, error: 'RPC URL not configured for EXECUTE' };
  }
  const client = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(rpcUrl),
  });
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl),
  });

  const contractAddress = params.contractAddress as `0x${string}`;
  const fn = params.functionName.toLowerCase();
  const isTransfer = fn.includes('transfer') && params.args && params.args.length >= 2;
  const isApprove = fn.includes('approve') && params.args && params.args.length >= 2;

  try {
    if (isTransfer) {
      const [to, amount] = params.args as [string, string];
      const hash = await client.writeContract({
        address: contractAddress,
        abi: ERC20_TRANSFER_ABI,
        functionName: 'transfer',
        args: [to as `0x${string}`, BigInt(amount)],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return {
        success: true,
        transactionHash: hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
        simulationResult: { hash, blockNumber: receipt.blockNumber.toString() },
      };
    }
    if (isApprove && params.args && params.args.length >= 2) {
      const [spender, amount] = params.args as [string, string];
      const hash = await client.writeContract({
        address: contractAddress,
        abi: MINIMAL_CALL_ABI,
        functionName: 'approve',
        args: [spender as `0x${string}`, BigInt(amount)],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return {
        success: true,
        transactionHash: hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
        simulationResult: { hash, blockNumber: receipt.blockNumber.toString() },
      };
    }
    return {
      success: false,
      error: `EXECUTE supports only transfer and approve. Requested: ${params.functionName} at ${params.contractAddress}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `EXECUTE failed: ${message}` };
  }
}

/**
 * Execute a rebalance operation (multiple swaps to reach target allocation)
 */
async function executeRebalance(
  agentkit: AgentKitInstance,
  decision: ExecutableDecision & { action: 'REBALANCE' }
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
    const rebalanceInput: TradeRunInput = {
      fromAssetId: toAssetId(params.tokenIn, networkId),
      toAssetId: toAssetId(params.tokenOut, networkId),
      amount: params.amountIn,
    };
    const result = await agentkit.run(tradeAction, rebalanceInput as unknown as Parameters<AgentKitInstance['run']>[1]);

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
