/**
 * Unified orchestrator for Reserve Pipeline and Gas Sponsorship modes.
 * Runs both modes concurrently with isolated circuit breakers and rate limiters.
 */

import { logger } from '../logger';
import { validatePolicy } from './policy';
import { execute, getCircuitBreaker, executeWithWalletLock, signDecision, sponsorTransaction } from './execute';
import { storeMemory, retrieveRelevantMemories } from './memory';
import { postSponsorshipProof } from './social/farcaster';
import { postSponsorshipToBotchan, postReserveSwapToBotchan } from './social/botchan';
import { runMoltbookHeartbeat } from './social/heartbeat';
import { maybePostFarcasterUpdate } from './transparency/farcaster-updates';
import { observeGasPrice } from './observe';
import { getAdaptiveGasSponsorshipConfig } from './modes/gas-sponsorship';
import { checkAndUpdateEmergencyMode } from './emergency';
import type { AgentMode, AgentModeContext } from './types';
import type { AgentConfig } from './index';
import type { AgentMemory } from './index';
import type { ExecutionResult } from './execute';

const DEFAULT_RESERVE_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_SPONSORSHIP_INTERVAL_MS = 60 * 1000;
/** Interval to check whether to run Moltbook heartbeat and Farcaster health post (each has its own internal throttle). */
const SOCIAL_TRANSPARENCY_INTERVAL_MS = 15 * 60 * 1000; // 15 min

export interface MultiModeAgentOptions {
  modes: AgentMode[];
  intervals?: Record<string, number>;
}

export class MultiModeAgent {
  private modes: Map<string, AgentModeContext> = new Map();
  private timers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private draining = false;

  constructor(options: MultiModeAgentOptions) {
    const { modes, intervals = {} } = options;
    for (const mode of modes) {
      const config: AgentConfig = { ...mode.config, mode: mode.id };
      this.modes.set(mode.id, { mode, config });
    }
    this.intervals = {
      'reserve-pipeline': intervals['reserve-pipeline'] ?? DEFAULT_RESERVE_INTERVAL_MS,
      'gas-sponsorship': intervals['gas-sponsorship'] ?? DEFAULT_SPONSORSHIP_INTERVAL_MS,
      ...intervals,
    };
  }

  private intervals: Record<string, number>;

  async start(): Promise<void> {
    await checkAndUpdateEmergencyMode();

    const reserveCtx = this.modes.get('reserve-pipeline');
    if (reserveCtx) {
      if (reserveCtx.mode.onStart) await reserveCtx.mode.onStart();
      await this.runCycle(reserveCtx);
    }

    const sponsorshipCtx = this.modes.get('gas-sponsorship');
    if (sponsorshipCtx) {
      await this.runCycle(sponsorshipCtx);
    }

    for (const [id, ctx] of this.modes) {
      const intervalMs = this.intervals[id] ?? (id === 'reserve-pipeline' ? DEFAULT_RESERVE_INTERVAL_MS : DEFAULT_SPONSORSHIP_INTERVAL_MS);
      const t = setInterval(() => {
        if (this.draining) return;
        this.runCycle(ctx).catch((err) => logger.error('[MultiMode] Cycle error', { mode: id, error: err }));
      }, intervalMs);
      this.timers.set(id, t);
      logger.info('[MultiMode] Started mode', { mode: id, intervalMs });
    }

    // Moltbook engagement + Farcaster health updates (each throttled internally)
    const socialTimer = setInterval(() => {
      if (this.draining) return;
      runMoltbookHeartbeat().catch((err) => logger.warn('[MultiMode] Moltbook heartbeat error', { error: err }));
      maybePostFarcasterUpdate().catch((err) => logger.warn('[MultiMode] Farcaster update error', { error: err }));
    }, SOCIAL_TRANSPARENCY_INTERVAL_MS);
    this.timers.set('social-transparency', socialTimer);
    logger.info('[MultiMode] Started social/transparency', { intervalMs: SOCIAL_TRANSPARENCY_INTERVAL_MS });

    const shutdown = async () => {
      this.draining = true;
      for (const [, t] of this.timers) clearInterval(t);
      this.timers.clear();
      logger.info('[MultiMode] Shutting down gracefully');
      process.exit(0);
    };
    process.once('SIGTERM', shutdown);
    process.once('SIGINT', shutdown);
  }

