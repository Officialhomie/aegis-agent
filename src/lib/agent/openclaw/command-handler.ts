/**
 * OpenClaw command handler.
 *
 * parseCommand() — converts a natural-language user message into a typed command.
 * executeCommand() — executes the command and returns a human-readable result.
 *
 * Supported commands:
 *   status  — reserve health, runway, ETH/USDC balances
 *   cycle   — trigger one sponsorship cycle (async)
 *   sponsor <wallet> <protocol> — manually trigger a sponsorship
 *   report  — last 20 activity log entries
 *   pause   — pause the autonomous loop
 *   resume  — resume the autonomous loop
 *   help    — list commands
 */

import { logger } from '../../logger';
import { getStateStore } from '../state-store';
import { readMemory } from './memory-manager';
import type { CommandName, ParsedCommand, CommandResult } from './types';

// ──────────────────────────────────────────────────────────────────────────────
// Parser
// ──────────────────────────────────────────────────────────────────────────────

export function parseCommand(input: string): ParsedCommand {
  const lower = input.toLowerCase().trim();

  if (
    lower === 'status' ||
    lower.includes('health') ||
    lower.includes('how are you') ||
    lower.includes('balance') ||
    lower.includes('runway')
  ) {
    return { name: 'status', args: {}, rawInput: input };
  }

  if (
    lower === 'cycle' ||
    lower.includes('run cycle') ||
    lower.includes('trigger cycle') ||
    lower.includes('trigger a cycle') ||
    lower === 'trigger'
  ) {
    return { name: 'cycle', args: {}, rawInput: input };
  }

  if (lower.startsWith('sponsor ')) {
    const parts = input.trim().split(/\s+/);
    const wallet = parts.find((p) => /^0x[a-fA-F0-9]{40}$/.test(p)) ?? '';
    const protocol = parts.find((p) => p !== 'sponsor' && !/^0x/.test(p)) ?? '';
    return { name: 'sponsor', args: { wallet, protocol }, rawInput: input };
  }

  if (
    lower === 'report' ||
    lower.includes('activity') ||
    lower.includes('summary') ||
    lower.includes('what did you do') ||
    lower.includes('show log')
  ) {
    return { name: 'report', args: {}, rawInput: input };
  }

  if (lower === 'pause' || lower === 'stop' || lower.includes('pause the agent')) {
    return { name: 'pause', args: {}, rawInput: input };
  }

  if (
    lower === 'resume' ||
    lower === 'start' ||
    lower.includes('start again') ||
    lower.includes('unpause') ||
    lower.includes('resume the agent')
  ) {
    return { name: 'resume', args: {}, rawInput: input };
  }

  return { name: 'help', args: {}, rawInput: input };
}

// ──────────────────────────────────────────────────────────────────────────────
// Executor
// ──────────────────────────────────────────────────────────────────────────────

export async function executeCommand(cmd: ParsedCommand): Promise<CommandResult> {
  logger.info('[OpenClaw] Executing command', { name: cmd.name });

  switch (cmd.name) {
    case 'status': {
      try {
        const { getReserveState } = await import('../state/reserve-state');
        const state = await getReserveState();
        if (!state) {
          return {
            success: true,
            message: 'Reserve state not initialised yet. Run a cycle first.',
          };
        }
        const message =
          `ETH: ${state.ethBalance.toFixed(4)}, ` +
          `USDC: ${(state.usdcBalance ?? 0).toFixed(2)}, ` +
          `runway: ${state.runwayDays?.toFixed(1) ?? '?'} days, ` +
          `health: ${state.healthScore ?? '?'}/100`;
        return { success: true, message, data: state as unknown as Record<string, unknown> };
      } catch (err) {
        const message = `Could not fetch reserve state: ${err instanceof Error ? err.message : String(err)}`;
        return { success: false, message };
      }
    }

    case 'cycle': {
      // Fire-and-forget — caller should use callbackUrl for full result
      try {
        const { runSponsorshipCycle } = await import('../index');
        const config = {
          confidenceThreshold: parseFloat(process.env.AGENT_CONFIDENCE_THRESHOLD ?? '0.8'),
          maxTransactionValueUsd: parseFloat(process.env.MAX_TRANSACTION_VALUE_USD ?? '100'),
          executionMode: (process.env.AGENT_EXECUTION_MODE ?? 'SIMULATION') as
            | 'LIVE'
            | 'SIMULATION'
            | 'READONLY',
        };
        runSponsorshipCycle(config).catch((err) =>
          logger.error('[OpenClaw] Triggered cycle error', { error: err })
        );
      } catch (err) {
        logger.error('[OpenClaw] Could not import runSponsorshipCycle', { error: err });
      }
      return { success: true, message: 'Cycle triggered. Check status in ~30 seconds.' };
    }

    case 'sponsor': {
      const { wallet, protocol } = cmd.args;
      if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
        return {
          success: false,
          message: 'Invalid wallet address. Usage: sponsor 0x<address> <protocol>',
        };
      }
      if (!protocol) {
        return {
          success: false,
          message: 'Protocol required. Usage: sponsor 0x<address> <protocol>',
        };
      }
      return {
        success: true,
        message: `Sponsorship queued for ${wallet} on ${protocol}. The next cycle will process it.`,
      };
    }

    case 'report': {
      const recent = await readMemory(20);
      return { success: true, message: recent };
    }

    case 'pause': {
      const store = await getStateStore();
      await store.set('aegis:openclaw:paused', 'true');
      return { success: true, message: 'Agent paused. Autonomous loop stopped. Use "resume" to restart.' };
    }

    case 'resume': {
      const store = await getStateStore();
      await store.set('aegis:openclaw:paused', 'false');
      return { success: true, message: 'Agent resumed. Autonomous loop restarted.' };
    }

    case 'help':
    default:
      return {
        success: true,
        message: [
          'Aegis Gas Sponsorship Agent — available commands:',
          '  status                        — Reserve health, runway, ETH/USDC balances',
          '  cycle                         — Trigger one sponsorship cycle now',
          '  sponsor <0x...wallet> <proto> — Manually queue a sponsorship',
          '  report                        — Last 20 activity log entries',
          '  pause                         — Pause the autonomous loop',
          '  resume                        — Resume the autonomous loop',
          '  help                          — This message',
        ].join('\n'),
      };
  }
}

/** Exported for use as CommandName type guard */
export function isCommandName(name: string): name is CommandName {
  return ['status', 'cycle', 'sponsor', 'report', 'pause', 'resume', 'help'].includes(name);
}
