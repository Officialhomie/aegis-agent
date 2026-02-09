/**
 * Post deduplication: avoid posting the same or very similar content consecutively.
 * Stores last 10 post hashes (hash of first 100 chars) in state store.
 */

import { createHash } from 'crypto';
import { getStateStore } from '../state-store';

const HISTORY_KEY = 'social:post:history';
const HISTORY_SIZE = 10;
const PREVIEW_LEN = 100;

function hashPreview(text: string): string {
  const preview = text.slice(0, PREVIEW_LEN).trim();
  return createHash('sha256').update(preview).digest('hex').slice(0, 16);
}

/**
 * Check if this post content is a duplicate of a recent post.
 */
export async function isDuplicatePost(content: string): Promise<boolean> {
  const store = await getStateStore();
  const raw = await store.get(HISTORY_KEY);
  if (!raw) return false;
  try {
    const history = JSON.parse(raw) as string[];
    if (!Array.isArray(history)) return false;
    const h = hashPreview(content);
    return history.includes(h);
  } catch {
    return false;
  }
}

/**
 * Record that this post was published (add its hash to history).
 */
export async function recordPost(content: string): Promise<void> {
  const store = await getStateStore();
  const raw = await store.get(HISTORY_KEY);
  const history: string[] = raw ? (JSON.parse(raw) as string[]) : [];
  if (!Array.isArray(history)) throw new Error('Invalid post history');
  const h = hashPreview(content);
  const next = [...history.filter((x) => x !== h), h].slice(-HISTORY_SIZE);
  await store.set(HISTORY_KEY, JSON.stringify(next));
}