  stop(): void {
    this.draining = true;
    for (const [, t] of this.timers) clearInterval(t);
    this.timers.clear();
  }

  private async runCycle(ctx: AgentModeContext): Promise<void> {
    const { mode, config: baseConfig } = ctx;
    const key = mode.id;
    const breaker = getCircuitBreaker(key);

    const health = await (breaker as { checkHealthBeforeExecution?: () => Promise<{ healthy: boolean; reason?: string }> }).checkHealthBeforeExecution?.();
    if (health && !health.healthy) {
      logger.warn('[MultiMode] Health check failed, skipping cycle', { mode: key, reason: health.reason });
      return;
    }

    let config = baseConfig;
    if (key === 'gas-sponsorship') {
      config = await getAdaptiveGasSponsorshipConfig();
    }

    const run = async () => {
      const observations = await mode.observe();
      const memories = (await retrieveRelevantMemories(observations)) as AgentMemory[];
      let currentGasPriceGwei: number | undefined;
      if (key === 'gas-sponsorship') {
        const gasObs = await observeGasPrice();
        const gasData = gasObs[0]?.data as { gasPriceGwei?: string } | undefined;
        currentGasPriceGwei = gasData?.gasPriceGwei != null ? parseFloat(String(gasData.gasPriceGwei)) : undefined;
      }
      const configWithGas: AgentConfig = { ...config, currentGasPriceGwei };

      const decision = await mode.reason(observations, memories);

      const policyResult = await validatePolicy(decision, configWithGas);
      if (!policyResult.passed) {
        logger.warn('[MultiMode] Policy rejected', { mode: key, errors: policyResult.errors });
        await storeMemory({ type: 'DECISION', decision, outcome: 'POLICY_REJECTED', policyErrors: policyResult.errors });
        return;
      }

      if (decision.confidence < configWithGas.confidenceThreshold) {
        logger.info('[MultiMode] Below confidence threshold', { mode: key, confidence: decision.confidence });
        await storeMemory({ type: 'DECISION', observations, decision, outcome: null });
        return;
      }

      if (configWithGas.executionMode === 'READONLY') {
        await storeMemory({ type: 'DECISION', observations, decision, outcome: 'READONLY' });
        return;
      }

      let executionResult: ExecutionResult | null = null;

      if (key === 'gas-sponsorship' && decision.action === 'SPONSOR_TRANSACTION') {
        const signed = await signDecision(decision);
        executionResult = await sponsorTransaction(decision, configWithGas.executionMode === 'LIVE' ? 'LIVE' : 'SIMULATION');
        await postSponsorshipProof(signed, executionResult as ExecutionResult & { sponsorshipHash?: string; decisionHash?: string });
        postSponsorshipToBotchan(signed, executionResult as ExecutionResult & { sponsorshipHash?: string; decisionHash?: string }).catch(() => {});
        if (executionResult?.success) {
          const { updateReservesAfterSponsorship } = await import('./execute/post-sponsorship');
          await updateReservesAfterSponsorship(
            executionResult as ExecutionResult & { gasUsed?: bigint },
            configWithGas.currentGasPriceGwei
          );
        }
      } else {
        executionResult = await executeWithWalletLock(() => execute(decision, configWithGas.executionMode === 'LIVE' ? 'LIVE' : 'SIMULATION'));
        if (decision.action === 'SWAP_RESERVES' && executionResult && (key === 'gas-sponsorship' || key === 'reserve-pipeline')) {
          postReserveSwapToBotchan(decision, executionResult).catch(() => {});
        }
      }

      await storeMemory({ type: 'DECISION', observations, decision, outcome: executionResult ?? undefined });
    };

    try {
      await breaker.execute(run);
    } catch (err) {
      logger.error('[MultiMode] Cycle failed', { mode: key, error: err });
      try {
        await storeMemory({
          type: 'DECISION',
          decision: { action: 'WAIT', confidence: 0, reasoning: String(err), parameters: null, metadata: {} },
          outcome: { success: false, error: String(err) },
        });
      } catch (storageErr) {
        logger.warn('[MultiMode] Could not store cycle failure in memory (database unavailable)', {
          mode: key,
          storageError: storageErr instanceof Error ? storageErr.message : String(storageErr),
        });
      }
    }
  }
}
