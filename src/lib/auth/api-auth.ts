/**
 * API authentication for Aegis agent routes.
 * Uses timing-safe Bearer token comparison against AEGIS_API_KEY.
 */

import { timingSafeEqual } from 'crypto';

export function verifyApiAuth(request: Request): { valid: boolean; error?: string } {
  const AEGIS_API_KEY = process.env.AEGIS_API_KEY;
  if (!AEGIS_API_KEY) {
    return { valid: false, error: 'API authentication not configured' };
  }
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { valid: false, error: 'Missing Bearer token' };
  }
  const token = authHeader.slice(7);
  const keyBuf = Buffer.from(AEGIS_API_KEY, 'utf8');
  const tokenBuf = Buffer.from(token, 'utf8');
  if (keyBuf.length !== tokenBuf.length) {
    return { valid: false, error: 'Invalid API key' };
  }
  if (!timingSafeEqual(keyBuf, tokenBuf)) {
    return { valid: false, error: 'Invalid API key' };
  }
  return { valid: true };
}
