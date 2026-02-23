/**
 * Aegis Skills - Zod schemas for executor output (LLM structured response).
 */

import { z } from 'zod';

export const SkillDecisionSchema = z.enum(['APPROVE', 'REJECT', 'ESCALATE']);
export type SkillDecisionZod = z.infer<typeof SkillDecisionSchema>;

/** Normalized confidence 0-100 for SkillExecutionResult */
export const SkillResultSchema = z.object({
  decision: SkillDecisionSchema,
  confidence: z.number().min(0).max(100),
  reasoning: z.string(),
  warnings: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type SkillResultZod = z.infer<typeof SkillResultSchema>;
