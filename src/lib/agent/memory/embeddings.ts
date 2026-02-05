/**
 * Aegis Agent - Embedding Service
 * 
 * Uses OpenAI for text embeddings and Pinecone for vector storage.
 * Enables semantic search over agent memories.
 */

import OpenAI from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';
import { logger } from '../../logger';

export class EmbeddingService {
  private openai: OpenAI;
  private pinecone: Pinecone | null = null;
  private indexName: string;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY ?? '',
    });
    this.indexName = process.env.PINECONE_INDEX_NAME || 'aegis-memory';
  }

  /** True if embeddings are available (OpenAI key set and valid); avoids noisy errors when key is missing. */
  private isEmbeddingAvailable(): boolean {
    const key = process.env.OPENAI_API_KEY;
    return typeof key === 'string' && key.length > 0 && key.startsWith('sk-');
  }

  /**
   * Initialize Pinecone client
   */
  private async getPinecone(): Promise<Pinecone> {
    if (!this.pinecone) {
      const apiKey = process.env.PINECONE_API_KEY;
      
      if (!apiKey) {
        throw new Error('PINECONE_API_KEY not configured');
      }

      this.pinecone = new Pinecone({
        apiKey,
      });
    }
    return this.pinecone;
  }

  /**
   * Create an embedding for text content
   */
  async createEmbedding(
    content: string,
    metadata: Record<string, unknown>
  ): Promise<string> {
    if (!this.isEmbeddingAvailable()) {
      logger.debug('[Embeddings] OPENAI_API_KEY missing or invalid, skipping embedding');
      return `temp-${Date.now()}`;
    }
    try {
      // Generate embedding using OpenAI
      const embeddingResponse = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: content,
      });

      const embedding = embeddingResponse.data[0].embedding;
      const embeddingId = `mem-${Date.now()}-${crypto.randomUUID()}`;

      // Store in Pinecone
      try {
        const pinecone = await this.getPinecone();
        const index = pinecone.index(this.indexName);

        await index.upsert([
          {
            id: embeddingId,
            values: embedding,
            metadata: {
              content: content.substring(0, 1000), // Truncate for metadata limits
              timestamp: new Date().toISOString(),
              ...this.sanitizeMetadata(metadata),
            },
          },
        ]);
      } catch (pineconeError) {
        logger.warn('[Embeddings] Pinecone storage failed, continuing without vector storage', { error: pineconeError });
      }

      return embeddingId;
    } catch (error: unknown) {
      const err = error as { status?: number; code?: string };
      const isInvalidKey = err?.status === 401 || err?.code === 'invalid_api_key';
      if (isInvalidKey) {
        logger.debug('[Embeddings] OpenAI API key rejected, skipping embedding');
      } else {
        logger.error('[Embeddings] Error creating embedding', { error });
      }
      return `temp-${Date.now()}`;
    }
  }

  /**
   * Search for similar memories using vector similarity
   */
  async searchSimilar(queryText: string, limit: number = 5): Promise<string[]> {
    if (!this.isEmbeddingAvailable()) {
      logger.debug('[Embeddings] OPENAI_API_KEY missing or invalid, skipping similar search');
      return [];
    }
    try {
      // Generate query embedding
      const embeddingResponse = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: queryText,
      });

      const queryEmbedding = embeddingResponse.data[0].embedding;

      // Search in Pinecone
      const pinecone = await this.getPinecone();
      const index = pinecone.index(this.indexName);

      const results = await index.query({
        vector: queryEmbedding,
        topK: limit,
        includeMetadata: true,
      });

      return results.matches?.map(match => match.id) || [];
    } catch (error: unknown) {
      const err = error as { status?: number; code?: string };
      const isInvalidKey = err?.status === 401 || err?.code === 'invalid_api_key';
      if (isInvalidKey) {
        logger.debug('[Embeddings] OpenAI API key rejected, returning no similar memories');
      } else {
        logger.error('[Embeddings] Error searching similar', { error });
      }
      return [];
    }
  }

  /**
   * Sanitize metadata for Pinecone (only primitive values allowed)
   */
  private sanitizeMetadata(metadata: Record<string, unknown>): Record<string, string | number | boolean> {
    const sanitized: Record<string, string | number | boolean> = {};

    for (const [key, value] of Object.entries(metadata)) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        sanitized[key] = value;
      } else if (value !== null && value !== undefined) {
        sanitized[key] = JSON.stringify(value).substring(0, 500);
      }
    }

    return sanitized;
  }
}
