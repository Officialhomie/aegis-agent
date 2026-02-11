/**
 * Aegis Delegation Framework
 *
 * User-to-Agent delegation with scoped permissions and gas budgets.
 * Enables users to grant limited, revocable permissions to ERC-8004 registered agents.
 */

// Schemas and types
export {
  DelegationPermissionsSchema,
  CreateDelegationRequestSchema,
  RevokeDelegationRequestSchema,
  ListDelegationsQuerySchema,
  DelegationResponseSchema,
  DelegationUsageResponseSchema,
  DelegationTypedDataSchema,
  DelegationRecordSchema,
  RecordUsageParamsSchema,
  EIP712_DOMAIN,
  DELEGATION_TYPES,
  isDelegationTimeValid,
  isWithinScope,
  isWithinValueLimit,
  type DelegationPermissions,
  type CreateDelegationRequest,
  type RevokeDelegationRequest,
  type ListDelegationsQuery,
  type DelegationResponse,
  type DelegationUsageResponse,
  type DelegationTypedData,
  type DelegationRecord,
  type RecordUsageParams,
} from './schemas';

// EIP-712 signature handling
export {
  hashPermissions,
  buildDomainSeparator,
  buildStructHash,
  buildDigest,
  verifyDelegationSignature,
  buildTypedDataForSigning,
  getPermissionsHashForClient,
  type DelegationSignatureParams,
  type SignatureVerificationResult,
} from './eip712';

// Service layer
export {
  createDelegation,
  revokeDelegation,
  getDelegation,
  listDelegations,
  getDelegationUsage,
  validateDelegationForTransaction,
  hasValidDelegation,
  deductDelegationBudget,
  rollbackDelegationBudget,
  recordDelegationUsage,
  type CreateDelegationResult,
  type RevokeDelegationResult,
  type DelegationValidation,
} from './service';
