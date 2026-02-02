/**
 * Aegis Agent - x402 Request Parsing Middleware
 *
 * Parses X-PAYWITH-402 and PAYMENT-SIGNATURE headers from incoming requests.
 * Use with verifyX402Payment() for full verification via facilitator.
 */

import type { X402PaymentProof, VerifiedPayment } from './x402';
import { verifyX402Payment } from './x402';

const X402_HEADER_NAMES = ['X-PAYWITH-402', 'PAYMENT-SIGNATURE', 'x-paywith-402', 'payment-signature'];

function tryParseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function tryParseBase64<T>(raw: string): T | null {
  try {
    const decoded = Buffer.from(raw, 'base64').toString('utf-8');
    return tryParseJson<T>(decoded);
  } catch {
    return null;
  }
}

function isValidProof(p: unknown): p is X402PaymentProof {
  if (!p || typeof p !== 'object') return false;
  const obj = p as Record<string, unknown>;
  return (
    typeof obj.paymentHash === 'string' &&
    typeof obj.amount === 'string' &&
    typeof obj.currency === 'string' &&
    typeof obj.chainId === 'number'
  );
}

/**
 * Parse x402 payment proof from request headers.
 * Checks X-PAYWITH-402 and PAYMENT-SIGNATURE (both raw JSON and Base64-encoded).
 * Returns null if no valid proof found.
 */
export function parseX402Headers(request: Request): X402PaymentProof | null {
  for (const headerName of X402_HEADER_NAMES) {
    const value = request.headers.get(headerName);
    if (!value?.trim()) continue;

    const trimmed = value.trim();

    // Try raw JSON first, then Base64-encoded
    let parsed = tryParseJson<unknown>(trimmed);
    if (!parsed) parsed = tryParseBase64<unknown>(trimmed);

    if (parsed && isValidProof(parsed)) {
      return parsed as X402PaymentProof;
    }
  }
  return null;
}

export interface RequirePaymentResult {
  verified: boolean;
  payment?: VerifiedPayment;
  error?: string;
}

/**
 * Require payment for a request: parse header, verify via facilitator.
 * Use when an endpoint requires x402 payment before processing.
 */
export async function requirePayment(
  request: Request,
  requiredAmount?: string,
  currency?: string
): Promise<RequirePaymentResult> {
  const proof = parseX402Headers(request);
  if (!proof) {
    return {
      verified: false,
      error: 'Missing or invalid X-PAYWITH-402 / PAYMENT-SIGNATURE header',
    };
  }

  try {
    const payment = await verifyX402Payment(proof);

    if (requiredAmount != null && BigInt(proof.amount) < BigInt(requiredAmount)) {
      return {
        verified: false,
        payment,
        error: `Insufficient payment: required ${requiredAmount} ${currency ?? ''}, got ${proof.amount}`,
      };
    }
    if (currency != null && payment.currency !== currency) {
      return {
        verified: false,
        payment,
        error: `Currency mismatch: required ${currency}, got ${payment.currency}`,
      };
    }

    return { verified: true, payment };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      verified: false,
      error: `Payment verification failed: ${msg}`,
    };
  }
}
