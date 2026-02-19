/**
 * DispatcherService — operational routing layer.
 *
 * Responsibilities:
 *   1. Validate policy against the task spec (27 mandatory rules)
 *   2. Check confidence threshold
 *   3. Check execution mode (READONLY short-circuit)
 *   4. Route to the correct executor via the registry
 *   5. Return a TaskResult back to MultiModeAgent for memory storage
 *
 * The Dispatcher never reasons about what to do — it only enforces
 * constraints and delegates execution.
 */

import { logger } from '../logger';
import { validatePolicy } from '../agent/policy';
import { getExecutor } from '../executors';
import type { TaskSpec, TaskResult } from '../orchestrator/types';

export class DispatcherService {
  async dispatch(spec: TaskSpec): Promise<TaskResult> {
    const { id, modeId, decision, config } = spec;

    const base = {
      taskId: id,
      modeId,
      executionResult: null,
      policyPassed: false,
      policyErrors: [] as string[],
      skipped: true,
    } as const;

    // 1. Policy validation
    const policyResult = await validatePolicy(decision, config);
    if (!policyResult.passed) {
      logger.warn('[Dispatcher] Policy rejected', {
        mode: modeId,
        errors: policyResult.errors,
      });
      return {
        ...base,
        policyErrors: policyResult.errors,
        skipReason: 'POLICY',
      };
    }

    // 2. Confidence threshold
    if (decision.confidence < config.confidenceThreshold) {
      logger.info('[Dispatcher] Below confidence threshold', {
        mode: modeId,
        confidence: decision.confidence,
        threshold: config.confidenceThreshold,
      });
      return { ...base, policyPassed: true, skipReason: 'CONFIDENCE' };
    }

    // 3. READONLY mode short-circuit
    if (config.executionMode === 'READONLY') {
      logger.info('[Dispatcher] READONLY mode — skipping execution', { mode: modeId });
      return { ...base, policyPassed: true, skipReason: 'READONLY' };
    }

    // 4. Route to executor
    const executor = getExecutor(decision.action);
    logger.info('[Dispatcher] Routing to executor', {
      mode: modeId,
      action: decision.action,
      executor: executor.constructor.name,
    });

    const executionResult = await executor.execute(spec);

    return {
      taskId: id,
      modeId,
      executionResult,
      policyPassed: true,
      policyErrors: [],
      skipped: false,
    };
  }
}
