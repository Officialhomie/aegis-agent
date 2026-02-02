/**
 * IPFS upload for decision JSON (Pinata or Infura).
 * Set IPFS_API_KEY (Pinata) or IPFS_PROJECT_ID + IPFS_PROJECT_SECRET (Infura).
 */

const PINATA_URL = 'https://api.pinata.cloud/pinning/pinJSONToIPFS';
const INFURA_IPFS_URL = 'https://ipfs.infura.io:5001/api/v0/add';

export interface UploadResult {
  cid: string;
  url: string;
}

/**
 * Upload JSON to IPFS via Pinata or Infura. Returns CID and gateway URL.
 */
export async function uploadDecisionToIPFS(decisionJSON: string): Promise<UploadResult | null> {
  const pinataKey = process.env.IPFS_API_KEY?.trim();
  const infuraProjectId = process.env.IPFS_PROJECT_ID?.trim();
  const infuraSecret = process.env.IPFS_PROJECT_SECRET?.trim();
  const gatewayUrl = process.env.IPFS_GATEWAY_URL?.trim() ?? 'https://gateway.pinata.cloud';

  if (pinataKey) {
    const pinataSecret = process.env.IPFS_SECRET_API_KEY?.trim();
    if (!pinataSecret) return null;
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
      if (!res.ok) return null;
      const data = (await res.json()) as { IpfsHash?: string };
      const cid = data.IpfsHash;
      if (!cid) return null;
      return { cid, url: `${gatewayUrl}/ipfs/${cid}` };
    } catch {
      return null;
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
      if (!res.ok) return null;
      const data = (await res.json()) as { Hash?: string };
      const cid = data.Hash;
      if (!cid) return null;
      const baseGateway = gatewayUrl.replace(/\/$/, '');
      return { cid, url: `${baseGateway}/ipfs/${cid}` };
    } catch {
      return null;
    }
  }

  return null;
}
