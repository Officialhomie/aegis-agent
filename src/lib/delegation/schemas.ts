/**
 * Aegis Delegation Framework - Zod Schemas
 *
 * Defines the structure for delegation permissions, API requests/responses,
 * and EIP-712 typed data.
 */

import { z } from 'zod';

// ============================================================================
// Address validation
// ============================================================================

const AddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid address format');
const FunctionSelectorSchema = z.string().regex(/^0x[a-fA-F0-9]{8}$/, 'Invalid function selector');
const BigIntStringSchema = z.string().regex(/^\d+$/, 'Must be a numeric string');

// ============================================================================
// Delegation Permissions
// ============================================================================

/**
 * Scoped permissions for a delegation.
 * Empty arrays mean "all allowed" for that category.
 */
export const DelegationPermissionsSchema = z.object({
  // Contract whitelist (empty = all contracts allowed)
  contracts: z.array(AddressSchema).default([]),

  // Function selector whitelist (empty = all functions allowed)
  functions: z.array(FunctionSelectorSchema).default([]),

  // Value limits
  maxValuePerTx: BigIntStringSchema.optional().default('0'), // Max ETH value per tx (Wei), 0 = no limit
  maxGasPerTx: z.number().int().positive().optional().default(500000),

  // Spend limits (USD)
  maxDailySpend: z.number().min(0).optional().default(100),

  // Rate limits
  maxTxPerDay: z.number().int().positive().optional().default(50),
  maxTxPerHour: z.number().int().positive().optional().default(10),
});

export type DelegationPermissions = z.infer<typeof DelegationPermissionsSchema>;

// ============================================================================
// API Request Schemas
// ============================================================================

/**
 * Request to create a new delegation.
 */
export const CreateDelegationRequestSchema = z.object({
  // Parties
  delegator: AddressSchema,
  agent: AddressSchema,

  // Permissions
  permissions: DelegationPermissionsSchema,

  // Budget
  gasBudgetWei: BigIntStringSchema,

  // Validity period
  validFrom: z.string().datetime(),
  validUntil: z.string().datetime(),

  // EIP-712 signature
  signature: z.string().min(130).max(132), // 65 bytes hex with 0x prefix
  nonce: BigIntStringSchema,
});

export type CreateDelegationRequest = z.infer<typeof CreateDelegationRequestSchema>;

/**
 * Request to revoke a delegation.
 */
export const RevokeDelegationRequestSchema = z.object({
  reason: z.string().max(256).optional(),
});

export type RevokeDelegationRequest = z.infer<typeof RevokeDelegationRequestSchema>;

/**
 * Query parameters for listing delegations.
 */
