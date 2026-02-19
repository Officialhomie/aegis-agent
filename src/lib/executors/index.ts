/**
 * Executor registry — maps decision action types to the correct executor.
 *
 * DispatcherService calls getExecutor() to resolve which executor handles
 * a given TaskSpec before calling executor.execute(spec).
 */

import { SponsorExecutor } from './sponsor-executor';
import { ReserveExecutor } from './reserve-executor';
import type { ExecutorInterface } from './types';

const SPONSOR_EXECUTOR = new SponsorExecutor();
const RESERVE_EXECUTOR = new ReserveExecutor();

const ALL_EXECUTORS: ExecutorInterface[] = [SPONSOR_EXECUTOR, RESERVE_EXECUTOR];

const registry = new Map<string, ExecutorInterface>();
for (const executor of ALL_EXECUTORS) {
  for (const actionType of executor.handles) {
    registry.set(actionType, executor);
  }
}

/**
 * Resolve the executor for a given decision action type.
 * Falls back to ReserveExecutor for unknown action types (safe default).
 */
export function getExecutor(actionType: string): ExecutorInterface {
  return registry.get(actionType) ?? RESERVE_EXECUTOR;
}

export type { ExecutorInterface } from './types';
export { SponsorExecutor } from './sponsor-executor';
export { ReserveExecutor } from './reserve-executor';
