/**
 * OpenClaw Protocol CRUD Commands
 *
 * Commands for managing protocol sponsors:
 * - create protocol <id> name "<name>" budget $<amount> min-tier <1|2|3>
 * - update protocol <id> set <field> <value>
 * - disable protocol <id>
 * - get protocol <id>
 * - list protocols [live|suspended|simulation]
 */

import { registerCommand, type CommandHandler } from '../command-registry';
import { getProtocolIdFromSession } from '../session-manager';
import {
  createProtocol,
  updateProtocol,
  archiveProtocol,
  reactivateProtocol,
  getProtocolDetails,
  listProtocols,
  formatProtocolDetails,
  formatProtocolList,
} from '../../../protocol/protocol-service';
import {
  parseProtocolId,
  parseAgentLabel,
  parseMoneyExtended,
  parseTier,
  parseBoolean,
  parseSetClause,
  parseStatusFilter,
  parseServiceTier,
} from '../parsers';
import type { OnboardingStatus } from '@prisma/client';
import type { ParsedCommand, CommandResult } from '../types';

/**
 * Parse create protocol command
 * Examples:
 *   create protocol uniswap-v4 name "Uniswap V4" budget $1000 min-tier 2
 *   add protocol aave-v3 tier silver
 */
export function parseCreateProtocolCommand(input: string): ParsedCommand {
  const protocolId = parseProtocolId(input);
  const name = parseAgentLabel(input);
  const budget = parseMoneyExtended(input);
  const minTier = parseTier(input);
  const serviceTier = parseServiceTier(input);

  // Extract email if specified
  const emailMatch = input.match(/email\s+(\S+@\S+)/i);
  const email = emailMatch ? emailMatch[1] : undefined;

  return {
    name: 'create_protocol',
    args: {
      protocolId: protocolId ?? '',
      name: name ?? '',
      budget: budget?.toString() ?? '',
      minTier: minTier?.toString() ?? '',
      serviceTier: serviceTier ?? '',
      email: email ?? '',
    },
    rawInput: input,
  };
}

/**
 * Parse update protocol command
 * Examples:
 *   update protocol uniswap-v4 set minTier 2
 *   update protocol aave-v3 set requireERC8004 true
 *   set protocol uniswap-v4 name "Uniswap Protocol"
 */
export function parseUpdateProtocolCommand(input: string): ParsedCommand {
  const protocolId = parseProtocolId(input);
  const setClause = parseSetClause(input);

  return {
    name: 'update_protocol',
    args: {
      protocolId: protocolId ?? '',
      field: setClause?.field ?? '',
      value: setClause?.value ?? '',
    },
    rawInput: input,
  };
}

/**
 * Parse disable protocol command
 * Examples:
 *   disable protocol uniswap-v4
 *   suspend protocol aave-v3
 *   archive protocol compound-v3
 */
export function parseDisableProtocolCommand(input: string): ParsedCommand {
  const protocolId = parseProtocolId(input);

  return {
    name: 'disable_protocol',
    args: {
      protocolId: protocolId ?? '',
    },
    rawInput: input,
  };
}

/**
 * Parse get protocol command
 * Examples:
 *   get protocol uniswap-v4
 *   show protocol aave-v3
 *   protocol status compound-v3
 */
export function parseGetProtocolCommand(input: string): ParsedCommand {
  const protocolId = parseProtocolId(input);

  return {
    name: 'get_protocol',
    args: {
      protocolId: protocolId ?? '',
    },
    rawInput: input,
  };
}

/**
 * Parse list protocols command
 * Examples:
 *   list protocols
 *   list protocols live
 *   list protocols suspended
 *   show all protocols simulation
 */
export function parseListProtocolsCommand(input: string): ParsedCommand {
  const status = parseStatusFilter(input);
  const tier = parseServiceTier(input);

  return {
    name: 'list_protocols',
    args: {
      status: status ?? '',
      tier: tier ?? '',
    },
    rawInput: input,
  };
}

