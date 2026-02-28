/**
 * Aegis Skills - Registry
 * In-memory registry of loaded skills; initialize on server startup.
 */

import { logger } from '../logger';
import { loadAllSkills } from './loader';
import type { Skill } from './types';

let skillRegistry: Map<string, Skill> | null = null;

/**
 * Initialize the skill registry (call on server startup).
 */
export async function initializeSkillRegistry(): Promise<void> {
  skillRegistry = loadAllSkills();
  logger.info('[Skills] Loaded skills', { count: skillRegistry.size });
}

/**
 * Ensure registry is loaded (lazy init on first use if not initialized).
 */
function ensureRegistry(): Map<string, Skill> {
  if (!skillRegistry) {
    skillRegistry = loadAllSkills();
    logger.info('[Skills] Loaded skills (lazy)', { count: skillRegistry.size });
  }
  return skillRegistry;
}

/**
 * Get a skill by name.
 */
export function getSkill(name: string): Skill | null {
  return ensureRegistry().get(name) ?? null;
}

/**
 * Get all skills.
 */
export function getAllSkills(): Skill[] {
  return Array.from(ensureRegistry().values());
}

/**
 * Get all skills that have any of the given tags.
 */
export function getSkillsByTags(tags: string[]): Skill[] {
  return Array.from(ensureRegistry().values()).filter((skill) =>
    tags.some((tag) => skill.metadata.tags?.includes(tag))
  );
}

/**
 * Reload skills from disk (e.g. for hot-reload in development).
 */
export async function reloadSkills(): Promise<void> {
  await initializeSkillRegistry();
}
