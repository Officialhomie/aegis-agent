/**
 * IPFS upload for decision JSON (Pinata or Infura).
 * Set IPFS_API_KEY (Pinata) or IPFS_PROJECT_ID + IPFS_PROJECT_SECRET (Infura).
 */

import { logger } from './logger';

const PINATA_URL = 'https://api.pinata.cloud/pinning/pinJSONToIPFS';
const INFURA_IPFS_URL = 'https://ipfs.infura.io:5001/api/v0/add';

export interface UploadResult {
  cid: string;
  url: string;
}

export interface UploadError {
  success: false;
  error: string;
  reason: 'not_configured' | 'auth_failed' | 'network_error' | 'invalid_data';
}

/**
 * Upload JSON to IPFS via Pinata or Infura. Returns CID and gateway URL, or structured error.
 */
export async function uploadDecisionToIPFS(
  decisionJSON: string
): Promise<UploadResult | UploadError> {
  const pinataKey = process.env.IPFS_API_KEY?.trim();
  const infuraProjectId = process.env.IPFS_PROJECT_ID?.trim();
  const infuraSecret = process.env.IPFS_PROJECT_SECRET?.trim();
  const gatewayUrl = process.env.IPFS_GATEWAY_URL?.trim() ?? 'https://gateway.pinata.cloud';

  if (pinataKey) {
    const pinataSecret = process.env.IPFS_SECRET_API_KEY?.trim();
    if (!pinataSecret) {
      logger.warn('[IPFS] Pinata API key configured but secret missing');
      return {
        success: false,
        error: 'IPFS_SECRET_API_KEY not configured',
        reason: 'not_configured',
      };
    }

    try {
      const res = await fetch(PINATA_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          pinata_api_key: pinataKey,
          pinata_secret_api_key: pinataSecret,
        },
        body: decisionJSON,
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        const errorText = await res.text();
        logger.error('[IPFS] Pinata upload failed', { status: res.status, error: errorText });
        if (res.status === 401 || res.status === 403) {
          return {
            success: false,
            error: `Pinata authentication failed: ${res.status}`,
            reason: 'auth_failed',
          };
        }
        return {
          success: false,
          error: `Pinata API error: ${res.status} - ${errorText}`,
          reason: 'network_error',
        };
      }

      const data = (await res.json()) as { IpfsHash?: string };
      const cid = data.IpfsHash;
      if (!cid) {
        logger.error('[IPFS] Pinata response missing CID', { response: data });
        return {
          success: false,
          error: 'Pinata response missing IpfsHash field',
          reason: 'invalid_data',
        };
      }

      logger.info('[IPFS] Decision uploaded successfully', { cid });
      return { cid, url: `${gatewayUrl}/ipfs/${cid}` };
    } catch (error) {
      logger.error('[IPFS] Pinata upload exception', { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        reason: 'network_error',
      };
    }
  }

  if (infuraProjectId && infuraSecret) {
    try {
      const auth = Buffer.from(`${infuraProjectId}:${infuraSecret}`).toString('base64');
      const form = new FormData();
      form.append('file', new Blob([decisionJSON], { type: 'application/json' }));
      const res = await fetch(INFURA_IPFS_URL, {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}` },
        body: form,
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        const errorText = await res.text();
        logger.error('[IPFS] Infura upload failed', { status: res.status, error: errorText });
        if (res.status === 401 || res.status === 403) {
          return {
            success: false,
            error: `Infura authentication failed: ${res.status}`,
            reason: 'auth_failed',
          };
        }
        return {
          success: false,
          error: `Infura API error: ${res.status} - ${errorText}`,
          reason: 'network_error',
        };
      }

      const data = (await res.json()) as { Hash?: string };
      const cid = data.Hash;
      if (!cid) {
        logger.error('[IPFS] Infura response missing Hash', { response: data });
        return {
          success: false,
          error: 'Infura response missing Hash field',
          reason: 'invalid_data',
        };
      }

      logger.info('[IPFS] Decision uploaded successfully (Infura)', { cid });
      const baseGateway = gatewayUrl.replace(/\/$/, '');
      return { cid, url: `${baseGateway}/ipfs/${cid}` };
    } catch (error) {
      logger.error('[IPFS] Infura upload exception', { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        reason: 'network_error',
      };
    }
  }

  logger.debug('[IPFS] No IPFS provider configured - skipping upload');
  return {
    success: false,
    error: 'No IPFS provider configured (set IPFS_API_KEY or IPFS_PROJECT_ID)',
    reason: 'not_configured',
  };
}
