/**
 * Aegis Delegation Framework - Service Layer
 *
 * Business logic for creating, revoking, and querying delegations.
 * Handles database operations, signature verification, and ERC-8004 checks.
 */

import type { Address, Hex } from 'viem';
import { getPrisma } from '../db';
import { logger } from '../logger';
import { getConfigNumber, getConfigString } from '../config';
import { verifyDelegationSignature, hashPermissions } from './eip712';
import {
  type DelegationPermissions,
  type CreateDelegationRequest,
  type DelegationResponse,
  type DelegationUsageResponse,
  type RecordUsageParams,
  DelegationPermissionsSchema,
  isDelegationTimeValid,
  isWithinScope,
  isWithinValueLimit,
} from './schemas';

// ============================================================================
// Configuration
// ============================================================================

const DELEGATION_ENABLED = process.env.DELEGATION_ENABLED === 'true';
const DELEGATION_REQUIRE_ERC8004 = process.env.DELEGATION_REQUIRE_ERC8004 === 'true';
const DELEGATION_REGISTRY_ADDRESS = getConfigString(
  'DELEGATION_REGISTRY_ADDRESS',
  '0x0000000000000000000000000000000000000000'
) as Address;
const DELEGATION_CHAIN_ID = getConfigNumber('DELEGATION_CHAIN_ID', 8453, 1, 999999);

// ============================================================================
// Types
// ============================================================================

export interface CreateDelegationResult {
  success: boolean;
  delegation?: DelegationResponse;
  error?: string;
}

export interface RevokeDelegationResult {
  success: boolean;
  error?: string;
}

export interface DelegationValidation {
  valid: boolean;
  delegation?: {
    id: string;
    delegator: string;
    agent: string;
    permissions: DelegationPermissions;
    gasBudgetRemaining: bigint;
  };
  error?: string;
}

// ============================================================================
// Create Delegation
// ============================================================================

/**
 * Create a new delegation after verifying the signature.
 */
