/**
 * OrchestratorService — strategic planning layer.
 *
 * Responsibilities:
 *   1. Resolve adaptive config for the current mode
 *   2. Observe blockchain state (via mode.observe)
 *   3. Retrieve relevant memories (Pinecone + Postgres)
 *   4. Inject current gas price into config (gas-sponsorship only)
 *   5. Run LLM reasoning (via mode.reason)
 *   6. Return a TaskSpec for the DispatcherService to execute
 *
 * The Orchestrator never executes transactions or validates policy.
 * It purely produces a structured intent (TaskSpec).
 */

import { logger } from '../logger';
import { retrieveRelevantMemories } from '../agent/memory';
import { observeGasPrice } from '../agent/observe';
import { getAdaptiveGasSponsorshipConfig } from '../agent/modes/gas-sponsorship';
import { getReservePipelineConfig } from '../agent/modes/reserve-pipeline';
import type { AgentModeContext } from '../agent/types';
import type { AgentConfig, AgentMemory } from '../agent/index';
import type { TaskSpec } from './types';

let _nextId = 0;
function createId(): string {
  _nextId += 1;
  return `task-${Date.now()}-${_nextId}`;
}

export class OrchestratorService {
  /**
   * Run one orchestration step for the given mode context.
   * Returns null when there are no observations to reason about.
   */
  async orchestrate(ctx: AgentModeContext): Promise<TaskSpec | null> {
    const { mode } = ctx;
    const key = mode.id;

    // 1. Resolve adaptive config
    let config: AgentConfig;
    if (key === 'gas-sponsorship') {
      config = await getAdaptiveGasSponsorshipConfig();
    } else if (key === 'reserve-pipeline') {
      config = getReservePipelineConfig();
    } else {
      config = { ...ctx.config, mode: key };
    }

    // 2. Observe blockchain state
    const observations = await mode.observe();
    if (!observations.length) {
      logger.info('[Orchestrator] No observations, skipping reasoning', { mode: key });
      return null;
    }

    // 3. Retrieve memories
    const memories = (await retrieveRelevantMemories(observations)) as AgentMemory[];

    // 4. Inject current gas price (gas-sponsorship only)
    let configWithGas = config;
    if (key === 'gas-sponsorship') {
      const gasObs = await observeGasPrice();
      const gasData = gasObs[0]?.data as { gasPriceGwei?: string } | undefined;
      const currentGasPriceGwei =
        gasData?.gasPriceGwei != null ? parseFloat(String(gasData.gasPriceGwei)) : undefined;
      configWithGas = { ...config, currentGasPriceGwei };
    }

    // 5. Reason (LLM call)
    const decision = await mode.reason(observations, memories);

    logger.info('[Orchestrator] Task spec created', {
      mode: key,
      action: decision.action,
      confidence: decision.confidence,
    });

    return {
      id: createId(),
      modeId: key,
      decision,
      config: configWithGas,
      observations,
      memories,
      createdAt: new Date(),
    };
  }
}
