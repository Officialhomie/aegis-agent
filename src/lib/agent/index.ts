/**
 * Aegis Agent - Main Orchestrator
 * 
 * This is the central coordinator for the agent's observe-reason-decide-act-memory loop.
 * It connects all the agent components and manages the decision cycle.
 */

import { getPrisma } from '../db';
import { logger } from '../logger';
import { runStartupValidation, getCurrentNetworkName } from '../startup-validation';
import { observeBaseSponsorshipOpportunities, observeGasPrice } from './observe';
import {
  hasSignificantChange,
  getPreviousObservations,
  savePreviousObservations,
} from './observe/observation-filter';
import { reasonAboutSponsorship } from './reason';
import { validatePolicy } from './policy';
import { execute } from './execute';
import { storeMemory, retrieveRelevantMemories } from './memory';
import { getDefaultCircuitBreaker } from './execute/circuit-breaker';
import { signDecision, sponsorTransaction } from './execute/paymaster';
import { postSponsorshipProof } from './social/farcaster';
import { postSponsorshipToBotchan, postReserveSwapToBotchan } from './social/botchan';
import {
  getIdentityRegistryAddress,
  getAgentRegistryString,
  registerWithRegistry,
  setAgentURI,
  uploadToIPFS,
  buildRegistrationFile,
} from './identity';
import { incrementCounter } from '../monitoring/metrics';
import type { Observation } from './observe';
import type { Decision } from './reason/schemas';
import type { ExecutionResult } from './execute';

export interface AgentConfig {
  confidenceThreshold: number;
  maxTransactionValueUsd: number;
  executionMode: 'LIVE' | 'SIMULATION' | 'READONLY';
  /** Max gas price in Gwei - if set, policy rejects when currentGasPriceGwei exceeds this */
  gasPriceMaxGwei?: number;
  /** Current gas price in Gwei - set by orchestrator before validate for gas-price-limit rule */
  currentGasPriceGwei?: number;
  /** Allowed recipient/contract addresses (TRANSFER recipient, EXECUTE contractAddress) */
  allowedAddresses?: string[];
  /** Max slippage tolerance for SWAP (0-1) */
  maxSlippageTolerance?: number;
  /** Rate limit: max actions per window */
  maxActionsPerWindow?: number;
  /** Rate limit: window in ms */
  rateLimitWindowMs?: number;
  /** Agent mode (e.g. 'reserve-pipeline', 'gas-sponsorship') for isolated rate limit / circuit breaker */
  mode?: string;
  /** Trigger source (e.g. 'reactive', 'polling') */
  triggerSource?: string;
  /** Event payload when triggered by external source (e.g. Reactive Network) */
  eventData?: unknown;
}

/** In-memory representation of a retrieved memory (from memory layer) */
export interface AgentMemory {
  id: string;
  type: string;
  content: string;
  metadata: Record<string, unknown>;
  importance: number;
  createdAt: Date;
}

export interface AgentState {
  observations: Observation[];
  memories: AgentMemory[];
  currentDecision: Decision | null;
  executionResult: ExecutionResult | null;
}

const defaultConfig: AgentConfig = {
  confidenceThreshold: 0.75,
  maxTransactionValueUsd: 10000,
  executionMode: 'SIMULATION',
};

/**
 * @deprecated Use runSponsorshipCycle() or MultiModeAgent for unified reserve + sponsorship. Runs a single sponsorship cycle for backward compatibility.
 */
export async function runAgentCycle(config: AgentConfig = defaultConfig): Promise<AgentState> {
  logger.warn('[Aegis] runAgentCycle is deprecated; use runSponsorshipCycle() or MultiModeAgent');
  return runSponsorshipCycle({ ...sponsorshipDefaultConfig, ...config });
}

const sponsorshipDefaultConfig: AgentConfig = {
  confidenceThreshold: 0.8,
  maxTransactionValueUsd: 100,
  executionMode: 'LIVE',
  triggerSource: 'autonomous-loop',
  gasPriceMaxGwei: 2,
};

/**
 * Check if we should post this sponsorship to Farcaster.
 * Posts every 42nd sponsorship to stay within Neynar free tier (740 posts/month / 30,000 sponsorships/month).
 */
async function shouldPostSponsorshipProof(): Promise<boolean> {
  const store = await import('./state-store').then((m) => m.getStateStore());
  const stateStore = await store;
  const key = 'sponsorship:farcaster:counter';
  const data = await stateStore.get(key);
  let count = 1;
  if (data) {
    try {
      count = parseInt(data, 10) + 1;
    } catch {
      count = 1;
    }
  }
  await stateStore.set(key, count.toString());
  const shouldPost = count % 42 === 0;
  if (shouldPost) {
    logger.info('[Aegis] Posting sponsorship proof to Farcaster', { sponsorshipNumber: count, reason: 'Every 42nd sponsorship' });
  } else {
    logger.debug('[Aegis] Skipping Farcaster post for this sponsorship', { sponsorshipNumber: count, nextPost: 42 - (count % 42) });
  }
  return shouldPost;
}

