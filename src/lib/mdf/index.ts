/**
 * Aegis MDF Layer - MetaMask Delegation Framework Integration
 *
 * This module provides the delegation authority layer for Aegis.
 * MDF handles: delegation creation, caveat enforcement, revocation.
 * Aegis handles: intent analysis, policy checks, gas sponsorship, execution routing.
 */

export { SINGLE_EXECUTION_MODE, ROOT_AUTHORITY } from './types';
export type { MdfCaveat, MdfDelegation, MdfDelegationRecord, MdfVerificationResult, MdfCalldataResult } from './types';

export {
  DELEGATION_MANAGER_ADDRESSES,
  DELEGATION_MANAGER_ABI,
  CAVEAT_ENFORCERS_BASE_SEPOLIA,
  getDelegationManagerAddress,
  resolveDelegationManagerAddress,
} from './constants';

export {
  buildAllowedTargetsCaveat,
  buildAllowedMethodsCaveat,
  buildTimestampCaveat,
  buildValueLteCaveat,
  buildCaveatsFromPermissions,
} from './caveats';

export {
  verifyMdfDelegationSignature,
  hashMdfDelegation,
} from './verifier';

export {
  buildRedeemDelegationsCalldata,
  deserializeMdfDelegation,
  serializeMdfDelegation,
} from './calldata';
