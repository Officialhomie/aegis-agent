/**
 * Aegis Skills - Loader
 * Loads and parses SKILL.md files (YAML frontmatter + markdown content).
 */

import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import type { Skill } from './types';

const SKILL_FILENAME = 'SKILL.md';

/**
 * Load a single skill from a SKILL.md file path.
 */
export function loadSkill(skillPath: string): Skill {
  const content = fs.readFileSync(skillPath, 'utf-8');
  const { data, content: markdown } = matter(content);

  if (!data.name || !data.description) {
    throw new Error(`Invalid skill: ${skillPath} missing name or description`);
  }

  return {
    metadata: {
      name: data.name as string,
      description: data.description as string,
      version: data.version as string | undefined,
      author: data.author as string | undefined,
      tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
    },
    content: markdown.trim(),
    examples: Array.isArray(data.examples) ? (data.examples as string[]) : undefined,
    guidelines: Array.isArray(data.guidelines) ? (data.guidelines as string[]) : undefined,
  };
}

/**
 * Resolve the skills directory (works from cwd and from compiled output).
 */
function getSkillsDir(): string {
  const fromCwd = path.join(process.cwd(), 'src', 'lib', 'skills', 'skills');
  if (fs.existsSync(fromCwd)) {
    return fromCwd;
  }
  const fromDirname = path.join(__dirname, 'skills');
  if (fs.existsSync(fromDirname)) {
    return fromDirname;
  }
  return fromCwd;
}

/**
 * Load all skills from the skills directory (one SKILL.md per subdirectory).
 */
export function loadAllSkills(): Map<string, Skill> {
  const skillsDir = getSkillsDir();
  const skills = new Map<string, Skill>();

  if (!fs.existsSync(skillsDir)) {
    return skills;
  }

  const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  for (const dirent of entries) {
    if (!dirent.isDirectory()) continue;
    const skillPath = path.join(skillsDir, dirent.name, SKILL_FILENAME);
    if (fs.existsSync(skillPath)) {
      try {
        const skill = loadSkill(skillPath);
        skills.set(skill.metadata.name, skill);
      } catch (err) {
        console.warn(`[Skills] Failed to load skill at ${skillPath}:`, err);
      }
    }
  }

  return skills;
}
