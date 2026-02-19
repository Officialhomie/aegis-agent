/**
 * SponsorExecutor — handles SPONSOR_TRANSACTION decisions.
 *
 * Extracted from MultiModeAgent.runCycle() gas-sponsorship path.
 * Signs the decision, executes sponsorship via paymaster, posts proofs,
 * and updates reserve state post-execution.
 */

import { logger } from '../logger';
import { signDecision, sponsorTransaction } from '../agent/execute/paymaster';
import { postSponsorshipProof } from '../agent/social/farcaster';
import { postSponsorshipToBotchan } from '../agent/social/botchan';
import { executeEventSkills } from '../agent/skills';
import type { ExecutorInterface } from './types';
import type { TaskSpec } from '../orchestrator/types';
import type { ExecutionResult } from '../agent/execute';

export class SponsorExecutor implements ExecutorInterface {
  readonly handles = ['SPONSOR_TRANSACTION'] as const;

  async execute(spec: TaskSpec): Promise<ExecutionResult> {
    const { decision, config } = spec;
    const mode = config.executionMode === 'LIVE' ? 'LIVE' : 'SIMULATION';

    logger.info('[SponsorExecutor] Signing and sponsoring transaction', {
      action: decision.action,
      mode,
    });

    const signed = await signDecision(decision);
    const executionResult = await sponsorTransaction(decision, mode);

    await postSponsorshipProof(
      signed,
      executionResult as ExecutionResult & { sponsorshipHash?: string; decisionHash?: string }
    );

    postSponsorshipToBotchan(
      signed,
      executionResult as ExecutionResult & { sponsorshipHash?: string; decisionHash?: string }
    ).catch(() => {});

    if (executionResult?.success) {
      const { updateReservesAfterSponsorship } = await import('../agent/execute/post-sponsorship');
      await updateReservesAfterSponsorship(
        executionResult as ExecutionResult & { gasUsed?: bigint },
        config.currentGasPriceGwei
      );

      const params = decision.parameters as { agentWallet?: string; protocolId?: string } | null;
      executeEventSkills('sponsorship:success', {
        userAddress: params?.agentWallet,
        protocolId: params?.protocolId,
        txHash: (executionResult as ExecutionResult & { sponsorshipHash?: string }).sponsorshipHash,
      }).catch((err) => logger.warn('[SponsorExecutor] Event skills error', { error: err }));
    }

    return executionResult;
  }
}