export async function createDelegation(
  request: CreateDelegationRequest
): Promise<CreateDelegationResult> {
  if (!DELEGATION_ENABLED) {
    return { success: false, error: 'Delegation feature is disabled' };
  }

  const db = getPrisma();

  try {
    // Parse and validate permissions
    const permissions = DelegationPermissionsSchema.parse(request.permissions);

    // Check if agent is ERC-8004 registered (if required)
    let agentOnChainId: string | null = null;
    if (DELEGATION_REQUIRE_ERC8004) {
      const agent = await db.agent.findFirst({
        where: { walletAddress: request.agent.toLowerCase() },
        select: { onChainId: true },
      });

      if (!agent?.onChainId) {
        return {
          success: false,
          error: 'Agent is not registered with ERC-8004. Registration required for delegations.',
        };
      }
      agentOnChainId = agent.onChainId;
    }

    // Verify EIP-712 signature
    const validFrom = new Date(request.validFrom);
    const validUntil = new Date(request.validUntil);
    const nonce = BigInt(request.nonce);
    const gasBudgetWei = BigInt(request.gasBudgetWei);

    const signatureResult = await verifyDelegationSignature(
      {
        delegator: request.delegator as Address,
        agent: request.agent as Address,
        permissions,
        gasBudgetWei,
        validFrom,
        validUntil,
        nonce,
        chainId: DELEGATION_CHAIN_ID,
        verifyingContract: DELEGATION_REGISTRY_ADDRESS,
      },
      request.signature as Hex
    );

    if (!signatureResult.valid) {
      logger.warn('[Delegation] Signature verification failed', {
        delegator: request.delegator,
        error: signatureResult.error,
      });
      return { success: false, error: signatureResult.error || 'Invalid signature' };
    }

    // Check for duplicate nonce
    const existing = await db.delegation.findFirst({
      where: {
        delegator: request.delegator.toLowerCase(),
        agent: request.agent.toLowerCase(),
        signatureNonce: nonce,
      },
    });

    if (existing) {
      return { success: false, error: 'Nonce already used. Use a new nonce for this delegation.' };
    }

    // Create delegation record
    const delegation = await db.delegation.create({
      data: {
        delegator: request.delegator.toLowerCase(),
        agent: request.agent.toLowerCase(),
        agentOnChainId,
        signature: request.signature,
        signatureNonce: nonce,
        permissions: permissions as object,
        gasBudgetWei,
        gasBudgetSpent: BigInt(0),
        status: 'ACTIVE',
        validFrom,
        validUntil,
      },
    });

    logger.info('[Delegation] Created new delegation', {
      id: delegation.id,
      delegator: delegation.delegator,
      agent: delegation.agent,
      validUntil: delegation.validUntil,
    });

    return {
      success: true,
      delegation: formatDelegationResponse(delegation),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[Delegation] Failed to create delegation', { error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

// ============================================================================
// Revoke Delegation
// ============================================================================

/**
 * Revoke a delegation.
 * Only the delegator can revoke their own delegations.
 */
export async function revokeDelegation(
  delegationId: string,
  delegatorAddress: string,
  reason?: string
): Promise<RevokeDelegationResult> {
  const db = getPrisma();

  try {
    const delegation = await db.delegation.findUnique({
      where: { id: delegationId },
    });

    if (!delegation) {
      return { success: false, error: 'Delegation not found' };
    }

    if (delegation.delegator.toLowerCase() !== delegatorAddress.toLowerCase()) {
      return { success: false, error: 'Only the delegator can revoke this delegation' };
    }

    if (delegation.status === 'REVOKED') {
      return { success: false, error: 'Delegation already revoked' };
    }

    await db.delegation.update({
      where: { id: delegationId },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
        revokedReason: reason,
      },
    });

    logger.info('[Delegation] Revoked delegation', {
      id: delegationId,
      delegator: delegatorAddress,
      reason,
    });

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[Delegation] Failed to revoke delegation', { error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

// ============================================================================
// Query Delegations
// ============================================================================

/**
 * Get a single delegation by ID.
 */
export async function getDelegation(delegationId: string): Promise<DelegationResponse | null> {
  const db = getPrisma();

  const delegation = await db.delegation.findUnique({
    where: { id: delegationId },
    include: {
      usageRecords: {
        select: { id: true },
      },
    },
  });

  if (!delegation) return null;

  // Check and update expiration status
  const updated = await checkAndUpdateStatus(delegation);
  return formatDelegationResponse(updated);
}

/**
 * List delegations with filters.
 */
export async function listDelegations(params: {
  delegator?: string;
  agent?: string;
  status?: 'ACTIVE' | 'REVOKED' | 'EXPIRED' | 'EXHAUSTED' | 'ALL';
  limit?: number;
  offset?: number;
}): Promise<DelegationResponse[]> {
  const db = getPrisma();

  const where: Record<string, unknown> = {};

  if (params.delegator) {
    where.delegator = params.delegator.toLowerCase();
  }

  if (params.agent) {
    where.agent = params.agent.toLowerCase();
  }

  if (params.status && params.status !== 'ALL') {
    where.status = params.status;
  }

  const delegations = await db.delegation.findMany({
    where,
    include: {
      usageRecords: {
        select: { id: true, gasUsed: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: params.limit || 50,
    skip: params.offset || 0,
  });

  // Check and update status for each delegation
  const updated = await Promise.all(delegations.map(checkAndUpdateStatus));
  return updated.map(formatDelegationResponse);
}

/**
 * Get usage history for a delegation.
 */
export async function getDelegationUsage(
  delegationId: string,
  limit = 50,
  offset = 0
): Promise<DelegationUsageResponse[]> {
  const db = getPrisma();

  const usage = await db.delegationUsage.findMany({
    where: { delegationId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
  });

  return usage.map((u) => ({
    id: u.id,
    delegationId: u.delegationId,
    targetContract: u.targetContract,
    functionSelector: u.functionSelector,
    valueWei: u.valueWei.toString(),
    gasUsed: u.gasUsed.toString(),
    gasCostWei: u.gasCostWei.toString(),
    txHash: u.txHash,
    success: u.success,
    errorMessage: u.errorMessage,
    createdAt: u.createdAt.toISOString(),
  }));
}

// ============================================================================
// Delegation Validation (for Paymaster)
// ============================================================================

/**
 * Validate a delegation for a specific transaction.
 * Called by the policy layer before sponsoring.
 */
export async function validateDelegationForTransaction(params: {
  delegationId: string;
  targetContract: string;
  functionSelector?: string;
  valueWei: bigint;
  estimatedGasWei: bigint;
}): Promise<DelegationValidation> {
  const db = getPrisma();

  try {
    const delegation = await db.delegation.findUnique({
      where: { id: params.delegationId },
    });

    if (!delegation) {
      return { valid: false, error: 'Delegation not found' };
    }

    // Check status
    if (delegation.status !== 'ACTIVE') {
      return { valid: false, error: `Delegation is ${delegation.status}` };
    }

    // Check time validity
    if (!isDelegationTimeValid(delegation.validFrom, delegation.validUntil)) {
      // Update status to expired
      await db.delegation.update({
        where: { id: delegation.id },
        data: { status: 'EXPIRED' },
      });
      return { valid: false, error: 'Delegation has expired' };
    }

    // Parse permissions
    const permissions = DelegationPermissionsSchema.parse(delegation.permissions);

    // Check scope (contracts, functions)
    if (!isWithinScope(permissions, params.targetContract, params.functionSelector)) {
      return {
        valid: false,
        error: 'Transaction not within delegation scope (contract/function not whitelisted)',
      };
    }

    // Check value limit
    if (!isWithinValueLimit(permissions, params.valueWei)) {
      return {
        valid: false,
        error: `Transaction value exceeds limit (max: ${permissions.maxValuePerTx} Wei)`,
      };
    }

    // Check gas budget
    const gasBudgetRemaining = delegation.gasBudgetWei - delegation.gasBudgetSpent;
    if (params.estimatedGasWei > gasBudgetRemaining) {
      // Update status to exhausted if no budget left
      if (gasBudgetRemaining <= BigInt(0)) {
        await db.delegation.update({
          where: { id: delegation.id },
          data: { status: 'EXHAUSTED' },
        });
      }
      return {
        valid: false,
        error: `Insufficient gas budget (remaining: ${gasBudgetRemaining} Wei, needed: ${params.estimatedGasWei} Wei)`,
      };
    }

    // Check rate limits
    const rateLimitCheck = await checkRateLimits(delegation.id, permissions);
    if (!rateLimitCheck.valid) {
      return { valid: false, error: rateLimitCheck.error };
    }

    return {
      valid: true,
      delegation: {
        id: delegation.id,
        delegator: delegation.delegator,
        agent: delegation.agent,
        permissions,
        gasBudgetRemaining,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[Delegation] Validation error', { error: errorMessage });
    return { valid: false, error: errorMessage };
  }
}

/**
 * Validate that an agent has a valid delegation from a user.
 * Used by policy rules to check delegation existence.
 */
export async function hasValidDelegation(agentAddress: string): Promise<{
  valid: boolean;
  delegationId?: string;
  delegator?: string;
}> {
  const db = getPrisma();

  const delegation = await db.delegation.findFirst({
    where: {
      agent: agentAddress.toLowerCase(),
      status: 'ACTIVE',
      validFrom: { lte: new Date() },
      validUntil: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!delegation) {
    return { valid: false };
  }

  // Check remaining budget
  const remaining = delegation.gasBudgetWei - delegation.gasBudgetSpent;
  if (remaining <= BigInt(0)) {
    return { valid: false };
  }

  return {
    valid: true,
    delegationId: delegation.id,
    delegator: delegation.delegator,
  };
}

// ============================================================================
// Budget Management
// ============================================================================

/**
 * Deduct gas from delegation budget (optimistic).
 * Called before transaction submission.
 */
export async function deductDelegationBudget(
  delegationId: string,
  gasWei: bigint
): Promise<{ success: boolean; error?: string }> {
  const db = getPrisma();

  try {
    const delegation = await db.delegation.findUnique({
      where: { id: delegationId },
    });

    if (!delegation) {
      return { success: false, error: 'Delegation not found' };
    }

    const remaining = delegation.gasBudgetWei - delegation.gasBudgetSpent;
    if (gasWei > remaining) {
      return { success: false, error: 'Insufficient budget' };
    }

    await db.delegation.update({
      where: { id: delegationId },
      data: {
        gasBudgetSpent: delegation.gasBudgetSpent + gasWei,
      },
    });

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

/**
 * Rollback gas deduction if transaction fails.
 */
export async function rollbackDelegationBudget(
  delegationId: string,
  gasWei: bigint
): Promise<void> {
  const db = getPrisma();

  try {
    const delegation = await db.delegation.findUnique({
      where: { id: delegationId },
    });

    if (!delegation) return;

    const newSpent = delegation.gasBudgetSpent - gasWei;

    await db.delegation.update({
      where: { id: delegationId },
      data: {
        gasBudgetSpent: newSpent < BigInt(0) ? BigInt(0) : newSpent,
      },
    });
  } catch (error) {
    logger.error('[Delegation] Failed to rollback budget', { delegationId, error });
  }
}

/**
 * Record delegation usage after successful transaction.
 */
export async function recordDelegationUsage(params: RecordUsageParams): Promise<void> {
  const db = getPrisma();

  try {
    await db.delegationUsage.create({
      data: {
        delegationId: params.delegationId,
        targetContract: params.targetContract,
        functionSelector: params.functionSelector,
        valueWei: params.valueWei,
        gasUsed: params.gasUsed,
        gasCostWei: params.gasCostWei,
        txHash: params.txHash,
        success: params.success,
        errorMessage: params.errorMessage,
      },
    });
  } catch (error) {
    logger.error('[Delegation] Failed to record usage', { delegationId: params.delegationId, error });
  }
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Check and update delegation status if expired/exhausted.
 */
async function checkAndUpdateStatus<
  T extends {
    id: string;
    status: string;
    validUntil: Date;
    gasBudgetWei: bigint;
    gasBudgetSpent: bigint;
  }
>(delegation: T): Promise<T> {
  const db = getPrisma();
  const now = new Date();

  if (delegation.status === 'ACTIVE') {
    // Check expiration
    if (now > delegation.validUntil) {
      await db.delegation.update({
        where: { id: delegation.id },
        data: { status: 'EXPIRED' },
      });
      return { ...delegation, status: 'EXPIRED' };
    }

    // Check budget exhaustion
    if (delegation.gasBudgetSpent >= delegation.gasBudgetWei) {
      await db.delegation.update({
        where: { id: delegation.id },
        data: { status: 'EXHAUSTED' },
      });
      return { ...delegation, status: 'EXHAUSTED' };
    }
  }

  return delegation;
}

/**
 * Check rate limits for a delegation.
 */
async function checkRateLimits(
  delegationId: string,
  permissions: DelegationPermissions
): Promise<{ valid: boolean; error?: string }> {
  const db = getPrisma();
  const now = new Date();

  // Check hourly limit
  if (permissions.maxTxPerHour) {
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const hourlyCount = await db.delegationUsage.count({
      where: {
        delegationId,
        createdAt: { gte: hourAgo },
        success: true,
      },
    });

    if (hourlyCount >= permissions.maxTxPerHour) {
      return { valid: false, error: `Hourly rate limit exceeded (${permissions.maxTxPerHour}/hour)` };
    }
  }

  // Check daily limit
  if (permissions.maxTxPerDay) {
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const dailyCount = await db.delegationUsage.count({
      where: {
        delegationId,
        createdAt: { gte: dayAgo },
        success: true,
      },
    });

    if (dailyCount >= permissions.maxTxPerDay) {
      return { valid: false, error: `Daily rate limit exceeded (${permissions.maxTxPerDay}/day)` };
    }
  }

  return { valid: true };
}

/**
 * Format a delegation record for API response.
 */
function formatDelegationResponse(
  delegation: {
    id: string;
    delegator: string;
    agent: string;
    agentOnChainId: string | null;
    permissions: unknown;
    gasBudgetWei: bigint;
    gasBudgetSpent: bigint;
    status: string;
    validFrom: Date;
    validUntil: Date;
    revokedAt: Date | null;
    revokedReason: string | null;
    onChainTxHash: string | null;
    createdAt: Date;
    updatedAt: Date;
    usageRecords?: { id: string; gasUsed?: bigint }[];
  }
): DelegationResponse {
  const remaining = delegation.gasBudgetWei - delegation.gasBudgetSpent;
  const totalGasUsed = delegation.usageRecords?.reduce(
    (sum, u) => sum + (u.gasUsed || BigInt(0)),
    BigInt(0)
  ) || BigInt(0);

  return {
    id: delegation.id,
    delegator: delegation.delegator,
    agent: delegation.agent,
    agentOnChainId: delegation.agentOnChainId,
    permissions: DelegationPermissionsSchema.parse(delegation.permissions),
    gasBudgetWei: delegation.gasBudgetWei.toString(),
    gasBudgetSpent: delegation.gasBudgetSpent.toString(),
    gasBudgetRemaining: remaining.toString(),
    status: delegation.status as 'ACTIVE' | 'REVOKED' | 'EXPIRED' | 'EXHAUSTED',
    validFrom: delegation.validFrom.toISOString(),
    validUntil: delegation.validUntil.toISOString(),
    revokedAt: delegation.revokedAt?.toISOString() || null,
    revokedReason: delegation.revokedReason,
    onChainTxHash: delegation.onChainTxHash,
    createdAt: delegation.createdAt.toISOString(),
    updatedAt: delegation.updatedAt.toISOString(),
    usageCount: delegation.usageRecords?.length || 0,
    totalGasUsed: totalGasUsed.toString(),
  };
}
