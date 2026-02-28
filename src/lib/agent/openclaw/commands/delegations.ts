/**
 * OpenClaw Delegation Commands
 *
 * Commands for managing delegations:
 * - create delegation from <user> to <agent> max-value $<amount> duration <Nd>
 * - revoke delegation <id>
 * - list delegations <user|agent>
 * - get delegation <id>
 *
 * Note: Creating a delegation via OpenClaw returns an unsigned EIP-712 payload.
 * The actual signature must happen in the user's wallet.
 */

import { registerCommand, type CommandHandler } from '../command-registry';
import {
  getDelegation,
  listDelegations,
  revokeDelegation,
  getDelegationUsage,
} from '../../../delegation/service';
import { buildTypedDataForSigning } from '../../../delegation/eip712';
import { getConfigNumber, getConfigString } from '../../../config';
import type { DelegationResponse } from '../../../delegation/schemas';
import {
  extractAddress,
  parseMoneyExtended,
  parseInterval,
  parseId,
  parseStatusFilter,
} from '../parsers';
import type { ParsedCommand, CommandResult } from '../types';

/**
 * Parse create delegation command
 * Examples:
 *   create delegation from 0xuser... to 0xagent... max-value $50 duration 2d
 *   delegate from 0xabc... to 0x123... budget $100 7 days
 */
export function parseCreateDelegationCommand(input: string): ParsedCommand {
  // Extract "from" address
  const fromMatch = input.match(/from\s+(0x[a-fA-F0-9]{40})/i);
  const delegator = fromMatch ? fromMatch[1] : null;

  // Extract "to" address
  const toMatch = input.match(/to\s+(0x[a-fA-F0-9]{40})/i);
  const agent = toMatch ? toMatch[1] : extractAddress(input.replace(delegator ?? '', ''));

  const maxValue = parseMoneyExtended(input);
  const duration = parseInterval(input);

  // Parse max transactions per day
  const maxTxMatch = input.match(/(\d+)\s*(?:tx|transactions?)\s*(?:per|\/)\s*(?:day|24h)/i);
  const maxTxPerDay = maxTxMatch ? parseInt(maxTxMatch[1]) : undefined;

  return {
    name: 'create_delegation',
    args: {
      delegator: delegator ?? '',
      agent: agent ?? '',
      maxValueWei: maxValue ? Math.floor(maxValue * 1e18).toString() : '',
      duration: duration?.toString() ?? '',
      maxTxPerDay: maxTxPerDay?.toString() ?? '',
    },
    rawInput: input,
  };
}

/**
 * Parse revoke delegation command
 * Examples:
 *   revoke delegation clm123...
 *   cancel delegation clm456...
 */
export function parseRevokeDelegationCommand(input: string): ParsedCommand {
  const delegationId = parseId(input);

  // Try to extract delegator address for authorization
  const delegator = extractAddress(input);

  // Parse reason if provided
  const reasonMatch = input.match(/reason\s+"([^"]+)"/i);
  const reason = reasonMatch ? reasonMatch[1] : undefined;

  return {
    name: 'revoke_delegation',
    args: {
      delegationId: delegationId ?? '',
      delegator: delegator ?? '',
      reason: reason ?? '',
    },
    rawInput: input,
  };
}

/**
 * Parse list delegations command
 * Examples:
 *   list delegations 0xuser...
 *   list delegations for 0xagent... active
 *   show delegations
 */
export function parseListDelegationsCommand(input: string): ParsedCommand {
  const address = extractAddress(input);
  const status = parseStatusFilter(input);

  // Determine if address is delegator or agent based on keywords
  const isAgent = /(?:for|to|agent)\s+0x/i.test(input);

  return {
    name: 'list_delegations',
    args: {
      delegator: !isAgent ? (address ?? '') : '',
      agent: isAgent ? (address ?? '') : '',
      status: status ?? '',
    },
    rawInput: input,
  };
}

/**
 * Parse get delegation command
 * Examples:
 *   get delegation clm123...
 *   show delegation clm456...
 */
export function parseGetDelegationCommand(input: string): ParsedCommand {
  const delegationId = parseId(input);

  // Check if user wants usage history
  const showUsage = /usage|history|transactions/i.test(input);

  return {
    name: 'get_delegation',
    args: {
      delegationId: delegationId ?? '',
      showUsage: showUsage ? 'true' : '',
    },
    rawInput: input,
  };
}

// ============================================================================
// Formatters
// ============================================================================

