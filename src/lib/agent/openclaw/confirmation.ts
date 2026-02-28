/**
 * OpenClaw Confirmation Flow
 *
 * For destructive operations (delete, revoke, archive), requires user confirmation.
 * Generates a confirmation token that the user must echo back within 60 seconds.
 */

import { logger } from '../../logger';
import { randomBytes } from 'crypto';
import type { CommandName } from './types';

/**
 * Pending confirmation entry
 */
export interface PendingConfirmation {
  token: string;
  action: CommandName;
  args: Record<string, string>;
  sessionId: string;
  description: string;
  expiresAt: Date;
}

// In-memory store for pending confirmations
const pendingConfirmations = new Map<string, PendingConfirmation>();

const CONFIRMATION_TTL_MS = 60 * 1000; // 60 seconds

/**
 * Generate a short, easy-to-type confirmation token
 */
function generateToken(): string {
  const bytes = randomBytes(3);
  return bytes.toString('hex').toUpperCase();
}

/**
 * Create a pending confirmation for a destructive action
 */
export function createConfirmation(params: {
  action: CommandName;
  args: Record<string, string>;
  sessionId: string;
  description: string;
}): PendingConfirmation {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + CONFIRMATION_TTL_MS);

  const confirmation: PendingConfirmation = {
    token,
    action: params.action,
    args: params.args,
    sessionId: params.sessionId,
    description: params.description,
    expiresAt,
  };

  // Store by session + token for lookup
  const key = `${params.sessionId}:${token}`;
  pendingConfirmations.set(key, confirmation);

  // Also store by session for "YES" confirmations (most recent)
  pendingConfirmations.set(`${params.sessionId}:LATEST`, confirmation);

  logger.info('[Confirmation] Created pending confirmation', {
    sessionId: params.sessionId,
    action: params.action,
    token,
    expiresAt,
  });

  return confirmation;
}

/**
 * Verify a confirmation token
 */
export function verifyConfirmation(
  sessionId: string,
  input: string
): { valid: boolean; confirmation?: PendingConfirmation; error?: string } {
  // Clean up input
  const cleanInput = input.trim().toUpperCase();

  // Handle "YES" as confirming the most recent pending action
  if (cleanInput === 'YES' || cleanInput === 'Y' || cleanInput === 'CONFIRM') {
    const latestKey = `${sessionId}:LATEST`;
    const confirmation = pendingConfirmations.get(latestKey);

    if (!confirmation) {
      return { valid: false, error: 'No pending action to confirm' };
    }

    if (new Date() > confirmation.expiresAt) {
      pendingConfirmations.delete(latestKey);
      pendingConfirmations.delete(`${sessionId}:${confirmation.token}`);
      return { valid: false, error: 'Confirmation expired. Please try the command again.' };
    }

    // Clean up
    pendingConfirmations.delete(latestKey);
    pendingConfirmations.delete(`${sessionId}:${confirmation.token}`);

    logger.info('[Confirmation] Verified via YES', {
      sessionId,
      action: confirmation.action,
    });

    return { valid: true, confirmation };
  }

  // Handle token confirmation
  const key = `${sessionId}:${cleanInput}`;
  const confirmation = pendingConfirmations.get(key);

  if (!confirmation) {
    return { valid: false, error: 'Invalid confirmation token' };
  }

  if (new Date() > confirmation.expiresAt) {
    pendingConfirmations.delete(key);
    pendingConfirmations.delete(`${sessionId}:LATEST`);
    return { valid: false, error: 'Confirmation expired. Please try the command again.' };
  }

  // Clean up
  pendingConfirmations.delete(key);
  pendingConfirmations.delete(`${sessionId}:LATEST`);

  logger.info('[Confirmation] Verified via token', {
    sessionId,
    action: confirmation.action,
    token: cleanInput,
  });

  return { valid: true, confirmation };
}

/**
 * Cancel a pending confirmation
 */
export function cancelConfirmation(sessionId: string): boolean {
  const latestKey = `${sessionId}:LATEST`;
  const confirmation = pendingConfirmations.get(latestKey);

  if (!confirmation) {
    return false;
  }

  pendingConfirmations.delete(latestKey);
  pendingConfirmations.delete(`${sessionId}:${confirmation.token}`);

  logger.info('[Confirmation] Cancelled', {
    sessionId,
    action: confirmation.action,
  });

  return true;
}

/**
 * Check if there's a pending confirmation for a session
 */
export function hasPendingConfirmation(sessionId: string): boolean {
  const latestKey = `${sessionId}:LATEST`;
  const confirmation = pendingConfirmations.get(latestKey);

  if (!confirmation) {
    return false;
  }

  if (new Date() > confirmation.expiresAt) {
    pendingConfirmations.delete(latestKey);
    return false;
  }

  return true;
}

/**
 * Get the pending confirmation for a session
 */
export function getPendingConfirmation(sessionId: string): PendingConfirmation | null {
  const latestKey = `${sessionId}:LATEST`;
  const confirmation = pendingConfirmations.get(latestKey);

  if (!confirmation || new Date() > confirmation.expiresAt) {
    return null;
  }

  return confirmation;
}

/**
 * Format a confirmation request message
 */
export function formatConfirmationRequest(confirmation: PendingConfirmation): string {
  const timeoutSeconds = Math.ceil((confirmation.expiresAt.getTime() - Date.now()) / 1000);

  return [
    'This is a destructive action that requires confirmation.',
    '',
    `Action: ${confirmation.description}`,
    '',
    `To confirm, reply with: ${confirmation.token}`,
    `Or simply reply: YES`,
    '',
    `This confirmation expires in ${timeoutSeconds} seconds.`,
    '',
    'To cancel, reply: NO or CANCEL',
  ].join('\n');
}

/**
 * Clear all confirmations (for testing)
 */
export function clearAllConfirmations(): void {
  pendingConfirmations.clear();
}

/**
 * Cleanup expired confirmations (run periodically)
 */
export function cleanupExpiredConfirmations(): number {
  const now = new Date();
  let cleaned = 0;

  for (const [key, confirmation] of pendingConfirmations.entries()) {
    if (now > confirmation.expiresAt) {
      pendingConfirmations.delete(key);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    logger.debug('[Confirmation] Cleaned up expired confirmations', { count: cleaned });
  }

  return cleaned;
}

// Cleanup task: Run every 30 seconds
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupExpiredConfirmations, 30 * 1000);
}
