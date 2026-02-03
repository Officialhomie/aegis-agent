/**
 * Aegis Agent - Botchan Inbound Observation
 *
 * Polls a Botchan feed for agent requests (e.g. aegis-requests) so the agent
 * can consider them in the reasoning loop.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../../logger';
import type { Observation } from './index';

const execAsync = promisify(exec);

function getInboundFeed(): string {
  return process.env.BOTCHAN_FEED_INBOUND?.trim() ?? 'aegis-requests';
}

interface BotchanPost {
  sender?: string;
  text?: string;
  timestamp?: number;
  topic?: string;
}

/**
 * Read recent posts from the configured Botchan inbound feed (no wallet required).
 * Returns observations of type agent-request for the reasoning layer.
 */
export async function observeBotchanRequests(): Promise<Observation[]> {
  const feed = getInboundFeed();
  const rpcUrl = process.env.BASE_RPC_URL ?? process.env.RPC_URL_BASE ?? '';
  const env = { ...process.env, BOTCHAN_CHAIN_ID: '8453', ...(rpcUrl ? { RPC_URL: rpcUrl } : {}) };
  try {
    const { stdout } = await execAsync(`botchan read "${feed}" --limit 10 --json --chain-id 8453`, {
      env: { ...env } as NodeJS.ProcessEnv,
      timeout: 15_000,
    });
    const raw = stdout.trim();
    if (!raw) return [];
    const items = JSON.parse(raw) as unknown;
    const posts = Array.isArray(items) ? (items as BotchanPost[]) : [];
    return posts.map((p, i) => ({
      id: `botchan-${feed}-${p.timestamp ?? i}-${Date.now()}`,
      timestamp: new Date((p.timestamp ?? 0) * 1000),
      source: 'api' as const,
      data: {
        type: 'agent-request',
        wallet: p.sender ?? '0x0',
        message: p.text ?? '',
        topic: p.topic,
      },
      context: `Agent request from ${(p.sender ?? 'unknown').slice(0, 10)}... on feed ${feed}`,
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('not found') || message.includes('ENOENT')) {
      logger.debug('[Botchan] CLI not installed - skipping inbound observation');
      return [];
    }
    logger.warn('[Botchan] Read feed failed', { feed, error: message });
    return [];
  }
}
