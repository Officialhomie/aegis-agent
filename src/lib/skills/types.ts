/**
 * Aegis Skills - Type definitions
 * Agent Skills framework for structured domain knowledge and policy decisions.
 */

export interface SkillMetadata {
  name: string;
  description: string;
  version?: string;
  author?: string;
  tags?: string[];
}

export interface Skill {
  metadata: SkillMetadata;
  content: string;
  examples?: string[];
  guidelines?: string[];
}

export interface SkillContext {
  agentWallet?: string;
  protocolId?: string;
  estimatedCostUSD?: number;
  currentGasPrice?: bigint;
  chainId?: number;
  guarantee?: unknown;
  passport?: unknown;
}

export type SkillDecision = 'APPROVE' | 'REJECT' | 'ESCALATE';

export interface SkillExecutionResult {
  success: boolean;
  decision?: SkillDecision;
  reasoning: string;
  confidence: number;
  appliedSkills: string[];
  warnings?: string[];
  metadata?: Record<string, unknown>;
}
