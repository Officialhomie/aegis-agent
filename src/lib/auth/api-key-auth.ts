/**
 * Aegis API Key Authentication
 *
 * Generates and validates API keys for protocol authentication.
 * API keys are stored as SHA-256 hashes in the database.
 */

import { createHash, randomBytes } from 'crypto';
import { getPrisma } from '../db';
import { logger } from '../logger';

/**
 * Generate a new API key
 * Format: aegis_<32 random bytes in hex>
 */
export function generateApiKey(): string {
  const randomPart = randomBytes(32).toString('hex');
  return `aegis_${randomPart}`;
}

/**
 * Hash an API key using SHA-256
 */
export function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Validate API key format
 */
export function isValidApiKeyFormat(apiKey: string): boolean {
  return /^aegis_[a-f0-9]{64}$/.test(apiKey);
}

/**
 * Authenticate a request using API key and return protocol ID
 */
export async function authenticateApiKey(apiKey: string): Promise<{
  valid: boolean;
  protocolId?: string;
  reason?: string;
}> {
  if (!isValidApiKeyFormat(apiKey)) {
    return { valid: false, reason: 'Invalid API key format' };
  }

  const apiKeyHash = hashApiKey(apiKey);
  const db = getPrisma();

  try {
    const protocol = await db.protocolSponsor.findUnique({
      where: { apiKeyHash },
      select: {
        protocolId: true,
        onboardingStatus: true,
      },
    });

    if (!protocol) {
      logger.warn('[Auth] API key not found', { apiKeyHash: apiKeyHash.substring(0, 16) });
      return { valid: false, reason: 'API key not found' };
    }

    if (protocol.onboardingStatus === 'SUSPENDED') {
      logger.warn('[Auth] Protocol suspended', { protocolId: protocol.protocolId });
      return { valid: false, reason: 'Protocol suspended' };
    }

    return { valid: true, protocolId: protocol.protocolId };
  } catch (err) {
    logger.error('[Auth] API key authentication failed', { error: err });
    return { valid: false, reason: 'Authentication error' };
  }
}

/**
 * Middleware-style authentication for Next.js API routes
 */
export async function authenticateRequest(
  authHeader: string | null
): Promise<{ success: boolean; protocolId?: string; error?: string }> {
  if (!authHeader) {
    return { success: false, error: 'Missing Authorization header' };
  }

  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) {
    return { success: false, error: 'Invalid Authorization format (expected: Bearer <api_key>)' };
  }

  const apiKey = match[1];
  const result = await authenticateApiKey(apiKey);

  if (!result.valid) {
    return { success: false, error: result.reason ?? 'Invalid API key' };
  }

  return { success: true, protocolId: result.protocolId };
}

/**
 * Revoke an API key (for security purposes)
 */
export async function revokeApiKey(protocolId: string): Promise<void> {
  const db = getPrisma();

  await db.protocolSponsor.update({
    where: { protocolId },
    data: {
      apiKeyHash: null,
      apiKeyCreatedAt: null,
      onboardingStatus: 'SUSPENDED',
    },
  });

  logger.info('[Auth] API key revoked', { protocolId });
}

/**
 * Regenerate API key for a protocol
 */
export async function regenerateApiKey(protocolId: string): Promise<string> {
  const db = getPrisma();
  const newApiKey = generateApiKey();
  const apiKeyHash = hashApiKey(newApiKey);

  await db.protocolSponsor.update({
    where: { protocolId },
    data: {
      apiKeyHash,
      apiKeyCreatedAt: new Date(),
    },
  });

  logger.info('[Auth] API key regenerated', { protocolId });

  return newApiKey;
}
