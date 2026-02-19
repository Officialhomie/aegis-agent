/**
 * Executor interface — implemented by SponsorExecutor and ReserveExecutor.
 *
 * Each executor handles a specific set of decision action types.
 * The DispatcherService uses the registry to select the correct executor.
 */

import type { TaskSpec } from '../orchestrator/types';
import type { ExecutionResult } from '../agent/execute';

export interface ExecutorInterface {
  /** Decision action types this executor handles */
  readonly handles: ReadonlyArray<string>;
  /** Execute the given task spec and return a result */
  execute(spec: TaskSpec): Promise<ExecutionResult>;
}
