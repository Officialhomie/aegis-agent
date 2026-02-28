/**
 * OpenClaw Help and Safety Commands
 *
 * Commands for help and safety:
 * - help [command]
 * - commands
 * - confirm <token>
 */

import { registerCommand, type CommandHandler, commandRegistry } from '../command-registry';
import {
  verifyConfirmation,
  cancelConfirmation,
  hasPendingConfirmation,
  formatConfirmationRequest,
  getPendingConfirmation,
} from '../confirmation';
import { getRateLimitStatus } from '../rate-limiter';
import { executeRegisteredCommand } from '../command-registry';
import { parseConfirmation } from '../parsers';
import type { ParsedCommand, CommandResult, CommandName } from '../types';

/**
 * Parse help command
 * Examples:
 *   help
 *   help create_agent
 *   ? budget
 */
export function parseHelpCommand(input: string): ParsedCommand {
  // Extract command name if specified
  const match = input.match(/(?:help|h|\?)\s+(\w+)/i);
  const commandName = match ? match[1] : undefined;

  return {
    name: 'help',
    args: {
      commandName: commandName ?? '',
    },
    rawInput: input,
  };
}

/**
 * Parse commands command
 * Examples:
 *   commands
 *   list commands
 */
export function parseCommandsCommand(input: string): ParsedCommand {
  // Check if user wants a specific category
  const categoryMatch = input.match(
    /commands?\s+(agent|protocol|budget|guarantee|delegation|heartbeat|report|safety)/i
  );
  const category = categoryMatch ? categoryMatch[1].toLowerCase() : undefined;

  return {
    name: 'commands',
    args: {
      category: category ?? '',
    },
    rawInput: input,
  };
}

/**
 * Parse confirm command
 * Examples:
 *   confirm ABC123
 *   YES
 *   NO
 */
export function parseConfirmCommand(input: string): ParsedCommand {
  const confirmation = parseConfirmation(input);

  return {
    name: 'confirm',
    args: {
      token: confirmation.token ?? input.trim(),
    },
    rawInput: input,
  };
}

// ============================================================================
// Command Handlers
// ============================================================================

const handleHelp: CommandHandler = async (cmd, _sessionId) => {
  const commandName = cmd.args.commandName;

  if (commandName) {
    // Help for specific command
    const helpText = commandRegistry.generateCommandHelp(commandName as CommandName);

    if (!helpText) {
      return {
        success: false,
        message: `Unknown command: ${commandName}. Type "commands" to see all available commands.`,
      };
    }

    return {
      success: true,
      message: helpText,
    };
  }

  // General help
  const helpText = commandRegistry.generateHelp();

  return {
    success: true,
    message: helpText,
  };
};

const handleCommands: CommandHandler = async (cmd, _sessionId) => {
  const category = cmd.args.category;

  if (category) {
    // Get commands for specific category
    const byCategory = commandRegistry.getCommandsByCategory();
    const commands = byCategory.get(category as never);

    if (!commands || commands.length === 0) {
      return {
        success: false,
        message: `No commands found in category: ${category}`,
      };
    }

    const lines = [`Commands in ${category}:`];
    for (const { name, options } of commands) {
      const desc = options.description ?? '';
      const destructive = options.isDestructive ? ' (!)' : '';
      lines.push(`  ${name}${destructive} - ${desc}`);
    }

    return {
      success: true,
      message: lines.join('\n'),
    };
  }

  // Quick reference of all commands
  const availableCommands = commandRegistry.getAvailableCommands();

  const lines = [
    'Available Commands:',
    '',
    ...availableCommands.map((name) => `  ${name}`),
    '',
    'Type "help <command>" for details on a specific command.',
  ];

  return {
    success: true,
    message: lines.join('\n'),
  };
};

const handleConfirm: CommandHandler = async (cmd, sessionId) => {
  if (!sessionId) {
    return {
      success: false,
      message: 'Session required for confirmation.',
    };
  }

  const input = cmd.args.token;

  // Handle cancellation
  if (/^(no|cancel|abort)$/i.test(input)) {
    const cancelled = cancelConfirmation(sessionId);

    if (cancelled) {
      return {
        success: true,
        message: 'Action cancelled.',
      };
    }

    return {
      success: false,
      message: 'No pending action to cancel.',
    };
  }

  // Check if there's a pending confirmation
  if (!hasPendingConfirmation(sessionId)) {
    return {
      success: false,
      message: 'No pending action to confirm.',
    };
  }

  // Verify confirmation
  const verification = verifyConfirmation(sessionId, input);

  if (!verification.valid) {
    return {
      success: false,
      message: verification.error ?? 'Invalid confirmation.',
    };
  }

  // Execute the confirmed action
  const pendingAction = verification.confirmation!;

  const result = await executeRegisteredCommand(
    {
      name: pendingAction.action,
      args: pendingAction.args,
      rawInput: `[confirmed] ${pendingAction.description}`,
    },
    sessionId
  );

  return result;
};

/**
 * Handler for checking session status (rate limits, pending confirmations)
 */
const handleStatus: CommandHandler = async (_cmd, sessionId) => {
  if (!sessionId) {
    return {
      success: true,
      message: 'No active session.',
    };
  }

  const rateLimitStatus = getRateLimitStatus(sessionId);
  const pending = getPendingConfirmation(sessionId);

  const lines = [
    'Session Status:',
    '',
    'Rate Limits:',
    `  Commands: ${rateLimitStatus.remainingCommands}/${rateLimitStatus.maxCommands} remaining (per minute)`,
    `  Destructive: ${rateLimitStatus.remainingDestructive}/${rateLimitStatus.maxDestructive} remaining (per hour)`,
  ];

  if (pending) {
    lines.push('');
    lines.push('Pending Confirmation:');
    lines.push(`  Action: ${pending.action}`);
    lines.push(`  Token: ${pending.token}`);
    const secondsRemaining = Math.ceil((pending.expiresAt.getTime() - Date.now()) / 1000);
    lines.push(`  Expires in: ${secondsRemaining}s`);
  }

  return {
    success: true,
    message: lines.join('\n'),
  };
};

// ============================================================================
// Register Commands
// ============================================================================

export function registerHelpCommands(): void {
  registerCommand('help', handleHelp, {
    requiresExpanded: false,
    requiresSession: false,
    category: 'help',
    description: 'Show help for commands',
    examples: [
      'help',
      'help create_agent',
    ],
  });

  registerCommand('commands', handleCommands, {
    requiresExpanded: false,
    requiresSession: false,
    category: 'help',
    description: 'List all available commands',
    examples: [
      'commands',
      'commands agent',
    ],
  });

  registerCommand('confirm', handleConfirm, {
    requiresExpanded: false,
    requiresSession: true,
    category: 'safety',
    description: 'Confirm a pending destructive action',
    examples: [
      'confirm ABC123',
      'YES',
      'NO',
    ],
  });
}
