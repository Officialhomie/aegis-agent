/**
 * OpenClaw Agent CRUD Commands
 *
 * Commands for managing approved agents:
 * - create agent <0x...> name "<label>" type <AGENT_TYPE> tier <1|2|3>
 * - update agent <0x...> set <field> <value>
 * - delete agent <0x...>
 * - get agent <0x...>
 * - list agents [active|tier <n>]
 */

import { registerCommand, type CommandHandler } from '../command-registry';
import { getProtocolIdFromSession } from '../session-manager';
import {
  createApprovedAgent,
  updateApprovedAgent,
  deleteApprovedAgent,
  getApprovedAgent,
  listApprovedAgents,
  formatAgentDetails,
  formatAgentList,
} from '../../approved-agent-service';
import {
  extractAddress,
  parseAgentLabel,
  parseAgentType,
  parseTier,
  parseMoneyExtended,
  parseBoolean,
  parseSetClause,
  parseStatusFilter,
} from '../parsers';
import { AgentType } from '@prisma/client';
import type { ParsedCommand, CommandResult } from '../types';

/**
 * Parse create agent command
 * Examples:
 *   create agent 0xabc... name "MyBot" type ERC8004_AGENT tier 1
 *   add agent 0x123... tier 2
 */
export function parseCreateAgentCommand(input: string): ParsedCommand {
  const address = extractAddress(input);
  const name = parseAgentLabel(input);
  const typeStr = parseAgentType(input);
  const tier = parseTier(input);

  // Parse max budget if specified
  const budgetMatch = input.match(/(?:budget|max)\s*\$?(\d+(?:\.\d+)?)/i);
  const maxBudget = budgetMatch ? parseFloat(budgetMatch[1]) : undefined;

  return {
    name: 'create_agent',
    args: {
      address: address ?? '',
      agentName: name ?? '',
      agentType: typeStr ?? '',
      tier: tier?.toString() ?? '',
      maxBudget: maxBudget?.toString() ?? '',
    },
    rawInput: input,
  };
}

/**
 * Parse update agent command
 * Examples:
 *   update agent 0xabc... set tier 1
 *   update agent 0x123... set name "NewName"
 *   set agent 0x456... tierOverride true
 */
export function parseUpdateAgentCommand(input: string): ParsedCommand {
  const address = extractAddress(input);
  const setClause = parseSetClause(input);

  return {
    name: 'update_agent',
    args: {
      address: address ?? '',
      field: setClause?.field ?? '',
      value: setClause?.value ?? '',
    },
    rawInput: input,
  };
}

/**
 * Parse delete agent command
 * Examples:
 *   delete agent 0xabc...
 *   remove agent 0x123...
 *   revoke agent 0x456...
 */
export function parseDeleteAgentCommand(input: string): ParsedCommand {
  const address = extractAddress(input);

  return {
    name: 'delete_agent',
    args: {
      address: address ?? '',
    },
    rawInput: input,
  };
}

/**
 * Parse get agent command
 * Examples:
 *   get agent 0xabc...
 *   show agent 0x123...
 */
export function parseGetAgentCommand(input: string): ParsedCommand {
  const address = extractAddress(input);

  return {
    name: 'get_agent',
    args: {
      address: address ?? '',
    },
    rawInput: input,
  };
}

/**
 * Parse list agents command
 * Examples:
 *   list agents
 *   list agents active
 *   list agents tier 1
 *   show all agents
 */
export function parseListAgentsCommand(input: string): ParsedCommand {
  const lower = input.toLowerCase();
  const tier = parseTier(input);
  const isActive = lower.includes('active') ? 'true' :
                   lower.includes('revoked') ? 'false' : '';

  return {
    name: 'list_agents',
    args: {
      active: isActive,
      tier: tier?.toString() ?? '',
    },
    rawInput: input,
  };
}

// ============================================================================
// Command Handlers
// ============================================================================

