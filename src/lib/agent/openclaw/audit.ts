/**
 * OpenClaw Audit Middleware
 *
 * Logs all OpenClaw commands to the database for security, compliance, and debugging.
 * Every command execution is recorded with:
 * - Session and protocol context
 * - Command details (name, args, raw input)
 * - Execution result (success/failure, error message)
 * - Performance metrics (execution time)
 */

import { getPrisma } from '../../db';
import { logger } from '../../logger';
import { createHash } from 'crypto';
import type { ParsedCommand, CommandResult } from './types';

/**
 * Audit entry for OpenClaw command
 */
export interface AuditEntry {
  sessionId: string;
  protocolId: string;
  userPhoneHash?: string;
  commandName: string;
  commandArgs: Record<string, string>;
  rawInput: string;
  confidence: number;
  success: boolean;
  errorMessage?: string;
  executionMs: number;
}

/**
 * Hash a phone number for privacy-compliant audit logging
 * Uses SHA-256 with a salt prefix
 */
export function hashPhoneNumber(phoneNumber: string): string {
  const salt = 'openclaw-audit-v1:';
  return createHash('sha256')
    .update(salt + phoneNumber)
    .digest('hex')
    .substring(0, 32); // Truncate for readability
}

/**
 * Record an OpenClaw command execution to the audit log
 */
export async function auditCommand(entry: AuditEntry): Promise<void> {
  const prisma = getPrisma();

  try {
    await prisma.openClawAudit.create({
      data: {
        sessionId: entry.sessionId,
        protocolId: entry.protocolId,
        userPhoneHash: entry.userPhoneHash,
        commandName: entry.commandName,
        commandArgs: entry.commandArgs,
        rawInput: entry.rawInput,
        confidence: entry.confidence,
        success: entry.success,
        errorMessage: entry.errorMessage,
        executionMs: entry.executionMs,
      },
    });

    logger.debug('[Audit] Command logged', {
      sessionId: entry.sessionId,
      commandName: entry.commandName,
      success: entry.success,
      executionMs: entry.executionMs,
    });
  } catch (error) {
    // Don't let audit failures break command execution
    logger.error('[Audit] Failed to log command', {
      error: error instanceof Error ? error.message : String(error),
      sessionId: entry.sessionId,
      commandName: entry.commandName,
    });
  }
}

/**
 * Wrapper to execute a command with automatic audit logging
 */
export async function executeWithAudit(
  cmd: ParsedCommand,
  sessionId: string,
  protocolId: string,
  executor: () => Promise<CommandResult>,
  options: {
    userPhoneHash?: string;
    confidence?: number;
  } = {}
): Promise<CommandResult> {
  const startTime = Date.now();
  let result: CommandResult;

  try {
    result = await executor();
  } catch (error) {
    result = {
      success: false,
      message: `Command execution error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const executionMs = Date.now() - startTime;

  // Log to audit trail
  await auditCommand({
    sessionId,
    protocolId,
    userPhoneHash: options.userPhoneHash,
    commandName: cmd.name,
    commandArgs: cmd.args,
    rawInput: cmd.rawInput,
    confidence: options.confidence ?? 1.0,
    success: result.success,
    errorMessage: result.success ? undefined : result.message,
    executionMs,
  });

  return result;
}

/**
 * Query audit log entries
 */
export async function getAuditLog(params: {
  protocolId?: string;
  sessionId?: string;
  commandName?: string;
  since?: Date;
  limit?: number;
}): Promise<Array<{
  id: string;
  sessionId: string;
  protocolId: string;
  commandName: string;
  success: boolean;
  executionMs: number;
  createdAt: Date;
}>> {
  const prisma = getPrisma();

  const where: Record<string, unknown> = {};

  if (params.protocolId) {
    where.protocolId = params.protocolId;
  }

  if (params.sessionId) {
    where.sessionId = params.sessionId;
  }

  if (params.commandName) {
    where.commandName = params.commandName;
  }

  if (params.since) {
    where.createdAt = { gte: params.since };
  }

  const entries = await prisma.openClawAudit.findMany({
    where,
    select: {
      id: true,
      sessionId: true,
      protocolId: true,
      commandName: true,
      success: true,
      executionMs: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: params.limit ?? 100,
  });

  return entries;
}

/**
 * Get detailed audit entry
 */
export async function getAuditEntry(id: string): Promise<{
  id: string;
  sessionId: string;
  protocolId: string;
  userPhoneHash: string | null;
  commandName: string;
  commandArgs: unknown;
  rawInput: string;
  confidence: number;
  success: boolean;
  errorMessage: string | null;
  executionMs: number;
  createdAt: Date;
} | null> {
  const prisma = getPrisma();

  return prisma.openClawAudit.findUnique({
    where: { id },
  });
}

/**
 * Get audit statistics for a protocol
 */
export async function getAuditStats(
  protocolId: string,
  since?: Date
): Promise<{
  totalCommands: number;
  successCount: number;
  failureCount: number;
  avgExecutionMs: number;
  topCommands: Array<{ command: string; count: number }>;
}> {
  const prisma = getPrisma();

  const where: Record<string, unknown> = { protocolId };
  if (since) {
    where.createdAt = { gte: since };
  }

  // Get counts
  const [total, successCount] = await Promise.all([
    prisma.openClawAudit.count({ where }),
    prisma.openClawAudit.count({ where: { ...where, success: true } }),
  ]);

  // Get average execution time
  const avgResult = await prisma.openClawAudit.aggregate({
    where,
    _avg: { executionMs: true },
  });

  // Get top commands
  const topCommands = await prisma.openClawAudit.groupBy({
    by: ['commandName'],
    where,
    _count: true,
    orderBy: { _count: { commandName: 'desc' } },
    take: 10,
  });

  return {
    totalCommands: total,
    successCount,
    failureCount: total - successCount,
    avgExecutionMs: avgResult._avg.executionMs ?? 0,
    topCommands: topCommands.map(c => ({
      command: c.commandName,
      count: c._count,
    })),
  };
}

/**
 * Format audit log for display
 */
export function formatAuditLog(
  entries: Array<{
    id: string;
    sessionId: string;
    protocolId: string;
    commandName: string;
    success: boolean;
    executionMs: number;
    createdAt: Date;
  }>
): string {
  if (entries.length === 0) {
    return 'No audit entries found.';
  }

  const lines: string[] = ['Audit Log:', ''];

  for (const entry of entries) {
    const status = entry.success ? 'OK' : 'FAIL';
    const time = entry.createdAt.toISOString().replace('T', ' ').substring(0, 19);
    lines.push(`[${time}] ${status} ${entry.commandName} (${entry.executionMs}ms)`);
  }

  return lines.join('\n');
}

/**
 * Format audit stats for display
 */
export function formatAuditStats(stats: {
  totalCommands: number;
  successCount: number;
  failureCount: number;
  avgExecutionMs: number;
  topCommands: Array<{ command: string; count: number }>;
}): string {
  const successRate = stats.totalCommands > 0
    ? ((stats.successCount / stats.totalCommands) * 100).toFixed(1)
    : '0.0';

  const lines: string[] = [
    'Audit Statistics:',
    '',
    `Total Commands: ${stats.totalCommands}`,
    `Success Rate: ${successRate}%`,
    `Avg Execution: ${stats.avgExecutionMs.toFixed(0)}ms`,
    '',
    'Top Commands:',
  ];

  for (const cmd of stats.topCommands.slice(0, 5)) {
    lines.push(`  ${cmd.command}: ${cmd.count}`);
  }

  return lines.join('\n');
}
