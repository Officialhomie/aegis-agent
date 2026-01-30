/**
 * Aegis Agent - ERC-8004 Identity Integration
 *
 * Agent registration and on-chain identity (when ERC-8004 mainnet is live).
 * Metadata upload to IPFS and identity registry mint are stubbed/placeholder
 * until the standard is deployed.
 */

type PrismaClient = any;
let prisma: PrismaClient | null = null;

function getPrisma(): PrismaClient {
  if (!prisma) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PrismaClient } = require('@prisma/client') as { PrismaClient: PrismaClient };
    prisma = new PrismaClient();
  }
  return prisma;
}

export interface AgentMetadata {
  name: string;
  description?: string;
  capabilities: string[];
  version: string;
  created: string;
}

/**
 * Upload agent metadata to IPFS (stub until ipfs-http-client is configured).
 * Set IPFS_GATEWAY_URL or use a real IPFS client when ready.
 */
export async function uploadToIPFS(metadata: AgentMetadata): Promise<string> {
  const gateway = process.env.IPFS_GATEWAY_URL;
  if (gateway) {
    try {
      const res = await fetch(`${gateway}/api/v0/add`, {
        method: 'POST',
        body: JSON.stringify(metadata),
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const data = (await res.json()) as { Hash?: string };
        return data.Hash ? `ipfs://${data.Hash}` : `data:application/json,${encodeURIComponent(JSON.stringify(metadata))}`;
      }
    } catch {
      // fallback to data URI
    }
  }
  return `data:application/json,${encodeURIComponent(JSON.stringify(metadata))}`;
}

/**
 * Get ERC-8004 identity registry contract (stub until mainnet).
 * When live: return viem/ethers contract instance for the registry address.
 */
function getERC8004IdentityRegistry(): { mint: (uri: string) => Promise<{ tokenId: string; from: string }> } {
  const registryAddress = process.env.ERC8004_IDENTITY_REGISTRY_ADDRESS;
  return {
    async mint(uri: string): Promise<{ tokenId: string; from: string }> {
      if (registryAddress) {
        // TODO: call real contract when ERC-8004 is deployed
        // const tx = await contract.mint(uri);
        // return { tokenId: tx.tokenId.toString(), from: tx.from };
      }
      return {
        tokenId: `mock-${Date.now()}`,
        from: process.env.AGENT_WALLET_ADDRESS ?? '0x0000000000000000000000000000000000000000',
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
