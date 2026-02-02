/**
 * IPFS uploadDecisionToIPFS tests - structured error return (no silent null)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { uploadDecisionToIPFS } from '../../src/lib/ipfs';

describe('uploadDecisionToIPFS', () => {
  beforeEach(() => {
    vi.stubEnv('IPFS_API_KEY', '');
    vi.stubEnv('IPFS_SECRET_API_KEY', '');
    vi.stubEnv('IPFS_PROJECT_ID', '');
    vi.stubEnv('IPFS_PROJECT_SECRET', '');
  });

  it('returns structured UploadError when no IPFS provider configured', async () => {
    const result = await uploadDecisionToIPFS('{"test": true}');
    expect(result).not.toBeNull();
    expect('success' in result && result.success === false).toBe(true);
    if ('reason' in result) {
      expect(result.reason).toBe('not_configured');
      expect(result.error).toMatch(/No IPFS provider/);
    }
  });

  it('return value has cid when success or reason when error', async () => {
    const result = await uploadDecisionToIPFS('{}');
    const hasCid = result != null && 'cid' in result;
    const hasReason = result != null && 'reason' in result;
    expect(hasCid || hasReason).toBe(true);
  });
});
