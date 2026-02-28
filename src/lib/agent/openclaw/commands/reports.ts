/**
 * OpenClaw Report Commands
 *
 * Commands for reports and audit logs:
 * - export sponsorships <protocol> since <date> format <csv|json>
 * - audit log <protocol> last <N>h
 * - generate report <protocol> summary
 */

import { registerCommand, type CommandHandler } from '../command-registry';
import { getProtocolIdFromSession } from '../session-manager';
import {
  getAuditLog,
  getAuditStats,
  formatAuditLog,
  formatAuditStats,
} from '../audit';
import { getPrisma } from '../../../db';
import {
  parseProtocolId,
  parseDate,
  parseFormat,
  parseHours,
} from '../parsers';
import type { ParsedCommand, CommandResult } from '../types';

/**
 * Parse export sponsorships command
 * Examples:
 *   export sponsorships uniswap-v4 since 2026-02-01 format csv
 *   export sponsorships since 2026-01-01 json
 */
export function parseExportSponsorshipsCommand(input: string): ParsedCommand {
  const protocolId = parseProtocolId(input);
  const since = parseDate(input);
  const format = parseFormat(input);

  return {
    name: 'export_sponsorships',
    args: {
      protocolId: protocolId ?? '',
      since: since?.toISOString() ?? '',
      format: format ?? 'json',
    },
    rawInput: input,
  };
}

/**
 * Parse audit log command
 * Examples:
 *   audit log uniswap-v4 last 24h
 *   audit log last 48 hours
 */
export function parseAuditLogCommand(input: string): ParsedCommand {
  const protocolId = parseProtocolId(input);
  const hours = parseHours(input);

  // Parse command name filter
  const cmdMatch = input.match(/command\s+(\w+)/i);
  const commandName = cmdMatch ? cmdMatch[1] : undefined;

  return {
    name: 'audit_log',
    args: {
      protocolId: protocolId ?? '',
      hours: hours?.toString() ?? '24',
      commandName: commandName ?? '',
    },
    rawInput: input,
  };
}

/**
 * Parse generate report command
 * Examples:
 *   generate report uniswap-v4 summary
 *   report summary
 */
export function parseGenerateReportCommand(input: string): ParsedCommand {
  const protocolId = parseProtocolId(input);

  // Determine report type
  const isSummary = /summary|overview/i.test(input);
  const isSpending = /spending|budget|financial/i.test(input);
  const isActivity = /activity|usage/i.test(input);

  const reportType = isSummary ? 'summary' : isSpending ? 'spending' : isActivity ? 'activity' : 'summary';

  return {
    name: 'generate_report',
    args: {
      protocolId: protocolId ?? '',
      reportType,
    },
    rawInput: input,
  };
}

// ============================================================================
// Report Generator Helpers
// ============================================================================

