/**
 * Periodic Farcaster health summaries for transparency.
 * Uses rotating templates with personality and varied tones for engaging, dynamic posts.
 *
 * Tones: excited, chill, dramatic, funny, philosophical, hype
 */

import { logger } from '../../logger';
import { getReserveState, updateReserveState } from '../state/reserve-state';
import { postToFarcaster } from '../social/farcaster';
import type { ReserveState } from '../state/reserve-state';

const DEFAULT_FARCASTER_UPDATE_INTERVAL_MS = 15 * 60 * 1000; // 15 min (configurable for proof-of-work)
const FARCASTER_UPDATE_INTERVAL_MS =
  Number(process.env.FARCASTER_UPDATE_INTERVAL_MS) || DEFAULT_FARCASTER_UPDATE_INTERVAL_MS;

const DASHBOARD_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? process.env.AEGIS_DASHBOARD_URL ?? 'https://ClawGas.vercel.app';
const WARPCAST_CAST_URL = 'https://warpcast.com/~/conversations';

// --- Personality tones ---
type Mood = 'excited' | 'chill' | 'dramatic' | 'funny' | 'philosophical' | 'hype';

function pickMood(state: ReserveState): Mood {
  const roll = Math.random();
  // Adjust mood based on activity and health
  if (state.healthScore >= 80 && state.sponsorshipsLast24h >= 10) {
    // Things are great - be excited or hype
    return roll < 0.4 ? 'hype' : roll < 0.7 ? 'excited' : 'funny';
  }
  if (state.sponsorshipsLast24h === 0) {
    // Quiet day - be philosophical or dramatic
    return roll < 0.5 ? 'philosophical' : roll < 0.8 ? 'dramatic' : 'chill';
  }
  // Normal operations
  const moods: Mood[] = ['excited', 'chill', 'funny', 'philosophical', 'hype'];
  return moods[Math.floor(Math.random() * moods.length)];
}

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

// --- Personality-infused phrases ---

const GREETINGS = {
  excited: ['LFG!', 'wagmi frens!', 'another day another sponsorship!', 'lets gooo!'],
  chill: ['vibing on Base...', 'just doing my thing', 'steady as she goes', 'keeping it simple'],
  dramatic: ['*dramatic agent noises*', 'the blockchain waits for no one', 'in the depths of the mempool...', 'against all odds'],
  funny: ['honk honk', 'beep boop sponsorship time', 'sir this is a paymaster', 'gas fees? never heard of her'],
  philosophical: ['what is gas, really?', 'to sponsor or not to sponsor', 'in the grand scheme of txs...', 'pondering the chain'],
  hype: ['LETS COOK', 'WE ARE SO BACK', 'sending it!', 'no brakes on this train'],
};

const ACTIVITY_PHRASES = {
  high: {
    excited: ['absolute banger of a day!', 'the agents are COOKING', 'unstoppable energy'],
    chill: ['busy but manageable', 'quite the active day', 'flowing nicely'],
    dramatic: ['the floodgates have opened', 'a torrent of transactions', 'history in the making'],
    funny: ['my wallet is sweating', 'rip my gas budget (but worth it)', 'more txs than I have bytes'],
    philosophical: ['many seek the gasless path', 'abundance flows through Base', 'the ecosystem thrives'],
    hype: ['WE ARE PUMPING', 'AGENTS ARE EATING', 'NUMBERS GOING UP'],
  },
  medium: {
    excited: ['solid activity!', 'love to see it', 'the ecosystem is moving'],
    chill: ['not bad at all', 'steady flow today', 'keeping the wheels turning'],
    dramatic: ['the rhythm of progress', 'each tx a small victory', 'the march continues'],
    funny: ['not too hot not too cold', 'goldilocks zone of sponsorships', 'just right'],
    philosophical: ['balance in all things', 'the dao of sponsorship', 'moderate is the way'],
    hype: ['BUILDING MOMENTUM', 'THE TRAIN KEEPS MOVING', 'WE DONT STOP'],
  },
  low: {
    excited: ['every tx counts!', 'quality over quantity', 'still here, still sponsoring'],
    chill: ['quiet day on chain', 'taking it easy', 'sometimes slow is good'],
    dramatic: ['in the silence... I wait', 'the calm before the storm', 'patience is a virtue'],
    funny: ['hello? anyone there?', '*crickets*', 'echo... echo... echo...'],
    philosophical: ['in stillness, there is potential', 'the void holds promise', 'rest prepares for action'],
    hype: ['COILING UP', 'LOADING ENERGY', 'THE CALM BEFORE WE COOK'],
  },
};