/**
 * Sponsorship cycle: observe Base opportunities, reason, validate, execute (sponsor or swap reserves), prove (Farcaster), store memory.
 */
export async function runSponsorshipCycle(
  config: AgentConfig = sponsorshipDefaultConfig
): Promise<AgentState> {
  const state: AgentState = {
    observations: [],
    memories: [],
    currentDecision: null,
    executionResult: null,
  };

  try {
    logger.info('[Aegis] Observing Base for sponsorship opportunities...');
    state.observations = await observeBaseSponsorshipOpportunities();

    const circuitBreaker = getDefaultCircuitBreaker();
    const health = await (circuitBreaker as { checkHealthBeforeExecution?: () => Promise<{ healthy: boolean; reason?: string }> }).checkHealthBeforeExecution?.();
    if (health && !health.healthy) {
      logger.warn('[Aegis] Health check failed, skipping cycle', { reason: health.reason });
      return state;
    }

    logger.info('[Aegis] Retrieving relevant memories...');
    state.memories = (await retrieveRelevantMemories(state.observations)) as AgentMemory[];

    const gasObs = await observeGasPrice();
    const gasData = gasObs[0]?.data as { gasPriceGwei?: string } | undefined;
    const currentGasPriceGwei = gasData?.gasPriceGwei != null ? parseFloat(String(gasData.gasPriceGwei)) : undefined;
    const configWithGas: AgentConfig = { ...config, currentGasPriceGwei };

    const previousObs = await getPreviousObservations();
    const hasChanges = await hasSignificantChange(state.observations, previousObs);
    incrementCounter('aegis_observation_filter_total', 1);

    if (!hasChanges) {
      incrementCounter('aegis_observation_filter_skips', 1);
      state.currentDecision = {
        action: 'WAIT',
        confidence: 1.0,
        reasoning: 'No significant changes detected in observations',
        parameters: null,
        preconditions: [],
        expectedOutcome: 'Re-evaluate next cycle',
        metadata: { skippedReasoning: true, reason: 'observation-filter' },
      } as Decision;
      logger.info('[Aegis] Skipping LLM reasoning - observations stable', {
        action: 'WAIT',
        reason: 'No significant changes detected',
      });
      await savePreviousObservations(state.observations);
      await storeMemory({
        type: 'DECISION',
        observations: state.observations,
        decision: state.currentDecision,
        outcome: { success: true, message: 'No changes, skipped reasoning' },
      });
      return state;
    }

    logger.info('[Aegis] Reasoning about sponsorship opportunities...');
    const decision = await reasonAboutSponsorship(state.observations, state.memories);
    state.currentDecision = decision;

    logger.info('[Aegis] Validating against policy rules...');
    const policyResult = await validatePolicy(decision, configWithGas);

    if (!policyResult.passed) {
      logger.warn('[Aegis] Decision rejected by policy', { errors: policyResult.errors });
      await storeMemory({
        type: 'DECISION',
        decision,
        outcome: 'POLICY_REJECTED',
        policyErrors: policyResult.errors,
      });
      return state;
    }

    if (decision.confidence >= config.confidenceThreshold) {
      logger.info('[Aegis] Executing sponsorship...');
      if (config.executionMode !== 'READONLY') {
        if (decision.action === 'SPONSOR_TRANSACTION') {
          const signed = await signDecision(decision);
          state.executionResult = await sponsorTransaction(decision, config.executionMode === 'LIVE' ? 'LIVE' : 'SIMULATION');
          const shouldPostToFarcaster = await shouldPostSponsorshipProof();
          if (shouldPostToFarcaster) {
            await postSponsorshipProof(signed, state.executionResult as ExecutionResult & { sponsorshipHash?: string; decisionHash?: string });
          }
          postSponsorshipToBotchan(signed, state.executionResult as ExecutionResult & { sponsorshipHash?: string; decisionHash?: string }).catch(() => {});
          if (state.executionResult?.success) {
            const { updateReservesAfterSponsorship } = await import('./execute/post-sponsorship');
            await updateReservesAfterSponsorship(state.executionResult, config.currentGasPriceGwei);
          }
        } else {
          state.executionResult = await execute(decision, config.executionMode);
          if (decision.action === 'SWAP_RESERVES' && state.executionResult) {
            postReserveSwapToBotchan(decision, state.executionResult).catch(() => {});
          }
        }
      }
    } else {
      logger.info('[Aegis] Confidence below threshold - waiting', {
        confidence: decision.confidence,
        threshold: config.confidenceThreshold,
      });
    }

    await storeMemory({
      type: 'DECISION',
      observations: state.observations,
      decision,
      outcome: state.executionResult,
    });

    await savePreviousObservations(state.observations);
    return state;
  } catch (error) {
    logger.error('[Aegis] Error in sponsorship cycle', { error: error instanceof Error ? error.message : String(error) });
    await import('./execute/alerts').then(({ sendAlert }) =>
      sendAlert({
        severity: 'HIGH',
        message: `Sponsorship cycle error: ${error instanceof Error ? error.message : String(error)}`,
      })
    ).catch(() => {});
    return state;
  }
}

