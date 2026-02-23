/**
 * Tests for the skills loader.
 */

import path from 'path';
import { describe, it, expect } from 'vitest';
import { loadSkill, loadAllSkills } from '../../../src/lib/skills/loader';

const skillsRoot = path.join(process.cwd(), 'src', 'lib', 'skills', 'skills');

describe('Skill Loader', () => {
  it('should load skill from SKILL.md file', async () => {
    const skillPath = path.join(skillsRoot, 'gas-estimation', 'SKILL.md');
    const skill = loadSkill(skillPath);
    expect(skill.metadata.name).toBe('aegis-gas-estimation');
    expect(skill.metadata.description).toContain('gas');
    expect(skill.content).toContain('Gas Estimation Skill');
  });

  it('should throw error for invalid skill (missing name)', () => {
    const invalidPath = path.join(process.cwd(), 'package.json');
    expect(() => loadSkill(invalidPath)).toThrow(/missing name or description|Invalid skill/);
  });

  it('should load all skills from directory', () => {
    const skills = loadAllSkills();
    expect(skills.size).toBeGreaterThan(0);
    expect(skills.has('aegis-gas-estimation')).toBe(true);
    expect(skills.has('aegis-protocol-vetting')).toBe(true);
    expect(skills.has('aegis-sla-optimization')).toBe(true);
    expect(skills.has('aegis-agent-reputation')).toBe(true);
    expect(skills.has('aegis-breach-detection')).toBe(true);
  });

  it('should parse frontmatter and content', () => {
    const skillPath = path.join(skillsRoot, 'gas-estimation', 'SKILL.md');
    const skill = loadSkill(skillPath);
    expect(skill.metadata.version).toBe('1.0.0');
    expect(skill.metadata.tags).toContain('gas');
    expect(skill.content.length).toBeGreaterThan(100);
  });
});
