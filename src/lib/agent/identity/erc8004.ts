/**
 * Aegis Agent - ERC-8004 Identity Integration
 *
 * Agent registration and on-chain identity (when ERC-8004 mainnet is live).
 * When ERC8004_IDENTITY_REGISTRY_ADDRESS is set, mints via viem writeContract.
 */

import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient | null = null;

function getPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}

const MINT_ABI = [
  {
    inputs: [{ name: 'uri', type: 'string' }],
    name: 'mint',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

export interface AgentMetadata {
  name: string;
  description?: string;
  capabilities: string[];
  version: string;
  created: string;
}

/**
 * Upload agent metadata to IPFS using multipart/form-data (IPFS HTTP API /api/v0/add).
 * Validates CID in response. Throws on failure when NODE_ENV=production.
 */
export async function uploadToIPFS(metadata: AgentMetadata): Promise<string> {
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
    return `data:application/json,${encodeURIComponent(JSON.stringify(metadata))}`;
  }
}

/**
 * Get ERC-8004 identity registry. When ERC8004_IDENTITY_REGISTRY_ADDRESS is set,
 * calls real contract via viem writeContract; otherwise returns mock mint.
 */
function getERC8004IdentityRegistry(): { mint: (uri: string) => Promise<{ tokenId: string; from: string }> } {
  const registryAddress = process.env.ERC8004_IDENTITY_REGISTRY_ADDRESS as `0x${string}` | undefined;
  const privateKey = process.env.EXECUTE_WALLET_PRIVATE_KEY ?? process.env.AGENT_PRIVATE_KEY;
  const walletAddress = process.env.AGENT_WALLET_ADDRESS ?? '0x0000000000000000000000000000000000000000';

  return {
    async mint(uri: string): Promise<{ tokenId: string; from: string }> {
      if (registryAddress && privateKey) {
        const rpcUrl = process.env.RPC_URL_BASE_SEPOLIA ?? process.env.RPC_URL_84532;
        if (!rpcUrl) throw new Error('RPC URL not configured for ERC-8004 mint');
        const account = privateKeyToAccount(privateKey as `0x${string}`);
        const walletClient = createWalletClient({
          account,
          chain: baseSepolia,
          transport: http(rpcUrl),
        });
        const publicClient = createPublicClient({
          chain: baseSepolia,
          transport: http(rpcUrl),
        });
        const hash = await walletClient.writeContract({
          address: registryAddress,
          abi: MINT_ABI,
          functionName: 'mint',
          args: [uri],
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        const firstLog = receipt.logs?.[0] as { topics?: readonly string[] } | undefined;
        const tokenIdFromLog = firstLog?.topics?.[3];
        const tokenId =
          typeof tokenIdFromLog === 'string'
            ? tokenIdFromLog
            : receipt.transactionHash;
        return {
          tokenId,
          from: account.address,
        };
      }
      return {
        tokenId: `mock-${Date.now()}`,
        from: walletAddress,
      };
    },
  };
}

/**
 * Register agent identity: upload metadata, mint ERC-721 identity NFT, store onChainId in DB.
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
  const identityRegistry = getERC8004IdentityRegistry();
  const tx = await identityRegistry.mint(uri);

  const db = getPrisma();
  try {
    await db.agent.update({
      where: { id: agentId },
      data: {
        onChainId: tx.tokenId,
        walletAddress: tx.from,
      },
    });
  } catch (error) {
    console.error('[ERC-8004] Failed to update agent in DB:', error);
    throw error;
  }

  return tx.tokenId;
}
