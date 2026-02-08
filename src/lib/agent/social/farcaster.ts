/**
 * Aegis Agent - Farcaster Integration (Neynar SDK)
 *
 * Posts sponsorship proofs and stats to Farcaster for public transparency.
 */

import { logger } from '../../logger';
import type { SignedDecision } from '../execute/paymaster';
import type { ExecutionResult } from '../execute/index';
import { getNeynarRateLimiter, type PostCategory } from './neynar-rate-limiter';

const BASESCAN_TX_URL = 'https://basescan.org/tx';
const AEGIS_DASHBOARD_URL = process.env.NEXT_PUBLIC_APP_URL ?? process.env.AEGIS_DASHBOARD_URL ?? 'https://ClawGas.vercel.app';

function truncate(str: string, len: number = 10): string {
  if (str.length <= len) return str;
  return `${str.slice(0, 6)}...${str.slice(-4)}`;
}

export interface DailyStats {
  sponsorshipsToday: number;
  activeProtocols: number;
  reserveETH: number;
  totalGasSavedUSD: number;
  uniqueAgents: number;
}

/**
 * Post sponsorship proof to Farcaster (cast with tx link, decision hash, reasoning).
 */
export async function postSponsorshipProof(
  signedDecision: SignedDecision,
  result: ExecutionResult & { sponsorshipHash?: string; decisionHash?: string; ipfsCid?: string }
): Promise<{ success: boolean; castHash?: string; error?: string; rateLimited?: boolean }> {
  const apiKey = process.env.NEYNAR_API_KEY;
  const signerUuid = process.env.FARCASTER_SIGNER_UUID ?? process.env.NEYNAR_SIGNER_UUID;
  if (!apiKey?.trim() || !signerUuid?.trim()) {
    logger.debug('[Farcaster] NEYNAR_API_KEY or FARCASTER_SIGNER_UUID not set - skipping cast');
    return { success: true };
  }

  // Check rate limit before posting
  const rateLimiter = await getNeynarRateLimiter();
  if (!(await rateLimiter.canPost('proof'))) {
    logger.debug('[Farcaster] Rate limit reached for sponsorship proofs - skipping cast', {
      category: 'proof',
    });
    return { success: true, rateLimited: true };
  }

  const params = signedDecision.decision.parameters as { agentWallet?: string; protocolId?: string; estimatedCostUSD?: number };
  const agentWallet = params?.agentWallet ?? '0x...';
  const protocolId = params?.protocolId ?? 'unknown';
  const costUSD = params?.estimatedCostUSD ?? 0;
  const txHash = result.sponsorshipHash ?? result.transactionHash ?? '';
  const decisionHash = result.decisionHash ?? signedDecision.decisionHash;
  const reasoning = signedDecision.decision.reasoning?.slice(0, 100) ?? '';

  const ipfsCid = result.ipfsCid;
  const ipfsGateway = process.env.IPFS_GATEWAY_URL ?? 'https://gateway.pinata.cloud';
  const ipfsLine = ipfsCid ? `\n📄 Decision JSON: ${ipfsGateway}/ipfs/${ipfsCid}` : '';

  const castText = `⛽ Sponsored execution for agent ${truncate(agentWallet)}

Protocol: ${protocolId}
Cost: $${costUSD.toFixed(2)}
Gas saved: ~200k units

Reasoning: ${truncate(reasoning, 100)}

🔗 View TX: ${txHash ? `${BASESCAN_TX_URL}/${txHash}` : 'N/A'}
📋 Decision: ${typeof decisionHash === 'string' ? truncate(decisionHash, 10) : 'N/A'}${ipfsLine}

#BasePaymaster #AutonomousAgent #BuildOnBase`;

  const embeds: { url: string }[] = [];
  if (txHash) embeds.push({ url: `${BASESCAN_TX_URL}/${txHash}` });
  embeds.push({ url: `${AEGIS_DASHBOARD_URL}/decisions/${typeof decisionHash === 'string' ? decisionHash : ''}` });
  if (ipfsCid) embeds.push({ url: `${ipfsGateway}/ipfs/${ipfsCid}` });

  try {
    const { NeynarAPIClient, Configuration } = await import('@neynar/nodejs-sdk');
    const config = new Configuration({ apiKey });
    const client = new NeynarAPIClient(config);
    const publish = await client.publishCast({
      signerUuid,
      text: castText,
      embeds: embeds.length > 0 ? embeds : undefined,
    });
    const castHash = publish?.cast?.hash;
    const verifyUrl = castHash ? `https://warpcast.com/~/conversations/${castHash}` : undefined;

    // Consume rate limit token after successful post
    const rateLimiter = await getNeynarRateLimiter();
    await rateLimiter.consumeToken('proof');

    logger.info('[Farcaster] Sponsorship proof published – verify link', {
      castHash,
      verifyUrl,
      txUrl: txHash ? `${BASESCAN_TX_URL}/${txHash}` : undefined,
      decisionHash: typeof decisionHash === 'string' ? truncate(decisionHash) : '',
    });
    return { success: true, castHash };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('[Farcaster] Failed to publish cast', {
      code: 'FARCASTER_POST_FAILED',
      error: message,
      hint: 'Check NEYNAR_API_KEY and FARCASTER_SIGNER_UUID.',
    });
    return { success: false, error: message };
  }
}

/**
 * Post daily stats summary to Farcaster.
 */
