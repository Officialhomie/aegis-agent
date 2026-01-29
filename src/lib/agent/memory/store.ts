/**
 * Aegis Agent - Memory Store
 * 
 * PostgreSQL-backed storage for agent memories using Prisma.
 */

import { PrismaClient } from '@prisma/client';

// Lazy-load Prisma client
let prisma: PrismaClient | null = null;

function getPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}

export interface CreateMemoryInput {
  type: string;
  content: string;
  metadata: Record<string, unknown>;
  embeddingId?: string;
  importance?: number;
}

export class MemoryStore {
  private agentId: string;

  constructor(agentId: string = 'default-agent') {
    this.agentId = agentId;
  }

  /**
   * Create a new memory record
   */
  async create(input: CreateMemoryInput): Promise<string> {
    const db = getPrisma();

    try {
      // Ensure agent exists
      await this.ensureAgent();

      const memory = await db.memory.create({
        data: {
          agentId: this.agentId,
          type: input.type as any,
          content: input.content,
          metadata: input.metadata as any,
          embeddingId: input.embeddingId,
          importance: input.importance || 0.5,
        },
      });

      return memory.id;
    } catch (error) {
      console.error('[MemoryStore] Error creating memory:', error);
      // Return a placeholder ID if database is not available
      return `temp-${Date.now()}`;
    }
  }

  /**
   * Find memories by IDs
   */
  async findByIds(ids: string[]): Promise<unknown[]> {
    const db = getPrisma();

    try {
      const memories = await db.memory.findMany({
        where: {
          id: { in: ids },
          agentId: this.agentId,
        },
      });

      return memories.map(m => ({
        id: m.id,
        type: m.type,
        content: m.content,
        metadata: m.metadata,
        importance: m.importance,
        createdAt: m.createdAt,
      }));
    } catch (error) {
      console.error('[MemoryStore] Error finding memories:', error);
      return [];
    }
  }

  /**
   * Get recent memories
   */
  async getRecent(type?: string, limit: number = 10): Promise<unknown[]> {
    const db = getPrisma();

    try {
      const memories = await db.memory.findMany({
        where: {
          agentId: this.agentId,
          ...(type && { type: type as any }),
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      return memories.map(m => ({
        id: m.id,
        type: m.type,
        content: m.content,
        metadata: m.metadata,
        importance: m.importance,
        createdAt: m.createdAt,
      }));
    } catch (error) {
      console.error('[MemoryStore] Error getting recent memories:', error);
      return [];
    }
  }

  /**
   * Update memory importance
   */
  async updateImportance(memoryId: string, delta: number): Promise<void> {
    const db = getPrisma();

    try {
      const memory = await db.memory.findUnique({
        where: { id: memoryId },
      });

      if (memory) {
        const newImportance = Math.max(0, Math.min(1, memory.importance + delta));
        
        await db.memory.update({
          where: { id: memoryId },
          data: {
            importance: newImportance,
            accessCount: { increment: 1 },
            lastAccessed: new Date(),
          },
        });
      }
    } catch (error) {
      console.error('[MemoryStore] Error updating importance:', error);
    }
  }

  /**
   * Ensure the agent record exists
   */
  private async ensureAgent(): Promise<void> {
    const db = getPrisma();

    try {
      const existing = await db.agent.findUnique({
        where: { id: this.agentId },
      });

      if (!existing) {
        await db.agent.create({
          data: {
            id: this.agentId,
            name: 'Aegis Agent',
            description: 'AI-powered treasury management agent',
          },
        });
      }
    } catch (error) {
      // Agent table might not exist yet - that's okay during development
      console.log('[MemoryStore] Agent table not available (run prisma migrate)');
    }
  }
}
