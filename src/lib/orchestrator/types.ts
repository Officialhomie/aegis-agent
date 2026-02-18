/**
 * Shared types for the Orchestrator → Dispatcher → Executor pipeline.
 *
 * TaskSpec is the bridge object emitted by OrchestratorService and consumed
 * by DispatcherService. It carries everything needed to validate policy and
 * execute, without coupling the reasoning layer to the execution layer.
 */

import type { Observation } from '../agent/observe';
import type { Decision } from '../agent/reason/schemas';
import type { AgentConfig, AgentMemory } from '../agent/index';
import type { ExecutionResult } from '../agent/execute';

export interface TaskSpec {
  /** Unique ID for this task (nanoid/cuid) */
  id: string;
  /** Mode that produced this task ('gas-sponsorship' | 'reserve-pipeline') */
  modeId: string;
  /** The LLM decision */
  decision: Decision;
  /** Resolved config (with adaptive overrides applied) */
  config: AgentConfig;
  /** Raw observations that produced this decision */
  observations: Observation[];
  /** Memories injected into the reasoning context */
  memories: AgentMemory[];
  /** When this spec was created */
  createdAt: Date;
}

export interface TaskResult {
  taskId: string;
  modeId: string;
  /** Null when execution was skipped */
  executionResult: ExecutionResult | null;
  policyPassed: boolean;
  policyErrors: string[];
  /** True when execution did not run (policy rejected, low confidence, readonly) */
  skipped: boolean;
  skipReason?: 'CONFIDENCE' | 'POLICY' | 'READONLY';
}