function formatDelegationDetails(d: DelegationResponse, showUsage = false): string {
  const remaining = BigInt(d.gasBudgetRemaining);
  const spent = BigInt(d.gasBudgetSpent);
  const total = BigInt(d.gasBudgetWei);

  // Convert Wei to ETH for display
  const remainingEth = Number(remaining) / 1e18;
  const spentEth = Number(spent) / 1e18;
  const totalEth = Number(total) / 1e18;

  const utilizationPct = total > BigInt(0) ? (Number(spent) / Number(total)) * 100 : 0;

  const lines = [
    `Delegation: ${d.id.slice(0, 12)}...`,
    `Status: ${d.status}`,
    '',
    `Delegator: ${d.delegator.slice(0, 10)}...${d.delegator.slice(-8)}`,
    `Agent: ${d.agent.slice(0, 10)}...${d.agent.slice(-8)}`,
    d.agentOnChainId ? `Agent On-Chain ID: ${d.agentOnChainId}` : '',
    '',
    'Gas Budget:',
    `  Total: ${totalEth.toFixed(6)} ETH`,
    `  Spent: ${spentEth.toFixed(6)} ETH`,
    `  Remaining: ${remainingEth.toFixed(6)} ETH`,
    `  Utilization: ${utilizationPct.toFixed(1)}%`,
    '',
    'Validity:',
    `  From: ${d.validFrom.split('T')[0]}`,
    `  Until: ${d.validUntil.split('T')[0]}`,
    '',
    'Permissions:',
    `  Contracts: ${d.permissions.contracts?.length || 'any'}`,
    d.permissions.maxValuePerTx ? `  Max Value/Tx: ${Number(d.permissions.maxValuePerTx) / 1e18} ETH` : '',
    d.permissions.maxTxPerDay ? `  Max Tx/Day: ${d.permissions.maxTxPerDay}` : '',
    d.permissions.maxTxPerHour ? `  Max Tx/Hour: ${d.permissions.maxTxPerHour}` : '',
    '',
    `Usage Count: ${d.usageCount}`,
    `Total Gas Used: ${d.totalGasUsed} Wei`,
    '',
    `Created: ${d.createdAt.split('T')[0]}`,
  ].filter(Boolean);

  if (d.revokedAt) {
    lines.push(`Revoked: ${d.revokedAt.split('T')[0]}`);
    if (d.revokedReason) {
      lines.push(`Reason: ${d.revokedReason}`);
    }
  }

  return lines.join('\n');
}

function formatDelegationList(delegations: DelegationResponse[]): string {
  if (delegations.length === 0) {
    return 'No delegations found.';
  }

  const lines = [`Delegations (${delegations.length}):`];

  for (const d of delegations) {
    const status = d.status.slice(0, 3).toUpperCase();
    const delegator = `${d.delegator.slice(0, 8)}...`;
    const agent = `${d.agent.slice(0, 8)}...`;
    const remaining = BigInt(d.gasBudgetRemaining);
    const remainingEth = (Number(remaining) / 1e18).toFixed(4);
    const expires = d.validUntil.split('T')[0];

    lines.push(`  [${status}] ${d.id.slice(0, 8)}... ${delegator} -> ${agent} ${remainingEth}ETH exp:${expires}`);
  }

  return lines.join('\n');
}

// ============================================================================
// Command Handlers
// ============================================================================

