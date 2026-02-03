/**
 * Aegis Agent - ERC-8004 Identity Integration
 *
 * Uses official ERC-8004 Identity Registry (https://github.com/erc-8004/erc-8004-contracts).
 * When ERC8004_IDENTITY_REGISTRY_ADDRESS is set, calls register(agentURI) and parses Registered event.
 */

import { createPublicClient, createWalletClient, http, decodeEventLog } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia, mainnet, sepolia } from 'viem/chains';
import { PrismaClient } from '@prisma/client';

import { IDENTITY_REGISTRY_ABI } from './abis/identity-registry';
import { ERC8004_ADDRESSES, type ERC8004Network } from './constants';
import { logger } from '../../logger';

let prisma: PrismaClient | null = null;

function getPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}

function getERC8004Chain() {
  const network = (process.env.ERC8004_NETWORK ?? 'sepolia') as ERC8004Network;
  if (network === 'mainnet') return mainnet;
  if (network === 'base-sepolia') return baseSepolia;
  return sepolia;
}

export function getIdentityRegistryAddress(): `0x${string}` | undefined {
  const override = process.env.ERC8004_IDENTITY_REGISTRY_ADDRESS?.trim();
  if (override) return override as `0x${string}`;
  const network = (process.env.ERC8004_NETWORK ?? 'sepolia') as ERC8004Network;
  const addr = ERC8004_ADDRESSES[network]?.identityRegistry;
  if (addr) return addr as `0x${string}`;
  return undefined;
}

function getRpcUrl(): string | undefined {
  const url = process.env.ERC8004_RPC_URL?.trim();
  if (url) return url;
  const network = process.env.ERC8004_NETWORK ?? 'sepolia';
  if (network === 'mainnet') return process.env.RPC_URL_ETHEREUM;
  if (network === 'base-sepolia') return process.env.RPC_URL_BASE_SEPOLIA ?? process.env.RPC_URL_84532;
  return process.env.RPC_URL_SEPOLIA ?? process.env.RPC_URL_ETHEREUM;
}

export interface AgentMetadata {
  name: string;
  description?: string;
  capabilities: string[];
  version: string;
  created: string;
}

/** ERC-8004 registration file format (agentURI content). Aligns with official spec / 8004.org. */
export interface AgentRegistrationFile {
  type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1';
  name: string;
  description: string;
  image?: string;
  services: Array<{
    name: 'web' | 'A2A' | 'mcp' | 'oasf' | 'https' | 'email';
    endpoint: string;
    version?: string;
  }>;
  x402Support: boolean;
  active: boolean;
  registrations: Array<{
    agentId: number;
    agentRegistry: string;
  }>;
  supportedTrust: ('reputation' | 'crypto-economic' | 'tee-attestation')[];
}

/** Build a spec-compliant registration file for IPFS / 8004.org. */
export function buildRegistrationFile(opts: {
  name: string;
  description: string;
  image?: string;
  webEndpoint?: string;
  a2aEndpoint?: string;
  x402Support?: boolean;
  existingRegistration?: { agentId: number; agentRegistry: string };
}): AgentRegistrationFile {
  const services: AgentRegistrationFile['services'] = [];
  if (opts.webEndpoint) services.push({ name: 'web', endpoint: opts.webEndpoint });
  if (opts.a2aEndpoint) services.push({ name: 'A2A', endpoint: opts.a2aEndpoint, version: '0.3.0' });
  return {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: opts.name,
    description: opts.description,
    image: opts.image,
    services: services.length > 0 ? services : [{ name: 'web', endpoint: 'https://aegis.example.com' }],
    x402Support: opts.x402Support ?? true,
    active: true,
    registrations: opts.existingRegistration ? [opts.existingRegistration] : [],
    supportedTrust: ['reputation'],
  };
}

/**
 * Upload agent metadata to IPFS using multipart/form-data (IPFS HTTP API /api/v0/add).
 * Validates CID in response. Throws on failure when NODE_ENV=production.
 */
export async function uploadToIPFS(metadata: AgentMetadata | AgentRegistrationFile): Promise<string> {
  const dataUri = `data:application/json,${encodeURIComponent(JSON.stringify(metadata))}`;
  const gateway = process.env.IPFS_GATEWAY_URL;
  if (!gateway) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('IPFS_GATEWAY_URL not configured - cannot use data: URI in production');
    }
    return dataUri;
  }
  try {
    const blob = new Blob([JSON.stringify(metadata)], { type: 'application/json' });
    const formData = new FormData();
    formData.append('file', blob, 'metadata.json');
    const res = await fetch(`${gateway}/api/v0/add`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`IPFS add failed: ${res.status} ${text}`);
    }
    const data = (await res.json()) as { Hash?: string; Name?: string };
    const cid = data.Hash ?? data.Name;
    if (!cid || typeof cid !== 'string' || cid.length < 10) {
      throw new Error('IPFS response missing valid CID');
    }
    return `ipfs://${cid}`;
  } catch (err) {
    if (process.env.NODE_ENV === 'production') {
      throw err;
    }
    return dataUri;
  }
}