export const ListDelegationsQuerySchema = z.object({
  delegator: AddressSchema.optional(),
  agent: AddressSchema.optional(),
  status: z.enum(['ACTIVE', 'REVOKED', 'EXPIRED', 'EXHAUSTED', 'ALL']).optional().default('ACTIVE'),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export type ListDelegationsQuery = z.infer<typeof ListDelegationsQuerySchema>;

// ============================================================================
// API Response Schemas
// ============================================================================

/**
 * Delegation record as returned by API.
 */
export const DelegationResponseSchema = z.object({
  id: z.string(),
  delegator: AddressSchema,
  agent: AddressSchema,
  agentOnChainId: z.string().nullable(),

  permissions: DelegationPermissionsSchema,

  gasBudgetWei: z.string(),
  gasBudgetSpent: z.string(),
  gasBudgetRemaining: z.string(),

  status: z.enum(['ACTIVE', 'REVOKED', 'EXPIRED', 'EXHAUSTED']),
  validFrom: z.string().datetime(),
  validUntil: z.string().datetime(),
  revokedAt: z.string().datetime().nullable(),
  revokedReason: z.string().nullable(),

  onChainTxHash: z.string().nullable(),

  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),

  // Usage stats
  usageCount: z.number().int().min(0),
  totalGasUsed: z.string(),
});

export type DelegationResponse = z.infer<typeof DelegationResponseSchema>;

/**
 * Delegation usage record.
 */
export const DelegationUsageResponseSchema = z.object({
  id: z.string(),
  delegationId: z.string(),

  targetContract: AddressSchema,
  functionSelector: z.string().nullable(),
  valueWei: z.string(),
  gasUsed: z.string(),
  gasCostWei: z.string(),

  txHash: z.string().nullable(),
  success: z.boolean(),
  errorMessage: z.string().nullable(),

  createdAt: z.string().datetime(),
});

export type DelegationUsageResponse = z.infer<typeof DelegationUsageResponseSchema>;

// ============================================================================
// EIP-712 Types
// ============================================================================

/**
 * EIP-712 domain for delegation signatures.
 */
export const EIP712_DOMAIN = {
  name: 'AegisDelegation',
  version: '1',
} as const;

/**
 * EIP-712 typed data structure for delegation.
 */
export const DelegationTypedDataSchema = z.object({
  delegator: AddressSchema,
  agent: AddressSchema,
  permissionsHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  gasBudgetWei: z.bigint(),
  validFrom: z.bigint(),
  validUntil: z.bigint(),
  nonce: z.bigint(),
});

export type DelegationTypedData = z.infer<typeof DelegationTypedDataSchema>;

/**
 * EIP-712 type definitions for viem/ethers.
 */
export const DELEGATION_TYPES = {
  Delegation: [
    { name: 'delegator', type: 'address' },
    { name: 'agent', type: 'address' },
    { name: 'permissionsHash', type: 'bytes32' },
    { name: 'gasBudgetWei', type: 'uint256' },
    { name: 'validFrom', type: 'uint256' },
    { name: 'validUntil', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
  ],
} as const;

// ============================================================================
// Internal Types
// ============================================================================

/**
 * Database delegation record (matches Prisma model).
 */
export const DelegationRecordSchema = z.object({
  id: z.string(),
  delegator: z.string(),
  agent: z.string(),
  agentOnChainId: z.string().nullable(),
  signature: z.string(),
  signatureNonce: z.bigint(),
  permissions: DelegationPermissionsSchema,
  gasBudgetWei: z.bigint(),
  gasBudgetSpent: z.bigint(),
  status: z.enum(['ACTIVE', 'REVOKED', 'EXPIRED', 'EXHAUSTED']),
  validFrom: z.date(),
  validUntil: z.date(),
  revokedAt: z.date().nullable(),
  revokedReason: z.string().nullable(),
  onChainTxHash: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type DelegationRecord = z.infer<typeof DelegationRecordSchema>;

/**
 * Parameters for recording delegation usage.
 */
export const RecordUsageParamsSchema = z.object({
  delegationId: z.string(),
  targetContract: AddressSchema,
  functionSelector: FunctionSelectorSchema.optional(),
  valueWei: z.bigint(),
  gasUsed: z.bigint(),
  gasCostWei: z.bigint(),
  txHash: z.string().optional(),
  success: z.boolean(),
  errorMessage: z.string().optional(),
});

export type RecordUsageParams = z.infer<typeof RecordUsageParamsSchema>;

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Check if a delegation is within its valid time window.
 */
export function isDelegationTimeValid(validFrom: Date, validUntil: Date): boolean {
  const now = new Date();
  return now >= validFrom && now <= validUntil;
}

/**
 * Check if a transaction is within the delegation's permission scope.
 */
export function isWithinScope(
  permissions: DelegationPermissions,
  targetContract: string,
  functionSelector?: string
): boolean {
  // Check contract whitelist
  if (permissions.contracts.length > 0) {
    const normalizedTarget = targetContract.toLowerCase();
    const allowed = permissions.contracts.some(
      (c) => c.toLowerCase() === normalizedTarget
    );
    if (!allowed) return false;
  }

  // Check function whitelist
  if (permissions.functions.length > 0 && functionSelector) {
    const normalizedSelector = functionSelector.toLowerCase();
    const allowed = permissions.functions.some(
      (f) => f.toLowerCase() === normalizedSelector
    );
    if (!allowed) return false;
  }

  return true;
}

/**
 * Check if a transaction value is within limits.
 */
export function isWithinValueLimit(
  permissions: DelegationPermissions,
  valueWei: bigint
): boolean {
  const maxValue = BigInt(permissions.maxValuePerTx || '0');
  // 0 means no limit
  if (maxValue === BigInt(0)) return true;
  return valueWei <= maxValue;
}