export async function postDailyStats(stats: DailyStats): Promise<{ success: boolean; castHash?: string; error?: string; rateLimited?: boolean }> {
  const apiKey = process.env.NEYNAR_API_KEY;
  const signerUuid = process.env.FARCASTER_SIGNER_UUID ?? process.env.NEYNAR_SIGNER_UUID;
  if (!apiKey?.trim() || !signerUuid?.trim()) {
    return { success: true };
  }

  // Check rate limit (priority: stats category)
  const rateLimiter = await getNeynarRateLimiter();
  if (!(await rateLimiter.canPost('stats'))) {
    logger.warn('[Farcaster] Rate limit reached for daily stats - skipping cast');
    return { success: true, rateLimited: true };
  }

  const castText = `📊 Daily Stats:
• ${stats.sponsorshipsToday} autonomous executions sponsored
• ${stats.uniqueAgents} autonomous agents served
• ${stats.activeProtocols} protocols active
• Total gas saved: $${stats.totalGasSavedUSD.toFixed(2)}
• Reserve: ${stats.reserveETH.toFixed(2)} ETH

#BasePaymaster #AutonomousAgent #BuildOnBase`;

  try {
    const { NeynarAPIClient, Configuration } = await import('@neynar/nodejs-sdk');
    const config = new Configuration({ apiKey });
    const client = new NeynarAPIClient(config);
    const publish = await client.publishCast({ signerUuid, text: castText });

    // Consume rate limit token
    await rateLimiter.consumeToken('stats');

    logger.info('[Farcaster] Daily stats published', { castHash: publish?.cast?.hash });
    return { success: true, castHash: publish?.cast?.hash };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('[Farcaster] Failed to publish daily stats', { error: message });
    return { success: false, error: message };
  }
}

/**
 * Post arbitrary text to Farcaster (e.g. emergency alerts, health summaries).
 */
export async function postToFarcaster(
  text: string,
  category: PostCategory = 'health'
): Promise<{ success: boolean; castHash?: string; error?: string; rateLimited?: boolean }> {
  const apiKey = process.env.NEYNAR_API_KEY;
  const signerUuid = process.env.FARCASTER_SIGNER_UUID ?? process.env.NEYNAR_SIGNER_UUID;
  if (!apiKey?.trim() || !signerUuid?.trim()) {
    logger.debug('[Farcaster] NEYNAR_API_KEY or FARCASTER_SIGNER_UUID not set - skipping cast');
    return { success: true };
  }

  // Check rate limit (emergency always bypasses)
  const rateLimiter = await getNeynarRateLimiter();
  if (!(await rateLimiter.canPost(category))) {
    logger.warn('[Farcaster] Rate limit reached - skipping cast', { category });
    return { success: true, rateLimited: true };
  }

  try {
    const { NeynarAPIClient, Configuration } = await import('@neynar/nodejs-sdk');
    const config = new Configuration({ apiKey });
    const client = new NeynarAPIClient(config);
    const publish = await client.publishCast({ signerUuid, text });
    const castHash = publish?.cast?.hash;

    // Consume rate limit token
    await rateLimiter.consumeToken(category);

    if (castHash) {
      logger.info('[Farcaster] Cast published – verify', {
        castHash,
        verifyUrl: `https://warpcast.com/~/conversations/${castHash}`,
        category,
      });
    }
    return { success: true, castHash };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('[Farcaster] Failed to publish cast', {
      code: 'FARCASTER_POST_FAILED',
      error: message,
      hint: 'Check NEYNAR_API_KEY and FARCASTER_SIGNER_UUID.',
    });
    return { success: false, error: message };
  }
}

/**
 * Post reserve swap notification to Farcaster.
 */
export async function postReserveSwapProof(params: {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  txHash?: string;
  decisionHash?: string;
  reasoning?: string;
}): Promise<{ success: boolean; castHash?: string; rateLimited?: boolean }> {
  const apiKey = process.env.NEYNAR_API_KEY;
  const signerUuid = process.env.FARCASTER_SIGNER_UUID ?? process.env.NEYNAR_SIGNER_UUID;
  if (!apiKey?.trim() || !signerUuid?.trim()) return { success: true };

  // Check rate limit (category: health)
  const rateLimiter = await getNeynarRateLimiter();
  if (!(await rateLimiter.canPost('health'))) {
    logger.debug('[Farcaster] Rate limit reached for reserve swap - skipping cast');
    return { success: true, rateLimited: true };
  }

  const castText = `🔄 Swapped reserves: ${params.amountIn} ${params.tokenIn} → ${params.amountOut} ${params.tokenOut}

${params.reasoning ?? ''}

🔗 View TX: ${params.txHash ? `${BASESCAN_TX_URL}/${params.txHash}` : 'N/A'}
📋 Decision: ${params.decisionHash ? params.decisionHash.slice(0, 10) + '...' : 'N/A'}

#BasePaymaster #BuildOnBase`;

  try {
    const { NeynarAPIClient, Configuration } = await import('@neynar/nodejs-sdk');
    const config = new Configuration({ apiKey });
    const client = new NeynarAPIClient(config);
    const publish = await client.publishCast({ signerUuid, text: castText });

    // Consume rate limit token
    await rateLimiter.consumeToken('health');

    return { success: true, castHash: publish?.cast?.hash };
  } catch {
    return { success: false };
  }
}
