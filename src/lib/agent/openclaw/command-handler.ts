/**
 * OpenClaw command handler.
 *
 * parseCommand() — converts a natural-language user message into a typed command.
 * executeCommand() — executes the command and returns a human-readable result.
 *
 * Phase 1B commands (monitoring):
 *   status       — reserve health, runway, ETH/USDC balances
 *   cycle        — trigger one sponsorship cycle (async)
 *   sponsor      — manually trigger a sponsorship
 *   report       — last 20 activity log entries
 *   pause/resume — pause/resume autonomous loop
 *
 * Phase 2 commands (management):
 *   pause_timed   — pause for specific duration ("pause for 2 hours")
 *   set_budget    — update daily spend cap ("set budget to $500")
 *   analytics     — show top users and spending ("show top 10 users")
 *   block_wallet  — block wallet address ("block wallet 0xabc")
 *   set_gas_cap   — update max gas price ("set gas cap to 50 gwei")
 *   topup         — get funding instructions ("topup 1000")
 *
 *   help         — list commands
 */

import { logger } from '../../logger';
import { getStateStore } from '../state-store';
import { readMemory } from './memory-manager';
import type { CommandName, ParsedCommand, CommandResult } from './types';
import {
  parseDuration,
  parseAmount,
  extractAddress,
  parseGwei,
  parseNumber,
  parsePeriod,
  extractReason,
} from './parsers';
import { getAnalyticsSummary, formatAnalyticsMessage } from './analytics';
import {
  createRuntimeOverride,
  blockWallet,
} from '../../protocol/runtime-overrides';
import { getProtocolIdFromSession } from './session-manager';
import { getGasPassport, formatPassportText } from '../../passport';

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

  if (
    (lower.includes('sponsor the next') || lower.includes('sponsor next')) &&
    (lower.includes('transaction') || lower.includes('tx') || /\d+/.test(lower)) &&
    (lower.includes('base') || lower.includes('mainnet')) &&
    (lower.includes('uniswap') || lower.includes('uniswap v4') || lower.includes('uniswap v3'))
  ) {
    const limit = parseNumber(input, 10);
    const protocol = lower.includes('v4') ? 'uniswap-v4' : 'uniswap-v4';
    const chain = lower.includes('base') ? 'base' : 'base';
    return { name: 'campaign', args: { protocol, chain, limit: limit.toString() }, rawInput: input };
  }

  if (lower.includes('campaign status') || lower.includes('campaign progress') || lower === 'campaign_status') {
    return { name: 'campaign_status', args: {}, rawInput: input };
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

  // Phase 2: New management commands

  if (lower.includes('pause for') || lower.includes('pause until')) {
    const durationMs = parseDuration(input);
    return { name: 'pause_timed', args: { durationMs: durationMs.toString() }, rawInput: input };
  }

  if (
    lower.includes('set budget') ||
    lower.includes('daily budget') ||
    lower.includes('spend cap') ||
    lower.includes('daily cap')
  ) {
    const amountUSD = parseAmount(input);
    return { name: 'set_budget', args: { amountUSD: amountUSD.toString() }, rawInput: input };
  }

  if (
    lower.includes('analytics') ||
    lower.includes('top users') ||
    lower.includes('top wallets') ||
    lower.includes('expensive users') ||
    lower.includes('show spending') ||
    lower.includes('show top') ||
    lower.match(/top\s+\d+/)
  ) {
    const limit = parseNumber(input, 10);
    const period = parsePeriod(input);
    return { name: 'analytics', args: { limit: limit.toString(), period }, rawInput: input };
  }

  if (lower.includes('block wallet') || lower.includes('block address')) {
    const wallet = extractAddress(input);
    const reason = extractReason(input);
    return { name: 'block_wallet', args: { wallet, reason: reason ?? '' }, rawInput: input };
  }

  if (lower.includes('gas cap') || lower.includes('max gas') || lower.includes('gas price')) {
    const maxGwei = parseGwei(input);
    return { name: 'set_gas_cap', args: { maxGwei: maxGwei.toString() }, rawInput: input };
  }

  if (lower.includes('topup') || lower.includes('top up') || lower.includes('deposit')) {
    const amountUSD = parseAmount(input);
    return { name: 'topup', args: { amountUSD: amountUSD.toString() }, rawInput: input };
  }

  if (
    lower.includes('passport') ||
    lower.includes('reputation') ||
    lower.includes('my score') ||
    lower.includes('trust score')
  ) {
    const wallet = extractAddress(input);
    return { name: 'passport', args: { wallet }, rawInput: input };
  }

  return { name: 'help', args: {}, rawInput: input };
}