// ============================================================================
// Command Handlers
// ============================================================================

const handleCreateProtocol: CommandHandler = async (cmd, sessionId) => {
  const protocolId = cmd.args.protocolId;
  if (!protocolId) {
    return { success: false, message: 'Protocol ID is required. Example: create protocol my-protocol-id name "My Protocol"' };
  }

  // Validate protocol ID format (alphanumeric + hyphens, lowercase)
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(protocolId) || protocolId.length < 3) {
    return {
      success: false,
      message: 'Invalid protocol ID. Must be lowercase alphanumeric with hyphens, min 3 characters. Example: my-protocol-v2',
    };
  }

  try {
    const protocol = await createProtocol({
      protocolId,
      name: cmd.args.name || protocolId,
      balanceUSD: cmd.args.budget ? parseFloat(cmd.args.budget) : undefined,
      minAgentTier: cmd.args.minTier ? (parseInt(cmd.args.minTier) as 1 | 2 | 3) : undefined,
      tier: cmd.args.serviceTier ? (cmd.args.serviceTier as 'bronze' | 'silver' | 'gold') : undefined,
      notificationEmail: cmd.args.email || undefined,
    });

    return {
      success: true,
      message: `Protocol created successfully:\n${formatProtocolDetails(protocol)}`,
      data: { protocolId: protocol.protocolId, id: protocol.id },
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to create protocol: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

const handleUpdateProtocol: CommandHandler = async (cmd, sessionId) => {
  // Allow either explicit protocolId in command or from session
  let protocolId = cmd.args.protocolId;

  if (!protocolId && sessionId) {
    try {
      protocolId = await getProtocolIdFromSession(sessionId);
    } catch {
      // Session doesn't have a protocol, that's okay if protocolId was provided
    }
  }

  if (!protocolId) {
    return { success: false, message: 'Protocol ID is required. Example: update protocol my-protocol set minTier 2' };
  }

  const field = cmd.args.field?.toLowerCase();
  const value = cmd.args.value;

  if (!field || !value) {
    return {
      success: false,
      message: 'Please specify field and value to update. Example: update protocol my-protocol set minTier 2',
    };
  }

  try {
    const updates: Record<string, unknown> = {};

    switch (field) {
      case 'name':
        updates.name = value;
        break;
      case 'mintier':
      case 'min-tier':
      case 'minagenttier':
        const tier = parseInt(value);
        if (tier < 1 || tier > 3) {
          return { success: false, message: 'minAgentTier must be 1, 2, or 3' };
        }
        updates.minAgentTier = tier as 1 | 2 | 3;
        break;
      case 'requireerc8004':
      case 'require-erc8004':
      case 'erc8004':
        updates.requireERC8004 = parseBoolean(value) ?? false;
        break;
      case 'requireerc4337':
      case 'require-erc4337':
      case 'erc4337':
        updates.requireERC4337 = parseBoolean(value) ?? false;
        break;
      case 'tier':
      case 'servicetier':
        const serviceTier = value.toLowerCase();
        if (!['bronze', 'silver', 'gold'].includes(serviceTier)) {
          return { success: false, message: 'Service tier must be bronze, silver, or gold' };
        }
        updates.tier = serviceTier as 'bronze' | 'silver' | 'gold';
        break;
      case 'email':
      case 'notificationemail':
        updates.notificationEmail = value;
        break;
      case 'webhook':
      case 'notificationwebhook':
        updates.notificationWebhook = value;
        break;
      default:
        return {
          success: false,
          message: `Unknown field: ${field}. Valid fields: name, minTier, requireERC8004, requireERC4337, tier, email, webhook`,
        };
    }

    const protocol = await updateProtocol({
      protocolId,
      updates,
    });

    return {
      success: true,
      message: `Protocol updated:\n${formatProtocolDetails(protocol)}`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to update protocol: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

const handleDisableProtocol: CommandHandler = async (cmd, sessionId) => {
  let protocolId = cmd.args.protocolId;

  if (!protocolId && sessionId) {
    try {
      protocolId = await getProtocolIdFromSession(sessionId);
    } catch {
      // Session doesn't have a protocol
    }
  }

  if (!protocolId) {
    return { success: false, message: 'Protocol ID is required. Example: disable protocol my-protocol' };
  }

  try {
    await archiveProtocol(protocolId);

    return {
      success: true,
      message: `Protocol ${protocolId} has been suspended. Use "reactivate protocol ${protocolId}" to restore.`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to disable protocol: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

const handleGetProtocol: CommandHandler = async (cmd, sessionId) => {
  let protocolId = cmd.args.protocolId;

  if (!protocolId && sessionId) {
    try {
      protocolId = await getProtocolIdFromSession(sessionId);
    } catch {
      // Session doesn't have a protocol
    }
  }

  if (!protocolId) {
    return { success: false, message: 'Protocol ID is required. Example: get protocol my-protocol' };
  }

  try {
    const protocol = await getProtocolDetails(protocolId);

    if (!protocol) {
      return { success: false, message: `Protocol not found: ${protocolId}` };
    }

    return {
      success: true,
      message: formatProtocolDetails(protocol),
      data: { protocol },
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to get protocol: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

const handleListProtocols: CommandHandler = async (cmd, _sessionId) => {
  try {
    const options: { status?: OnboardingStatus; tier?: string } = {};

    // Parse status filter
    const statusArg = cmd.args.status?.toUpperCase();
    if (statusArg === 'LIVE') {
      options.status = 'LIVE';
    } else if (statusArg === 'SUSPENDED' || statusArg === 'SUSP') {
      options.status = 'SUSPENDED';
    } else if (statusArg === 'SIMULATION' || statusArg === 'SIM') {
      options.status = 'APPROVED_SIMULATION';
    } else if (statusArg === 'PENDING') {
      options.status = 'PENDING_REVIEW';
    }

    // Parse tier filter
    if (cmd.args.tier) {
      const tierLower = cmd.args.tier.toLowerCase();
      if (['bronze', 'silver', 'gold'].includes(tierLower)) {
        options.tier = tierLower;
      }
    }

    const protocols = await listProtocols(options);

    return {
      success: true,
      message: formatProtocolList(protocols),
      data: { count: protocols.length },
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to list protocols: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

// ============================================================================
// Register Commands
// ============================================================================

export function registerProtocolCrudCommands(): void {
  registerCommand('create_protocol', handleCreateProtocol, {
    requiresExpanded: true,
    requiresSession: false, // Admin can create without session
    category: 'protocol',
    description: 'Create a new protocol sponsor',
    examples: [
      'create protocol uniswap-v4 name "Uniswap V4"',
      'create protocol aave-v3 budget $1000 min-tier 2',
    ],
  });

  registerCommand('update_protocol', handleUpdateProtocol, {
    requiresExpanded: true,
    requiresSession: false,
    category: 'protocol',
    description: 'Update a protocol configuration',
    examples: [
      'update protocol uniswap-v4 set minTier 2',
      'update protocol aave-v3 set requireERC8004 true',
    ],
  });

  registerCommand('disable_protocol', handleDisableProtocol, {
    requiresExpanded: true,
    requiresSession: false,
    isDestructive: true,
    category: 'protocol',
    description: 'Suspend a protocol (can be reactivated)',
    examples: [
      'disable protocol uniswap-v4',
      'suspend protocol aave-v3',
    ],
  });

  registerCommand('get_protocol', handleGetProtocol, {
    requiresExpanded: true,
    requiresSession: false,
    category: 'protocol',
    description: 'View protocol details',
    examples: [
      'get protocol uniswap-v4',
      'show protocol aave-v3',
    ],
  });

  registerCommand('list_protocols', handleListProtocols, {
    requiresExpanded: true,
    requiresSession: false,
    category: 'protocol',
    description: 'List all protocols',
    examples: [
      'list protocols',
      'list protocols live',
      'list protocols suspended',
    ],
  });
}
