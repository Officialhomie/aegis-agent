/**
 * OpenClaw memory manager — reads and writes MEMORY.md.
 *
 * MEMORY.md is the persistent cross-session memory file that OpenClaw
 * agents maintain on disk. It gives continuity across restarts and lets
 * users (and the LLM) review what the agent has done recently.
 *
 * Format:
 *   [2026-02-18 10:00:00] CATEGORY: message text
 */

import fs from 'fs/promises';
import path from 'path';
import type { MemoryEntry } from './types';

const MEMORY_FILE = path.resolve(process.cwd(), 'MEMORY.md');

const HEADER = `# Aegis Agent Memory

## Session Log
`;

/**
 * Ensure MEMORY.md exists; create with header if not.
 */
export async function ensureMemoryFile(): Promise<void> {
  try {
    await fs.access(MEMORY_FILE);
  } catch {
    await fs.writeFile(MEMORY_FILE, HEADER, 'utf-8');
  }
}

/**
 * Append a single entry to MEMORY.md.
 */
export async function writeMemory(entry: MemoryEntry): Promise<void> {
  await ensureMemoryFile();
  const ts = (entry.timestamp ?? new Date()).toISOString().replace('T', ' ').slice(0, 19);
  const line = `[${ts}] ${entry.category}: ${entry.message}\n`;
  await fs.appendFile(MEMORY_FILE, line, 'utf-8');
}

/**
 * Append an action log entry (shorthand for common pattern).
 */
export async function appendActionLog(category: string, message: string): Promise<void> {
  await writeMemory({ category, message });
}

/**
 * Read the last `limit` lines from MEMORY.md.
 * Returns a formatted string suitable for sending to the user.
 */
export async function readMemory(limit = 20): Promise<string> {
  try {
    await fs.access(MEMORY_FILE);
  } catch {
    return 'No memory recorded yet. Run a cycle first.';
  }

  const content = await fs.readFile(MEMORY_FILE, 'utf-8');
  const lines = content.split('\n').filter((l) => l.trim().length > 0);

  // Return the header line and last `limit` log entries
  const logLines = lines.filter((l) => l.startsWith('['));
  const recent = logLines.slice(-limit);

  if (recent.length === 0) {
    return 'Memory file exists but no activity logged yet.';
  }

  return recent.join('\n');
}
