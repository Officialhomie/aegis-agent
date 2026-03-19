/**
 * Aegis Paymaster Signer - Backend ECDSA approval signer.
 *
 * The backend evaluates sponsorship policy off-chain (agent tier, budget,
 * rate limits) and then calls signPaymasterApproval() to produce a
 * short-lived ECDSA approval embedded in paymasterAndData.
 *
 * AegisPaymaster.sol verifies this approval on-chain — deterministically
 * and without external calls.
 *
 * paymasterAndData layout (matches AegisPaymaster.sol exactly):
 *   [0:20]   paymaster address
 *   [20:36]  validation gas limit (uint128, ABI-packed by the caller)
 *   [36:52]  postOp gas limit    (uint128, ABI-packed by the caller)
 *   [52:58]  validUntil  (uint48, big-endian)
 *   [58:64]  validAfter  (uint48, big-endian)
 *   [64:65]  agentTier   (uint8: 1=ERC-8004, 2=ERC-4337, 3=other)
 *   [65:97]  approvalHash (bytes32)
 *   [97:162] signature   (bytes65, ECDSA r+s+v)
 */

import {
  encodeAbiParameters,
  encodePacked,
  keccak256,
  toBytes,
  toHex,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export interface PaymasterApprovalParams {
  /** ERC-4337 UserOp sender address */
  sender: Address;
  /** UserOp nonce */
  nonce: bigint;
  /** UserOp callData */
  callData: Hex;
  /** Agent tier (1=ERC-8004, 2=ERC-4337, 3=other smart contract) */
  agentTier: 1 | 2 | 3;
  /** Paymaster validation gas limit for the UserOp (passed through, not signed) */
  validationGasLimit?: bigint;
  /** Paymaster postOp gas limit for the UserOp (passed through, not signed) */
  postOpGasLimit?: bigint;
  /** How long the approval is valid in ms (default: PAYMASTER_APPROVAL_DURATION_MS or 300_000) */
  validDurationMs?: number;
}

export interface SignedPaymasterApproval {
  /** Full paymasterAndData bytes to set on the UserOp */
  paymasterAndData: Hex;
  /** Approval hash that was signed */
  approvalHash: Hex;
  /** Unix seconds */
  validUntil: number;
  /** Unix seconds */
  validAfter: number;
}

/** Decode paymasterAndData for testing and debugging. */
export interface DecodedPaymasterData {
  paymasterAddress: Address;
  validUntil: number;
  validAfter: number;
  agentTier: number;
  approvalHash: Hex;
  signature: Hex;
}

function getSigningKey(): Hex {
  const key = process.env.AEGIS_PAYMASTER_SIGNING_KEY?.trim();
  if (!key) {
    throw new Error('AEGIS_PAYMASTER_SIGNING_KEY is not configured');
  }
  return key as Hex;
}

function getPaymasterAddress(): Address {
  const addr = process.env.AEGIS_PAYMASTER_ADDRESS?.trim();
  if (!addr) {
    throw new Error('AEGIS_PAYMASTER_ADDRESS is not configured');
  }
  return addr as Address;
}

function getChainId(): number {
  const id = process.env.AGENT_CHAIN_ID ?? process.env.CHAIN_ID;
  if (id) return parseInt(id, 10);
  // Default: Base Sepolia = 84532, Base Mainnet = 8453
  const networkId = process.env.AGENT_NETWORK_ID ?? 'base-sepolia';
  return networkId === 'base' ? 8453 : 84532;
}

function getApprovalDurationMs(): number {
  const env = process.env.PAYMASTER_APPROVAL_DURATION_MS;
  return env ? parseInt(env, 10) : 300_000; // 5 minutes default
}

/**
 * Compute the approval hash that AegisPaymaster.sol will reconstruct on-chain.
 * Must match the Solidity exactly:
 *   keccak256(abi.encode(sender, nonce, keccak256(callData), validUntil, validAfter, agentTier, paymaster, chainId))
 */
export function computeApprovalHash(params: {
  sender: Address;
  nonce: bigint;
  callData: Hex;
  validUntil: number;
  validAfter: number;
  agentTier: number;
  paymasterAddress: Address;
  chainId: number;
}): Hex {
  const callDataHash = keccak256(params.callData);
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'address' },
        { type: 'uint256' },
        { type: 'bytes32' },
        { type: 'uint48' },
        { type: 'uint48' },
        { type: 'uint8' },
        { type: 'address' },
        { type: 'uint256' },
      ],
      [
        params.sender,
        params.nonce,
        callDataHash,
        params.validUntil,
        params.validAfter,
        params.agentTier,
        params.paymasterAddress,
        BigInt(params.chainId),
      ]
    )
  );
}

/**
 * Sign a paymaster approval and encode the full paymasterAndData bytes.
 *
 * The caller must set the first 52 bytes (paymaster address + gas limits) on
 * the UserOp's paymasterAndData. This function returns the full 162-byte blob
 * including those prefix bytes.
 */
export async function signPaymasterApproval(
  params: PaymasterApprovalParams
): Promise<SignedPaymasterApproval> {
  const paymasterAddress = getPaymasterAddress();
  const chainId = getChainId();
  const signingKey = getSigningKey();

  const durationMs = params.validDurationMs ?? getApprovalDurationMs();
  const validAfter = Math.floor(Date.now() / 1000);
  const validUntil = validAfter + Math.ceil(durationMs / 1000);

  const approvalHash = computeApprovalHash({
    sender: params.sender,
    nonce: params.nonce,
    callData: params.callData,
    validUntil,
    validAfter,
    agentTier: params.agentTier,
    paymasterAddress,
    chainId,
  });

  // Sign with EIP-191 prefix (matches MessageHashUtils.toEthSignedMessageHash in Solidity)
  const account = privateKeyToAccount(signingKey);
  const signature = await account.signMessage({ message: { raw: toBytes(approvalHash) } });

  // Encode the prefix: paymaster address (20) + validationGasLimit (16) + postOpGasLimit (16)
  const validationGasLimit = params.validationGasLimit ?? BigInt(150_000);
  const postOpGasLimit = params.postOpGasLimit ?? BigInt(75_000);

  const paymasterAndData = encodePacked(
    ['address', 'uint128', 'uint128', 'uint48', 'uint48', 'uint8', 'bytes32', 'bytes'],
    [
      paymasterAddress,
      validationGasLimit,
      postOpGasLimit,
      validUntil,
      validAfter,
      params.agentTier,
      approvalHash,
      signature,
    ]
  );

  return {
    paymasterAndData,
    approvalHash,
    validUntil,
    validAfter,
  };
}

/**
 * Decode paymasterAndData for inspection and testing.
 * Inverse of the encoding done in signPaymasterApproval.
 */
export function decodePaymasterAndData(paymasterAndData: Hex): DecodedPaymasterData {
  const bytes = toBytes(paymasterAndData);

  if (bytes.length < 162) {
    throw new Error(`paymasterAndData too short: ${bytes.length} bytes (need 162)`);
  }

  const paymasterAddress = toHex(bytes.slice(0, 20)) as Address;
  // bytes 20-52 are gas limits (prefix), skip
  const validUntil = parseInt(toHex(bytes.slice(52, 58)), 16);
  const validAfter = parseInt(toHex(bytes.slice(58, 64)), 16);
  const agentTier = bytes[64];
  const approvalHash = toHex(bytes.slice(65, 97)) as Hex;
  const signature = toHex(bytes.slice(97, 162)) as Hex;

  return { paymasterAddress, validUntil, validAfter, agentTier, approvalHash, signature };
}
