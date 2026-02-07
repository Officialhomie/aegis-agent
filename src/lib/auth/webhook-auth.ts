/**
 * Webhook Authentication Module
 *
 * Provides HMAC signature verification for webhook endpoints.
 * Uses PROTOCOL_WEBHOOK_SECRET for signing/verification.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { logger } from '../logger';

const WEBHOOK_SECRET = process.env.PROTOCOL_WEBHOOK_SECRET;
const SIGNATURE_HEADER = 'x-aegis-signature';
const TIMESTAMP_HEADER = 'x-aegis-timestamp';
const MAX_TIMESTAMP_AGE_MS = 5 * 60 * 1000; // 5 minutes

export interface WebhookAuthResult {
  valid: boolean;
  error?: string;
  protocolId?: string;
}

/**
 * Verify HMAC signature of a webhook request.
 *
 * Signature format: HMAC-SHA256(timestamp + '.' + JSON.stringify(body))
 * Headers required:
 * - X-Aegis-Signature: The HMAC signature
 * - X-Aegis-Timestamp: Unix timestamp in seconds
 */
export function verifyWebhookSignature(
  body: unknown,
  signature: string | null,
  timestamp: string | null
): WebhookAuthResult {
  // Check if webhook secret is configured
  if (!WEBHOOK_SECRET) {
    logger.warn('[WebhookAuth] PROTOCOL_WEBHOOK_SECRET not configured');
    // In production, this should fail. In dev, we might allow bypass.
    if (process.env.NODE_ENV === 'production') {
      return { valid: false, error: 'Webhook authentication not configured' };
    }
    logger.warn('[WebhookAuth] Bypassing auth in development mode');
    return { valid: true };
  }

  // Check required headers
  if (!signature) {
    return { valid: false, error: `Missing ${SIGNATURE_HEADER} header` };
  }

  if (!timestamp) {
    return { valid: false, error: `Missing ${TIMESTAMP_HEADER} header` };
  }

  // Validate timestamp
  const timestampNum = parseInt(timestamp, 10);
  if (isNaN(timestampNum)) {
    return { valid: false, error: 'Invalid timestamp format' };
  }

  const now = Math.floor(Date.now() / 1000);
  const age = Math.abs(now - timestampNum) * 1000;

  if (age > MAX_TIMESTAMP_AGE_MS) {
    return {
      valid: false,
      error: `Timestamp too old or too far in future (age: ${age}ms, max: ${MAX_TIMESTAMP_AGE_MS}ms)`,
    };
  }

  // Compute expected signature
  const payload = `${timestamp}.${JSON.stringify(body)}`;
  const expectedSignature = createHmac('sha256', WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');

  // Compare signatures using timing-safe comparison
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (signatureBuffer.length !== expectedBuffer.length) {
    return { valid: false, error: 'Invalid signature' };
  }

  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return { valid: false, error: 'Invalid signature' };
  }

  return { valid: true };
}

/**
 * Generate a webhook signature for testing or client-side signing.
 */
export function generateWebhookSignature(
  body: unknown,
  secret: string,
  timestamp?: number
): { signature: string; timestamp: string } {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  const payload = `${ts}.${JSON.stringify(body)}`;
  const signature = createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return {
    signature,
    timestamp: ts.toString(),
  };
}

/**
 * Simple in-memory rate limiter for webhooks.
 * For production, consider Redis-based rate limiting.
 */
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // 10 requests per minute per protocol

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  error?: string;
}

/**
 * Check rate limit for a protocol webhook.
 * Returns whether the request is allowed and remaining quota.
 */
export function checkWebhookRateLimit(protocolId: string): RateLimitResult {
  const now = Date.now();
  const key = `webhook:${protocolId}`;

  let entry = rateLimitStore.get(key);

  // Reset if window expired
  if (!entry || now >= entry.resetAt) {
    entry = {
      count: 0,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    };
  }

  // Check if over limit
  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
      error: `Rate limit exceeded. Max ${RATE_LIMIT_MAX_REQUESTS} requests per minute.`,
    };
  }

  // Increment counter
  entry.count += 1;
  rateLimitStore.set(key, entry);

  return {
    allowed: true,
    remaining: RATE_LIMIT_MAX_REQUESTS - entry.count,
    resetAt: entry.resetAt,
  };
}

/**
 * Clean up expired rate limit entries.
 * Call periodically to prevent memory leaks.
 */
export function cleanupRateLimitStore(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now >= entry.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}

// Clean up every 5 minutes
setInterval(cleanupRateLimitStore, 5 * 60 * 1000);
