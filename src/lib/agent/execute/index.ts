/**
 * Aegis Agent - Execution Layer
 * 
 * Handles the actual execution of decisions using Coinbase AgentKit.
 * The LLM never directly accesses this layer - all actions pass through policy first.
 */

import { executeWithAgentKit } from './agentkit';
import type { Decision } from '../reason/schemas';

export interface ExecutionResult {
  success: boolean;
  transactionHash?: string;
  blockNumber?: bigint;
  gasUsed?: bigint;
  error?: string;
  simulationResult?: unknown;
}

/**
 * Execute a decision (either live or in simulation mode)
 */
export async function execute(
  decision: Decision,
  mode: 'LIVE' | 'SIMULATION' = 'SIMULATION'
): Promise<ExecutionResult> {
  console.log(`[Execute] Processing decision in ${mode} mode:`, decision.action);

  try {
    if (decision.action === 'WAIT') {
      return {
        success: true,
        simulationResult: 'WAIT action - no execution needed',
      };
    }

    if (decision.action === 'ALERT_HUMAN') {
      // TODO: Implement alerting (email, Slack, etc.)
      console.log('[Execute] ALERT_HUMAN:', decision.parameters);
      return {
        success: true,
        simulationResult: 'Human alerted',
      };
    }

    // For actual blockchain actions, use AgentKit
    return await executeWithAgentKit(decision, mode);
  } catch (error) {
    console.error('[Execute] Execution error:', error);
    return {
      success: false,
      error: `Execution failed: ${error}`,
    };
  }
}

export { executeWithAgentKit } from './agentkit';
