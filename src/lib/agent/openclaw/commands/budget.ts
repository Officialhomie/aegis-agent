/**
 * OpenClaw Budget Commands
 *
 * Commands for managing protocol budgets:
 * - topup budget <protocol> $<amount> [via <method>]
 * - set daily budget <protocol> $<amount>
 * - show budget <protocol>
 */

import { registerCommand, type CommandHandler } from '../command-registry';
import { getProtocolIdFromSession } from '../session-manager';
import {
  topupProtocolBudget,
  setDailyBudget,
  getBudgetSummary,
  formatBudgetSummary,
  getDepositHistory,
} from '../../../protocol/budget-service';
import {
  parseProtocolId,
  parseMoneyExtended,
} from '../parsers';
import type { ParsedCommand, CommandResult } from '../types';

/**
 * Parse topup budget command
 * Examples:
 *   topup budget uniswap-v4 $500
 *   topup protocol aave-v3 $1000 via x402
 *   add budget $200 (uses session protocol)
 */
export function parseTopupBudgetCommand(input: string): ParsedCommand {
  const protocolId = parseProtocolId(input);
  const amount = parseMoneyExtended(input);

  // Parse payment method
  const methodMatch = input.match(/via\s+(x402|manual|crypto|credit_card)/i);
  const method = methodMatch ? methodMatch[1].toLowerCase() : 'manual';

  // Parse optional note
  const noteMatch = input.match(/note\s+"([^"]+)"/i);
  const note = noteMatch ? noteMatch[1] : undefined;

  return {
    name: 'topup_budget',
    args: {
      protocolId: protocolId ?? '',
      amount: amount?.toString() ?? '',
      method,
      note: note ?? '',
    },
    rawInput: input,
  };
}

/**
 * Parse set daily budget command
 * Examples:
 *   set daily budget uniswap-v4 $100
 *   daily limit aave-v3 $50
 *   set budget limit $200 (uses session protocol)
 */
export function parseSetDailyBudgetCommand(input: string): ParsedCommand {
  const protocolId = parseProtocolId(input);
  const amount = parseMoneyExtended(input);

  return {
    name: 'set_daily_budget',
    args: {
      protocolId: protocolId ?? '',
      amount: amount?.toString() ?? '',
    },
    rawInput: input,
  };
}

/**
 * Parse show budget command
 * Examples:
 *   show budget uniswap-v4
 *   budget status aave-v3
 *   my budget (uses session protocol)
 */
export function parseShowBudgetCommand(input: string): ParsedCommand {
  const protocolId = parseProtocolId(input);

  // Check if user wants history
  const showHistory = /history|deposits|transactions/i.test(input);

  return {
    name: 'show_budget',
    args: {
      protocolId: protocolId ?? '',
      showHistory: showHistory ? 'true' : '',
    },
    rawInput: input,
  };
}

// ============================================================================
// Command Handlers
// ============================================================================

const handleTopupBudget: CommandHandler = async (cmd, sessionId) => {
  let protocolId = cmd.args.protocolId;

  // Try to get protocol from session if not specified
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
      message: 'Protocol ID is required. Example: topup budget my-protocol $500',
    };
  }

  const amount = parseFloat(cmd.args.amount);
  if (!amount || amount <= 0) {
    return {
      success: false,
      message: 'Invalid amount. Please specify a positive amount. Example: topup budget my-protocol $500',
    };
  }

  try {
    const method = cmd.args.method as 'x402' | 'manual' | 'crypto' | 'credit_card';
    const result = await topupProtocolBudget({
      protocolId,
      amountUSD: amount,
      paymentMethod: method,
      note: cmd.args.note || undefined,
    });

    return {
      success: true,
      message: `Budget topped up successfully!\n\nProtocol: ${protocolId}\nAmount: $${amount.toFixed(2)}\nNew Balance: $${result.newBalance.toFixed(2)}\nMethod: ${method}\nDeposit ID: ${result.depositId.slice(0, 12)}...`,
      data: { depositId: result.depositId, newBalance: result.newBalance },
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to top up budget: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

const handleSetDailyBudget: CommandHandler = async (cmd, sessionId) => {
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
      message: 'Protocol ID is required. Example: set daily budget my-protocol $100',
    };
  }

  const amount = parseFloat(cmd.args.amount);
  if (isNaN(amount) || amount < 0) {
    return {
      success: false,
      message: 'Invalid amount. Please specify a non-negative amount. Example: set daily budget my-protocol $100',
    };
  }

  try {
    await setDailyBudget(protocolId, amount);

    if (amount === 0) {
      return {
        success: true,
        message: `Daily budget limit removed for ${protocolId}.`,
      };
    }

    return {
      success: true,
      message: `Daily budget set to $${amount.toFixed(2)} for ${protocolId}.\n\nSponsorships will be limited to this amount per day. Set to $0 to remove the limit.`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to set daily budget: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

const handleShowBudget: CommandHandler = async (cmd, sessionId) => {
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
      message: 'Protocol ID is required. Example: show budget my-protocol',
    };
  }

  try {
    const summary = await getBudgetSummary(protocolId);
    let message = formatBudgetSummary(summary);

    // Include deposit history if requested
    if (cmd.args.showHistory === 'true') {
      const history = await getDepositHistory(protocolId, 10);

      if (history.length > 0) {
        message += '\n\nRecent Deposits:';
        for (const deposit of history) {
          const status = deposit.confirmed ? 'OK' : 'PENDING';
          const date = deposit.createdAt.toISOString().split('T')[0];
          const hash = deposit.txHash.startsWith('manual-')
            ? 'manual'
            : deposit.txHash.slice(0, 10) + '...';
          message += `\n  [${status}] ${date} $${deposit.amount.toFixed(2)} ${deposit.tokenSymbol} (${hash})`;
        }
      }
    }

    return {
      success: true,
      message,
      data: { summary },
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to get budget: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

// ============================================================================
// Register Commands
// ============================================================================

export function registerBudgetCommands(): void {
  registerCommand('topup_budget', handleTopupBudget, {
    requiresExpanded: true,
    requiresSession: false,
    category: 'budget',
    description: 'Add funds to protocol budget',
    examples: [
      'topup budget uniswap-v4 $500',
      'topup protocol aave-v3 $1000 via x402',
    ],
  });

  registerCommand('set_daily_budget', handleSetDailyBudget, {
    requiresExpanded: true,
    requiresSession: false,
    category: 'budget',
    description: 'Set daily spending limit',
    examples: [
      'set daily budget uniswap-v4 $100',
      'daily limit aave-v3 $50',
    ],
  });

  registerCommand('show_budget', handleShowBudget, {
    requiresExpanded: true,
    requiresSession: false,
    category: 'budget',
    description: 'View budget summary and history',
    examples: [
      'show budget uniswap-v4',
      'show budget aave-v3 history',
    ],
  });
}
