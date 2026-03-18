/**
 * OpenClaw Session Manager
 *
 * Maps OpenClaw sessions (WhatsApp/Telegram/Signal) to authenticated protocols.
 * Sessions are stored via getStateStore (Redis when REDIS_URL set, else in-memory).
 * Multi-node deployment requires Redis for session persistence across instances.
 */

import { logger } from '@/src/lib/logger';
import { getStateStore } from '../state-store';

export interface OpenClawSession {
  sessionId: string;
  protocolId: string;
  apiKeyHash: string;
  createdAt: Date;
  lastAccessedAt: Date;
  expiresAt: Date;
}

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const SESSION_KEY_PREFIX = 'openclaw:session:';

function sessionKey(sessionId: string): string {
  return `${SESSION_KEY_PREFIX}${sessionId}`;
}

function parseSession(raw: string | null): OpenClawSession | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as {
      sessionId: string;
      protocolId: string;
      apiKeyHash: string;
      createdAt: string;
      lastAccessedAt: string;
      expiresAt: string;
    };
    return {
      ...parsed,
      createdAt: new Date(parsed.createdAt),
      lastAccessedAt: new Date(parsed.lastAccessedAt),
      expiresAt: new Date(parsed.expiresAt),
    };
  } catch {
    return null;
  }
}

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

  const store = await getStateStore();
  const value = JSON.stringify({
    ...session,
    createdAt: session.createdAt.toISOString(),
    lastAccessedAt: session.lastAccessedAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
  });
  await store.set(sessionKey(sessionId), value, { px: SESSION_TTL_MS });

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
export async function getProtocolIdFromSession(sessionId: string): Promise<string> {
  const store = await getStateStore();
  const raw = await store.get(sessionKey(sessionId));
  const session = parseSession(raw);

  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  if (new Date() > session.expiresAt) {
    throw new Error(`Session expired: ${sessionId}`);
  }

  session.lastAccessedAt = new Date();
  await store.set(
    sessionKey(sessionId),
    JSON.stringify({
      ...session,
      createdAt: session.createdAt.toISOString(),
      lastAccessedAt: session.lastAccessedAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
    }),
    { px: SESSION_TTL_MS }
  );

  logger.debug('[OpenClaw] Session accessed', {
    sessionId,
    protocolId: session.protocolId,
  });

  return session.protocolId;
}

/**
 * Get full session details
 */
export async function getSession(sessionId: string): Promise<OpenClawSession | null> {
  const store = await getStateStore();
  const raw = await store.get(sessionKey(sessionId));
  const session = parseSession(raw);

  if (!session || new Date() > session.expiresAt) {
    return null;
  }

  return session;
}

/**
 * Extend session TTL (refresh on activity)
 */
export async function refreshSession(sessionId: string): Promise<void> {
  const session = await getSession(sessionId);

  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  const now = new Date();
  session.lastAccessedAt = now;
  session.expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  const store = await getStateStore();
  await store.set(
    sessionKey(sessionId),
    JSON.stringify({
      ...session,
      createdAt: session.createdAt.toISOString(),
      lastAccessedAt: session.lastAccessedAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
    }),
    { px: SESSION_TTL_MS }
  );

  logger.debug('[OpenClaw] Session refreshed', {
    sessionId,
    newExpiresAt: session.expiresAt.toISOString(),
  });
}

/**
 * Destroy a session
 */
export async function destroySession(sessionId: string): Promise<void> {
  const store = await getStateStore();
  await store.set(sessionKey(sessionId), '', { px: 1 });
  logger.info('[OpenClaw] Session destroyed', { sessionId });
}

/**
 * Check if session exists and is valid
 */
export async function isSessionValid(sessionId: string): Promise<boolean> {
  const session = await getSession(sessionId);
  return session != null;
}

/**
 * Cleanup expired sessions (run periodically)
 * Note: With Redis, keys expire automatically via TTL. This is a no-op for Redis.
 * For in-memory store, we cannot iterate keys - cleanup happens on get.
 */
export async function cleanupExpiredSessions(): Promise<number> {
  return 0;
}

/**
 * Get all active sessions (for debugging)
 * Note: StateStore does not support listing keys. Returns empty array.
 */
export async function getActiveSessions(): Promise<OpenClawSession[]> {
  return [];
}
