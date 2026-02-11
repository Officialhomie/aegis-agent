/**
 * Aegis Delegation Framework - EIP-712 Signature Verification
 *
 * Handles signature verification for delegation creation.
 * Uses viem for EIP-712 typed data hashing and recovery.
 */

import { keccak256, encodePacked, recoverAddress, type Hex, type Address } from 'viem';
import { logger } from '../logger';
import { EIP712_DOMAIN, DELEGATION_TYPES, type DelegationPermissions } from './schemas';

// ============================================================================
// Types
// ============================================================================

export interface DelegationSignatureParams {
  delegator: Address;
  agent: Address;
  permissions: DelegationPermissions;
  gasBudgetWei: bigint;
  validFrom: Date;
  validUntil: Date;
  nonce: bigint;
  chainId: number;
  verifyingContract: Address;
}

export interface SignatureVerificationResult {
  valid: boolean;
  recoveredAddress?: Address;
  error?: string;
}

// ============================================================================
// Hash Functions
// ============================================================================

/**
 * Hash delegation permissions to bytes32.
 * Used for on-chain storage and signature verification.
 */
export function hashPermissions(permissions: DelegationPermissions): Hex {
  // Normalize and stringify permissions deterministically
  const normalized = {
    contracts: [...permissions.contracts].sort().map((c) => c.toLowerCase()),
    functions: [...permissions.functions].sort().map((f) => f.toLowerCase()),
    maxValuePerTx: permissions.maxValuePerTx || '0',
    maxGasPerTx: permissions.maxGasPerTx || 500000,
    maxDailySpend: permissions.maxDailySpend || 100,
    maxTxPerDay: permissions.maxTxPerDay || 50,
    maxTxPerHour: permissions.maxTxPerHour || 10,
  };

  const json = JSON.stringify(normalized);
  return keccak256(encodePacked(['string'], [json]));
}

/**
 * Build EIP-712 domain separator.
 */
export function buildDomainSeparator(chainId: number, verifyingContract: Address): Hex {
  const typeHash = keccak256(
    encodePacked(
      ['string'],
      ['EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)']
    )
  );

  const nameHash = keccak256(encodePacked(['string'], [EIP712_DOMAIN.name]));
  const versionHash = keccak256(encodePacked(['string'], [EIP712_DOMAIN.version]));

  return keccak256(
    encodePacked(
      ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
      [typeHash, nameHash, versionHash, BigInt(chainId), verifyingContract]
    )
  );
}

/**
 * Build EIP-712 struct hash for delegation.
 */
export function buildStructHash(params: DelegationSignatureParams): Hex {
  const typeHash = keccak256(
    encodePacked(
      ['string'],
      [
        'Delegation(address delegator,address agent,bytes32 permissionsHash,uint256 gasBudgetWei,uint256 validFrom,uint256 validUntil,uint256 nonce)',
      ]
    )
  );

  const permissionsHash = hashPermissions(params.permissions);
  const validFromUnix = BigInt(Math.floor(params.validFrom.getTime() / 1000));
  const validUntilUnix = BigInt(Math.floor(params.validUntil.getTime() / 1000));

  return keccak256(
    encodePacked(
      ['bytes32', 'address', 'address', 'bytes32', 'uint256', 'uint256', 'uint256', 'uint256'],
      [
        typeHash,
        params.delegator,
        params.agent,
        permissionsHash,
        params.gasBudgetWei,
        validFromUnix,
        validUntilUnix,
        params.nonce,
      ]
    )
  );
}

/**
 * Build the full EIP-712 digest to be signed.
 */
export function buildDigest(params: DelegationSignatureParams): Hex {
  const domainSeparator = buildDomainSeparator(params.chainId, params.verifyingContract);
  const structHash = buildStructHash(params);

  return keccak256(
    encodePacked(['string', 'bytes32', 'bytes32'], ['\x19\x01', domainSeparator, structHash])
  );
}

// ============================================================================
// Signature Verification
// ============================================================================

/**
 * Verify an EIP-712 delegation signature.
 * Returns the recovered address and whether it matches the claimed delegator.
 */
export async function verifyDelegationSignature(
  params: DelegationSignatureParams,
  signature: Hex
): Promise<SignatureVerificationResult> {
  try {
    // Build the digest
    const digest = buildDigest(params);

    // Recover the signer address
    const recoveredAddress = await recoverAddress({
      hash: digest,
      signature,
    });

    // Check if recovered address matches delegator
    const valid = recoveredAddress.toLowerCase() === params.delegator.toLowerCase();

    if (!valid) {
      logger.warn('[Delegation] Signature verification failed: address mismatch', {
        expected: params.delegator,
        recovered: recoveredAddress,
      });
    }

    return {
      valid,
      recoveredAddress,
      error: valid ? undefined : `Recovered ${recoveredAddress}, expected ${params.delegator}`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[Delegation] Signature verification error', { error: errorMessage });

    return {
      valid: false,
      error: `Signature verification failed: ${errorMessage}`,
    };
  }
}

// ============================================================================
// Client-Side Helpers
// ============================================================================

/**
 * Build typed data object for client-side signing with viem/ethers.
 * This is what the client would use to sign the delegation.
 */
export function buildTypedDataForSigning(
  params: DelegationSignatureParams
): {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: Address;
  };
  types: typeof DELEGATION_TYPES;
  primaryType: 'Delegation';
  message: {
    delegator: Address;
    agent: Address;
    permissionsHash: Hex;
    gasBudgetWei: bigint;
    validFrom: bigint;
    validUntil: bigint;
    nonce: bigint;
  };
} {
  const permissionsHash = hashPermissions(params.permissions);
  const validFromUnix = BigInt(Math.floor(params.validFrom.getTime() / 1000));
  const validUntilUnix = BigInt(Math.floor(params.validUntil.getTime() / 1000));

  return {
    domain: {
      name: EIP712_DOMAIN.name,
      version: EIP712_DOMAIN.version,
      chainId: params.chainId,
      verifyingContract: params.verifyingContract,
    },
    types: DELEGATION_TYPES,
    primaryType: 'Delegation',
    message: {
      delegator: params.delegator,
      agent: params.agent,
      permissionsHash,
      gasBudgetWei: params.gasBudgetWei,
      validFrom: validFromUnix,
      validUntil: validUntilUnix,
      nonce: params.nonce,
    },
  };
}

/**
 * Get the permissions hash that would be used in the signature.
 * Useful for clients to verify they're signing the right permissions.
 */
export function getPermissionsHashForClient(permissions: DelegationPermissions): Hex {
  return hashPermissions(permissions);
}
