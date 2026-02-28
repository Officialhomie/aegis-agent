/**
 * OpenClaw Guarantee Commands
 *
 * Commands for managing execution guarantees:
 * - create guarantee <protocol> for <agent> type <TYPE> budget $<amount> duration <Nd> tier <TIER>
 * - cancel guarantee <id>
 * - list guarantees <protocol> [active|expired]
 * - get guarantee <id>
 */

import { registerCommand, type CommandHandler } from '../command-registry';
import { getProtocolIdFromSession } from '../session-manager';
import {
  createGuarantee,
  cancelGuarantee,
  getGuaranteeDetails,
  listGuarantees,
} from '../../guarantees/lifecycle';
import type {
  CreateGuaranteeRequest,
  GuaranteeType,
  GuaranteeStatus,
  ServiceTier,
  GuaranteeDetails,
  ExecutionGuarantee,
} from '../../guarantees/types';
import {
  extractAddress,
  parseProtocolId,
  parseMoneyExtended,
  parseGuaranteeType,
  parseServiceTier,
  parseInterval,
  parseId,
  parseStatusFilter,
} from '../parsers';
import type { ParsedCommand, CommandResult } from '../types';

/**
 * Parse create guarantee command
 * Examples:
 *   create guarantee uniswap-v4 for 0xabc... type GAS_BUDGET budget $100 duration 7d tier GOLD
 *   add guarantee for 0x123... budget $50 7 days SILVER
 */
export function parseCreateGuaranteeCommand(input: string): ParsedCommand {
  const protocolId = parseProtocolId(input);
  const beneficiary = extractAddress(input);
  const guaranteeType = parseGuaranteeType(input);
  const budget = parseMoneyExtended(input);
  const tier = parseServiceTier(input);
  const duration = parseInterval(input);

  // Parse tx count if specified
  const txCountMatch = input.match(/(\d+)\s*(?:tx|transactions?)/i);
  const txCount = txCountMatch ? parseInt(txCountMatch[1]) : undefined;

  // Parse max latency if specified
  const latencyMatch = input.match(/(?:max[- ]?latency|sla)\s*(\d+)\s*(?:ms|milliseconds?|s|seconds?|m|minutes?)/i);
  let maxLatencyMs: number | undefined;
  if (latencyMatch) {
    const value = parseInt(latencyMatch[1]);
    if (/s(?:econds?)?$/i.test(latencyMatch[0])) {
      maxLatencyMs = value * 1000;
    } else if (/m(?:inutes?)?$/i.test(latencyMatch[0])) {
      maxLatencyMs = value * 60 * 1000;
    } else {
      maxLatencyMs = value;
    }
  }

  return {
    name: 'create_guarantee',
    args: {
      protocolId: protocolId ?? '',
      beneficiary: beneficiary ?? '',
      type: guaranteeType ?? 'GAS_BUDGET',
      budget: budget?.toString() ?? '',
      txCount: txCount?.toString() ?? '',
      duration: duration?.toString() ?? '',
      tier: tier ?? 'BRONZE',
      maxLatencyMs: maxLatencyMs?.toString() ?? '',
    },
    rawInput: input,
  };
}

/**
 * Parse cancel guarantee command
 * Examples:
 *   cancel guarantee clm123...
 *   revoke guarantee clm456...
 */
export function parseCancelGuaranteeCommand(input: string): ParsedCommand {
  const guaranteeId = parseId(input);

  return {
    name: 'cancel_guarantee',
    args: {
      guaranteeId: guaranteeId ?? '',
    },
    rawInput: input,
  };
}

/**
 * Parse list guarantees command
 * Examples:
 *   list guarantees uniswap-v4
 *   list guarantees active
 *   show guarantees for 0xabc...
 */
export function parseListGuaranteesCommand(input: string): ParsedCommand {
  const protocolId = parseProtocolId(input);
  const beneficiary = extractAddress(input);
  const status = parseStatusFilter(input);

  return {
    name: 'list_guarantees',
    args: {
      protocolId: protocolId ?? '',
      beneficiary: beneficiary ?? '',
      status: status ?? '',
    },
    rawInput: input,
  };
}

/**
 * Parse get guarantee command
 * Examples:
 *   get guarantee clm123...
 *   show guarantee clm456...
 */
export function parseGetGuaranteeCommand(input: string): ParsedCommand {
  const guaranteeId = parseId(input);

  return {
    name: 'get_guarantee',
    args: {
      guaranteeId: guaranteeId ?? '',
    },
    rawInput: input,
  };
}

// ============================================================================
// Formatters
// ============================================================================

