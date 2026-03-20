/**
 * Aegis MDF Layer - TypeScript types for MetaMask Delegation Framework
 *
 * Lean interfaces decoupled from any specific npm package version.
 * These mirror the Solidity structs in DelegationManager.sol.
 */

/** A single caveat constraint attached to a delegation. */
export interface MdfCaveat {
  /** Address of the caveat enforcer contract. */
  enforcer: `0x${string}`;
  /** ABI-encoded static parameters set at delegation creation time. */
  terms: `0x${string}`;
  /** ABI-encoded runtime arguments supplied at redemption time. Empty at creation. */
  args: `0x${string}`;
}

/**
 * MetaMask Delegation Framework Delegation struct.
 * Mirrors the Solidity Delegation struct in DelegationManager.sol.
 */
export interface MdfDelegation {
  /** The address authorized to act (Aegis agent smart account). */
  delegate: `0x${string}`;
  /** The address granting authority (user's DeleGator account). */
  delegator: `0x${string}`;
  /**
   * Authority chain reference.
   * ROOT_AUTHORITY (0xfff...f) for top-level delegations.
   * Parent delegation hash for sub-delegations.
   */
  authority: `0x${string}`;
  /** Composable permission constraints enforced on-chain by DelegationManager. */
  caveats: MdfCaveat[];
  /** Uniqueness salt to allow multiple delegations between the same parties. */
  salt: bigint;
  /** EIP-712 signature from the delegator. */
  signature: `0x${string}`;
}

/**
 * Internal record linking an Aegis Delegation DB record to an MDF delegation.
 * Stored as JSON in Delegation.serializedMdfDelegation.
 */
export interface MdfDelegationRecord {
  /** FK to Prisma Delegation.id */
  aegisDelegationId: string;
  /** keccak256 of the ABI-encoded MdfDelegation struct (used for on-chain revocation checks) */
  mdfDelegationHash: `0x${string}`;
  /** Address of the DelegationManager contract used */
  delegationManagerAddress: `0x${string}`;
  /** Chain ID where the delegation is valid */
  chainId: number;
}

/**
 * ERC-7579 execution mode codes used in redeemDelegations.
 * Single default execution = all zeros.
 */
export const SINGLE_EXECUTION_MODE =
  '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`;

/** Root authority constant — signals a top-level delegation with no parent. */
export const ROOT_AUTHORITY =
  '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' as `0x${string}`;

/** Result from MDF delegation signature verification. */
export interface MdfVerificationResult {
  valid: boolean;
  error?: string;
}

/** Result from building redeemDelegations calldata. */
export interface MdfCalldataResult {
  callData: `0x${string}`;
  delegationHash: `0x${string}`;
}
