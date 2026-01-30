/**
 * Aegis Agent - x402 Payment Integration
 *
 * Verifies x402 payment proofs and links payments to agent actions.
 * Tracks payment lifecycle: PENDING → CONFIRMED → EXECUTED.
 */

import { runAgentCycle } from '../index';
import { recordExecution } from '../identity/reputation';

type PrismaClient = any;
let prisma: PrismaClient | null = null;

function getPrisma(): PrismaClient {
  if (!prisma) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PrismaClient } = require('@prisma/client') as { PrismaClient: PrismaClient };
    prisma = new PrismaClient();
  }
  return prisma;
}

export interface X402PaymentProof {
  paymentHash: string;
  amount: string;
  currency: string;
  chainId: number;
  requestedAction?: string;
  requester?: string;
  /** Optional facilitator verification token */
  verificationToken?: string;
}

export interface VerifiedPayment {
  paymentHash: string;
  amount: bigint;
  currency: string;
  chainId: number;
  requestedAction: string;
  requester: string;
}

/**
 * Verify x402 payment proof (stub: validate structure; in production call facilitator verify API)
 */
export async function verifyX402Payment(proof: X402PaymentProof): Promise<VerifiedPayment | null> {
  if (!proof.paymentHash || !proof.amount || !proof.currency || !proof.chainId) {
    return null;
  }
  if (process.env.X402_FACILITATOR_URL && proof.verificationToken) {
    try {
      const res = await fetch(`${process.env.X402_FACILITATOR_URL}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${proof.verificationToken}` },
        body: JSON.stringify(proof),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { verified?: boolean; payment?: VerifiedPayment };
      if (data.verified && data.payment) return data.payment;
    } catch {
      return null;
    }
  }
  return {
    paymentHash: proof.paymentHash,
    amount: BigInt(proof.amount),
    currency: proof.currency,
    chainId: proof.chainId,
    requestedAction: proof.requestedAction ?? 'run_cycle',
    requester: proof.requester ?? '0x0000000000000000000000000000000000000000',
  };
}

/**
 * Create or update PaymentRecord in DB
 */
export async function upsertPaymentRecord(
  payment: VerifiedPayment,
  status: 'PENDING' | 'CONFIRMED' | 'EXECUTED' | 'REFUNDED',
  executionId?: string
): Promise<string> {
  const db = getPrisma();
  const existing = await db.paymentRecord.findUnique({ where: { paymentHash: payment.paymentHash } });
  if (existing) {
    await db.paymentRecord.update({
      where: { paymentHash: payment.paymentHash },
      data: { status, executionId: executionId ?? undefined },
    });
    return existing.id;
  }
  const created = await db.paymentRecord.create({
    data: {
      paymentHash: payment.paymentHash,
      amount: payment.amount,
      currency: payment.currency,
      chainId: payment.chainId,
      requestedAction: payment.requestedAction,
      requester: payment.requester,
      status,
      executionId,
    },
  });
  return created.id;
}

/**
 * Execute agent action for a verified x402 payment and record reputation
 */
export async function executePaidAction(
  paymentProof: X402PaymentProof,
  agentOnChainId?: string
): Promise<{ executionResult: unknown; reputationTxHash?: string; paymentId: string }> {
  const payment = await verifyX402Payment(paymentProof);
  if (!payment) {
    throw new Error('Invalid or unverifiable payment');
  }

  await upsertPaymentRecord(payment, 'CONFIRMED');

  const state = await runAgentCycle({
    confidenceThreshold: 0.75,
    maxTransactionValueUsd: 10000,
    executionMode: 'SIMULATION',
    eventData: { requestedAction: payment.requestedAction, requester: payment.requester },
  });

  const executionResult = state.executionResult as { success?: boolean; transactionHash?: string } | null;
  const success = executionResult?.success ?? false;

  if (agentOnChainId && executionResult) {
    const attestationId = await recordExecution(
      agentOnChainId,
      executionResult as { success: boolean; transactionHash?: string; error?: string; simulationResult?: unknown },
      payment.chainId,
      payment.requester
    );
    await upsertPaymentRecord(payment, 'EXECUTED', attestationId ?? undefined);
    return {
      executionResult: state,
      reputationTxHash: attestationId ?? undefined,
      paymentId: payment.paymentHash,
    };
  }

  await upsertPaymentRecord(payment, success ? 'EXECUTED' : 'PENDING');
  return { executionResult: state, paymentId: payment.paymentHash };
}
