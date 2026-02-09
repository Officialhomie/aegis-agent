/**
 * Aegis Agent - x402 Coinbase CDP Facilitator Adapter
 *
 * When X402_FACILITATOR_URL points to CDP (api.cdp.coinbase.com), verifies payments
 * via CDP's x402 verify API using JWT auth. Maps our proof shape to CDP request/response.
 */

import { generateJwt } from '@coinbase/cdp-sdk/auth';
import type { X402PaymentProof, VerifiedPayment } from './x402';

const CDP_X402_VERIFY_PATH = '/platform/v2/x402/verify';
const CDP_API_HOST = 'api.cdp.coinbase.com';

/** Chain ID to CDP network name */
const CHAIN_TO_NETWORK: Record<number, string> = {
  8453: 'base',
  84532: 'base-sepolia',
};

/**
 * Check if the configured facilitator is Coinbase CDP.
 */
export function isCdpFacilitator(): boolean {
  const url = process.env.X402_FACILITATOR_URL ?? '';
  return url.includes('api.cdp.coinbase.com');
}

/**
 * Proof is usable with CDP when it includes the raw CDP payment payload (client sends x402 X-PAYMENT format).
 * CDP paymentPayload has x402Version, scheme, network, payload (signature + authorization).
 */
export function hasCdpPayload(proof: X402PaymentProof): boolean {
  const p = proof as X402PaymentProof & { cdpPaymentPayload?: unknown };
  if (!p.cdpPaymentPayload || typeof p.cdpPaymentPayload !== 'object') return false;
  const pl = p.cdpPaymentPayload as Record<string, unknown>;
  return 'x402Version' in pl && 'scheme' in pl && 'network' in pl && 'payload' in pl;
}

/**
 * Generate a CDP JWT for the x402 verify request.
 */
async function getCdpJwt(): Promise<string> {
  const apiKeyId = process.env.CDP_API_KEY_NAME ?? process.env.API_KEY_ID;
  const apiKeySecret = process.env.CDP_API_KEY_PRIVATE_KEY ?? process.env.API_KEY_SECRET;
  if (!apiKeyId || !apiKeySecret) {
    throw new Error(
      'CDP x402 adapter requires CDP_API_KEY_NAME and CDP_API_KEY_PRIVATE_KEY for JWT auth'
    );
  }
  return generateJwt({
    apiKeyId,
    apiKeySecret,
    requestMethod: 'POST',
    requestHost: CDP_API_HOST,
    requestPath: CDP_X402_VERIFY_PATH,
    expiresIn: 120,
  });
}

/**
 * Convert proof amount to atomic units (USDC = 6 decimals). If already looks atomic (no decimal), use as-is.
 */
function toAtomicAmount(amount: string, currency: string): string {
  const amountStr = amount.trim();
  if (/^\d+$/.test(amountStr)) return amountStr;
  const num = parseFloat(amountStr);
  if (Number.isNaN(num)) return '0';
  const decimals = currency.toUpperCase() === 'USDC' ? 6 : 18;
  return String(Math.floor(num * 10 ** decimals));
}

/**
 * Build CDP v1 payment requirements from our proof and env.
 */
function buildPaymentRequirements(proof: X402PaymentProof): {
  scheme: 'exact';
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
} {
  const network = CHAIN_TO_NETWORK[proof.chainId] ?? 'base';
  const payTo = process.env.AGENT_WALLET_ADDRESS ?? '';
  const asset =
    proof.chainId === 8453
      ? process.env.USDC_ADDRESS_BASE_MAINNET ?? '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
      : process.env.USDC_ADDRESS ?? '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
  const resource =
    process.env.AEGIS_DASHBOARD_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://aegis.example.com';
  return {
    scheme: 'exact',
    network,
    maxAmountRequired: toAtomicAmount(proof.amount, proof.currency),
    resource,
    description: proof.requestedAction ?? 'Aegis agent action',
    mimeType: 'application/json',
    payTo,
    maxTimeoutSeconds: 60,
    asset,
  };
}

/**
 * Build the CDP verify request body. Expects proof to contain cdpPaymentPayload (client-sent x402 payload: x402Version, scheme, network, payload).
 */
function buildCdpVerifyBody(proof: X402PaymentProof): {
  x402Version: 1;
  paymentPayload: unknown;
  paymentRequirements: ReturnType<typeof buildPaymentRequirements>;
} {
  const p = proof as X402PaymentProof & { cdpPaymentPayload?: unknown };
  const paymentPayload = p.cdpPaymentPayload;
  if (!paymentPayload || typeof paymentPayload !== 'object') {
    throw new Error(
      'CDP x402 verify requires proof.cdpPaymentPayload (client must send full x402 payment payload in X-PAYMENT header)'
    );
  }
  return {
    x402Version: 1,
    paymentPayload,
    paymentRequirements: buildPaymentRequirements(proof),
  };
}

/** CDP verify API response shape */
interface CdpVerifyResponse {
  isValid: boolean;
  payer?: string;
  invalidReason?: string;
}

/**
 * Verify x402 payment via Coinbase CDP facilitator.
 * Proof must include cdpPaymentPayload (the raw CDP payment payload from the client).
 */
export async function verifyX402PaymentViaCdp(proof: X402PaymentProof): Promise<VerifiedPayment> {
  const jwt = await getCdpJwt();
  const body = buildCdpVerifyBody(proof);
  const url = `https://${CDP_API_HOST}${CDP_X402_VERIFY_PATH}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CDP x402 verify failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as CdpVerifyResponse;
  if (!data.isValid || !data.payer) {
    throw new Error(
      `Payment verification rejected by CDP: ${data.invalidReason ?? 'invalid'}`
    );
  }

  const amountBigInt = BigInt(toAtomicAmount(proof.amount, proof.currency));
  return {
    paymentHash: proof.paymentHash,
    amount: amountBigInt,
    currency: proof.currency,
    chainId: proof.chainId,
    requestedAction: proof.requestedAction ?? 'agent-action',
    requester: data.payer,
  };
}