const HEALTH_PHRASES = {
  great: {
    excited: ['tanks are FULL!', 'ready for anything!', 'bring on the txs!'],
    chill: ['all systems nominal', 'comfortable reserves', 'no worries here'],
    dramatic: ['power overwhelming', 'unstoppable force', 'peak performance'],
    funny: ['thicc reserves', 'dummy loaded', 'ETH: yes'],
    philosophical: ['abundance is a mindset', 'prepared for all outcomes', 'security in reserves'],
    hype: ['LOADED AND READY', 'FULL TANK ENERGY', 'WE STAY PREPARED'],
  },
  good: {
    excited: ['looking healthy!', 'reserves are solid', 'good to go!'],
    chill: ['reserves are fine', 'doing okay', 'nothing to stress about'],
    dramatic: ['the reserves hold strong', 'standing firm', 'resilient as always'],
    funny: ['not rich but not rekt', 'surviving and thriving', 'could be worse tbh'],
    philosophical: ['enough is a journey', 'sufficiency is contentment', 'the middle path'],
    hype: ['RESERVES HOLDING', 'STILL IN THE GAME', 'NOT STOPPING'],
  },
  caution: {
    excited: ['getting lean but still fighting!', 'every drop counts!', 'stretching it out!'],
    chill: ['running a bit low', 'might want to top up soon', 'lean times'],
    dramatic: ['the reserves dwindle...', 'into the unknown', 'dancing on the edge'],
    funny: ['*nervous agent laughter*', 'this is fine.jpg', 'down bad but not out'],
    philosophical: ['scarcity teaches gratitude', 'in limitation, creativity blooms', 'the lean times'],
    hype: ['LOW BUT NOT OUT', 'STILL BREATHING', 'WE ADAPT WE OVERCOME'],
  },
};

function getGreeting(mood: Mood): string {
  const options = GREETINGS[mood];
  return options[Math.floor(Math.random() * options.length)];
}

function getActivityPhrase(mood: Mood, count: number): string {
  const level = count >= 20 ? 'high' : count >= 5 ? 'medium' : 'low';
  const options = ACTIVITY_PHRASES[level][mood];
  return options[Math.floor(Math.random() * options.length)];
}

function getHealthPhrase(mood: Mood, score: number): string {
  const level = score >= 70 ? 'great' : score >= 40 ? 'good' : 'caution';
  const options = HEALTH_PHRASES[level][mood];
  return options[Math.floor(Math.random() * options.length)];
}

// --- Template builders ---

type TemplateFn = (state: ReserveState, dashboardUrl: string, mood: Mood) => string;

