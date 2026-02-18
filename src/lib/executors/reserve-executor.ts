/**
 * ReserveExecutor — handles all non-sponsorship decision actions.
 *
 * Delegates to the existing execute() function from the execute layer,
 * then posts reserve swap proofs to Botchan when applicable.
 */

import { logger } from '../logger';
import { execute, executeWithWalletLock } from '../agent/execute';
import { postReserveSwapToBotchan } from '../agent/social/botchan';
import type { ExecutorInterface } from './types';
import type { TaskSpec } from '../orchestrator/types';
import type { ExecutionResult } from '../agent/execute';

export class ReserveExecutor implements ExecutorInterface {
  readonly handles = [
    'WAIT',
    'SWAP_RESERVES',
    'REPLENISH_RESERVES',
    'REBALANCE_RESERVES',
    'ALLOCATE_BUDGET',
    'ALERT_HUMAN',
    'ALERT_PROTOCOL',
    'ALERT_LOW_RUNWAY',
  ] as const;

  async execute(spec: TaskSpec): Promise<ExecutionResult> {
    const { decision, config, modeId } = spec;
    const mode = config.executionMode === 'LIVE' ? 'LIVE' : 'SIMULATION';

    logger.info('[ReserveExecutor] Executing decision', {
      action: decision.action,
      mode,
      modeId,
    });

    const executionResult = await executeWithWalletLock(() => execute(decision, mode));

    if (
      decision.action === 'SWAP_RESERVES' &&
      executionResult &&
      (modeId === 'gas-sponsorship' || modeId === 'reserve-pipeline')
    ) {
      postReserveSwapToBotchan(decision, executionResult).catch(() => {});
    }

    return executionResult;
  }
}
