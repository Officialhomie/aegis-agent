/**
 * Aegis Agent - Main Orchestrator
 * 
 * This is the central coordinator for the agent's observe-reason-decide-act-memory loop.
 * It connects all the agent components and manages the decision cycle.
 */

import { observe } from './observe';
import { reason } from './reason';
import { validatePolicy } from './policy';
import { execute } from './execute';
import { storeMemory, retrieveRelevantMemories } from './memory';

export interface AgentConfig {
  confidenceThreshold: number;
  maxTransactionValueUsd: number;
  executionMode: 'LIVE' | 'SIMULATION' | 'READONLY';
}

export interface AgentState {
  observations: unknown[];
  memories: unknown[];
  currentDecision: unknown | null;
  executionResult: unknown | null;
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
    console.log('[Aegis] Observing current state...');
    state.observations = await observe();

    // Step 2: RETRIEVE MEMORIES - Get relevant past experiences
    console.log('[Aegis] Retrieving relevant memories...');
    state.memories = await retrieveRelevantMemories(state.observations);

    // Step 3: REASON - Use LLM to analyze state and propose action
    console.log('[Aegis] Reasoning about state...');
    const decision = await reason(state.observations, state.memories);
    state.currentDecision = decision;

    // Step 4: VALIDATE POLICY - Check decision against safety rules
    console.log('[Aegis] Validating against policy rules...');
    const policyResult = await validatePolicy(decision, config);

    if (!policyResult.passed) {
      console.log('[Aegis] Decision rejected by policy:', policyResult.errors);
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
      console.log('[Aegis] Executing decision...');
      
      if (config.executionMode === 'READONLY') {
        console.log('[Aegis] READONLY mode - skipping execution');
      } else {
        state.executionResult = await execute(decision, config.executionMode);
      }
    } else {
      console.log(`[Aegis] Confidence ${decision.confidence} below threshold ${config.confidenceThreshold} - waiting`);
    }

    // Step 6: STORE MEMORY - Record the experience for future learning
    console.log('[Aegis] Storing memory...');
    await storeMemory({
      type: 'DECISION',
      observations: state.observations,
      decision,
      outcome: state.executionResult,
    });

    return state;
  } catch (error) {
    console.error('[Aegis] Error in agent cycle:', error);
    throw error;
  }
}

/**
 * Start the agent in continuous monitoring mode
 */
export async function startAgent(
  config: AgentConfig = defaultConfig,
  intervalMs: number = 60000
): Promise<void> {
  console.log('[Aegis] Starting agent with config:', config);
  
  const runCycle = async () => {
    try {
      await runAgentCycle(config);
    } catch (error) {
      console.error('[Aegis] Cycle error:', error);
    }
  };

  // Run immediately, then on interval
  await runCycle();
  setInterval(runCycle, intervalMs);
}

export { observe } from './observe';
export { reason } from './reason';
export { validatePolicy } from './policy';
export { execute } from './execute';
export { storeMemory, retrieveRelevantMemories } from './memory';
