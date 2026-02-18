/**
 * OpenClaw memory manager unit tests.
 *
 * Tests that MEMORY.md is correctly created, written to, and read.
 * Mocks fs/promises to avoid touching the real filesystem.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory file store for tests
let fileStore: Map<string, string>;

vi.mock('fs/promises', () => {
  return {
    default: {
      access: vi.fn(async (filePath: string) => {
        if (!fileStore.has(filePath)) {
          const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
          throw err;
        }
      }),
      writeFile: vi.fn(async (filePath: string, content: string) => {
        fileStore.set(filePath, content);
      }),
      appendFile: vi.fn(async (filePath: string, content: string) => {
        const existing = fileStore.get(filePath) ?? '';
        fileStore.set(filePath, existing + content);
      }),
      readFile: vi.fn(async (filePath: string) => {
        if (!fileStore.has(filePath)) {
          const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
          throw err;
        }
        return fileStore.get(filePath) as string;
      }),
      unlink: vi.fn(async () => {}),
    },
    access: vi.fn(async (filePath: string) => {
      if (!fileStore.has(filePath)) {
        const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        throw err;
      }
    }),
    writeFile: vi.fn(async (filePath: string, content: string) => {
      fileStore.set(filePath, content);
    }),
    appendFile: vi.fn(async (filePath: string, content: string) => {
      const existing = fileStore.get(filePath) ?? '';
      fileStore.set(filePath, existing + content);
    }),
    readFile: vi.fn(async (filePath: string) => {
      if (!fileStore.has(filePath)) {
        const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        throw err;
      }
      return fileStore.get(filePath) as string;
    }),
    unlink: vi.fn(async () => {}),
  };
});

import {
  ensureMemoryFile,
  writeMemory,
  appendActionLog,
  readMemory,
} from '../../../src/lib/agent/openclaw/memory-manager';

describe('memory-manager', () => {
  beforeEach(() => {
    fileStore = new Map();
    vi.clearAllMocks();
  });

  describe('ensureMemoryFile', () => {
    it('creates MEMORY.md with header when it does not exist', async () => {
      await ensureMemoryFile();
      const values = [...fileStore.values()];
      expect(values.some((v) => v.includes('# Aegis Agent Memory'))).toBe(true);
      expect(values.some((v) => v.includes('## Session Log'))).toBe(true);
    });

    it('does not overwrite existing file', async () => {
      // Pre-populate file store
      const existingContent = '# Existing Content\n';
      // We don't know the exact path, but we can pre-set the MEMORY.md key
      // by writing first, then testing that a second ensureMemoryFile doesn't overwrite
      const { writeFile, appendFile } = await import('fs/promises');

      // Simulate existing file
      await writeMemory({ category: 'EXISTING', message: 'data' });
      const beforeSize = fileStore.size;
      const beforeValues = [...fileStore.values()];

      await ensureMemoryFile();

      // Should not have added new files
      expect(fileStore.size).toBe(beforeSize);
      // The value should still contain our existing content
      const afterValues = [...fileStore.values()];
      expect(afterValues).toEqual(beforeValues);
    });
  });

  describe('writeMemory', () => {
    it('appends a formatted line to MEMORY.md', async () => {
      await writeMemory({ category: 'TEST', message: 'test message' });
      const content = [...fileStore.values()].join('');
      expect(content).toContain('] TEST: test message');
    });

    it('includes timestamp in ISO-like format', async () => {
      const ts = new Date('2026-02-18T10:00:00.000Z');
      await writeMemory({ category: 'STARTUP', message: 'Agent started', timestamp: ts });
      const content = [...fileStore.values()].join('');
      expect(content).toMatch(/\[2026-02-18 10:00:00\] STARTUP: Agent started/);
    });

    it('appends multiple entries without overwriting', async () => {
      await writeMemory({ category: 'A', message: 'first' });
      await writeMemory({ category: 'B', message: 'second' });
      const content = [...fileStore.values()].join('');
      expect(content).toContain('] A: first');
      expect(content).toContain('] B: second');
    });
  });

  describe('appendActionLog', () => {
    it('is a shorthand for writeMemory', async () => {
      await appendActionLog('CYCLE', 'sponsored wallet 0x123');
      const content = [...fileStore.values()].join('');
      expect(content).toContain('] CYCLE: sponsored wallet 0x123');
    });
  });

  describe('readMemory', () => {
    it('returns message when no file exists', async () => {
      const result = await readMemory();
      expect(result).toContain('No memory recorded yet');
    });

    it('returns log entries after writing', async () => {
      await appendActionLog('LINE', 'entry 1');
      await appendActionLog('LINE', 'entry 2');
      const result = await readMemory(10);
      expect(result).toContain('LINE: entry 1');
      expect(result).toContain('LINE: entry 2');
    });

    it('returns last N log lines when more than limit exist', async () => {
      for (let i = 1; i <= 25; i++) {
        await appendActionLog('LINE', `entry ${i}`);
      }
      const result = await readMemory(5);
      const lines = result.split('\n').filter((l) => l.startsWith('['));
      expect(lines.length).toBeLessThanOrEqual(5);
      expect(result).toContain('entry 25');
    });
  });
});