async function generateSummaryReport(protocolId: string): Promise<string> {
  const prisma = getPrisma();

  // Get protocol details
  const protocol = await prisma.protocolSponsor.findUnique({
    where: { protocolId },
    include: {
      _count: {
        select: {
          approvedAgents: { where: { isActive: true } },
          guarantees: { where: { status: 'ACTIVE' } },
        },
      },
    },
  });

  if (!protocol) {
    throw new Error(`Protocol not found: ${protocolId}`);
  }

  // Get recent sponsorships
  const recentSponsorships = await prisma.sponsorshipRecord.aggregate({
    where: {
      protocolId,
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
    _count: true,
    _sum: { estimatedCostUSD: true },
  });

  // Get audit stats
  const auditStats = await getAuditStats(
    protocolId,
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  );

  const lines = [
    '=================================',
    `Protocol Summary: ${protocol.name}`,
    '=================================',
    '',
    'Status:',
    `  Onboarding: ${protocol.onboardingStatus}`,
    `  CDP Status: ${protocol.cdpAllowlistStatus}`,
    `  Service Tier: ${protocol.tier.toUpperCase()}`,
    '',
    'Financials:',
    `  Balance: $${protocol.balanceUSD.toFixed(2)}`,
    `  Total Spent: $${protocol.totalSpent.toFixed(2)}`,
    `  Guaranteed: $${protocol.totalGuaranteedUsd.toFixed(2)}`,
    `  Reserve: $${protocol.guaranteeReserveUsd.toFixed(2)}`,
    '',
    'Active Resources:',
    `  Approved Agents: ${protocol._count.approvedAgents}`,
    `  Active Guarantees: ${protocol._count.guarantees}`,
    '',
    'Last 7 Days:',
    `  Sponsorships: ${recentSponsorships._count}`,
    `  Spent: $${(recentSponsorships._sum.estimatedCostUSD ?? 0).toFixed(2)}`,
    `  OpenClaw Commands: ${auditStats.totalCommands}`,
    `  Command Success Rate: ${((auditStats.successCount / Math.max(1, auditStats.totalCommands)) * 100).toFixed(1)}%`,
    '',
    'Policy:',
    `  Min Agent Tier: ${protocol.minAgentTier}`,
    `  Require ERC-8004: ${protocol.requireERC8004}`,
    `  Require ERC-4337: ${protocol.requireERC4337}`,
    '',
    `Report Generated: ${new Date().toISOString()}`,
    '=================================',
  ];

  return lines.join('\n');
}

async function exportSponsorshipsData(
  protocolId: string,
  since: Date,
  format: 'json' | 'csv'
): Promise<{ data: string; count: number }> {
  const prisma = getPrisma();

  const sponsorships = await prisma.sponsorshipRecord.findMany({
    where: {
      protocolId,
      createdAt: { gte: since },
    },
    select: {
      id: true,
      userAddress: true,
      decisionHash: true,
      txHash: true,
      estimatedCostUSD: true,
      actualCostUSD: true,
      agentTier: true,
      agentType: true,
      isERC8004: true,
      isERC4337: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 1000,
  });

  if (format === 'csv') {
    const headers = ['id', 'userAddress', 'decisionHash', 'txHash', 'estimatedCostUSD', 'actualCostUSD', 'agentTier', 'agentType', 'isERC8004', 'isERC4337', 'createdAt'];
    const rows = sponsorships.map((s) => [
      s.id,
      s.userAddress,
      s.decisionHash ?? '',
      s.txHash ?? '',
      s.estimatedCostUSD?.toFixed(4) ?? '',
      s.actualCostUSD?.toFixed(4) ?? '',
      s.agentTier?.toString() ?? '',
      s.agentType ?? '',
      s.isERC8004 ? 'true' : 'false',
      s.isERC4337 ? 'true' : 'false',
      s.createdAt.toISOString(),
    ].join(','));

    return {
      data: [headers.join(','), ...rows].join('\n'),
      count: sponsorships.length,
    };
  }

  // JSON format
  return {
    data: JSON.stringify(sponsorships, null, 2),
    count: sponsorships.length,
  };
}

// ============================================================================
// Command Handlers
// ============================================================================

const handleExportSponsorships: CommandHandler = async (cmd, sessionId) => {
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
      message: 'Protocol ID is required. Example: export sponsorships my-protocol since 2026-02-01',
    };
  }

  // Parse since date (default 30 days ago)
  const since = cmd.args.since
    ? new Date(cmd.args.since)
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const format = (cmd.args.format as 'json' | 'csv') || 'json';

  try {
    const result = await exportSponsorshipsData(protocolId, since, format);

    // For large exports, just provide summary
    if (result.count > 50) {
      return {
        success: true,
        message: `Exported ${result.count} sponsorships since ${since.toISOString().split('T')[0]}.\n\nFormat: ${format.toUpperCase()}\n\nNote: Data is too large to display. Use the API endpoint for full export:\nGET /api/v1/protocol/${protocolId}/sponsorships?since=${since.toISOString()}&format=${format}`,
        data: { count: result.count, format, since: since.toISOString() },
      };
    }

    return {
      success: true,
      message: `Sponsorships Export (${result.count} records):\n\n${result.data}`,
      data: { count: result.count, format },
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to export sponsorships: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

const handleAuditLog: CommandHandler = async (cmd, sessionId) => {
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
      message: 'Protocol ID is required. Example: audit log my-protocol last 24h',
    };
  }

  const hours = cmd.args.hours ? parseInt(cmd.args.hours) : 24;
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  try {
    const entries = await getAuditLog({
      protocolId,
      commandName: cmd.args.commandName || undefined,
      since,
      limit: 50,
    });

    if (entries.length === 0) {
      return {
        success: true,
        message: `No audit entries found for ${protocolId} in the last ${hours} hours.`,
      };
    }

    return {
      success: true,
      message: formatAuditLog(entries),
      data: { count: entries.length },
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to get audit log: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

const handleGenerateReport: CommandHandler = async (cmd, sessionId) => {
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
      message: 'Protocol ID is required. Example: generate report my-protocol summary',
    };
  }

  const reportType = cmd.args.reportType || 'summary';

  try {
    let report: string;

    switch (reportType) {
      case 'summary':
        report = await generateSummaryReport(protocolId);
        break;
      case 'spending':
        // Get audit stats for spending report
        const stats = await getAuditStats(protocolId);
        report = formatAuditStats(stats);
        break;
      case 'activity':
        const auditEntries = await getAuditLog({ protocolId, limit: 20 });
        report = formatAuditLog(auditEntries);
        break;
      default:
        report = await generateSummaryReport(protocolId);
    }

    return {
      success: true,
      message: report,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to generate report: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

// ============================================================================
// Register Commands
// ============================================================================

export function registerReportCommands(): void {
  registerCommand('export_sponsorships', handleExportSponsorships, {
    requiresExpanded: true,
    requiresSession: false,
    category: 'report',
    description: 'Export sponsorship data',
    examples: [
      'export sponsorships uniswap-v4 since 2026-02-01 format csv',
      'export sponsorships since 2026-01-01',
    ],
  });

  registerCommand('audit_log', handleAuditLog, {
    requiresExpanded: true,
    requiresSession: false,
    category: 'report',
    description: 'View OpenClaw audit log',
    examples: [
      'audit log uniswap-v4 last 24h',
      'audit log last 48 hours',
    ],
  });

  registerCommand('generate_report', handleGenerateReport, {
    requiresExpanded: true,
    requiresSession: false,
    category: 'report',
    description: 'Generate protocol summary report',
    examples: [
      'generate report uniswap-v4 summary',
      'report summary',
    ],
  });
}
