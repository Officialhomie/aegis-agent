/**
 * Aegis MDF Layer - MDF Delegation Signature Verifier
 *
 * Verifies EIP-712 signatures produced by a user's DeleGator account when
 * creating a delegation. The EIP-712 domain and type definitions must exactly
 * match what the deployed DelegationManager.sol expects.
 */

import { verifyTypedData, keccak256, encodeAbiParameters, parseAbiParameters } from 'viem';
import type { MdfDelegation, MdfVerificationResult } from './types';

/**
 * EIP-712 type definitions for MDF Delegation and Caveat.
 * These must match the deployed DelegationManager.sol EXACTLY.
 */
const MDF_EIP712_TYPES = {
  Delegation: [
    { name: 'delegate', type: 'address' },
    { name: 'delegator', type: 'address' },
    { name: 'authority', type: 'bytes32' },
    { name: 'caveats', type: 'Caveat[]' },
    { name: 'salt', type: 'uint256' },
  ],
  Caveat: [
    { name: 'enforcer', type: 'address' },
    { name: 'terms', type: 'bytes' },
    { name: 'args', type: 'bytes' },
  ],
} as const;

/**
 * Verify an EIP-712 signature on an MDF Delegation struct.
 * Returns { valid: true } if the signature was produced by delegation.delegator.
 *
 * @param delegation - The MDF delegation struct including the signature to verify
 * @param delegationManagerAddress - The deployed DelegationManager contract address
 * @param chainId - Chain ID for the EIP-712 domain
 */
export async function verifyMdfDelegationSignature(
  delegation: MdfDelegation,
  delegationManagerAddress: `0x${string}`,
  chainId: number
): Promise<MdfVerificationResult> {
  try {
    const domain = {
      name: 'DelegationManager',
      version: '1',
      chainId,
      verifyingContract: delegationManagerAddress,
    };

    // The message excludes the signature itself — sign over the typed data content
    const message = {
      delegate: delegation.delegate,
      delegator: delegation.delegator,
      authority: delegation.authority,
      caveats: delegation.caveats.map((c) => ({
        enforcer: c.enforcer,
        terms: c.terms,
        args: c.args,
      })),
      salt: delegation.salt,
    };

    const isValid = await verifyTypedData({
      address: delegation.delegator,
      domain,
      types: MDF_EIP712_TYPES,
      primaryType: 'Delegation',
      message,
      signature: delegation.signature,
    });

    return { valid: isValid };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : 'Signature verification failed',
    };
  }
}

/**
 * Compute the keccak256 hash of an MDF Delegation struct.
 * This hash is used as the key in DelegationManager for revocation checks.
 *
 * Mirrors the hash computed by DelegationManager.sol's _getAndIncrementNonce / getDelegationHash.
 * Implementation: keccak256(abi.encode(Delegation)) — the raw struct encoding.
 */
export function hashMdfDelegation(delegation: MdfDelegation): `0x${string}` {
  const encodedCaveats = delegation.caveats.map((c) =>
    encodeAbiParameters(parseAbiParameters('(address enforcer, bytes terms, bytes args)'), [
      { enforcer: c.enforcer, terms: c.terms, args: c.args },
    ])
  );

  const encoded = encodeAbiParameters(
    parseAbiParameters(
      '(address delegate, address delegator, bytes32 authority, bytes[] caveats, uint256 salt)'
    ),
    [
      {
        delegate: delegation.delegate,
        delegator: delegation.delegator,
        authority: delegation.authority,
        caveats: encodedCaveats,
        salt: delegation.salt,
      },
    ]
  );

  return keccak256(encoded);
}
