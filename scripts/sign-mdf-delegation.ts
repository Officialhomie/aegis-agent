/**
 * Aegis MDF Helper — Sign MDF Delegation Struct
 *
 * Creates a signed MDF Delegation struct suitable for submission to
 * POST /api/delegation/:id/mdf-upgrade.
 *
 * Signs the MetaMask digest: keccak256(0x1901 ‖ domainSeparator ‖ hashMdfDelegation(...))
 * (same as DelegationManager + EncoderLib — not standard EIP-712 struct hashing).
 * Outputs JSON to stdout — pipe directly into the mdf-upgrade API call.
 *
 * Required env vars:
 *   MDF_DELEGATE_ADDRESS          — Aegis agent smart account address (the delegate)
 *   MDF_DELEGATOR_PRIVATE_KEY     — Private key of the user's DeleGator account
 *   MDF_DELEGATION_MANAGER_ADDRESS_BASE_SEPOLIA or _BASE — DelegationManager address
 *
 * Optional env vars:
 *   MDF_DELEGATION_SALT           — uint256 salt (default: Date.now())
 *   MDF_DELEGATION_AUTHORITY      — authority bytes32 (default: ROOT = 0xffff...ffff)
 *   AGENT_NETWORK_ID              — 'base' or 'base-sepolia' (default: base-sepolia)
 *
 * Usage:
 *   npx tsx scripts/sign-mdf-delegation.ts
 *
 *   # Upgrade an existing delegation:
 *   DELEGATION_ID=<uuid> npx tsx scripts/sign-mdf-delegation.ts | \
 *     xargs -I {} curl -X POST http://localhost:3000/api/delegation/$DELEGATION_ID/mdf-upgrade \
 *       -H "Authorization: Bearer $AEGIS_API_KEY" \
 *       -H "Content-Type: application/json" \
 *       -d {}
 *
 * Output shape (JSON):
 *   {
 *     "mdfDelegation": { delegate, delegator, authority, caveats, salt, signature },
 *     "chainId": 84532
 *   }
 */

import 'dotenv/config';
import { privateKeyToAccount } from 'viem/accounts';
import { ROOT_AUTHORITY } from '../src/lib/mdf/types';
import { serializeMdfDelegation } from '../src/lib/mdf/calldata';
import { hashMdfDelegation, mdfDelegationTypedDataDigest } from '../src/lib/mdf/verifier';
import type { MdfDelegation } from '../src/lib/mdf/types';

// ─── Config ───────────────────────────────────────────────────────────────────

const NETWORK_ID = process.env.AGENT_NETWORK_ID ?? 'base-sepolia';
const IS_MAINNET = NETWORK_ID === 'base';
const CHAIN_ID = IS_MAINNET ? 8453 : 84532;

const DM_ENV_KEY = IS_MAINNET
  ? 'MDF_DELEGATION_MANAGER_ADDRESS_BASE'
  : 'MDF_DELEGATION_MANAGER_ADDRESS_BASE_SEPOLIA';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    console.error(`[sign-mdf] ERROR: ${name} is not set`);
    process.exit(1);
  }
  return v.trim();
}

/** viem expects `0x` + 64 hex chars; .env often omits the prefix or wraps in quotes. */
function normalizeSecp256k1PrivateKey(raw: string): `0x${string}` {
  let s = raw.trim().replace(/^["']|["']$/g, '');
  if (!s.startsWith('0x') && !s.startsWith('0X')) {
    if (/^[0-9a-fA-F]{64}$/.test(s)) {
      s = `0x${s}`;
    }
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(s)) {
    console.error(
      '[sign-mdf] ERROR: MDF_DELEGATOR_PRIVATE_KEY must be 32 bytes hex: `0x` + 64 hex characters (or 64 hex without 0x).'
    );
    process.exit(1);
  }
  return s as `0x${string}`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const delegateAddress = requireEnv('MDF_DELEGATE_ADDRESS') as `0x${string}`;
  const delegatorPrivateKey = normalizeSecp256k1PrivateKey(requireEnv('MDF_DELEGATOR_PRIVATE_KEY'));
  const dmAddress = requireEnv(DM_ENV_KEY) as `0x${string}`;

  if (dmAddress === '0x0000000000000000000000000000000000000000') {
    console.error(`[sign-mdf] ERROR: ${DM_ENV_KEY} is set to zero address`);
    process.exit(1);
  }

  // Parse optional params
  const saltEnv = process.env.MDF_DELEGATION_SALT;
  const salt = saltEnv ? BigInt(saltEnv) : BigInt(Date.now());

  const authorityEnv = process.env.MDF_DELEGATION_AUTHORITY;
  const authority = (authorityEnv ?? ROOT_AUTHORITY) as `0x${string}`;

  // Build delegator account from private key
  const delegatorAccount = privateKeyToAccount(delegatorPrivateKey);
  const delegatorAddress = delegatorAccount.address;

  console.error(`[sign-mdf] Signing MDF Delegation on ${NETWORK_ID} (chainId ${CHAIN_ID})`);
  console.error(`[sign-mdf] DelegationManager: ${dmAddress}`);
  console.error(`[sign-mdf] delegate:  ${delegateAddress}`);
  console.error(`[sign-mdf] delegator: ${delegatorAddress}`);
  console.error(`[sign-mdf] salt:      ${salt}`);
  console.error(`[sign-mdf] authority: ${authority.slice(0, 10)}...`);

  const unsigned: MdfDelegation = {
    delegate: delegateAddress,
    delegator: delegatorAddress,
    authority,
    caveats: [],
    salt,
    signature: '0x',
  };

  const digest = mdfDelegationTypedDataDigest(unsigned, dmAddress, CHAIN_ID);
  const signature = await delegatorAccount.sign({ hash: digest });

  console.error(`[sign-mdf] Signature: ${signature.slice(0, 20)}...`);

  const mdfDelegation: MdfDelegation = {
    ...unsigned,
    signature,
  };

  // Compute hash for reference (used in revocation checks)
  const delegationHash = hashMdfDelegation(mdfDelegation);
  console.error(`[sign-mdf] Delegation hash: ${delegationHash}`);

  // Output to stdout as JSON body for /mdf-upgrade
  const output = {
    mdfDelegation: {
      delegate: mdfDelegation.delegate,
      delegator: mdfDelegation.delegator,
      authority: mdfDelegation.authority,
      caveats: mdfDelegation.caveats,
      salt: mdfDelegation.salt.toString(),
      signature: mdfDelegation.signature,
    },
    chainId: CHAIN_ID,
    // Metadata (not part of API body — for reference only)
    _meta: {
      delegationHash,
      delegationManagerAddress: dmAddress,
      network: NETWORK_ID,
      signedAt: new Date().toISOString(),
    },
  };

  // Print JSON to stdout (so it can be piped to curl)
  process.stdout.write(JSON.stringify(output, null, 2) + '\n');

  // Also serialize for verification
  const serialized = serializeMdfDelegation(mdfDelegation);
  const parsed = JSON.parse(serialized);
  if (parsed.salt !== mdfDelegation.salt.toString()) {
    console.error('[sign-mdf] WARNING: salt serialization round-trip mismatch — check calldata.ts');
  } else {
    console.error('[sign-mdf] Salt serialization round-trip: OK');
  }

  console.error('[sign-mdf] Done. Pipe the JSON above to POST /api/delegation/:id/mdf-upgrade');
}

main().catch((err) => {
  console.error('[sign-mdf] Fatal error:', err);
  process.exit(1);
});
