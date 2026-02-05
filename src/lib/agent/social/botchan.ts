/**
 * Aegis Agent - Botchan Integration (onchain agent messaging on Base)
 *
 * Posts decision summaries to Botchan feeds so other agents can discover
 * and react to Aegis activity. Uses Botchan CLI when available.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../../logger';
import type { Decision } from '../reason/schemas';
import type { ExecutionResult } from '../execute/index';
import type { SignedDecision } from '../execute/paymaster';

const execAsync = promisify(exec);
const BASESCAN_TX_URL = 'https://basescan.org/tx';
const MAX_POST_LENGTH = 4000;

function truncate(str: string, len: number = 10): string {
  if (str.length <= len) return str;
  return `${str.slice(0, 6)}...${str.slice(-4)}`;
}

function getFeed(name: 'sponsorships' | 'reserves' | 'decisions'): string {
  const outbound = process.env.BOTCHAN_FEED_OUTBOUND?.trim();
  if (outbound) return outbound;
  if (name === 'sponsorships') return 'aegis-sponsorships';
  if (name === 'reserves') return 'aegis-reserves';
  return 'aegis-decisions';
}

/**
 * Post a message to a Botchan feed via CLI. Skips if CLI or key not configured.
 */
export async function postToFeed(
  feed: string,
  text: string
): Promise<{ success: boolean; error?: string }> {
  let privateKey = process.env.BOTCHAN_PRIVATE_KEY?.trim();
  if (!privateKey) {
    try {
      const { getPrivateKeyHex } = await import('../../keystore');
      privateKey = await getPrivateKeyHex();
    } catch {
      logger.debug('[Botchan] No private key configured - skipping post');
      return { success: true };
    }
  }
  const trimmed = text.slice(0, MAX_POST_LENGTH);
  const escaped = trimmed.replace(/"/g, '\\"');
  const rpcUrl = process.env.BASE_RPC_URL ?? process.env.RPC_URL_BASE ?? '';
  const env = {
    ...process.env,
    BOTCHAN_PRIVATE_KEY: privateKey,
    BOTCHAN_CHAIN_ID: '8453',
    ...(rpcUrl ? { RPC_URL: rpcUrl } : {}),
  };
  try {
    await execAsync(`botchan post "${feed}" "${escaped}" --chain-id 8453`, {
      env: { ...env } as NodeJS.ProcessEnv,
      timeout: 30_000,
    });
    logger.info('[Botchan] Posted to feed', { feed });
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('not found') || message.includes('ENOENT')) {
      logger.debug('[Botchan] CLI not installed - skipping post');
      return { success: true };
    }
    logger.warn('[Botchan] Post failed', { feed, error: message });
    return { success: false, error: message };
  }
}

/**
 * Post a sponsorship decision summary to Botchan after SPONSOR_TRANSACTION execution.
 */
export async function postSponsorshipToBotchan(
  signedDecision: SignedDecision,
  result: ExecutionResult & { sponsorshipHash?: string; decisionHash?: string }
): Promise<{ success: boolean; error?: string }> {
  const params = signedDecision.decision.parameters as { agentWallet?: string; protocolId?: string; estimatedCostUSD?: number };
  const agentWallet = params?.agentWallet ?? '0x...';
  const protocolId = params?.protocolId ?? 'unknown';
  const costUSD = params?.estimatedCostUSD ?? 0;
  const txHash = result.sponsorshipHash ?? result.transactionHash ?? '';
  const line1 = `Sponsored execution for ${truncate(agentWallet)}`;
  const line2 = `Protocol: ${protocolId}`;
  const line3 = `Cost: $${costUSD.toFixed(2)}${txHash ? ` | Tx: ${BASESCAN_TX_URL}/${txHash}` : ''}`;
  const text = `${line1}\n${line2}\n${line3}\n#AegisPaymaster`;
  return postToFeed(getFeed('sponsorships'), text);
}

/**
 * Post a reserve swap decision summary to Botchan after SWAP_RESERVES execution.
 */
export async function postReserveSwapToBotchan(
  decision: Decision,
  result: ExecutionResult
): Promise<{ success: boolean; error?: string }> {
  const params = decision.parameters as { tokenIn?: string; tokenOut?: string; amountIn?: string } | null;
  const tokenIn = params?.tokenIn ?? 'USDC';
  const tokenOut = params?.tokenOut ?? 'ETH';
  const amountIn = params?.amountIn ?? '?';
  const txHash = result.transactionHash ?? '';
  const line1 = `Reserve swap: ${amountIn} ${tokenIn} → ${tokenOut}`;
  const line2 = txHash ? `Tx: ${BASESCAN_TX_URL}/${txHash}` : 'Simulation';
  const text = `${line1}\n${line2}\n#AegisReserves`;
  return postToFeed(getFeed('reserves'), text);
}