/**
 * Register on Identity Registry with agentURI (official ERC-8004 register(string) ).
 * Returns agentId from Registered event and txHash.
 */
export async function registerWithRegistry(agentURI: string): Promise<{ agentId: bigint; txHash: string }> {
  const registryAddress = getIdentityRegistryAddress();
  const privateKey = process.env.EXECUTE_WALLET_PRIVATE_KEY ?? process.env.AGENT_PRIVATE_KEY;
  if (!registryAddress || !privateKey) {
    const ts = Date.now();
    return {
      agentId: BigInt(ts),
      txHash: `mock-${ts}`,
    };
  }
  const rpcUrl = getRpcUrl();
  if (!rpcUrl) throw new Error('RPC URL not configured for ERC-8004');
  const chain = getERC8004Chain();
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl),
  });
  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });
  const hash = await walletClient.writeContract({
    address: registryAddress,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: 'register',
    args: [agentURI],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  let agentId: bigint = BigInt(0);
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: IDENTITY_REGISTRY_ABI,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === 'Registered' && 'agentId' in decoded.args) {
        agentId = decoded.args.agentId as bigint;
        break;
      }
    } catch {
      continue;
    }
  }
  if (agentId === BigInt(0) && receipt.logs?.[0]) {
    const firstLog = receipt.logs[0] as { topics?: readonly string[] };
    const tokenIdFromLog = firstLog?.topics?.[1];
    if (typeof tokenIdFromLog === 'string') agentId = BigInt(tokenIdFromLog);
  }
  return { agentId, txHash: receipt.transactionHash };
}

/**
 * Update agent URI on Identity Registry (official setAgentURI).
 */
export async function setAgentURI(agentId: bigint, newURI: string): Promise<string> {
  const registryAddress = getIdentityRegistryAddress();
  const privateKey = process.env.EXECUTE_WALLET_PRIVATE_KEY ?? process.env.AGENT_PRIVATE_KEY;
  if (!registryAddress || !privateKey) throw new Error('ERC-8004 registry or private key not configured');
  const rpcUrl = getRpcUrl();
  if (!rpcUrl) throw new Error('RPC URL not configured for ERC-8004');
  const chain = getERC8004Chain();
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl),
  });
  const hash = await walletClient.writeContract({
    address: registryAddress,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: 'setAgentURI',
    args: [agentId, newURI],
  });
  return hash;
}

/**
 * Read agent identity from Identity Registry (tokenURI, ownerOf, getAgentWallet).
 */
export async function getAgentIdentity(agentId: bigint): Promise<{ uri: string; owner: string; wallet: string }> {
  const registryAddress = getIdentityRegistryAddress();
  if (!registryAddress) throw new Error('ERC-8004 registry not configured');
  const rpcUrl = getRpcUrl();
  if (!rpcUrl) throw new Error('RPC URL not configured for ERC-8004');
  const publicClient = createPublicClient({
    chain: getERC8004Chain(),
    transport: http(rpcUrl),
  });
  const [uri, owner, wallet] = await Promise.all([
    publicClient.readContract({
      address: registryAddress,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'tokenURI',
      args: [agentId],
    }),
    publicClient.readContract({
      address: registryAddress,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'ownerOf',
      args: [agentId],
    }),
    publicClient.readContract({
      address: registryAddress,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'getAgentWallet',
      args: [agentId],
    }),
  ]);
  const walletAddr = wallet && typeof wallet === 'string' ? wallet : (wallet as unknown as { toString: () => string })?.toString?.() ?? '0x0';
  return {
    uri: uri as string,
    owner: owner as string,
    wallet: walletAddr,
  };
}

/**
 * Register agent identity: upload metadata, call official register(agentURI), store onChainId in DB.
 * Kept for backward compatibility with (agentId, agentName, capabilities, metadataUri?).
 */
export async function registerAgentIdentity(
  agentId: string,
  agentName: string,
  capabilities: string[],
  metadataUri?: string
): Promise<string> {
  const metadata: AgentMetadata = {
    name: agentName,
    description: 'Aegis - Autonomous Treasury Management Agent',
    capabilities,
    version: '1.0.0',
    created: new Date().toISOString(),
  };

  const uri = metadataUri ?? (await uploadToIPFS(metadata));
  const { agentId: onChainId, txHash } = await registerWithRegistry(uri);
  const onChainIdStr = txHash.startsWith('mock-') ? txHash : onChainId.toString();

  const db = getPrisma();
  try {
    await db.agent.update({
      where: { id: agentId },
      data: {
        onChainId: onChainIdStr,
        walletAddress: process.env.AGENT_WALLET_ADDRESS ?? undefined,
      },
    });
  } catch (error) {
    logger.error('[ERC-8004] Failed to update agent in DB', { error });
    throw error;
  }

  logger.info('[ERC-8004] Agent registered', { agentId: onChainIdStr, txHash });
  return onChainIdStr;
}
