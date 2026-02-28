/**
 * OpenClaw Heartbeat Commands
 *
 * Commands for managing liveness monitoring:
 * - start heartbeat <agent> every <interval>
 * - stop heartbeat <agent>
 * - liveness report <agent> [last N days]
 */

import { registerCommand, type CommandHandler } from '../command-registry';
import { getProtocolIdFromSession } from '../session-manager';
import {
  startHeartbeat,
  stopHeartbeat,
  getLivenessReport,
  listHeartbeatSchedules,
  formatLivenessReport,
} from '../../heartbeat/service';
import {
  extractAddress,
  parseProtocolId,
  parseInterval,
  parseHours,
} from '../parsers';
import type { ParsedCommand, CommandResult } from '../types';

/**
 * Parse start heartbeat command
 * Examples:
 *   start heartbeat 0xabc... every 15m
 *   enable heartbeat 0x123... every 1h
 *   heartbeat 0x456... interval 30m
 */
export function parseStartHeartbeatCommand(input: string): ParsedCommand {
  const agentAddress = extractAddress(input);
  const protocolId = parseProtocolId(input);
  const interval = parseInterval(input);

  return {
    name: 'start_heartbeat',
    args: {
      protocolId: protocolId ?? '',
      agentAddress: agentAddress ?? '',
      intervalMs: interval?.toString() ?? '',
    },
    rawInput: input,
  };
}

/**
 * Parse stop heartbeat command
 * Examples:
 *   stop heartbeat 0xabc...
 *   disable heartbeat 0x123...
 */
export function parseStopHeartbeatCommand(input: string): ParsedCommand {
  const agentAddress = extractAddress(input);
  const protocolId = parseProtocolId(input);

  return {
    name: 'stop_heartbeat',
    args: {
      protocolId: protocolId ?? '',
      agentAddress: agentAddress ?? '',
    },
    rawInput: input,
  };
}

/**
 * Parse liveness report command
 * Examples:
 *   liveness report 0xabc...
 *   liveness report 0x123... last 7 days
 *   health check 0x456...
 */
export function parseLivenessReportCommand(input: string): ParsedCommand {
  const agentAddress = extractAddress(input);
  const protocolId = parseProtocolId(input);
  const hours = parseHours(input);

  return {
    name: 'liveness_report',
    args: {
      protocolId: protocolId ?? '',
      agentAddress: agentAddress ?? '',
      hours: hours?.toString() ?? '',
    },
    rawInput: input,
  };
}

// ============================================================================
// Command Handlers
// ============================================================================

const handleStartHeartbeat: CommandHandler = async (cmd, sessionId) => {
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
      message: 'Protocol ID is required. Example: start heartbeat 0xagent... every 15m',
    };
  }

  const agentAddress = cmd.args.agentAddress;
  if (!agentAddress || !/^0x[a-fA-F0-9]{40}$/i.test(agentAddress)) {
    return {
      success: false,
      message: 'Valid agent address required. Example: start heartbeat 0xagent... every 15m',
    };
  }

  // Parse interval (default 15 minutes)
  const intervalMs = cmd.args.intervalMs ? parseInt(cmd.args.intervalMs) : 15 * 60 * 1000;

  try {
    const schedule = await startHeartbeat({
      protocolId,
      agentAddress,
      intervalMs,
    });

    const intervalMinutes = Math.round(schedule.intervalMs / 60000);
    const nextBeat = schedule.nextBeatAt?.toISOString().split('T')[1].slice(0, 8) ?? 'N/A';

    return {
      success: true,
      message: `Heartbeat monitoring started!\n\nAgent: ${agentAddress.slice(0, 10)}...\nInterval: ${intervalMinutes} minutes\nNext Check: ${nextBeat}\nSchedule ID: ${schedule.id.slice(0, 12)}...`,
      data: { scheduleId: schedule.id },
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to start heartbeat: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

const handleStopHeartbeat: CommandHandler = async (cmd, sessionId) => {
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
      message: 'Protocol ID is required. Example: stop heartbeat 0xagent...',
    };
  }

  const agentAddress = cmd.args.agentAddress;
  if (!agentAddress || !/^0x[a-fA-F0-9]{40}$/i.test(agentAddress)) {
    return {
      success: false,
      message: 'Valid agent address required. Example: stop heartbeat 0xagent...',
    };
  }

  try {
    await stopHeartbeat({
      protocolId,
      agentAddress,
    });

    return {
      success: true,
      message: `Heartbeat monitoring stopped for ${agentAddress.slice(0, 10)}...`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to stop heartbeat: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

const handleLivenessReport: CommandHandler = async (cmd, sessionId) => {
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
      message: 'Protocol ID is required. Example: liveness report 0xagent...',
    };
  }

  const agentAddress = cmd.args.agentAddress;

  // If no agent address, list all schedules for the protocol
  if (!agentAddress) {
    try {
      const schedules = await listHeartbeatSchedules(protocolId);

      if (schedules.length === 0) {
        return {
          success: true,
          message: 'No heartbeat schedules found for this protocol.',
        };
      }

      const lines = [`Heartbeat Schedules (${schedules.length}):`];

      for (const s of schedules) {
        const status = s.isActive ? 'ACTIVE' : 'STOPPED';
        const health = s.failureCount === 0 ? '' : ` (${s.failureCount} failures)`;
        const interval = Math.round(s.intervalMs / 60000);
        lines.push(
          `  [${status}] ${s.agentAddress.slice(0, 10)}... every ${interval}m${health}`
        );
      }

      return {
        success: true,
        message: lines.join('\n'),
        data: { count: schedules.length },
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to list schedules: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // Get report for specific agent
  if (!/^0x[a-fA-F0-9]{40}$/i.test(agentAddress)) {
    return {
      success: false,
      message: 'Invalid agent address format.',
    };
  }

  try {
    // Parse time window (default 7 days)
    const hours = cmd.args.hours ? parseInt(cmd.args.hours) : 7 * 24;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const report = await getLivenessReport({
      protocolId,
      agentAddress,
      since,
    });

    if (!report) {
      return {
        success: false,
        message: `No heartbeat schedule found for agent ${agentAddress.slice(0, 10)}...`,
      };
    }

    return {
      success: true,
      message: formatLivenessReport(report),
      data: { report },
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to get liveness report: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

// ============================================================================
// Register Commands
// ============================================================================

export function registerHeartbeatCommands(): void {
  registerCommand('start_heartbeat', handleStartHeartbeat, {
    requiresExpanded: true,
    requiresSession: false,
    category: 'heartbeat',
    description: 'Start liveness monitoring for an agent',
    examples: [
      'start heartbeat 0xagent... every 15m',
      'enable heartbeat 0xagent... every 1h',
    ],
  });

  registerCommand('stop_heartbeat', handleStopHeartbeat, {
    requiresExpanded: true,
    requiresSession: false,
    category: 'heartbeat',
    description: 'Stop liveness monitoring for an agent',
    examples: [
      'stop heartbeat 0xagent...',
    ],
  });

  registerCommand('liveness_report', handleLivenessReport, {
    requiresExpanded: true,
    requiresSession: false,
    category: 'heartbeat',
    description: 'View liveness report for an agent',
    examples: [
      'liveness report 0xagent...',
      'liveness report 0xagent... last 7 days',
    ],
  });
}