function formatGuaranteeDetails(g: GuaranteeDetails): string {
  const lines = [
    `Guarantee: ${g.id.slice(0, 12)}...`,
    `Type: ${g.type}`,
    `Status: ${g.status}`,
    `Tier: ${g.tier}`,
    `Beneficiary: ${g.beneficiary.slice(0, 10)}...${g.beneficiary.slice(-8)}`,
    `Protocol: ${g.protocolId}`,
    '',
    'Budget:',
    `  Total: $${g.budget.total.toFixed(2)}`,
    `  Used: $${g.budget.used.toFixed(2)}`,
    `  Remaining: $${g.budget.remaining.toFixed(2)}`,
    `  Utilization: ${g.budget.utilizationPct.toFixed(1)}%`,
    '',
    'SLA:',
    `  Executions: ${g.sla.totalExecutions}`,
    `  Met: ${g.sla.slaMet}`,
    `  Breached: ${g.sla.slaBreached}`,
    `  Compliance: ${g.sla.complianceRate.toFixed(1)}%`,
    '',
    'Financial:',
    `  Locked: $${g.financial.lockedAmount.toFixed(2)}`,
    `  Premium: $${g.financial.premiumPaid.toFixed(2)}`,
    `  Refunds: $${g.financial.refundsIssued.toFixed(2)}`,
    `  Net Cost: $${g.financial.netCost.toFixed(2)}`,
    '',
    'Validity:',
    `  From: ${g.validity.from.toISOString().split('T')[0]}`,
    `  Until: ${g.validity.until.toISOString().split('T')[0]}`,
    `  Remaining: ${g.validity.remainingDays} days`,
  ];

  return lines.join('\n');
}

function formatGuaranteeList(guarantees: ExecutionGuarantee[]): string {
  if (guarantees.length === 0) {
    return 'No guarantees found.';
  }

  const lines = [`Guarantees (${guarantees.length}):`];

  for (const g of guarantees) {
    const status = g.status.slice(0, 3).toUpperCase();
    const tier = g.tier.slice(0, 1);
    const budget = g.budgetUsd !== null ? `$${g.budgetUsd.toFixed(0)}` : `${g.txCount ?? 0}tx`;
    const used = `$${g.usedUsd.toFixed(2)}`;
    const beneficiary = `${g.beneficiary.slice(0, 8)}...`;
    const expires = g.validUntil.toISOString().split('T')[0];

    lines.push(`  [${status}] ${tier} ${g.id.slice(0, 8)}... ${budget} (${used} used) -> ${beneficiary} exp:${expires}`);
  }

  return lines.join('\n');
}

// ============================================================================
// Command Handlers
// ============================================================================

