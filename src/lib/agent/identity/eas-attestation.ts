/**
 * EAS (Ethereum Attestation Service) Gas Passport Attestation
 *
 * Creates portable, verifiable attestations of agent sponsorship history
 * on Base via EAS (0x4200000000000000000000000000000000000021).
 *
 * Schema: (address agent, uint256 sponsorCount, uint256 successRateBps,
 *          uint256 protocolCount, bytes32 reputationHash)
 */

import { createPublicClient, createWalletClient, http, encodePacked, keccak256, toHex } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { getKeystoreAccount } from '../../keystore';
import { logger } from '../../logger';

// EAS contract on Base (predeploy)
const EAS_ADDRESS = '0x4200000000000000000000000000000000000021' as const;
// Schema Registry on Base (predeploy)
const SCHEMA_REGISTRY_ADDRESS = '0x4200000000000000000000000000000000000020' as const;

const SCHEMA_REGISTRY_ABI = [
  {
    inputs: [
      { name: 'schema', type: 'string' },
      { name: 'resolver', type: 'address' },
      { name: 'revocable', type: 'bool' },
    ],
    name: 'register',
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

const EAS_ABI = [
  {
    inputs: [
      {
        name: 'request',
        type: 'tuple',
        components: [
          { name: 'schema', type: 'bytes32' },
          {
            name: 'data',
            type: 'tuple',
            components: [
              { name: 'recipient', type: 'address' },
              { name: 'expirationTime', type: 'uint64' },
              { name: 'revocable', type: 'bool' },
              { name: 'refUID', type: 'bytes32' },
              { name: 'data', type: 'bytes' },
              { name: 'value', type: 'uint256' },
            ],
          },
        ],
      },
    ],
    name: 'attest',
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'payable',
    type: 'function',
  },
] as const;

// Schema: agent address, sponsorship count, success rate (basis points), protocol count, reputation hash
const SCHEMA_STRING = 'address agent,uint256 sponsorCount,uint256 successRateBps,uint256 protocolCount,bytes32 reputationHash';

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

/**
 * Register the Gas Passport attestation schema on EAS.
 * Only needs to be called once per chain.
 */
export async function registerGasPassportSchema(): Promise<{
  success: boolean;
  schemaUID?: string;
  txHash?: string;
  error?: string;
}> {
  // Check if schema UID is already stored
  const existingUID = process.env.EAS_GAS_PASSPORT_SCHEMA_UID;
  if (existingUID) {
    logger.info('[EAS] Schema already registered', { schemaUID: existingUID });
    return { success: true, schemaUID: existingUID };
  }

  try {
    const { walletClient, publicClient } = await getClients();

    const hash = await walletClient.writeContract({
      address: SCHEMA_REGISTRY_ADDRESS,
      abi: SCHEMA_REGISTRY_ABI,
      functionName: 'register',
      args: [
        SCHEMA_STRING,
        '0x0000000000000000000000000000000000000000', // no resolver
        true, // revocable
      ],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    // Extract schema UID from SchemaRegistered event (topic0)
    const schemaRegisteredTopic = '0x7d917fcbc9a29a9705ff9936b1f9dbf3571993b32e3d5dabda85c8e16a99f0ef';
    const registeredLog = receipt.logs.find(
      (log) => log.topics[0] === schemaRegisteredTopic
    );
    const schemaUID = registeredLog?.topics[1] ?? undefined;

    logger.info('[EAS] Gas Passport schema registered', {
      txHash: hash,
      schemaUID,
      gasUsed: receipt.gasUsed.toString(),
    });

    return { success: true, schemaUID, txHash: hash };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[EAS] Schema registration failed', { error: message });
    return { success: false, error: message };
  }
}

/**
 * Create an EAS attestation for an agent's Gas Passport data.
 */
export async function attestGasPassport(params: {
  agentAddress: string;
  sponsorCount: number;
  successRateBps: number;
  protocolCount: number;
  passportData: string;
}): Promise<{
  success: boolean;
  attestationUID?: string;
  txHash?: string;
  error?: string;
}> {
  const schemaUID = process.env.EAS_GAS_PASSPORT_SCHEMA_UID;
  if (!schemaUID) {
    logger.warn('[EAS] EAS_GAS_PASSPORT_SCHEMA_UID not set - register schema first');
    return { success: false, error: 'Schema not registered' };
  }

  try {
    const { walletClient, publicClient } = await getClients();
    const reputationHash = keccak256(toHex(params.passportData));

    // Encode attestation data matching the schema
    const encodedData = encodePacked(
      ['address', 'uint256', 'uint256', 'uint256', 'bytes32'],
      [
        params.agentAddress as `0x${string}`,
        BigInt(params.sponsorCount),
        BigInt(params.successRateBps),
        BigInt(params.protocolCount),
        reputationHash,
      ]
    );

    const hash = await walletClient.writeContract({
      address: EAS_ADDRESS,
      abi: EAS_ABI,
      functionName: 'attest',
      args: [
        {
          schema: schemaUID as `0x${string}`,
          data: {
            recipient: params.agentAddress as `0x${string}`,
            expirationTime: BigInt(0), // no expiration
            revocable: true,
            refUID: '0x0000000000000000000000000000000000000000000000000000000000000000',
            data: encodedData,
            value: BigInt(0),
          },
        },
      ],
      value: BigInt(0),
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    // Extract attestation UID from Attested event
    const attestedTopic = '0x8bf46bf4cfd674fa735a3d63ec1c9ad4153f033c290341f3a588b75c3b2ee6a3';
    const attestedLog = receipt.logs.find(
      (log) => log.topics[0] === attestedTopic
    );
    const attestationUID = attestedLog?.data?.slice(0, 66) ?? undefined;

    logger.info('[EAS] Gas Passport attestation created', {
      txHash: hash,
      attestationUID,
      agent: params.agentAddress,
      sponsorCount: params.sponsorCount,
      successRateBps: params.successRateBps,
      gasUsed: receipt.gasUsed.toString(),
    });

    return { success: true, attestationUID, txHash: hash };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[EAS] Attestation failed', { error: message });
    return { success: false, error: message };
  }
}
