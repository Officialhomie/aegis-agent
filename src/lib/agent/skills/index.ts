/**
 * Aegis Agent - Skill System
 *
 * Registry and manager for proactive agent skills.
 * Skills extend the agent's capabilities beyond core sponsorship.
 */

import { logger } from '../../logger';

/**
 * Skill trigger types:
 * - schedule: Runs periodically (e.g., every heartbeat)
 * - event: Runs in response to agent events (e.g., after sponsorship)
 * - request: Runs when triggered by external request (e.g., webhook)
 */
export type SkillTrigger = 'schedule' | 'event' | 'request';

/**
 * Event types that can trigger skills
 */
export type SkillEvent =
  | 'sponsorship:success'
  | 'sponsorship:failed'
  | 'heartbeat:start'
  | 'heartbeat:end'
  | 'cycle:start'
  | 'cycle:end';

/**
 * Context passed to skill execution
 */
export interface SkillContext {
  /** Event that triggered the skill (if event-driven) */
  event?: SkillEvent;
  /** Event payload data */
  eventData?: Record<string, unknown>;
  /** Request data (if request-driven) */
  requestData?: Record<string, unknown>;
  /** Whether this is a dry run */
  dryRun?: boolean;
}

/**
 * Result returned by skill execution
 */
export interface SkillResult {
  success: boolean;
  /** Human-readable summary of what happened */
  summary?: string;
  /** Structured data from skill execution */
  data?: Record<string, unknown>;
  /** Error message if failed */
  error?: string;
}

/**
 * Skill definition interface
 */
export interface Skill {
  /** Unique skill name */
  name: string;
  /** Human-readable description */
  description: string;
  /** How the skill is triggered */
  trigger: SkillTrigger;
  /** For scheduled skills: interval in milliseconds */
  interval?: number;
  /** For event-driven skills: which events trigger it */
  events?: SkillEvent[];
  /** Whether the skill is enabled */
  enabled: boolean;
  /** Execute the skill */
  execute: (context: SkillContext) => Promise<SkillResult>;
}

/**
 * Skill registry - stores all registered skills
 */
const skillRegistry = new Map<string, Skill>();

/**
 * Last execution timestamp per skill (for interval enforcement)
 */
const lastExecutionTime = new Map<string, number>();

/**
 * Register a skill in the registry
 */
export function registerSkill(skill: Skill): void {
  if (skillRegistry.has(skill.name)) {
    logger.warn(`[Skills] Overwriting existing skill: ${skill.name}`);
  }
  skillRegistry.set(skill.name, skill);
  logger.info(`[Skills] Registered skill: ${skill.name}`, {
    trigger: skill.trigger,
    enabled: skill.enabled,
  });
}

/**
 * Get a skill by name
 */
export function getSkill(name: string): Skill | undefined {
  return skillRegistry.get(name);
}

/**
 * Get all registered skills
 */
export function getAllSkills(): Skill[] {
  return Array.from(skillRegistry.values());
}

/**
 * Get skills by trigger type
 */
export function getSkillsByTrigger(trigger: SkillTrigger): Skill[] {
  return getAllSkills().filter((s) => s.trigger === trigger && s.enabled);
}

/**
 * Get skills that respond to a specific event
 */
export function getSkillsForEvent(event: SkillEvent): Skill[] {
  return getAllSkills().filter(
    (s) => s.trigger === 'event' && s.enabled && s.events?.includes(event)
  );
}

/**
 * Check if a scheduled skill should run based on its interval
 */
function shouldRunScheduledSkill(skill: Skill): boolean {
  if (!skill.interval) return true;

  const lastRun = lastExecutionTime.get(skill.name);
  if (!lastRun) return true;

  return Date.now() - lastRun >= skill.interval;
}

/**
 * Execute a skill with error handling
 */
export async function executeSkill(
  skill: Skill,
  context: SkillContext = {}
): Promise<SkillResult> {
  if (!skill.enabled) {
    return { success: false, error: 'Skill is disabled' };
  }

  try {
    logger.info(`[Skills] Executing skill: ${skill.name}`, { context });
    const result = await skill.execute(context);
    lastExecutionTime.set(skill.name, Date.now());

    if (result.success) {
      logger.info(`[Skills] Skill completed: ${skill.name}`, {
        summary: result.summary,
      });
    } else {
      logger.warn(`[Skills] Skill failed: ${skill.name}`, {
        error: result.error,
      });
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[Skills] Skill error: ${skill.name}`, { error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * Execute all scheduled skills that are due to run
 */
export async function executeScheduledSkills(
  context: SkillContext = {}
): Promise<Map<string, SkillResult>> {
  const results = new Map<string, SkillResult>();
  const scheduledSkills = getSkillsByTrigger('schedule');

  for (const skill of scheduledSkills) {
    if (shouldRunScheduledSkill(skill)) {
      const result = await executeSkill(skill, context);
      results.set(skill.name, result);
    }
  }

  return results;
}

/**
 * Execute all skills that respond to a specific event
 */
export async function executeEventSkills(
  event: SkillEvent,
  eventData?: Record<string, unknown>
): Promise<Map<string, SkillResult>> {
  const results = new Map<string, SkillResult>();
  const eventSkills = getSkillsForEvent(event);

  for (const skill of eventSkills) {
    const result = await executeSkill(skill, { event, eventData });
    results.set(skill.name, result);
  }

  return results;
}

/**
 * Enable or disable a skill
 */
export function setSkillEnabled(name: string, enabled: boolean): boolean {
  const skill = skillRegistry.get(name);
  if (!skill) return false;

  skill.enabled = enabled;
  logger.info(`[Skills] Skill ${enabled ? 'enabled' : 'disabled'}: ${name}`);
  return true;
}

/**
 * Get skill status summary
 */
export function getSkillStatus(): {
  total: number;
  enabled: number;
  byTrigger: Record<SkillTrigger, number>;
} {
  const skills = getAllSkills();
  const enabled = skills.filter((s) => s.enabled).length;

  const byTrigger: Record<SkillTrigger, number> = {
    schedule: 0,
    event: 0,
    request: 0,
  };

  for (const skill of skills) {
    if (skill.enabled) {
      byTrigger[skill.trigger]++;
    }
  }

  return { total: skills.length, enabled, byTrigger };
}

// Re-export skills for convenience
export { moltbookConversationalistSkill } from './moltbook-conversationalist';
export { botchanListenerSkill } from './botchan-listener';
export { agentDiscoverySkill } from './agent-discovery';
export { reputationAttestorSkill } from './reputation-attestor';
