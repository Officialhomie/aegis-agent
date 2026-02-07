/**
 * Aegis Agent - Request Signature Verification
 *
 * Verifies EIP-712 typed signatures for sponsorship requests.
 * Ensures requests are authentically signed by the requesting agent.
 */

import { verifyTypedData, hashTypedData, type Address, type Hex } from 'viem';
import { logger } from '../../logger';

/**
 * EIP-712 domain for Aegis sponsorship requests.
 */
const AEGIS_DOMAIN = {
  name: 'Aegis Paymaster',
  version: '1',
  chainId: 8453, // Base mainnet
} as const;

/**
 * Sponsorship request type definition for EIP-712.
 */
const SPONSORSHIP_REQUEST_TYPES = {
  SponsorshipRequest: [
    { name: 'agentAddress', type: 'address' },
    { name: 'protocolId', type: 'string' },
    { name: 'targetContract', type: 'address' },
    { name: 'maxGasLimit', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

/**
 * Signed sponsorship request message.
 */
export interface SignedSponsorshipRequest {
  agentAddress: Address;
  protocolId: string;
  targetContract: Address;
  maxGasLimit: bigint;
  nonce: bigint;
  deadline: bigint;
  signature: Hex;
}

/**
 * Verification result.
 */
export interface SignatureVerificationResult {
  valid: boolean;
  signer?: Address;
  error?: string;
  expired?: boolean;
  requestHash?: Hex;
}

/**
 * Get the current chain ID for signature verification.
 */
function getChainId(): number {
  const networkId = process.env.AGENT_NETWORK_ID ?? 'base-sepolia';
  return networkId === 'base' ? 8453 : 84532;
}

/**
 * Verify an EIP-712 signed sponsorship request.
 *
 * @param request - The signed sponsorship request
 * @returns Verification result with signer address if valid
 */
export async function verifyRequestSignature(
  request: SignedSponsorshipRequest
): Promise<SignatureVerificationResult> {
  try {
    const now = BigInt(Math.floor(Date.now() / 1000));

    // Check deadline
    if (request.deadline < now) {
      return {
        valid: false,
        error: 'Request has expired',
        expired: true,
      };
    }

    // Get chain-specific domain
    const domain = {
      ...AEGIS_DOMAIN,
      chainId: getChainId(),
    };

    // Prepare message for verification
    const message = {
      agentAddress: request.agentAddress,
      protocolId: request.protocolId,
      targetContract: request.targetContract,
      maxGasLimit: request.maxGasLimit,
      nonce: request.nonce,
      deadline: request.deadline,
    };

    // Compute request hash for logging/tracking
    const requestHash = hashTypedData({
      domain,
      types: SPONSORSHIP_REQUEST_TYPES,
      primaryType: 'SponsorshipRequest',
      message,
    });

    // Verify the signature
    const isValid = await verifyTypedData({
      address: request.agentAddress,
      domain,
      types: SPONSORSHIP_REQUEST_TYPES,
      primaryType: 'SponsorshipRequest',
      message,
      signature: request.signature,
    });

    if (!isValid) {
      logger.warn('[SignatureVerify] Invalid signature', {
        agentAddress: request.agentAddress,
        requestHash,
      });

      return {
        valid: false,
        error: 'Signature does not match agent address',
        requestHash,
      };
    }

    logger.debug('[SignatureVerify] Signature verified', {
      agentAddress: request.agentAddress,
      protocolId: request.protocolId,
      requestHash,
    });

    return {
      valid: true,
      signer: request.agentAddress,
      requestHash,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[SignatureVerify] Verification failed', { error: message });

    return {
      valid: false,
      error: `Signature verification failed: ${message}`,
    };
  }
}

/**
 * Generate a request hash for a sponsorship request (without signature).
 * Useful for creating the message to sign.
 */
export function generateRequestHash(request: {
  agentAddress: Address;
  protocolId: string;
  targetContract: Address;
  maxGasLimit: bigint;
  nonce: bigint;
  deadline: bigint;
}): Hex {
  const domain = {
    ...AEGIS_DOMAIN,
    chainId: getChainId(),
  };

  return hashTypedData({
    domain,
    types: SPONSORSHIP_REQUEST_TYPES,
    primaryType: 'SponsorshipRequest',
    message: request,
  });
}

/**
 * Get the EIP-712 domain and types for client-side signing.
 */
export function getSigningConfig() {
  return {
    domain: {
      ...AEGIS_DOMAIN,
      chainId: getChainId(),
    },
    types: SPONSORSHIP_REQUEST_TYPES,
    primaryType: 'SponsorshipRequest' as const,
  };
}

/**
 * Simple timestamp-based signature for simpler use cases.
 * Uses HMAC with a shared secret.
 */
import { createHmac, timingSafeEqual } from 'crypto';

const REQUEST_SIGNATURE_SECRET = process.env.REQUEST_SIGNATURE_SECRET;
const MAX_SIGNATURE_AGE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Simple request signature format.
 */
export interface SimpleSignedRequest {
  agentAddress: string;
  protocolId: string;
  timestamp: number;
  signature: string;
}

/**
 * Verify a simple HMAC-signed request.
 * Use this for API requests when EIP-712 is not available.
 */
export function verifySimpleSignature(request: SimpleSignedRequest): SignatureVerificationResult {
  if (!REQUEST_SIGNATURE_SECRET) {
    // If secret not configured, skip verification in development
    if (process.env.NODE_ENV !== 'production') {
      return { valid: true };
    }
    return { valid: false, error: 'Request signature secret not configured' };
  }

  // Check timestamp age
  const age = Date.now() - request.timestamp;
  if (age > MAX_SIGNATURE_AGE_MS || age < 0) {
    return {
      valid: false,
      error: 'Request timestamp expired or invalid',
      expired: true,
    };
  }

  // Compute expected signature
  const payload = `${request.agentAddress}:${request.protocolId}:${request.timestamp}`;
  const expectedSignature = createHmac('sha256', REQUEST_SIGNATURE_SECRET)
    .update(payload)
    .digest('hex');

  // Compare signatures
  const sigBuffer = Buffer.from(request.signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (sigBuffer.length !== expectedBuffer.length) {
    return { valid: false, error: 'Invalid signature' };
  }

  if (!timingSafeEqual(sigBuffer, expectedBuffer)) {
    return { valid: false, error: 'Invalid signature' };
  }

  return { valid: true, signer: request.agentAddress as Address };
}

/**
 * Generate a simple HMAC signature for a request.
 * For testing or client-side use.
 */
export function generateSimpleSignature(
  agentAddress: string,
  protocolId: string,
  secret: string,
  timestamp?: number
): { signature: string; timestamp: number } {
  const ts = timestamp ?? Date.now();
  const payload = `${agentAddress}:${protocolId}:${ts}`;
  const signature = createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return { signature, timestamp: ts };
}
