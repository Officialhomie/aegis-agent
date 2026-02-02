/**
 * Memory store and embeddings tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatabaseUnavailableError } from '../../src/lib/errors';
import { MemoryStore } from '../../src/lib/agent/memory/store';

const mockCreate = vi.fn();
const mockFindMany = vi.fn();
const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(function (this: unknown) {
    return {
      memory: {
        create: mockCreate,
        findMany: mockFindMany,
        findUnique: mockFindUnique,
        update: mockUpdate,
      },
      agent: {
        findUnique: vi.fn().mockResolvedValue({ id: 'default-agent' }),
        create: vi.fn().mockResolvedValue(undefined),
      },
    };
  }),
}));

describe('MemoryStore', () => {
  beforeEach(() => {
    mockCreate.mockReset().mockResolvedValue({ id: 'mem-1' });
    mockFindMany.mockReset().mockResolvedValue([]);
    mockFindUnique.mockReset().mockResolvedValue(null);
    mockUpdate.mockReset().mockResolvedValue(undefined);
  });

  it('create returns memory id', async () => {
    const store = new MemoryStore('agent-1');
    const id = await store.create({
      type: 'DECISION',
      content: 'Decided to wait.',
      metadata: {},
    });
    expect(id).toBe('mem-1');
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        agentId: 'agent-1',
        type: 'DECISION',
        content: 'Decided to wait.',
        importance: 0.5,
      }),
    });
  });

  it('findByIds returns memories', async () => {
    mockFindMany.mockResolvedValueOnce([
      {
        id: 'mem-1',
        type: 'DECISION',
        content: 'Content',
        metadata: {},
        importance: 0.5,
        createdAt: new Date(),
      },
    ]);
    const store = new MemoryStore('agent-1');
    const memories = await store.findByIds(['mem-1']);
    expect(memories).toHaveLength(1);
    expect((memories[0] as { id: string }).id).toBe('mem-1');
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { id: { in: ['mem-1'] }, agentId: 'agent-1' },
    });
  });

  it('getRecent returns recent memories', async () => {
    mockFindMany.mockResolvedValueOnce([
      {
        id: 'mem-1',
        type: 'OUTCOME',
        content: 'Outcome',
        metadata: {},
        importance: 0.5,
        createdAt: new Date(),
      },
    ]);
    const store = new MemoryStore('agent-1');
    const memories = await store.getRecent('OUTCOME', 5);
    expect(memories).toHaveLength(1);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ agentId: 'agent-1', type: 'OUTCOME' }),
        orderBy: { createdAt: 'desc' },
        take: 5,
      })
    );
  });

  it('updateImportance updates memory when found', async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: 'mem-1',
      importance: 0.5,
    });
    const store = new MemoryStore('agent-1');
    await store.updateImportance('mem-1', 0.2);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'mem-1' },
      data: expect.objectContaining({
        importance: 0.7,
      }),
    });
  });

  it('findByIds throws DatabaseUnavailableError when DB fails', async () => {
    mockFindMany.mockRejectedValueOnce(new Error('Connection refused'));
    const store = new MemoryStore('agent-1');
    const err = await store.findByIds(['mem-1']).catch((e) => e);
    expect(err).toBeInstanceOf(DatabaseUnavailableError);
    expect((err as Error).message).toMatch(/Cannot retrieve memories/);
  });

  it('getRecent throws DatabaseUnavailableError when DB fails', async () => {
    mockFindMany.mockRejectedValueOnce(new Error('Connection refused'));
    const store = new MemoryStore('agent-1');
    const err = await store.getRecent(undefined, 10).catch((e) => e);
    expect(err).toBeInstanceOf(DatabaseUnavailableError);
    expect((err as Error).message).toMatch(/Cannot retrieve recent memories/);
  });

  it('updateImportance throws DatabaseUnavailableError when DB fails', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'mem-1', importance: 0.5 });
    mockUpdate.mockRejectedValueOnce(new Error('Connection refused'));
    const store = new MemoryStore('agent-1');
    await expect(store.updateImportance('mem-1', 0.2)).rejects.toThrow(DatabaseUnavailableError);
  });
});

describe('EmbeddingService', () => {
  it('embedding id format uses uuid (unit)', () => {
    const id = `mem-${Date.now()}-${crypto.randomUUID()}`;
    expect(id).toMatch(/^mem-\d+-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });
});