const handleCreateAgent: CommandHandler = async (cmd, sessionId) => {
  if (!sessionId) {
    return { success: false, message: 'Session ID required for this command' };
  }

  const address = cmd.args.address;
  if (!address || !/^0x[a-fA-F0-9]{40}$/i.test(address)) {
    return { success: false, message: 'Invalid agent address. Please provide a valid Ethereum address.' };
  }

  try {
    const protocolId = await getProtocolIdFromSession(sessionId);

    const agent = await createApprovedAgent({
      protocolId,
      agentAddress: address,
      agentName: cmd.args.agentName || undefined,
      agentTier: cmd.args.tier ? (parseInt(cmd.args.tier) as 1 | 2 | 3) : undefined,
      agentType: cmd.args.agentType ? (cmd.args.agentType as AgentType) : undefined,
      maxDailyBudget: cmd.args.maxBudget ? parseFloat(cmd.args.maxBudget) : undefined,
      approvedBy: 'openclaw',
    });

    return {
      success: true,
      message: `Agent approved successfully:\n${formatAgentDetails(agent)}`,
      data: { agentId: agent.id, agentAddress: agent.agentAddress },
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to create agent: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

const handleUpdateAgent: CommandHandler = async (cmd, sessionId) => {
  if (!sessionId) {
    return { success: false, message: 'Session ID required for this command' };
  }

  const address = cmd.args.address;
  if (!address || !/^0x[a-fA-F0-9]{40}$/i.test(address)) {
    return { success: false, message: 'Invalid agent address.' };
  }

  const field = cmd.args.field?.toLowerCase();
  const value = cmd.args.value;

  if (!field || !value) {
    return { success: false, message: 'Please specify field and value to update. Example: update agent 0x... set tier 1' };
  }

  try {
    const protocolId = await getProtocolIdFromSession(sessionId);

    const updates: Record<string, unknown> = {};

    switch (field) {
      case 'name':
      case 'agentname':
        updates.agentName = value;
        break;
      case 'tier':
      case 'agenttier':
        const tier = parseInt(value);
        if (tier < 1 || tier > 3) {
          return { success: false, message: 'Tier must be 1, 2, or 3' };
        }
        updates.agentTier = tier as 1 | 2 | 3;
        break;
      case 'type':
      case 'agenttype':
        const agentType = parseAgentType(value);
        if (!agentType) {
          return { success: false, message: 'Invalid agent type. Use ERC8004_AGENT, ERC4337_ACCOUNT, or SMART_CONTRACT' };
        }
        updates.agentType = agentType as AgentType;
        break;
      case 'tieroverride':
      case 'override':
        updates.tierOverride = parseBoolean(value) ?? false;
        break;
      case 'budget':
      case 'maxbudget':
      case 'maxdailybudget':
        updates.maxDailyBudget = parseMoneyExtended(value);
        break;
      default:
        return { success: false, message: `Unknown field: ${field}. Valid fields: name, tier, type, tierOverride, maxBudget` };
    }

    const agent = await updateApprovedAgent({
      protocolId,
      agentAddress: address,
      updates,
    });

    return {
      success: true,
      message: `Agent updated:\n${formatAgentDetails(agent)}`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to update agent: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

const handleDeleteAgent: CommandHandler = async (cmd, sessionId) => {
  if (!sessionId) {
    return { success: false, message: 'Session ID required for this command' };
  }

  const address = cmd.args.address;
  if (!address || !/^0x[a-fA-F0-9]{40}$/i.test(address)) {
    return { success: false, message: 'Invalid agent address.' };
  }

  try {
    const protocolId = await getProtocolIdFromSession(sessionId);

    await deleteApprovedAgent({
      protocolId,
      agentAddress: address,
    });

    return {
      success: true,
      message: `Agent ${address.slice(0, 10)}... has been revoked.`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to delete agent: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

const handleGetAgent: CommandHandler = async (cmd, sessionId) => {
  if (!sessionId) {
    return { success: false, message: 'Session ID required for this command' };
  }

  const address = cmd.args.address;
  if (!address || !/^0x[a-fA-F0-9]{40}$/i.test(address)) {
    return { success: false, message: 'Invalid agent address.' };
  }

  try {
    const protocolId = await getProtocolIdFromSession(sessionId);

    const agent = await getApprovedAgent(protocolId, address);

    if (!agent) {
      return { success: false, message: `Agent not found: ${address.slice(0, 10)}...` };
    }

    return {
      success: true,
      message: formatAgentDetails(agent),
      data: { agent },
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to get agent: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

const handleListAgents: CommandHandler = async (cmd, sessionId) => {
  if (!sessionId) {
    return { success: false, message: 'Session ID required for this command' };
  }

  try {
    const protocolId = await getProtocolIdFromSession(sessionId);

    const options: { active?: boolean; tier?: number } = {};

    if (cmd.args.active === 'true') {
      options.active = true;
    } else if (cmd.args.active === 'false') {
      options.active = false;
    }

    if (cmd.args.tier) {
      options.tier = parseInt(cmd.args.tier);
    }

    const agents = await listApprovedAgents(protocolId, options);

    return {
      success: true,
      message: formatAgentList(agents),
      data: { count: agents.length },
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to list agents: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

// ============================================================================
// Register Commands
// ============================================================================

export function registerAgentCrudCommands(): void {
  registerCommand('create_agent', handleCreateAgent, {
    requiresExpanded: true,
    requiresSession: true,
    category: 'agent',
    description: 'Approve a new agent for sponsorship',
    examples: [
      'create agent 0xabc... name "MyBot" tier 1',
      'add agent 0x123... type ERC4337_ACCOUNT',
    ],
  });

  registerCommand('update_agent', handleUpdateAgent, {
    requiresExpanded: true,
    requiresSession: true,
    category: 'agent',
    description: 'Update an approved agent',
    examples: [
      'update agent 0xabc... set tier 2',
      'update agent 0x123... set name "NewName"',
    ],
  });

  registerCommand('delete_agent', handleDeleteAgent, {
    requiresExpanded: true,
    requiresSession: true,
    isDestructive: true,
    category: 'agent',
    description: 'Revoke an approved agent',
    examples: [
      'delete agent 0xabc...',
      'revoke agent 0x123...',
    ],
  });

  registerCommand('get_agent', handleGetAgent, {
    requiresExpanded: true,
    requiresSession: true,
    category: 'agent',
    description: 'View agent details',
    examples: [
      'get agent 0xabc...',
      'show agent 0x123...',
    ],
  });

  registerCommand('list_agents', handleListAgents, {
    requiresExpanded: true,
    requiresSession: true,
    category: 'agent',
    description: 'List approved agents',
    examples: [
      'list agents',
      'list agents active',
      'list agents tier 1',
    ],
  });
}
