/**
 * API Route: GET /api/dashboard/social
 *
 * Returns Moltbook and Farcaster social activity status for the Aegis agent.
 */

import { NextResponse } from 'next/server';
import {
  getMoltbookProfile,
  getAgentPosts,
  getFeed,
  getAgentMentions,
  type MoltbookAgentProfile,
  type MoltbookPost,
  type MoltbookMention,
} from '@/src/lib/agent/social/moltbook';
import { getReserveState } from '@/src/lib/agent/state/reserve-state';
import { getStateStore } from '@/src/lib/agent/state-store';
import { logger } from '@/src/lib/logger';

interface SocialStatus {
  moltbook: {
    connected: boolean;
    profile: MoltbookAgentProfile | null;
    karma: number;
    followers: number;
    postsCount: number;
    recentPosts: Array<{
      id: string;
      title: string;
      upvotes: number;
      createdAt: string;
    }>;
    recentMentions: Array<{
      id: string;
      type: string;
      content: string;
      author: string;
      createdAt: string;
    }>;
    error?: string;
  };
  farcaster: {
    lastPost: string | null;
    postIntervalMinutes: number;
  };
  engagement: {
    totalUpvotesGiven: number;
    totalRepliesSent: number;
    totalPostsCreated: number;
    lastActivity: string | null;
  };
}

export async function GET(): Promise<NextResponse> {
  const status: SocialStatus = {
    moltbook: {
      connected: false,
      profile: null,
      karma: 0,
      followers: 0,
      postsCount: 0,
      recentPosts: [],
      recentMentions: [],
    },
    farcaster: {
      lastPost: null,
      postIntervalMinutes: 15,
    },
    engagement: {
      totalUpvotesGiven: 0,
      totalRepliesSent: 0,
      totalPostsCreated: 0,
      lastActivity: null,
    },
  };

  // Check Moltbook status
  if (process.env.MOLTBOOK_API_KEY?.trim()) {
    try {
      // Get profile
      const profile = await getMoltbookProfile();
      status.moltbook.connected = true;
      status.moltbook.profile = profile;
      status.moltbook.karma = profile.karma ?? 0;
      status.moltbook.followers = profile.follower_count ?? 0;

      // Get agent's posts
      try {
        const posts = await getAgentPosts(10);
        status.moltbook.postsCount = posts.length;
        status.moltbook.recentPosts = posts.slice(0, 5).map((p: MoltbookPost) => ({
          id: p.id,
          title: p.title ?? 'Untitled',
          upvotes: p.upvotes ?? 0,
          createdAt: p.created_at ?? new Date().toISOString(),
        }));

        // Count total posts created (for engagement metrics)
        status.engagement.totalPostsCreated = posts.length;
      } catch (err) {
        logger.debug('[Social API] Failed to get agent posts', {
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // Get mentions
      try {
        const mentions = await getAgentMentions();
        status.moltbook.recentMentions = mentions.slice(0, 5).map((m: MoltbookMention) => ({
          id: m.id,
          type: m.type,
          content: m.content.slice(0, 200),
          author: m.author.name,
          createdAt: m.created_at,
        }));
      } catch (err) {
        logger.debug('[Social API] Failed to get mentions', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    } catch (err) {
      status.moltbook.error = err instanceof Error ? err.message : String(err);
      logger.warn('[Social API] Failed to get Moltbook profile', {
        error: status.moltbook.error,
      });
    }
  } else {
    status.moltbook.error = 'MOLTBOOK_API_KEY not configured';
  }

  // Get Farcaster status from reserve state
  try {
    const reserveState = await getReserveState();
    if (reserveState) {
      status.farcaster.lastPost = reserveState.lastFarcasterPost;
    }
    status.farcaster.postIntervalMinutes =
      Number(process.env.FARCASTER_UPDATE_INTERVAL_MS) / 60000 || 15;
  } catch (err) {
    logger.debug('[Social API] Failed to get reserve state', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Get engagement metrics from state store
  try {
    const store = await getStateStore();

    // Get replied comments count
    const repliedCommentsData = await store.get('moltbook:repliedComments');
    if (repliedCommentsData) {
      const replied = JSON.parse(repliedCommentsData) as string[];
      status.engagement.totalRepliesSent = replied.length;
    }

    // Get last activity timestamps
    const lastMoltbookPost = await store.get('lastMoltbookPost');
    const lastMoltbookCheck = await store.get('lastMoltbookCheck');

    if (lastMoltbookPost) {
      const ts = parseInt(lastMoltbookPost, 10);
      if (!isNaN(ts)) {
        status.engagement.lastActivity = new Date(ts).toISOString();
      }
    } else if (lastMoltbookCheck) {
      const ts = parseInt(lastMoltbookCheck, 10);
      if (!isNaN(ts)) {
        status.engagement.lastActivity = new Date(ts).toISOString();
      }
    }
  } catch (err) {
    logger.debug('[Social API] Failed to get engagement metrics', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return NextResponse.json(status);
}