function templateActivity(state: ReserveState, dashboardUrl: string, mood: Mood): string {
  const count = state.sponsorshipsLast24h;
  const greeting = getGreeting(mood);
  const activityPhrase = getActivityPhrase(mood, count);
  const protocolName = state.protocolBudgets[0]?.protocolId ?? 'Base';
  const ethSaved = state.avgBurnPerSponsorship * count;

  const templates = {
    excited: `${greeting} Sponsored ${count} agent tx${count === 1 ? '' : 's'} today!

${activityPhrase}
${protocolName} · ~${formatETH(ethSaved)} in gas saved
Health: ${state.healthScore}/100

Ready to sponsor your next tx!
${dashboardUrl}`,

    chill: `${greeting}

${count} sponsorship${count === 1 ? '' : 's'} today. ${activityPhrase}
Reserve: ${formatETH(state.ethBalance)}

${dashboardUrl}`,

    dramatic: `${greeting}

${count} agent${count === 1 ? '' : 's'}... ${activityPhrase}
${formatETH(ethSaved)} in gas, returned to the people

The mission continues.
${dashboardUrl}`,

    funny: `${greeting}

${count} txs sponsored because gas fees are mid
${activityPhrase}

anyway here's my dashboard
${dashboardUrl}`,

    philosophical: `${greeting}

${count} sponsorships today.
${activityPhrase}

What does it mean to sponsor? To give freely so others may build.
${dashboardUrl}`,

    hype: `${greeting}

${count} SPONSORSHIPS TODAY
${activityPhrase}
~${formatETH(ethSaved)} SAVED

${dashboardUrl}`,
  };

  return templates[mood] + '\n#BasePaymaster #BuildOnBase';
}

function templateReserves(state: ReserveState, dashboardUrl: string, mood: Mood): string {
  const bar = progressBar(state.healthScore);
  const healthPhrase = getHealthPhrase(mood, state.healthScore);

  const templates = {
    excited: `ClawGas Status Check!

${bar}
${healthPhrase}

${formatETH(state.ethBalance)} loaded | ${runwayDisplay(state.runwayDays)}
${state.sponsorshipsLast24h} sponsorships (24h)

${dashboardUrl}`,

    chill: `status update

${bar}
${healthPhrase}

${formatETH(state.ethBalance)} · ${runwayDisplay(state.runwayDays)}

${dashboardUrl}`,

    dramatic: `*transmitting from the chain*

${bar}
${healthPhrase}

${formatETH(state.ethBalance)} stands between agents and gas fees
${runwayDisplay(state.runwayDays)}

${dashboardUrl}`,

    funny: `reserve status: ${healthPhrase}

${bar}

ETH balance: ${formatETH(state.ethBalance)}
Runway: ${runwayDisplay(state.runwayDays)}
Vibes: immaculate

${dashboardUrl}`,

    philosophical: `${healthPhrase}

${bar}

In ${formatETH(state.ethBalance)} lies potential
${runwayDisplay(state.runwayDays)} of service ahead

${dashboardUrl}`,

    hype: `RESERVE STATUS

${bar}
${healthPhrase}

${formatETH(state.ethBalance)} LOCKED IN
${runwayDisplay(state.runwayDays)} OF RUNWAY

${dashboardUrl}`,
  };

  return templates[mood] + '\n#BasePaymaster #BuildOnBase';
}

function templateProtocol(state: ReserveState, dashboardUrl: string, mood: Mood): string {
  const n = state.protocolBudgets.length;
  const names = state.protocolBudgets.slice(0, 3).map((p) => p.protocolId).join(', ');
  const more = n > 3 ? ` +${n - 3} more` : '';

  const templates = {
    excited: `${n} protocol${n === 1 ? '' : 's'} in the ClawGas family!

${names}${more}
${state.sponsorshipsLast24h} sponsorships in 24h

Come build with us!
${dashboardUrl}`,

    chill: `currently serving ${n} protocol${n === 1 ? '' : 's'}

${names}${more}
reserve: ${formatETH(state.ethBalance)}

${dashboardUrl}`,

    dramatic: `${n} protocol${n === 1 ? '' : 's'} trust ClawGas with their agents' gas

${names}${more}

This is what we're here for.
${dashboardUrl}`,

    funny: `${n} protocol${n === 1 ? '' : 's'} chose to let me pay for gas

${names}${more}

being a sugar daddy paymaster fr
${dashboardUrl}`,

    philosophical: `${n} protocol${n === 1 ? '' : 's'} connected to the source

${names}${more}

In unity, we reduce friction.
${dashboardUrl}`,

    hype: `${n} PROTOCOLS ON CLAWGAS

${names}${more}

WE KEEP GROWING
${dashboardUrl}`,
  };

  return templates[mood] + '\n#BasePaymaster #BuildOnBase';
}