/**
 * Ensure agent is registered on ERC-8004 Identity Registry when configured.
 * Two-step flow: register(uri), then setAgentURI(agentId, uriWithBackReference) so the agent is discoverable.
 * Skips when no active agent, agent already has onChainId, or registry not configured.
 */
export async function ensureAgentRegistered(): Promise<void> {
  const registryAddress = getIdentityRegistryAddress();
  if (!registryAddress) return;
  const prisma = getPrisma();
  try {
    const agent = await prisma.agent.findFirst({ where: { isActive: true } });
    if (!agent || agent.onChainId) return;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.AEGIS_DASHBOARD_URL ?? '';
    const image =
      process.env.AEGIS_AGENT_IMAGE_URL?.trim() ||
      'https://imgproxy.divecdn.com/-OwYxUXWv0C9nSm3eW6E5k5GJyU0wZ8F1_zYkfTrS5k/g:ce/rs:fill:1200:675:1/Z3M6Ly9kaXZlc2l0ZS1zdG9yYWdlL2RpdmVpbWFnZS9HZXR0eUltYWdlcy0yMjE2MTkwODA5LmpwZw==.webp';
    const registrationFile = buildRegistrationFile({
      name: agent.name,
      description: agent.description ?? 'Aegis - Autonomous Gas Sponsorship Agent',
      image,
      webEndpoint: baseUrl ? `${baseUrl.replace(/\/$/, '')}` : undefined,
      a2aEndpoint: baseUrl ? `${baseUrl.replace(/\/$/, '')}/.well-known/agent-card.json` : undefined,
      x402Support: true,
    });
    const uri = await uploadToIPFS(registrationFile);
    const { agentId, txHash } = await registerWithRegistry(uri);
    const agentRegistry = getAgentRegistryString();
    if (agentRegistry) {
      const updatedFile = buildRegistrationFile({
        name: agent.name,
        description: agent.description ?? 'Aegis - Autonomous Gas Sponsorship Agent',
        image,
        webEndpoint: baseUrl ? `${baseUrl.replace(/\/$/, '')}` : undefined,
        a2aEndpoint: baseUrl ? `${baseUrl.replace(/\/$/, '')}/.well-known/agent-card.json` : undefined,
        x402Support: true,
        existingRegistration: { agentId: Number(agentId), agentRegistry },
      });
      const uriWithBackRef = await uploadToIPFS(updatedFile);
      await setAgentURI(agentId, uriWithBackRef);
    }
    await prisma.agent.update({
      where: { id: agent.id },
      data: { onChainId: agentId.toString(), walletAddress: process.env.AGENT_WALLET_ADDRESS ?? undefined },
    });
    logger.info('[ERC-8004] Agent registered', { agentId: agentId.toString(), txHash });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const hint =
      msg.includes('allowance') || msg.includes('gas required')
        ? 'Agent wallet may need Base Sepolia ETH for gas. Set ERC8004_NETWORK=base-sepolia and fund AGENT_WALLET_ADDRESS.'
        : undefined;
    logger.warn('[ERC-8004] ensureAgentRegistered failed', {
      error: msg,
      hint,
      network: process.env.ERC8004_NETWORK,
      registry: getIdentityRegistryAddress(),
    });
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Start unified agent: Reserve Pipeline + Gas Sponsorship (multi-mode).
 * Use scripts/run-agent.ts for CLI. Reserve runs every 5 min, sponsorship every 1 min.
 *
 * IMPORTANT: Runs startup validation first. In production, fails if required config is missing.
 */
export async function startAutonomousPaymaster(intervalMs: number = 60000): Promise<void> {
  // Run startup validation before anything else
  // This will throw in production if required config is missing
  runStartupValidation();

  logger.info(`[Aegis] Starting autonomous paymaster on ${getCurrentNetworkName()}`);

  // Initialize Redis cache layer (Phase 1: Critical for 1000 txs/day scale)
  try {
    const { initializeCache } = await import('../cache');
    await initializeCache();
    logger.info('[Aegis] Cache layer initialized successfully');
  } catch (error) {
    logger.warn('[Aegis] Cache initialization failed - continuing without cache', {
      error: error instanceof Error ? error.message : String(error),
    });
    // Continue without cache - agent will fallback to direct database queries
  }

  await ensureAgentRegistered();
  const { MultiModeAgent } = await import('./multi-mode-agent');
  const { reservePipelineMode, gasSponsorshipMode } = await import('./modes');
  const agent = new MultiModeAgent({
    modes: [reservePipelineMode, gasSponsorshipMode],
    intervals: {
      'reserve-pipeline': Number(process.env.RESERVE_PIPELINE_INTERVAL_MS) || 5 * 60 * 1000,
      'gas-sponsorship': intervalMs,
    },
  });
  await agent.start();
}

export { observe } from './observe';
export { validatePolicy } from './policy';
export { execute } from './execute';
export { storeMemory, retrieveRelevantMemories } from './memory';