const handleCreateDelegation: CommandHandler = async (cmd, _sessionId) => {
  const delegator = cmd.args.delegator;
  const agent = cmd.args.agent;

  if (!delegator || !/^0x[a-fA-F0-9]{40}$/i.test(delegator)) {
    return {
      success: false,
      message: 'Valid delegator address required. Example: create delegation from 0xuser... to 0xagent...',
    };
  }

  if (!agent || !/^0x[a-fA-F0-9]{40}$/i.test(agent)) {
    return {
      success: false,
      message: 'Valid agent address required. Example: create delegation from 0xuser... to 0xagent...',
    };
  }

  // Parse gas budget (default 0.1 ETH)
  const gasBudgetWei = cmd.args.maxValueWei ? BigInt(cmd.args.maxValueWei) : BigInt(0.1 * 1e18);

  // Parse duration (default 7 days)
  const durationMs = cmd.args.duration ? parseInt(cmd.args.duration) : 7 * 24 * 60 * 60 * 1000;
  const validFrom = new Date();
  const validUntil = new Date(validFrom.getTime() + durationMs);

  // Build EIP-712 typed data for signing
  try {
    const chainId = getConfigNumber('DELEGATION_CHAIN_ID', 8453, 1, 999999);
    const verifyingContract = getConfigString(
      'DELEGATION_REGISTRY_ADDRESS',
      '0x0000000000000000000000000000000000000000'
    ) as `0x${string}`;

    const typedData = buildTypedDataForSigning({
      delegator: delegator as `0x${string}`,
      agent: agent as `0x${string}`,
      permissions: {
        contracts: [],
        functions: [],
        maxValuePerTx: gasBudgetWei.toString(),
        maxGasPerTx: 500000,
        maxDailySpend: 100,
        maxTxPerDay: cmd.args.maxTxPerDay ? parseInt(cmd.args.maxTxPerDay) : 50,
        maxTxPerHour: 10,
      },
      gasBudgetWei,
      validFrom,
      validUntil,
      nonce: BigInt(Date.now()),
      chainId,
      verifyingContract,
    });

    const durationDays = Math.ceil(durationMs / (24 * 60 * 60 * 1000));
    const budgetEth = Number(gasBudgetWei) / 1e18;

    const lines = [
      'Delegation payload created!',
      '',
      'This payload requires signing by the delegator wallet.',
      '',
      `Delegator: ${delegator.slice(0, 10)}...`,
      `Agent: ${agent.slice(0, 10)}...`,
      `Gas Budget: ${budgetEth.toFixed(4)} ETH`,
      `Duration: ${durationDays} days`,
      `Valid Until: ${validUntil.toISOString().split('T')[0]}`,
      '',
      'Next Steps:',
      '1. Sign the EIP-712 typed data with the delegator wallet',
      '2. Submit the signed delegation to POST /api/delegation',
      '',
      'Typed Data (for signing):',
      JSON.stringify(typedData, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2),
    ];

    return {
      success: true,
      message: lines.join('\n'),
      data: { typedData, requiresSignature: true },
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to create delegation payload: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

const handleRevokeDelegation: CommandHandler = async (cmd, _sessionId) => {
  const delegationId = cmd.args.delegationId;
  const delegator = cmd.args.delegator;

  if (!delegationId) {
    return {
      success: false,
      message: 'Delegation ID is required. Example: revoke delegation clm123abc...',
    };
  }

  if (!delegator || !/^0x[a-fA-F0-9]{40}$/i.test(delegator)) {
    return {
      success: false,
      message: 'Delegator address required for authorization. Example: revoke delegation clm123... 0xuser...',
    };
  }

  try {
    const result = await revokeDelegation(
      delegationId,
      delegator,
      cmd.args.reason || 'Revoked via OpenClaw'
    );

    if (!result.success) {
      return {
        success: false,
        message: `Failed to revoke: ${result.error}`,
      };
    }

    return {
      success: true,
      message: `Delegation ${delegationId.slice(0, 12)}... has been revoked.`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to revoke delegation: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

const handleListDelegations: CommandHandler = async (cmd, _sessionId) => {
  const delegator = cmd.args.delegator || undefined;
  const agent = cmd.args.agent || undefined;

  if (!delegator && !agent) {
    return {
      success: false,
      message: 'Address required. Example: list delegations 0xuser... or list delegations for 0xagent...',
    };
  }

  try {
    // Map status filter
    let status: 'ACTIVE' | 'REVOKED' | 'EXPIRED' | 'EXHAUSTED' | 'ALL' | undefined;
    const statusArg = cmd.args.status?.toUpperCase();
    if (statusArg === 'ACTIVE') status = 'ACTIVE';
    else if (statusArg === 'REVOKED') status = 'REVOKED';
    else if (statusArg === 'EXPIRED') status = 'EXPIRED';
    else if (statusArg === 'EXHAUSTED') status = 'EXHAUSTED';
    else if (statusArg === 'ALL') status = 'ALL';

    const delegations = await listDelegations({
      delegator,
      agent,
      status,
    });

    return {
      success: true,
      message: formatDelegationList(delegations),
      data: { count: delegations.length },
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to list delegations: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

const handleGetDelegation: CommandHandler = async (cmd, _sessionId) => {
  const delegationId = cmd.args.delegationId;

  if (!delegationId) {
    return {
      success: false,
      message: 'Delegation ID is required. Example: get delegation clm123abc...',
    };
  }

  try {
    const delegation = await getDelegation(delegationId);

    if (!delegation) {
      return {
        success: false,
        message: `Delegation not found: ${delegationId}`,
      };
    }

    let message = formatDelegationDetails(delegation);

    // Include usage history if requested
    if (cmd.args.showUsage === 'true') {
      const usage = await getDelegationUsage(delegationId, 10);

      if (usage.length > 0) {
        message += '\n\nRecent Usage:';
        for (const u of usage) {
          const status = u.success ? 'OK' : 'FAIL';
          const date = u.createdAt.split('T')[0];
          const gas = (Number(u.gasUsed) / 1e9).toFixed(2);
          message += `\n  [${status}] ${date} ${gas} Gwei -> ${u.targetContract.slice(0, 10)}...`;
        }
      }
    }

    return {
      success: true,
      message,
      data: { delegation },
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to get delegation: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

// ============================================================================
// Register Commands
// ============================================================================

export function registerDelegationCommands(): void {
  registerCommand('create_delegation', handleCreateDelegation, {
    requiresExpanded: true,
    requiresSession: false,
    category: 'delegation',
    description: 'Create delegation payload (requires wallet signature)',
    examples: [
      'create delegation from 0xuser... to 0xagent... max-value $50 duration 7d',
    ],
  });

  registerCommand('revoke_delegation', handleRevokeDelegation, {
    requiresExpanded: true,
    requiresSession: false,
    isDestructive: true,
    category: 'delegation',
    description: 'Revoke an active delegation',
    examples: [
      'revoke delegation clm123... 0xuser...',
    ],
  });

  registerCommand('list_delegations', handleListDelegations, {
    requiresExpanded: true,
    requiresSession: false,
    category: 'delegation',
    description: 'List delegations for a user or agent',
    examples: [
      'list delegations 0xuser...',
      'list delegations for 0xagent... active',
    ],
  });

  registerCommand('get_delegation', handleGetDelegation, {
    requiresExpanded: true,
    requiresSession: false,
    category: 'delegation',
    description: 'View delegation details',
    examples: [
      'get delegation clm123...',
      'get delegation clm456... usage',
    ],
  });
}
