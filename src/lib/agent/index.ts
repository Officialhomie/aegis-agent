/**
 * Aegis Agent - Main Orchestrator
 * 
 * This is the central coordinator for the agent's observe-reason-decide-act-memory loop.
 * It connects all the agent components and manages the decision cycle.
 */

import { logger } from '../logger';
import { observe } from './observe';
import { reason } from './reason';
import { validatePolicy } from './policy';
import { execute } from './execute';
import { storeMemory, retrieveRelevantMemories } from './memory';
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
 * Main agent loop - observes, reasons, decides, and executes
 */
export async function runAgentCycle(config: AgentConfig = defaultConfig): Promise<AgentState> {
  const state: AgentState = {
    observations: [],
    memories: [],
    currentDecision: null,
    executionResult: null,
  };

  try {
    // Step 1: OBSERVE - Gather current state from blockchain and other sources
    logger.info('[Aegis] Observing current state...');
    state.observations = await observe();

    // Step 2: RETRIEVE MEMORIES - Get relevant past experiences
    logger.info('[Aegis] Retrieving relevant memories...');
    state.memories = (await retrieveRelevantMemories(state.observations)) as AgentMemory[];

    // Step 3: REASON - Use LLM to analyze state and propose action
    logger.info('[Aegis] Reasoning about state...');
    const decision = await reason(state.observations, state.memories);
    state.currentDecision = decision;

    // Step 4: VALIDATE POLICY - Check decision against safety rules
    logger.info('[Aegis] Validating against policy rules...');
    const policyResult = await validatePolicy(decision, config);

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

    // Step 5: EXECUTE - Perform the action (if confidence threshold met)
    if (decision.confidence >= config.confidenceThreshold) {
      logger.info('[Aegis] Executing decision...');

      if (config.executionMode === 'READONLY') {
        logger.info('[Aegis] READONLY mode - skipping execution');
      } else {
        state.executionResult = await execute(decision, config.executionMode);
      }
    } else {
      logger.info('[Aegis] Confidence below threshold - waiting', {
        confidence: decision.confidence,
        threshold: config.confidenceThreshold,
      });
    }

    // Step 6: STORE MEMORY - Record the experience for future learning
    logger.info('[Aegis] Storing memory...');
    await storeMemory({
      type: 'DECISION',
      observations: state.observations,
      decision,
      outcome: state.executionResult,
    });

    return state;
  } catch (error) {
    logger.error('[Aegis] Error in agent cycle', { error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

/**
 * Start the agent in continuous monitoring mode with graceful shutdown.
 */
export async function startAgent(
  config: AgentConfig = defaultConfig,
  intervalMs: number = 60000
): Promise<void> {
  logger.info('[Aegis] Starting agent', { executionMode: config.executionMode, confidenceThreshold: config.confidenceThreshold });

  let cycleTimer: ReturnType<typeof setInterval> | null = null;
  let draining = false;

  const runCycle = async () => {
    if (draining) return;
    try {
      await runAgentCycle(config);
    } catch (error) {
      logger.error('[Aegis] Cycle error', { error: error instanceof Error ? error.message : String(error) });
    }
  };

  const shutdown = async () => {
    draining = true;
    if (cycleTimer) clearInterval(cycleTimer);
    cycleTimer = null;
    logger.info('[Aegis] Shutting down gracefully');
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  await runCycle();
  cycleTimer = setInterval(runCycle, intervalMs);
}

export { observe } from './observe';
export { reason } from './reason';
export { validatePolicy } from './policy';
export { execute } from './execute';
export { storeMemory, retrieveRelevantMemories } from './memory';
