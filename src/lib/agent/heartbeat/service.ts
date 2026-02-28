/**
 * Heartbeat Service
 *
 * Manages liveness monitoring schedules for agents.
 * Heartbeats verify that agents are responsive and can execute transactions.
 */

import { getPrisma } from '../../db';
import { logger } from '../../logger';
import { HEARTBEAT_ENABLED, HEARTBEAT_DEFAULT_INTERVAL_MS } from '../../config/feature-flags';

/**
 * Heartbeat schedule details
 */
export interface HeartbeatScheduleDetails {
  id: string;
  protocolId: string;
  agentAddress: string;
  intervalMs: number;
  isActive: boolean;
  lastBeatAt: Date | null;
  nextBeatAt: Date | null;
  failureCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Heartbeat record details
 */
export interface HeartbeatRecordDetails {
  id: string;
  scheduleId: string;
  txHash: string | null;
  success: boolean;
  latencyMs: number | null;
  errorMessage: string | null;
  createdAt: Date;
}

/**
 * Liveness report summary
 */
export interface LivenessReport {
  scheduleId: string;
  protocolId: string;
  agentAddress: string;
  isActive: boolean;
  lastBeatAt: Date | null;
  failureCount: number;
  totalBeats: number;
  successRate: number;
  avgLatencyMs: number | null;
  recentRecords: HeartbeatRecordDetails[];
}

/**
 * Start heartbeat monitoring for an agent
 */
export async function startHeartbeat(params: {
  protocolId: string;
  agentAddress: string;
  intervalMs?: number;
}): Promise<HeartbeatScheduleDetails> {
  if (!HEARTBEAT_ENABLED) {
    throw new Error('Heartbeat feature is disabled. Set HEARTBEAT_ENABLED=true to enable.');
  }

  const prisma = getPrisma();
  const agentAddress = params.agentAddress.toLowerCase();
  const intervalMs = params.intervalMs ?? HEARTBEAT_DEFAULT_INTERVAL_MS;

  // Validate interval (minimum 1 minute, maximum 24 hours)
  if (intervalMs < 60000 || intervalMs > 86400000) {
    throw new Error('Interval must be between 1 minute and 24 hours');
  }

  // Check if schedule already exists
  const existing = await prisma.heartbeatSchedule.findUnique({
    where: {
      protocolId_agentAddress: {
        protocolId: params.protocolId,
        agentAddress,
      },
    },
  });

  const now = new Date();
  const nextBeatAt = new Date(now.getTime() + intervalMs);

  if (existing) {
    // Reactivate existing schedule
    const updated = await prisma.heartbeatSchedule.update({
      where: { id: existing.id },
      data: {
        isActive: true,
        intervalMs,
        nextBeatAt,
        failureCount: 0,
      },
    });

    logger.info('[Heartbeat] Reactivated schedule', {
      scheduleId: updated.id,
      protocolId: params.protocolId,
      agentAddress,
      intervalMs,
    });

    return updated;
  }

  // Create new schedule
  const schedule = await prisma.heartbeatSchedule.create({
    data: {
      protocolId: params.protocolId,
      agentAddress,
      intervalMs,
      isActive: true,
      nextBeatAt,
    },
  });

  logger.info('[Heartbeat] Started new schedule', {
    scheduleId: schedule.id,
    protocolId: params.protocolId,
    agentAddress,
    intervalMs,
  });

  return schedule;
}

/**
 * Stop heartbeat monitoring for an agent
 */
export async function stopHeartbeat(params: {
  protocolId: string;
  agentAddress: string;
}): Promise<void> {
  const prisma = getPrisma();
  const agentAddress = params.agentAddress.toLowerCase();

  const schedule = await prisma.heartbeatSchedule.findUnique({
    where: {
      protocolId_agentAddress: {
        protocolId: params.protocolId,
        agentAddress,
      },
    },
  });

  if (!schedule) {
    throw new Error(`No heartbeat schedule found for agent ${agentAddress}`);
  }

  if (!schedule.isActive) {
    // Already stopped
    return;
  }

  await prisma.heartbeatSchedule.update({
    where: { id: schedule.id },
    data: {
      isActive: false,
      nextBeatAt: null,
    },
  });

  logger.info('[Heartbeat] Stopped schedule', {
    scheduleId: schedule.id,
    protocolId: params.protocolId,
    agentAddress,
  });
}

/**
 * Record a heartbeat result
 */
export async function recordHeartbeat(params: {
  scheduleId: string;
  success: boolean;
  txHash?: string;
  latencyMs?: number;
  errorMessage?: string;
}): Promise<HeartbeatRecordDetails> {
  const prisma = getPrisma();

  const schedule = await prisma.heartbeatSchedule.findUnique({
    where: { id: params.scheduleId },
  });

  if (!schedule) {
    throw new Error(`Schedule not found: ${params.scheduleId}`);
  }

  const now = new Date();

  // Create record and update schedule atomically
  const [record] = await prisma.$transaction([
    prisma.heartbeatRecord.create({
      data: {
        scheduleId: params.scheduleId,
        success: params.success,
        txHash: params.txHash,
        latencyMs: params.latencyMs,
        errorMessage: params.errorMessage,
      },
    }),
    prisma.heartbeatSchedule.update({
      where: { id: params.scheduleId },
      data: {
        lastBeatAt: now,
        nextBeatAt: schedule.isActive
          ? new Date(now.getTime() + schedule.intervalMs)
          : null,
        failureCount: params.success ? 0 : schedule.failureCount + 1,
      },
    }),
  ]);

  logger.debug('[Heartbeat] Recorded beat', {
    scheduleId: params.scheduleId,
    success: params.success,
    latencyMs: params.latencyMs,
  });

  return record;
}

/**
 * Get liveness report for an agent
 */
export async function getLivenessReport(params: {
  protocolId: string;
  agentAddress: string;
  since?: Date;
}): Promise<LivenessReport | null> {
  const prisma = getPrisma();
  const agentAddress = params.agentAddress.toLowerCase();
  const since = params.since ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Default 7 days

  const schedule = await prisma.heartbeatSchedule.findUnique({
    where: {
      protocolId_agentAddress: {
        protocolId: params.protocolId,
        agentAddress,
      },
    },
    include: {
      records: {
        where: {
          createdAt: { gte: since },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      },
    },
  });

  if (!schedule) {
    return null;
  }

  // Calculate statistics
  const totalBeats = schedule.records.length;
  const successfulBeats = schedule.records.filter((r) => r.success).length;
  const successRate = totalBeats > 0 ? (successfulBeats / totalBeats) * 100 : 100;

  const latencies = schedule.records
    .filter((r) => r.latencyMs !== null)
    .map((r) => r.latencyMs as number);
  const avgLatencyMs = latencies.length > 0
    ? latencies.reduce((a, b) => a + b, 0) / latencies.length
    : null;

  return {
    scheduleId: schedule.id,
    protocolId: schedule.protocolId,
    agentAddress: schedule.agentAddress,
    isActive: schedule.isActive,
    lastBeatAt: schedule.lastBeatAt,
    failureCount: schedule.failureCount,
    totalBeats,
    successRate,
    avgLatencyMs,
    recentRecords: schedule.records,
  };
}

/**
 * List heartbeat schedules for a protocol
 */
export async function listHeartbeatSchedules(
  protocolId: string,
  options?: { activeOnly?: boolean }
): Promise<HeartbeatScheduleDetails[]> {
  const prisma = getPrisma();

  const where: Record<string, unknown> = { protocolId };
  if (options?.activeOnly) {
    where.isActive = true;
  }

  return prisma.heartbeatSchedule.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Get schedules due for heartbeat check
 */
export async function getDueHeartbeats(): Promise<HeartbeatScheduleDetails[]> {
  const prisma = getPrisma();
  const now = new Date();

  return prisma.heartbeatSchedule.findMany({
    where: {
      isActive: true,
      nextBeatAt: { lte: now },
    },
    orderBy: { nextBeatAt: 'asc' },
  });
}

/**
 * Format liveness report for display
 */
export function formatLivenessReport(report: LivenessReport): string {
  const status = report.isActive ? 'ACTIVE' : 'STOPPED';
  const health = report.failureCount === 0 ? 'HEALTHY' :
                 report.failureCount < 3 ? 'WARNING' : 'CRITICAL';

  const lines = [
    `Liveness Report: ${report.agentAddress.slice(0, 10)}...`,
    '',
    `Protocol: ${report.protocolId}`,
    `Status: ${status}`,
    `Health: ${health}`,
    '',
    'Statistics:',
    `  Total Beats: ${report.totalBeats}`,
    `  Success Rate: ${report.successRate.toFixed(1)}%`,
    `  Avg Latency: ${report.avgLatencyMs !== null ? `${report.avgLatencyMs.toFixed(0)}ms` : 'N/A'}`,
    `  Consecutive Failures: ${report.failureCount}`,
    '',
    `Last Beat: ${report.lastBeatAt?.toISOString() ?? 'Never'}`,
  ];

  if (report.recentRecords.length > 0) {
    lines.push('');
    lines.push('Recent Heartbeats:');
    for (const r of report.recentRecords.slice(0, 5)) {
      const status = r.success ? 'OK' : 'FAIL';
      const time = r.createdAt.toISOString().split('T')[1].slice(0, 8);
      const latency = r.latencyMs !== null ? `${r.latencyMs}ms` : '-';
      lines.push(`  [${status}] ${time} ${latency}`);
    }
  }

  return lines.join('\n');
}
