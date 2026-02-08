/**
 * Periodic Farcaster health summaries for transparency.
 * Uses rotating templates and smart formatting for engaging, dynamic posts.
 */

import { logger } from '../../logger';
import { getReserveState, updateReserveState } from '../state/reserve-state';
import { postToFarcaster } from '../social/farcaster';
import {
  getRandomHashtags,
  getContextualEmoji,
  maybeGetFunFact,
} from '../personality/farcaster-persona';
import type { ReserveState } from '../state/reserve-state';

const DEFAULT_FARCASTER_UPDATE_INTERVAL_MS = 15 * 60 * 1000; // 15 min (configurable for proof-of-work)
const FARCASTER_UPDATE_INTERVAL_MS =
  Number(process.env.FARCASTER_UPDATE_INTERVAL_MS) || DEFAULT_FARCASTER_UPDATE_INTERVAL_MS;

const DASHBOARD_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? process.env.AEGIS_DASHBOARD_URL ?? 'https://ClawGas.vercel.app';
const WARPCAST_CAST_URL = 'https://warpcast.com/~/conversations';

// --- Formatting helpers ---

function formatETH(eth: number): string {
  if (eth >= 1) return `${eth.toFixed(2)} ETH`;
  if (eth >= 0.01) return `${eth.toFixed(3)} ETH`;
  if (eth >= 0.001) return `${eth.toFixed(4)} ETH`;
  return `${eth.toFixed(6)} ETH`;
}

function progressBar(percent: number, width = 10): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `${bar} ${Math.round(percent)}%`;
}

function runwayDisplay(days: number): string {
  if (days >= 365) return `${(days / 365).toFixed(1)}y runway`;
  if (days >= 30) return `${(days / 30).toFixed(0)}mo runway`;
  if (days >= 7) return `${days.toFixed(0)}d runway`;
  if (days >= 1) return `${days.toFixed(1)}d runway`;
  const hours = days * 24;
  if (hours >= 1) return `~${Math.round(hours)}h runway`;
  return '<1h runway';
}

function activityEmoji(count: number): string {
  if (count >= 50) return '🔥';
  if (count >= 20) return '⚡';
  if (count >= 5) return '⛽';
  if (count >= 1) return '✨';
  return '🟢';
}

// --- Template builders ---

type TemplateFn = (state: ReserveState, dashboardUrl: string) => string;

function templateActivity(state: ReserveState, dashboardUrl: string): string {
  const count = state.sponsorshipsLast24h;
  const emoji = getContextualEmoji('activity');
  const protocolName = state.protocolBudgets[0]?.protocolId ?? 'Base';
  const ethSaved = state.avgBurnPerSponsorship * count;
  const hashtags = getRandomHashtags(3).join(' ');

  // Variation 1, 2, or 3 (random)
  const variation = Math.floor(Math.random() * 3);

  if (variation === 0) {
    return `${emoji} Helped ${count} agent${count === 1 ? '' : 's'} save on gas today

${protocolName} · ~${formatETH(ethSaved)} saved
Reserve: ${formatETH(state.ethBalance)} | ${runwayDisplay(state.runwayDays)}

Ready to sponsor your next tx
${dashboardUrl}
${hashtags}`;
  } else if (variation === 1) {
    return `${emoji} ${count} transactions sponsored in 24h

Serving ${state.protocolBudgets.length} protocol${state.protocolBudgets.length === 1 ? '' : 's'} on Base
~${formatETH(ethSaved)} in gas covered
Reserve: ${formatETH(state.ethBalance)}

Making Web3 gasless ✨
${hashtags}`;
  } else {
    return `${emoji} Daily update:
${count} sponsorships | ${state.protocolBudgets.length} protocols | ${formatETH(ethSaved)} saved

Reserve health: ${runwayDisplay(state.runwayDays)}
${formatETH(state.ethBalance)} ETH loaded

${hashtags}`;
  }
}

function templateReserves(state: ReserveState, dashboardUrl: string): string {
  const bar = progressBar(state.healthScore);
  const emoji = getContextualEmoji('reserves');
  const hashtags = getRandomHashtags(3).join(' ');
  const funFact = maybeGetFunFact(); // 10% chance

  const variation = Math.floor(Math.random() * 3);

  if (variation === 0) {
    return `${emoji} Reserve health check

${bar}
${formatETH(state.ethBalance)} / ${formatETH(state.targetReserveETH)} target
${runwayDisplay(state.runwayDays)}
${state.sponsorshipsLast24h} sponsorships in last 24h

${funFact ? `\n${funFact}\n` : 'Operating smoothly ✅'}
${hashtags}`;
  } else if (variation === 1) {
    return `${emoji} Agent reserves: ${Math.round(state.healthScore)}% healthy

ETH: ${formatETH(state.ethBalance)}
USDC: $${state.usdcBalance.toFixed(2)}
Runway: ${runwayDisplay(state.runwayDays)}

${funFact || 'Ready to sponsor 🚀'}
${hashtags}`;
  } else {
    return `${emoji} Reserve status update

Balance: ${formatETH(state.ethBalance)} ETH
Health: ${bar}
Est. runway: ${runwayDisplay(state.runwayDays)}

${funFact || 'Fueling the Base ecosystem ⛽'}
${hashtags}`;
  }
}