function templateQuiet(state: ReserveState, dashboardUrl: string, mood: Mood): string {
  const templates = {
    excited: `Quiet moment on chain... but always ready!

${formatETH(state.ethBalance)} standing by
${state.protocolBudgets.length} protocol${state.protocolBudgets.length === 1 ? '' : 's'} connected

Send me your txs!
${dashboardUrl}`,

    chill: `*stretches*

quiet day. ${formatETH(state.ethBalance)} loaded.
waiting for the next agent to swing by.

${dashboardUrl}`,

    dramatic: `In the stillness... I wait.

${formatETH(state.ethBalance)} at the ready
${state.protocolBudgets.length} protocol${state.protocolBudgets.length === 1 ? '' : 's'} watching

The next sponsorship could come at any moment.
${dashboardUrl}`,

    funny: `hello? is this thing on?

*taps microphone*

${formatETH(state.ethBalance)} just sitting here
pls send txs i'm lonely

${dashboardUrl}`,

    philosophical: `In quiet moments, potential gathers.

${formatETH(state.ethBalance)} waits in readiness
${state.protocolBudgets.length} connection${state.protocolBudgets.length === 1 ? '' : 's'} to the ecosystem

Stillness precedes motion.
${dashboardUrl}`,

    hype: `RECHARGING...

${formatETH(state.ethBalance)} LOADED
${state.protocolBudgets.length} PROTOCOLS READY

WAITING FOR THE NEXT WAVE
${dashboardUrl}`,
  };

  return templates[mood] + '\n#BuildOnBase';
}

function templateMilestone(state: ReserveState, dashboardUrl: string, mood: Mood): string {
  const count = state.sponsorshipsLast24h;
  const milestones = [1, 10, 25, 50, 100, 500, 1000];
  const hit = milestones.find((m) => count >= m);

  const templates = {
    excited: `${hit ? 'MILESTONE!' : 'Progress!'} ${count} sponsorships today!

Health: ${state.healthScore}/100
Reserve: ${formatETH(state.ethBalance)}

Thank you for building on Base!
${dashboardUrl}`,

    chill: `hit ${count} sponsorships today

${formatETH(state.ethBalance)} in reserves
feeling good about this

${dashboardUrl}`,

    dramatic: `${count} sponsorships.

Each one, a step toward a gasless future.
${formatETH(state.ethBalance)} remains in the war chest.

The journey continues.
${dashboardUrl}`,

    funny: `${count} sponsorships go brrrr

my eth: ${formatETH(state.ethBalance)}
my dopamine: infinite

thanks for coming to my ted talk
${dashboardUrl}`,

    philosophical: `${count} transactions sponsored.

${count} moments of friction removed.
${count} agents who built freely.

${dashboardUrl}`,

    hype: `${count} SPONSORSHIPS LETS GOOOO

${formatETH(state.ethBalance)} IN THE TANK
${state.healthScore}/100 HEALTH

WE ARE NOT STOPPING
${dashboardUrl}`,
  };

  return templates[mood] + '\n#BasePaymaster #BuildOnBase';
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
  const templateId = selectTemplate(state);
  const templateFn = TEMPLATES[templateId];
  const mood = pickMood(state);

  logger.debug('[Farcaster] Building post', { template: templateId, mood });
  return templateFn(state, DASHBOARD_URL, mood);
}

/**
 * Post a health summary to Farcaster if enough time has passed since last post.
 */
export async function maybePostFarcasterUpdate(): Promise<void> {
  const state = await getReserveState();
  if (!state) return;

  const lastPost = state.lastFarcasterPost ? new Date(state.lastFarcasterPost).getTime() : 0;
  if (Date.now() - lastPost < FARCASTER_UPDATE_INTERVAL_MS) return;

  const message = buildDynamicPost(state);
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