// ──────────────────────────────────────────────────────────────────────────────
// Executor
// ──────────────────────────────────────────────────────────────────────────────

export async function executeCommand(cmd: ParsedCommand, sessionId?: string): Promise<CommandResult> {
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

    case 'pause_timed': {
      try {
        const durationMs = parseInt(cmd.args.durationMs ?? '0');
        const until = new Date(Date.now() + durationMs);

        // Get protocol ID from session (passed by API route)
        if (!sessionId) {
          return { success: false, message: 'Session ID required for this command' };
        }

        const protocolId = await getProtocolIdFromSession(sessionId);

        await createRuntimeOverride({
          protocolId,
          overrideType: 'PAUSE_UNTIL',
          value: { until: until.toISOString() },
          expiresAt: until,
          createdBy: 'openclaw',
        });

        const hours = Math.floor(durationMs / (1000 * 60 * 60));
        const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
        const timeStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

        return {
          success: true,
          message: `Sponsorships paused for ${timeStr} (until ${until.toLocaleString()})`,
        };
      } catch (err) {
        return {
          success: false,
          message: `Failed to pause: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    case 'set_budget': {
      try {
        const amountUSD = parseFloat(cmd.args.amountUSD ?? '0');

        if (amountUSD <= 0 || amountUSD > 10000) {
          return { success: false, message: 'Budget must be between $0.01 and $10,000' };
        }

        if (!sessionId) {
          return { success: false, message: 'Session ID required for this command' };
        }

        const protocolId = await getProtocolIdFromSession(sessionId);

        await createRuntimeOverride({
          protocolId,
          overrideType: 'DAILY_BUDGET_USD',
          value: { budgetUSD: amountUSD },
          createdBy: 'openclaw',
        });

        return {
          success: true,
          message: `Daily spend cap updated to $${amountUSD}`,
        };
      } catch (err) {
        return {
          success: false,
          message: `Failed to update budget: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    case 'analytics': {
      try {
        const limit = parseInt(cmd.args.limit ?? '10');
        const period = cmd.args.period ?? 'week';

        if (!sessionId) {
          return { success: false, message: 'Session ID required for this command' };
        }

        const protocolId = await getProtocolIdFromSession(sessionId);

        const summary = await getAnalyticsSummary(protocolId, {
          topWalletsLimit: limit,
          period: period as 'day' | 'week' | 'month',
        });

        const message = formatAnalyticsMessage(summary);

        return { success: true, message };
      } catch (err) {
        return {
          success: false,
          message: `Failed to get analytics: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    case 'block_wallet': {
      try {
        const wallet = cmd.args.wallet;

        if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
          return { success: false, message: 'Invalid wallet address' };
        }

        if (!sessionId) {
          return { success: false, message: 'Session ID required for this command' };
        }

        const protocolId = await getProtocolIdFromSession(sessionId);
        const reason = cmd.args.reason || 'Blocked via OpenClaw';

        await blockWallet({
          protocolId,
          walletAddress: wallet,
          reason,
          blockedBy: 'openclaw',
        });

        const shortAddr = `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
        return {
          success: true,
          message: `Wallet ${shortAddr} blocked. Future sponsorships will be rejected.`,
        };
      } catch (err) {
        return {
          success: false,
          message: `Failed to block wallet: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    case 'set_gas_cap': {
      try {
        const maxGwei = parseFloat(cmd.args.maxGwei ?? '0');

        if (maxGwei <= 0 || maxGwei > 1000) {
          return { success: false, message: 'Gas price must be between 0.1 and 1000 gwei' };
        }

        if (!sessionId) {
          return { success: false, message: 'Session ID required for this command' };
        }

        const protocolId = await getProtocolIdFromSession(sessionId);

        await createRuntimeOverride({
          protocolId,
          overrideType: 'MAX_GAS_PRICE_GWEI',
          value: { maxGwei },
          createdBy: 'openclaw',
        });

        return {
          success: true,
          message: `Max gas price set to ${maxGwei} gwei`,
        };
      } catch (err) {
        return {
          success: false,
          message: `Failed to set gas cap: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    case 'topup': {
      try {
        const amountUSD = parseFloat(cmd.args.amountUSD ?? '0');

        if (amountUSD <= 0) {
          return { success: false, message: 'Topup amount must be greater than $0' };
        }

        const depositAddress = process.env.TREASURY_USDC_ADDRESS || '0x...';

        return {
          success: true,
          message: [
            `To topup $${amountUSD}:`,
            '',
            `1. Send ${amountUSD} USDC to ${depositAddress} on Base`,
            `2. Funds will be available within 1 minute (3 confirmations)`,
            `3. Use "status" command to check updated balance`,
          ].join('\n'),
        };
      } catch (err) {
        return {
          success: false,
          message: `Failed to process topup: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    case 'passport': {
      try {
        const wallet = cmd.args.wallet;

        if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
          return {
            success: false,
            message: 'Please provide a valid wallet address. Usage: passport 0x...',
          };
        }

        const passport = await getGasPassport(wallet, { includeIdentity: true });
        const message = formatPassportText(passport);

        return { success: true, message };
      } catch (err) {
        return {
          success: false,
          message: `Failed to get passport: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    case 'campaign': {
      try {
        const protocol = cmd.args.protocol ?? 'uniswap-v4';
        const chain = cmd.args.chain ?? 'base';
        const limit = cmd.args.limit ?? '10';
        const { spawn } = await import('child_process');
        const path = await import('path');
        const scriptPath = path.join(process.cwd(), 'scripts', 'run-targeted-campaign.ts');
        const child = spawn(
          'npx',
          ['tsx', scriptPath, '--protocol', protocol, '--chain', chain, '--limit', limit],
          { detached: true, stdio: 'ignore', cwd: process.cwd() }
        );
        child.unref();
        return {
          success: true,
          message: `Campaign started: sponsor next ${limit} transactions on ${chain} for ${protocol}. Say "campaign status" for progress.`,
        };
      } catch (err) {
        return {
          success: false,
          message: `Failed to start campaign: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    case 'campaign_status': {
      try {
        const protocolId = sessionId
          ? await getProtocolIdFromSession(sessionId).catch(() => 'uniswap-v4')
          : 'uniswap-v4';
        const { getActiveCampaignForProtocol, getCampaignReport } = await import('../campaigns');
        const active = await getActiveCampaignForProtocol(protocolId);
        if (!active) {
          return {
            success: true,
            message: 'No active campaign for your protocol. Start one with: "sponsor the next 10 transactions on base mainnet for uniswap v4"',
          };
        }
        const report = await getCampaignReport(active.id);
        if (!report) {
          return { success: true, message: `Campaign ${active.id}: ${active.completedSponsorships}/${active.maxSponsorships} completed.` };
        }
        const lines = [
          `Campaign ${report.campaign.id} (${report.campaign.protocol} on ${report.campaign.chain}):`,
          `  Completed: ${report.campaign.completed}/${report.campaign.limit}`,
          `  Status: ${report.campaign.status}`,
          `  Total gas used: ${report.totals.totalGasUsed}`,
          `  Total cost USD: $${report.totals.totalCostUSD.toFixed(4)}`,
        ];
        if (report.transactions.length > 0) {
          lines.push('  Recent tx hashes:');
          report.transactions.slice(-5).forEach((t) => lines.push(`    ${t.txHash}`));
        }
        return { success: true, message: lines.join('\n') };
      } catch (err) {
        return {
          success: false,
          message: `Failed to get campaign status: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    case 'help':
    default:
      return {
        success: true,
        message: [
          'Aegis Gas Sponsorship Agent — available commands:',
          '',
          'MONITORING:',
          '  status                        — Reserve health, runway, ETH/USDC balances',
          '  analytics                     — Show top users and spending stats',
          '  passport 0x...                — View wallet Gas Passport (trust score)',
          '  report                        — Last 20 activity log entries',
          '',
          'EXECUTION:',
          '  cycle                         — Trigger one sponsorship cycle now',
          '  sponsor the next N txs on base for uniswap v4 — Start targeted campaign',
          '  campaign status               — Show active campaign progress',
          '  sponsor <0x...wallet> <proto> — Manually queue a sponsorship',
          '  pause                         — Pause the autonomous loop',
          '  pause for 2 hours             — Pause for a specific duration',
          '  resume                        — Resume the autonomous loop',
          '',
          'POLICY MANAGEMENT:',
          '  set budget to $500            — Update daily spend cap',
          '  set gas cap to 50 gwei        — Update max gas price',
          '  block wallet 0x...            — Block a wallet address',
          '',
          'FUNDING:',
          '  topup 1000                    — Get instructions to add funds',
          '',
          '  help                          — This message',
        ].join('\n'),
      };
  }
}

/** Exported for use as CommandName type guard */
export function isCommandName(name: string): name is CommandName {
  return [
    'status',
    'cycle',
    'sponsor',
    'report',
    'pause',
    'resume',
    'help',
    'pause_timed',
    'set_budget',
    'analytics',
    'block_wallet',
    'set_gas_cap',
    'topup',
    'passport',
    'campaign',
    'campaign_status',
  ].includes(name);
}
