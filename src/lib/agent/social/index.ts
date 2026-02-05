/**
 * Aegis Agent - Social (Moltbook)
 */

export {
  registerMoltbookAgent,
  getMoltbookStatus,
  getMoltbookProfile,
  postToMoltbook,
  commentOnPost,
  upvotePost,
  downvotePost,
  getFeed,
  getPosts,
  searchMoltbook,
  getMoltbookIdentityToken,
  createSubmolt,
  subscribeToSubmolt,
  type MoltbookRegistrationResult,
  type MoltbookStatus,
  type MoltbookPost,
  type MoltbookAgentProfile,
  type MoltbookSearchResult,
  type MoltbookSearchResponse,
} from './moltbook';

export {
  shouldRunMoltbookHeartbeat,
  runMoltbookHeartbeat,
  runMoltbookHeartbeatNow,
  getSponsorshipStats,
  buildActivitySummary,
  type SponsorshipStats,
} from './heartbeat';

export {
  postToFeed,
  postSponsorshipToBotchan,
  postReserveSwapToBotchan,
} from './botchan';
