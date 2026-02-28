/**
 * Budget Service
 *
 * Manages protocol budgets including top-ups, daily limits, and spending tracking.
 * Integrates with payment records for x402 and other payment methods.
 */

import { getPrisma } from '../db';
import { logger } from '../logger';

/**
 * Top-up parameters
 */
export interface TopupParams {
  protocolId: string;
  amountUSD: number;
  paymentMethod: 'x402' | 'manual' | 'credit_card' | 'crypto';
  paymentHash?: string;
  note?: string;
}

/**
 * Budget summary for a protocol
 */
export interface BudgetSummary {
  protocolId: string;
  balanceUSD: number;
  totalSpent: number;
  totalDeposited: number;
  sponsorshipCount: number;
  dailyBudget: number | null;
  spentToday: number;
  remainingToday: number | null;
  guaranteedAmount: number;
  availableBalance: number;
  runwayDays: number | null;
}

/**
 * Top up a protocol's budget
 *
 * For manual top-ups via OpenClaw, we create a DepositTransaction record
 * with a placeholder txHash. For real on-chain deposits, use the deposit-verify API.
 */
export async function topupProtocolBudget(
  params: TopupParams
): Promise<{ newBalance: number; depositId: string }> {
  const prisma = getPrisma();

  const protocol = await prisma.protocolSponsor.findUnique({
    where: { protocolId: params.protocolId },
  });

  if (!protocol) {
    throw new Error(`Protocol not found: ${params.protocolId}`);
  }

  if (params.amountUSD <= 0) {
    throw new Error('Top-up amount must be positive');
  }

  // Generate a unique identifier for manual top-ups
  const txHash = params.paymentHash ?? `manual-${params.protocolId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Create deposit record and update balance atomically
  const [deposit, updatedProtocol] = await prisma.$transaction([
    prisma.depositTransaction.create({
      data: {
        protocolId: params.protocolId,
        txHash,
        amount: params.amountUSD,
        tokenAmount: BigInt(Math.floor(params.amountUSD * 1_000_000)), // USDC has 6 decimals
        tokenSymbol: 'USDC',
        chainId: 8453, // Base mainnet
        confirmed: true,
        confirmedAt: new Date(),
        senderAddress: params.paymentMethod === 'manual' ? 'openclaw-admin' : `${params.paymentMethod}-deposit`,
      },
    }),
    prisma.protocolSponsor.update({
      where: { protocolId: params.protocolId },
      data: {
        balanceUSD: {
          increment: params.amountUSD,
        },
      },
    }),
  ]);

  logger.info('[BudgetService] Protocol topped up', {
    protocolId: params.protocolId,
    amount: params.amountUSD,
    newBalance: updatedProtocol.balanceUSD,
    depositId: deposit.id,
    method: params.paymentMethod,
  });

  return {
    newBalance: updatedProtocol.balanceUSD,
    depositId: deposit.id,
  };
}

/**
 * Set daily budget limit for a protocol
 */
export async function setDailyBudget(
  protocolId: string,
  dailyBudgetUSD: number
): Promise<void> {
  const prisma = getPrisma();

  if (dailyBudgetUSD < 0) {
    throw new Error('Daily budget cannot be negative');
  }

  const protocol = await prisma.protocolSponsor.findUnique({
    where: { protocolId },
  });

  if (!protocol) {
    throw new Error(`Protocol not found: ${protocolId}`);
  }

  // Store daily budget in policyConfig
  const currentConfig = (protocol.policyConfig as Record<string, unknown>) ?? {};
  const newConfig = {
    ...currentConfig,
    dailyBudgetUSD,
    dailyBudgetUpdatedAt: new Date().toISOString(),
  };

  await prisma.protocolSponsor.update({
    where: { protocolId },
    data: {
      policyConfig: newConfig,
    },
  });

  logger.info('[BudgetService] Daily budget set', {
    protocolId,
    dailyBudgetUSD,
  });
}

/**
 * Get daily budget for a protocol
 */
export async function getDailyBudget(protocolId: string): Promise<number | null> {
  const prisma = getPrisma();

  const protocol = await prisma.protocolSponsor.findUnique({
    where: { protocolId },
    select: { policyConfig: true },
  });

  if (!protocol) {
    throw new Error(`Protocol not found: ${protocolId}`);
  }

  const config = protocol.policyConfig as Record<string, unknown> | null;
  return config?.dailyBudgetUSD as number | null ?? null;
}

/**
 * Get spending for today
 */
export async function getSpendingToday(protocolId: string): Promise<number> {
  const prisma = getPrisma();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const result = await prisma.sponsorshipRecord.aggregate({
    where: {
      protocolId,
      createdAt: { gte: today },
    },
    _sum: { estimatedCostUSD: true },
  });

  return result._sum.estimatedCostUSD ?? 0;
}

/**
 * Get comprehensive budget summary
 */
export async function getBudgetSummary(protocolId: string): Promise<BudgetSummary> {
  const prisma = getPrisma();

  const protocol = await prisma.protocolSponsor.findUnique({
    where: { protocolId },
  });

  if (!protocol) {
    throw new Error(`Protocol not found: ${protocolId}`);
  }

  // Get total deposits
  const depositsResult = await prisma.depositTransaction.aggregate({
    where: {
      protocolId,
      confirmed: true,
    },
    _sum: { amount: true },
  });
  const totalDeposited = depositsResult._sum.amount ?? 0;

  // Get today's spending
  const spentToday = await getSpendingToday(protocolId);

  // Get daily budget from config
  const config = protocol.policyConfig as Record<string, unknown> | null;
  const dailyBudget = config?.dailyBudgetUSD as number | null ?? null;

  // Calculate remaining today
  const remainingToday = dailyBudget !== null ? Math.max(0, dailyBudget - spentToday) : null;

  // Calculate available balance (excluding guaranteed amounts)
  const availableBalance = Math.max(0, protocol.balanceUSD - protocol.totalGuaranteedUsd);

  // Calculate runway in days (based on recent spending average)
  let runwayDays: number | null = null;
  if (protocol.totalSpent > 0 && protocol.sponsorshipCount > 0) {
    // Get protocol age in days
    const ageInDays = Math.max(1, (Date.now() - protocol.createdAt.getTime()) / (1000 * 60 * 60 * 24));
    const dailyAverage = protocol.totalSpent / ageInDays;

    if (dailyAverage > 0) {
      runwayDays = Math.floor(availableBalance / dailyAverage);
    }
  }

  return {
    protocolId,
    balanceUSD: protocol.balanceUSD,
    totalSpent: protocol.totalSpent,
    totalDeposited,
    sponsorshipCount: protocol.sponsorshipCount,
    dailyBudget,
    spentToday,
    remainingToday,
    guaranteedAmount: protocol.totalGuaranteedUsd,
    availableBalance,
    runwayDays,
  };
}

/**
 * Check if protocol has sufficient budget for a transaction
 */
export async function checkBudgetAvailability(
  protocolId: string,
  amountUSD: number
): Promise<{ allowed: boolean; reason?: string }> {
  const summary = await getBudgetSummary(protocolId);

  // Check overall balance
  if (amountUSD > summary.availableBalance) {
    return {
      allowed: false,
      reason: `Insufficient balance: need $${amountUSD.toFixed(2)}, available $${summary.availableBalance.toFixed(2)}`,
    };
  }

  // Check daily budget if set
  if (summary.dailyBudget !== null && summary.remainingToday !== null) {
    if (amountUSD > summary.remainingToday) {
      return {
        allowed: false,
        reason: `Daily budget exceeded: need $${amountUSD.toFixed(2)}, remaining today $${summary.remainingToday.toFixed(2)}`,
      };
    }
  }

  return { allowed: true };
}

/**
 * Record spending (called after sponsorship execution)
 */
export async function recordSpending(
  protocolId: string,
  amountUSD: number
): Promise<void> {
  const prisma = getPrisma();

  await prisma.protocolSponsor.update({
    where: { protocolId },
    data: {
      balanceUSD: { decrement: amountUSD },
      totalSpent: { increment: amountUSD },
      sponsorshipCount: { increment: 1 },
    },
  });

  logger.debug('[BudgetService] Spending recorded', {
    protocolId,
    amountUSD,
  });
}

/**
 * Get recent deposit history
 */
export async function getDepositHistory(
  protocolId: string,
  limit: number = 20
): Promise<Array<{
  id: string;
  amount: number;
  tokenSymbol: string;
  txHash: string;
  confirmed: boolean;
  confirmedAt: Date | null;
  createdAt: Date;
}>> {
  const prisma = getPrisma();

  return prisma.depositTransaction.findMany({
    where: { protocolId },
    select: {
      id: true,
      amount: true,
      tokenSymbol: true,
      txHash: true,
      confirmed: true,
      confirmedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

/**
 * Format budget summary for display
 */
export function formatBudgetSummary(summary: BudgetSummary): string {
  const lines = [
    `Budget Summary: ${summary.protocolId}`,
    '',
    'Balance:',
    `  Current: $${summary.balanceUSD.toFixed(2)}`,
    `  Available: $${summary.availableBalance.toFixed(2)}`,
    `  Guaranteed: $${summary.guaranteedAmount.toFixed(2)}`,
    '',
    'Spending:',
    `  Total Spent: $${summary.totalSpent.toFixed(2)}`,
    `  Sponsorships: ${summary.sponsorshipCount}`,
    `  Today: $${summary.spentToday.toFixed(2)}`,
  ];

  if (summary.dailyBudget !== null) {
    lines.push(`  Daily Limit: $${summary.dailyBudget.toFixed(2)}`);
    lines.push(`  Remaining Today: $${summary.remainingToday?.toFixed(2) ?? 'N/A'}`);
  }

  lines.push('');
  lines.push('Deposits:');
  lines.push(`  Total Deposited: $${summary.totalDeposited.toFixed(2)}`);

  if (summary.runwayDays !== null) {
    lines.push('');
    lines.push(`Estimated Runway: ${summary.runwayDays} days`);
  }

  return lines.join('\n');
}
