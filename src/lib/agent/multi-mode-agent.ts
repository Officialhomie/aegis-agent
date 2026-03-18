/**
 * Unified orchestrator for Reserve Pipeline and Gas Sponsorship modes.
 * Runs both modes concurrently with isolated circuit breakers.
 *
 * runCycle() is now a thin coordinator:
 *   1. OrchestratorService — Observe + Retrieve + Reason → TaskSpec
 *   2. DispatcherService   — Policy + Route → TaskResult
 *   3. storeMemory         — Persist outcome
 */

import { logger } from '../logger';
import { storeMemory } from './memory';
import { getCircuitBreaker } from './execute';
import { runFullHeartbeat } from './social/heartbeat';
import { maybePostFarcasterUpdate } from './transparency/farcaster-updates';
import { executeOnchainHeartbeat } from './heartbeat/onchain-heartbeat';
import { checkAndUpdateEmergencyMode } from './emergency';
import { registerDefaultSkills } from './skills';
import { getStateStore } from './state-store';
import { OrchestratorService } from '../orchestrator';
import { DispatcherService } from '../dispatcher';
import type { AgentMode, AgentModeContext } from './types';
import type { AgentConfig } from './index';

const DEFAULT_RESERVE_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_SPONSORSHIP_INTERVAL_MS = 60 * 1000;
const SOCIAL_TRANSPARENCY_INTERVAL_MS = 15 * 60 * 1000;

export interface MultiModeAgentOptions {
  modes: AgentMode[];
  intervals?: Record<string, number>;
}

export class MultiModeAgent {
  private modes: Map<string, AgentModeContext> = new Map();
  private timers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private draining = false;
  private intervals: Record<string, number>;
  private orchestrator: OrchestratorService;
  private dispatcher: DispatcherService;

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
    this.orchestrator = new OrchestratorService();
    this.dispatcher = new DispatcherService();
  }

  async start(): Promise<void> {
    await checkAndUpdateEmergencyMode();

    registerDefaultSkills();
    logger.info('[MultiMode] Registered default skills');

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
      const intervalMs =
        this.intervals[id] ??
        (id === 'reserve-pipeline' ? DEFAULT_RESERVE_INTERVAL_MS : DEFAULT_SPONSORSHIP_INTERVAL_MS);
      const t = setInterval(() => {
        if (this.draining) return;
        this.runCycle(ctx).catch((err) =>
          logger.error('[MultiMode] Cycle error', { mode: id, error: err })
        );
      }, intervalMs);
      this.timers.set(id, t);
      logger.info('[MultiMode] Started mode', { mode: id, intervalMs });
    }

    const socialTimer = setInterval(() => {
      if (this.draining) return;
      runFullHeartbeat().catch((err) =>
        logger.warn('[MultiMode] Full heartbeat error', { error: err })
      );
      maybePostFarcasterUpdate().catch((err) =>
        logger.warn('[MultiMode] Farcaster update error', { error: err })
      );
      executeOnchainHeartbeat().catch((err) =>
        logger.warn('[MultiMode] Onchain heartbeat error', { error: err })
      );
    }, SOCIAL_TRANSPARENCY_INTERVAL_MS);
    this.timers.set('social-transparency', socialTimer);
    logger.info('[MultiMode] Started social/transparency with skills', {
      intervalMs: SOCIAL_TRANSPARENCY_INTERVAL_MS,
    });

    const { processQueue } = await import('./queue/queue-consumer');
    const queueTimer = setInterval(() => {
      if (this.draining) return;
      processQueue().catch((err) =>
        logger.warn('[MultiMode] Queue consumer error', { error: err })
      );
    }, 30_000);
    this.timers.set('queue-consumer', queueTimer);
    logger.info('[MultiMode] Started queue consumer', { intervalMs: 30_000 });

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
    const key = ctx.mode.id;
    const breaker = getCircuitBreaker(key);

    // Pause check — OpenClaw can pause the agent via command
    const store = await getStateStore();
    const paused = await store.get('aegis:openclaw:paused');
    if (paused === 'true') {
      logger.info('[MultiMode] Agent paused via OpenClaw', { mode: key });
      return;
    }

    const health = await (
      breaker as {
        checkHealthBeforeExecution?: () => Promise<{
          healthy: boolean;
          reason?: string;
          warnings?: string[];
        }>;
      }
    ).checkHealthBeforeExecution?.();

    if (health && !health.healthy) {
      logger.warn('[MultiMode] Health check failed, skipping cycle', {
        mode: key,
        reason: health.reason,
        warnings: health.warnings,
      });
      return;
    }
    if (health?.warnings && health.warnings.length > 0) {
      logger.info('[MultiMode] Health warnings detected', { mode: key, warnings: health.warnings });
    }

    const run = async () => {
      // — Orchestrator: Observe + Retrieve + Reason → TaskSpec
      const spec = await this.orchestrator.orchestrate(ctx);
      if (!spec) return;

      // — Dispatcher: Policy + Execute → TaskResult
      const result = await this.dispatcher.dispatch(spec);

      // — Memory: Store outcome
      if (result.skipped && result.skipReason === 'POLICY') {
        await storeMemory({
          type: 'DECISION',
          decision: spec.decision,
          outcome: 'POLICY_REJECTED',
          policyErrors: result.policyErrors,
        });
      } else {
        await storeMemory({
          type: 'DECISION',
          observations: spec.observations,
          decision: spec.decision,
          outcome: result.executionResult ?? undefined,
        });
      }

      // — Proactive reporting: notify OpenClaw user of autonomous actions
      if (!result.skipped && result.executionResult?.success && spec.decision.action !== 'WAIT') {
        import('./openclaw/proactive-reporter')
          .then(({ reportToActiveSessions }) => {
            const summary = `[${key}] ${spec.decision.action}: ${spec.decision.reasoning.slice(0, 120)}`;
            reportToActiveSessions(summary).catch(() => {});
          })
          .catch(() => {});
      }
    };

    try {
      await breaker.execute(run);
    } catch (err) {
      logger.error('[MultiMode] Cycle failed', { mode: key, error: err });
      try {
        await storeMemory({
          type: 'DECISION',
          decision: {
            action: 'WAIT',
            confidence: 0,
            reasoning: String(err),
            parameters: null,
            metadata: {},
          },
          outcome: { success: false, error: String(err) },
        });
      } catch (storageErr) {
        logger.warn('[MultiMode] Could not store cycle failure in memory', {
          mode: key,
          storageError:
            storageErr instanceof Error ? storageErr.message : String(storageErr),
        });
      }
    }
  }
}
