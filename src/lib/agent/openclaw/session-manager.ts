/**
 * OpenClaw Session Manager
 *
 * Maps OpenClaw sessions (WhatsApp/Telegram/Signal) to authenticated protocols.
 * Sessions are stored in memory with 24-hour TTL.
 */

import { logger } from '@/src/lib/logger';

interface OpenClawSession {
  sessionId: string;
  protocolId: string;
  apiKeyHash: string;
  createdAt: Date;
  lastAccessedAt: Date;
  expiresAt: Date;
}

// In-memory session store (TODO: Replace with Redis in production)
const sessionStore = new Map<string, OpenClawSession>();

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Create a new OpenClaw session
 */
export async function createOpenClawSession(
  sessionId: string,
  protocolId: string,
  apiKeyHash: string
): Promise<OpenClawSession> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  const session: OpenClawSession = {
    sessionId,
    protocolId,
    apiKeyHash,
    createdAt: now,
    lastAccessedAt: now,
    expiresAt,
  };

  sessionStore.set(sessionId, session);

  logger.info('[OpenClaw] Session created', {
    sessionId,
    protocolId,
    expiresAt: expiresAt.toISOString(),
  });

  return session;
}

/**
 * Get protocol ID from session
 * Throws error if session not found or expired
 */
export async function getProtocolIdFromSession(
  sessionId: string
): Promise<string> {
  const session = sessionStore.get(sessionId);

  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  // Check expiration
  if (new Date() > session.expiresAt) {
    sessionStore.delete(sessionId);
    throw new Error(`Session expired: ${sessionId}`);
  }

  // Update last accessed time
  session.lastAccessedAt = new Date();

  logger.debug('[OpenClaw] Session accessed', {
    sessionId,
    protocolId: session.protocolId,
  });

  return session.protocolId;
}

/**
 * Get full session details
 */
export async function getSession(
  sessionId: string
): Promise<OpenClawSession | null> {
  const session = sessionStore.get(sessionId);

  if (!session) {
    return null;
  }

  // Check expiration
  if (new Date() > session.expiresAt) {
    sessionStore.delete(sessionId);
    return null;
  }

  return session;
}

/**
 * Extend session TTL (refresh on activity)
 */
export async function refreshSession(sessionId: string): Promise<void> {
  const session = sessionStore.get(sessionId);

  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  const now = new Date();
  session.lastAccessedAt = now;
  session.expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  logger.debug('[OpenClaw] Session refreshed', {
    sessionId,
    newExpiresAt: session.expiresAt.toISOString(),
  });
}

/**
 * Destroy a session
 */
export async function destroySession(sessionId: string): Promise<void> {
  const deleted = sessionStore.delete(sessionId);

  if (deleted) {
    logger.info('[OpenClaw] Session destroyed', { sessionId });
  }
}

/**
 * Check if session exists and is valid
 */
export async function isSessionValid(sessionId: string): Promise<boolean> {
  const session = sessionStore.get(sessionId);

  if (!session) {
    return false;
  }

  if (new Date() > session.expiresAt) {
    sessionStore.delete(sessionId);
    return false;
  }

  return true;
}

/**
 * Cleanup expired sessions (run periodically)
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const now = new Date();
  let cleaned = 0;

  for (const [sessionId, session] of sessionStore.entries()) {
    if (now > session.expiresAt) {
      sessionStore.delete(sessionId);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    logger.info('[OpenClaw] Cleaned up expired sessions', { count: cleaned });
  }

  return cleaned;
}

/**
 * Get all active sessions (for debugging)
 */
export async function getActiveSessions(): Promise<OpenClawSession[]> {
  const now = new Date();
  const active: OpenClawSession[] = [];

  for (const session of sessionStore.values()) {
    if (now <= session.expiresAt) {
      active.push(session);
    }
  }

  return active;
}

// Cleanup task: Run every hour
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    cleanupExpiredSessions().catch((err) => {
      logger.error('[OpenClaw] Session cleanup failed', { error: err });
    });
  }, 60 * 60 * 1000); // 1 hour
}