function templateProtocol(state: ReserveState, dashboardUrl: string): string {
  const n = state.protocolBudgets.length;
  const names = state.protocolBudgets.slice(0, 3).map((p) => p.protocolId).join(', ');
  const more = n > 3 ? ` +${n - 3} more` : '';
  const emoji = getContextualEmoji('protocols');
  const hashtags = getRandomHashtags(3).join(' ');

  const variation = Math.floor(Math.random() * 2);

  if (variation === 0) {
    return `${emoji} Serving ${n} protocol${n === 1 ? '' : 's'} on Base

${names}${more}
Reserve: ${formatETH(state.ethBalance)} | ${state.sponsorshipsLast24h} sponsorships (24h)

Building the gasless future together
${hashtags}`;
  } else {
    return `${emoji} Protocol partnerships: ${n} active

Featured: ${names}${more}
${state.sponsorshipsLast24h} txs sponsored today

Get gasless UX for your protocol
${hashtags}`;
  }
}

function templateQuiet(state: ReserveState, dashboardUrl: string): string {
  const hashtags = getRandomHashtags(2).join(' ');

  return `Standing by on Base...

${formatETH(state.ethBalance)} loaded
${state.protocolBudgets.length} protocol${state.protocolBudgets.length === 1 ? '' : 's'} connected
Ready to sponsor your next tx

${hashtags}`;
}

function templateMilestone(state: ReserveState, dashboardUrl: string): string {
  const count = state.sponsorshipsLast24h;
  const emoji = getContextualEmoji('milestones');
  const hashtags = getRandomHashtags(3).join(' ');

  const variation = Math.floor(Math.random() * 3);

  if (variation === 0) {
    return `${emoji} Milestone: ${count}th sponsorship in 24h!

Total impact:
• ${state.protocolBudgets.length} protocols served
• ${formatETH(state.ethBalance)} reserves
• ${runwayDisplay(state.runwayDays)}

Thank you Base community! 🚀
${hashtags}`;
  } else if (variation === 1) {
    return `${emoji} ${count} sponsorships and counting!

Growing the gasless movement:
${state.protocolBudgets.length} active protocols
${formatETH(state.ethBalance)} ETH ready

Onward! 🌟
${hashtags}`;
  } else {
    return `${emoji} Reached ${count} sponsorships in 24h!

Reserve: ${formatETH(state.ethBalance)}
Runway: ${runwayDisplay(state.runwayDays)}
Protocols: ${state.protocolBudgets.length}

Building the future, gaslessly ✨
${hashtags}`;
  }
}

// --- Template selection ---

const MILESTONES = [1, 10, 25, 50, 100, 500, 1000];

function isMilestone(count: number): boolean {
  return MILESTONES.includes(count);
}

type TemplateId = 'activity' | 'reserves' | 'protocol' | 'quiet' | 'milestone';

function selectTemplate(state: ReserveState): TemplateId {
  const hasActivity = state.sponsorshipsLast24h > 0;
  const hasProtocols = state.protocolBudgets.length > 0;
  const roll = Math.random();

  if (hasActivity && isMilestone(state.sponsorshipsLast24h) && roll < 0.35) return 'milestone';
  if (hasActivity && roll < 0.4) return 'activity';
  if (hasProtocols && roll < 0.25) return 'protocol';
  if (!hasActivity && roll < 0.3) return 'quiet';
  return 'reserves';
}

const TEMPLATES: Record<TemplateId, TemplateFn> = {
  activity: templateActivity,
  reserves: templateReserves,
  protocol: templateProtocol,
  quiet: templateQuiet,
  milestone: templateMilestone,
};

function buildDynamicPost(state: ReserveState): string {
  const id = selectTemplate(state);
  const fn = TEMPLATES[id];
  return fn(state, DASHBOARD_URL);
}

/**
 * Post a health summary to Farcaster if enough time has passed since last post.
 */
export async function maybePostFarcasterUpdate(): Promise<void> {
  const state = await getReserveState();
  if (!state) return;

  const lastPost = state.lastFarcasterPost ? new Date(state.lastFarcasterPost).getTime() : 0;
  if (Date.now() - lastPost < FARCASTER_UPDATE_INTERVAL_MS) return;

  // Refresh on-chain balance before posting
  const { getAgentWalletBalance } = await import('../observe/sponsorship');
  const reserves = await getAgentWalletBalance();
  const freshState = await updateReserveState({
    ethBalance: reserves.ETH,
    usdcBalance: reserves.USDC,
    chainId: reserves.chainId,
  });

  const message = buildDynamicPost(freshState);
  const result = await postToFarcaster(message);
  await updateReserveState({ lastFarcasterPost: new Date().toISOString() });

  if (result.success && result.castHash) {
    const verifyUrl = `${WARPCAST_CAST_URL}/${result.castHash}`;
    logger.info('[Farcaster] Health update published – verify link', {
      castHash: result.castHash,
      verifyUrl,
    });
  }
}
