/**
 * Aegis Attestation Logger - Onchain attestation client
 *
 * Posts policy decisions, heartbeats, agent discovery events, and reputation
 * updates to the AegisAttestationLogger contract on Base.
 */

import { createPublicClient, createWalletClient, http, keccak256, toHex } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { getKeystoreAccount } from '../../keystore';
import { logger } from '../../logger';

const ATTESTATION_LOGGER_ABI = [
  {
    inputs: [
      { name: 'agent', type: 'address' },
      { name: 'action', type: 'string' },
      { name: 'approved', type: 'bool' },
      { name: 'decisionHash', type: 'bytes32' },
      { name: 'reason', type: 'string' },
    ],
    name: 'logPolicyDecision',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'gasPrice', type: 'uint256' },
      { name: 'activeProtocols', type: 'uint256' },
    ],
    name: 'heartbeat',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'discovered', type: 'address' },
      { name: 'accountType', type: 'string' },
      { name: 'tier', type: 'uint8' },
    ],
    name: 'logDiscovery',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'agent', type: 'address' },
      { name: 'sponsorCount', type: 'uint256' },
      { name: 'successRateBps', type: 'uint256' },
      { name: 'passportHash', type: 'bytes32' },
    ],
    name: 'logReputationUpdate',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

function getAttestationLoggerAddress(): `0x${string}` | null {
  const addr = process.env.ATTESTATION_LOGGER_ADDRESS;
  return addr ? (addr as `0x${string}`) : null;
}

function getChain() {
  const networkId = process.env.AGENT_NETWORK_ID ?? 'base-sepolia';
  return networkId === 'base' ? base : baseSepolia;
}

function getRpcUrl(): string {
  return (
    process.env.BASE_RPC_URL ??
    process.env.RPC_URL_BASE ??
    process.env.RPC_URL_BASE_SEPOLIA ??
    'https://sepolia.base.org'
  );
}

async function getClients() {
  const account = await getKeystoreAccount();
  const chain = getChain();
  const rpcUrl = getRpcUrl();
  const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  return { walletClient, publicClient, account };
}

export interface AttestationResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

/**
 * Log a policy decision (approval or rejection) onchain.
 */
export async function logPolicyDecisionOnchain(params: {
  agentAddress: string;
  action: string;
  approved: boolean;
  decisionHash: `0x${string}`;
  reason: string;
}): Promise<AttestationResult> {
  const contractAddress = getAttestationLoggerAddress();
  if (!contractAddress) {
    logger.debug('[AttestationLogger] ATTESTATION_LOGGER_ADDRESS not set - skipping');
    return { success: true };
  }

  try {
    const { walletClient, publicClient } = await getClients();
    const hash = await walletClient.writeContract({
      address: contractAddress,
      abi: ATTESTATION_LOGGER_ABI,
      functionName: 'logPolicyDecision',
      args: [
        params.agentAddress as `0x${string}`,
        params.action,
        params.approved,
        params.decisionHash,
        params.reason.slice(0, 256),
      ],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    logger.info('[AttestationLogger] Policy decision logged onchain', {
      txHash: hash,
      approved: params.approved,
      action: params.action,
      gasUsed: receipt.gasUsed.toString(),
    });
    return { success: true, txHash: hash };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[AttestationLogger] Failed to log policy decision', { error: message });
    return { success: false, error: message };
  }
}

/**
 * Post an onchain heartbeat proving agent liveness.
 */
export async function postOnchainHeartbeat(params: {
  gasPriceWei: bigint;
  activeProtocols: number;
}): Promise<AttestationResult> {
  const contractAddress = getAttestationLoggerAddress();
  if (!contractAddress) {
    logger.debug('[AttestationLogger] ATTESTATION_LOGGER_ADDRESS not set - skipping heartbeat');
    return { success: true };
  }

  try {
    const { walletClient, publicClient } = await getClients();
    const hash = await walletClient.writeContract({
      address: contractAddress,
      abi: ATTESTATION_LOGGER_ABI,
      functionName: 'heartbeat',
      args: [params.gasPriceWei, BigInt(params.activeProtocols)],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    logger.info('[AttestationLogger] Heartbeat posted onchain', {
      txHash: hash,
      gasPrice: params.gasPriceWei.toString(),
      activeProtocols: params.activeProtocols,
      gasUsed: receipt.gasUsed.toString(),
    });
    return { success: true, txHash: hash };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[AttestationLogger] Heartbeat failed', { error: message });
    return { success: false, error: message };
  }
}

/**
 * Log an agent discovery event onchain.
 */
export async function logAgentDiscoveryOnchain(params: {
  discoveredAddress: string;
  accountType: string;
  tier: number;
}): Promise<AttestationResult> {
  const contractAddress = getAttestationLoggerAddress();
  if (!contractAddress) {
    logger.debug('[AttestationLogger] ATTESTATION_LOGGER_ADDRESS not set - skipping discovery');
    return { success: true };
  }

  try {
    const { walletClient, publicClient } = await getClients();
    const hash = await walletClient.writeContract({
      address: contractAddress,
      abi: ATTESTATION_LOGGER_ABI,
      functionName: 'logDiscovery',
      args: [
        params.discoveredAddress as `0x${string}`,
        params.accountType,
        params.tier,
      ],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    logger.info('[AttestationLogger] Agent discovery logged onchain', {
      txHash: hash,
      discovered: params.discoveredAddress,
      tier: params.tier,
      gasUsed: receipt.gasUsed.toString(),
    });
    return { success: true, txHash: hash };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[AttestationLogger] Discovery log failed', { error: message });
    return { success: false, error: message };
  }
}

/**
 * Log a reputation update onchain.
 */
export async function logReputationUpdateOnchain(params: {
  agentAddress: string;
  sponsorCount: number;
  successRateBps: number;
  passportData: string;
}): Promise<AttestationResult> {
  const contractAddress = getAttestationLoggerAddress();
  if (!contractAddress) {
    logger.debug('[AttestationLogger] ATTESTATION_LOGGER_ADDRESS not set - skipping reputation');
    return { success: true };
  }

  try {
    const passportHash = keccak256(toHex(params.passportData));
    const { walletClient, publicClient } = await getClients();
    const hash = await walletClient.writeContract({
      address: contractAddress,
      abi: ATTESTATION_LOGGER_ABI,
      functionName: 'logReputationUpdate',
      args: [
        params.agentAddress as `0x${string}`,
        BigInt(params.sponsorCount),
        BigInt(params.successRateBps),
        passportHash,
      ],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    logger.info('[AttestationLogger] Reputation update logged onchain', {
      txHash: hash,
      agent: params.agentAddress,
      sponsorCount: params.sponsorCount,
      gasUsed: receipt.gasUsed.toString(),
    });
    return { success: true, txHash: hash };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[AttestationLogger] Reputation update failed', { error: message });
    return { success: false, error: message };
  }
}
