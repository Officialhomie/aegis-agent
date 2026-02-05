/**
 * Aegis Agent - Memory Store
 *
 * PostgreSQL-backed storage for agent memories using Prisma.
 */

import { getPrisma } from '../../db';
import { DatabaseUnavailableError } from '../../errors';
import { logger } from '../../logger';

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
      // #region agent log
      fetch('http://127.0.0.1:7248/ingest/d6915d2c-7cdc-4e4d-9879-2c5523431d83',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store.ts:create',message:'before ensureAgent',data:{agentId:this.agentId},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H3'})}).catch(()=>{});
      // #endregion
      // Ensure agent exists
      await this.ensureAgent();

      const memory = await db.memory.create({
        data: {
          agentId: this.agentId,
          type: input.type as 'DECISION' | 'OUTCOME' | 'LEARNED_PATTERN' | 'USER_FEEDBACK',
          content: input.content,
          metadata: input.metadata as object,
          embeddingId: input.embeddingId,
          importance: input.importance ?? 0.5,
        },
      });

      return memory.id;
    } catch (error) {
      // #region agent log
      const e = error as { code?: string; message?: string; name?: string };
      fetch('http://127.0.0.1:7248/ingest/d6915d2c-7cdc-4e4d-9879-2c5523431d83',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store.ts:create catch',message:'DB error',data:{errCode:e?.code,errMessage:e?.message?.slice(0,200),errName:e?.name},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H3'})}).catch(()=>{});
      // #endregion
      logger.error('[MemoryStore] Database unavailable', { error });
      throw new DatabaseUnavailableError('Cannot store memory without database connection');
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

      return memories.map((m) => ({
        id: m.id,
        type: m.type,
        content: m.content,
        metadata: m.metadata,
        importance: m.importance,
        createdAt: m.createdAt,
      }));
    } catch (error) {
      logger.error('[MemoryStore] Database unavailable when finding memories', {
        error,
        ids,
        severity: 'CRITICAL',
      });
      throw new DatabaseUnavailableError('Cannot retrieve memories - database connection failed');
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
          ...(type && { type: type as 'DECISION' | 'OUTCOME' | 'LEARNED_PATTERN' | 'USER_FEEDBACK' }),
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      return memories.map((m) => ({
        id: m.id,
        type: m.type,
        content: m.content,
        metadata: m.metadata,
        importance: m.importance,
        createdAt: m.createdAt,
      }));
    } catch (error) {
      logger.error('[MemoryStore] Database unavailable when getting recent memories', {
        error,
        type,
        limit,
        severity: 'CRITICAL',
      });
      throw new DatabaseUnavailableError('Cannot retrieve recent memories - database connection failed');
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
      logger.error('[MemoryStore] Failed to update memory importance', {
        error,
        memoryId,
        delta,
        severity: 'HIGH',
        impact: 'Memory weighting inaccurate - learning degraded',
      });
      throw new DatabaseUnavailableError(
        `Cannot update memory importance: ${error instanceof Error ? error.message : String(error)}`
      );
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
      logger.warn('[MemoryStore] Agent table not available (run prisma migrate)', { error });
    }
  }
}
