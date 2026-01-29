/**
 * Aegis Agent - Memory Layer
 * 
 * Manages short-term and long-term memory for the agent.
 * Uses PostgreSQL for structured data and Pinecone for semantic search.
 */

import { MemoryStore } from './store';
import { EmbeddingService } from './embeddings';

export interface MemoryEntry {
  type: 'OBSERVATION' | 'DECISION' | 'OUTCOME' | 'LEARNED_PATTERN' | 'USER_FEEDBACK';
  content: string;
  metadata: Record<string, unknown>;
  importance?: number;
}

// Initialize services (lazy loaded)
let memoryStore: MemoryStore | null = null;
let embeddingService: EmbeddingService | null = null;

function getMemoryStore(): MemoryStore {
  if (!memoryStore) {
    memoryStore = new MemoryStore();
  }
  return memoryStore;
}

function getEmbeddingService(): EmbeddingService {
  if (!embeddingService) {
    embeddingService = new EmbeddingService();
  }
  return embeddingService;
}

/**
 * Store a new memory (observation, decision, or outcome)
 */
export async function storeMemory(data: Record<string, unknown>): Promise<string> {
  const store = getMemoryStore();
  const embeddings = getEmbeddingService();

  try {
    // Create a textual description of the memory for embedding
    const content = JSON.stringify(data);
    
    // Generate embedding for semantic search
    const embeddingId = await embeddings.createEmbedding(content, data);

    // Store structured data in PostgreSQL
    const memoryId = await store.create({
      type: (data.type as string) || 'OBSERVATION',
      content,
      metadata: data,
      embeddingId,
    });

    console.log('[Memory] Stored memory:', memoryId);
    return memoryId;
  } catch (error) {
    console.error('[Memory] Error storing memory:', error);
    throw error;
  }
}

/**
 * Retrieve memories relevant to current observations
 */
export async function retrieveRelevantMemories(
  observations: unknown[],
  limit: number = 5
): Promise<unknown[]> {
  const embeddings = getEmbeddingService();
  const store = getMemoryStore();

  try {
    // Create query embedding from current observations
    const queryText = JSON.stringify(observations);
    
    // Search for similar memories in Pinecone
    const similarMemoryIds = await embeddings.searchSimilar(queryText, limit);

    if (similarMemoryIds.length === 0) {
      return [];
    }

    // Fetch full memory records from PostgreSQL
    const memories = await store.findByIds(similarMemoryIds);
    
    console.log(`[Memory] Retrieved ${memories.length} relevant memories`);
    return memories;
  } catch (error) {
    console.error('[Memory] Error retrieving memories:', error);
    return [];
  }
}

/**
 * Get recent memories (short-term memory)
 */
export async function getRecentMemories(
  type?: string,
  limit: number = 10
): Promise<unknown[]> {
  const store = getMemoryStore();
  return store.getRecent(type, limit);
}

/**
 * Update memory importance based on access patterns
 */
export async function updateMemoryImportance(
  memoryId: string,
  importanceDelta: number
): Promise<void> {
  const store = getMemoryStore();
  await store.updateImportance(memoryId, importanceDelta);
}

export { MemoryStore } from './store';
export { EmbeddingService } from './embeddings';