const handleCreateGuarantee: CommandHandler = async (cmd, sessionId) => {
  let protocolId = cmd.args.protocolId;

  if (!protocolId && sessionId) {
    try {
      protocolId = await getProtocolIdFromSession(sessionId);
    } catch {
      // Session doesn't have a protocol
    }
  }

  if (!protocolId) {
    return {
      success: false,
      message: 'Protocol ID is required. Example: create guarantee my-protocol for 0xabc... budget $100 duration 7d tier GOLD',
    };
  }

  const beneficiary = cmd.args.beneficiary;
  if (!beneficiary || !/^0x[a-fA-F0-9]{40}$/i.test(beneficiary)) {
    return {
      success: false,
      message: 'Valid beneficiary address is required. Example: create guarantee for 0xabc123... budget $100',
    };
  }

  // Parse budget
  const budget = cmd.args.budget ? parseFloat(cmd.args.budget) : undefined;
  const txCount = cmd.args.txCount ? parseInt(cmd.args.txCount) : undefined;

  if (!budget && !txCount) {
    return {
      success: false,
      message: 'Budget or transaction count is required. Example: budget $100 or 10 transactions',
    };
  }

  // Parse duration (default 7 days)
  const durationMs = cmd.args.duration ? parseInt(cmd.args.duration) : 7 * 24 * 60 * 60 * 1000;
  const validFrom = new Date();
  const validUntil = new Date(validFrom.getTime() + durationMs);

  // Parse type and tier
  const type = (cmd.args.type as GuaranteeType) || 'GAS_BUDGET';
  const tier = (cmd.args.tier?.toUpperCase() as ServiceTier) || 'BRONZE';

  try {
    const request: CreateGuaranteeRequest = {
      type,
      beneficiary,
      protocolId,
      budgetUsd: budget,
      txCount,
      validFrom,
      validUntil,
      tier,
      maxLatencyMs: cmd.args.maxLatencyMs ? parseInt(cmd.args.maxLatencyMs) : undefined,
    };

    const result = await createGuarantee(request);

    const durationDays = Math.ceil(durationMs / (24 * 60 * 60 * 1000));
    const lines = [
      'Guarantee created successfully!',
      '',
      `ID: ${result.guaranteeId}`,
      `Status: ${result.status}`,
      `Type: ${type}`,
      `Tier: ${tier}`,
      `Beneficiary: ${beneficiary.slice(0, 10)}...`,
      '',
      `Locked Amount: $${result.lockedAmount.toFixed(2)}`,
      `Premium Charged: $${result.premiumCharged.toFixed(2)}`,
      `Duration: ${durationDays} days`,
      `Valid From: ${result.effectiveFrom.toISOString().split('T')[0]}`,
      `Valid Until: ${result.effectiveUntil.toISOString().split('T')[0]}`,
    ];

    if (result.slaTerms) {
      lines.push('');
      lines.push('SLA Terms:');
      lines.push(`  Max Latency: ${result.slaTerms.maxLatencyMs}ms`);
      lines.push(`  Breach Penalty: ${result.slaTerms.breachPenalty}%`);
    }

    return {
      success: true,
      message: lines.join('\n'),
      data: { guaranteeId: result.guaranteeId },
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to create guarantee: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

const handleCancelGuarantee: CommandHandler = async (cmd, _sessionId) => {
  const guaranteeId = cmd.args.guaranteeId;

  if (!guaranteeId) {
    return {
      success: false,
      message: 'Guarantee ID is required. Example: cancel guarantee clm123abc...',
    };
  }

  try {
    const result = await cancelGuarantee(guaranteeId);

    return {
      success: true,
      message: `Guarantee cancelled.\n\nRefund Amount: $${result.refundAmount.toFixed(2)}\nCancellation Fee: $${result.cancellationFee.toFixed(2)}`,
      data: { refundAmount: result.refundAmount, cancellationFee: result.cancellationFee },
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to cancel guarantee: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

const handleListGuarantees: CommandHandler = async (cmd, sessionId) => {
  let protocolId = cmd.args.protocolId;

  if (!protocolId && sessionId) {
    try {
      protocolId = await getProtocolIdFromSession(sessionId);
    } catch {
      // Session doesn't have a protocol
    }
  }

  if (!protocolId) {
    return {
      success: false,
      message: 'Protocol ID is required. Example: list guarantees my-protocol',
    };
  }

  try {
    // Map status filter
    let status: GuaranteeStatus | undefined;
    const statusArg = cmd.args.status?.toUpperCase();
    if (statusArg === 'ACTIVE') status = 'ACTIVE';
    else if (statusArg === 'EXPIRED') status = 'EXPIRED';
    else if (statusArg === 'CANCELLED') status = 'CANCELLED';
    else if (statusArg === 'PENDING') status = 'PENDING';
    else if (statusArg === 'DEPLETED') status = 'DEPLETED';

    const guarantees = await listGuarantees(protocolId, {
      status,
      beneficiary: cmd.args.beneficiary || undefined,
    });

    return {
      success: true,
      message: formatGuaranteeList(guarantees),
      data: { count: guarantees.length },
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to list guarantees: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

const handleGetGuarantee: CommandHandler = async (cmd, _sessionId) => {
  const guaranteeId = cmd.args.guaranteeId;

  if (!guaranteeId) {
    return {
      success: false,
      message: 'Guarantee ID is required. Example: get guarantee clm123abc...',
    };
  }

  try {
    const details = await getGuaranteeDetails(guaranteeId);

    if (!details) {
      return {
        success: false,
        message: `Guarantee not found: ${guaranteeId}`,
      };
    }

    return {
      success: true,
      message: formatGuaranteeDetails(details),
      data: { guarantee: details },
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to get guarantee: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

// ============================================================================
// Register Commands
// ============================================================================

export function registerGuaranteeCommands(): void {
  registerCommand('create_guarantee', handleCreateGuarantee, {
    requiresExpanded: true,
    requiresSession: false,
    category: 'guarantee',
    description: 'Create execution guarantee for an agent',
    examples: [
      'create guarantee uniswap-v4 for 0xabc... budget $100 duration 7d tier GOLD',
      'create guarantee for 0x123... type TX_COUNT 50 transactions 14d SILVER',
    ],
  });

  registerCommand('cancel_guarantee', handleCancelGuarantee, {
    requiresExpanded: true,
    requiresSession: false,
    isDestructive: true,
    category: 'guarantee',
    description: 'Cancel an active guarantee',
    examples: [
      'cancel guarantee clm123abc...',
    ],
  });

  registerCommand('list_guarantees', handleListGuarantees, {
    requiresExpanded: true,
    requiresSession: false,
    category: 'guarantee',
    description: 'List guarantees for a protocol',
    examples: [
      'list guarantees uniswap-v4',
      'list guarantees active',
    ],
  });

  registerCommand('get_guarantee', handleGetGuarantee, {
    requiresExpanded: true,
    requiresSession: false,
    category: 'guarantee',
    description: 'View guarantee details',
    examples: [
      'get guarantee clm123abc...',
    ],
  });
}
