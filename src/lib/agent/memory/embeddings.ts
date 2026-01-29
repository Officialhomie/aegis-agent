/**
 * Aegis Agent - Embedding Service
 * 
 * Uses OpenAI for text embeddings and Pinecone for vector storage.
 * Enables semantic search over agent memories.
 */

import OpenAI from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';

export class EmbeddingService {
  private openai: OpenAI;
  private pinecone: Pinecone | null = null;
  private indexName: string;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.indexName = process.env.PINECONE_INDEX_NAME || 'aegis-memory';
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
    try {
      // Generate embedding using OpenAI
      const embeddingResponse = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: content,
      });

      const embedding = embeddingResponse.data[0].embedding;
      const embeddingId = `mem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

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
        console.warn('[Embeddings] Pinecone storage failed, continuing without vector storage:', pineconeError);
      }

      return embeddingId;
    } catch (error) {
      console.error('[Embeddings] Error creating embedding:', error);
      // Return a placeholder ID if embedding fails
      return `temp-${Date.now()}`;
    }
  }

  /**
   * Search for similar memories using vector similarity
   */
  async searchSimilar(queryText: string, limit: number = 5): Promise<string[]> {
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
    } catch (error) {
      console.error('[Embeddings] Error searching similar:', error);
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
