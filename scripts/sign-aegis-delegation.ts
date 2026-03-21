/**
 * Aegis Helper — Sign Aegis Delegation EIP-712 Struct
 *
 * Produces a JSON body ready for: POST /api/delegation
 *
 * The Aegis delegation EIP-712 domain is:
 *   { name: 'AegisDelegation', version: '1', chainId, verifyingContract: DELEGATION_REGISTRY_ADDRESS }
 *
 * This is DIFFERENT from the MDF delegation domain (DelegationManager).
 * Run this FIRST, then run sign-mdf-delegation.ts to upgrade to MDF mode.
 *
 * Required env vars:
 *   DELEGATION_REGISTRY_ADDRESS     — AegisDelegationRegistry contract address
 *   DELEGATOR_PRIVATE_KEY           — Private key of the user (the delegator)
 *   AGENT_WALLET_ADDRESS            — The agent smart account address (the delegate)
 *   DELEGATION_CHAIN_ID             — Chain ID (default: 8453 for Base mainnet)
 *
 * Optional env vars:
 *   DELEGATION_GAS_BUDGET_WEI       — Gas budget in wei (default: 1000000000000000000 = 1 ETH)
 *   DELEGATION_VALID_DAYS           — How many days the delegation is valid (default: 30)
 *
 * Usage:
 *   DELEGATOR_PRIVATE_KEY=0x... npx tsx scripts/sign-aegis-delegation.ts
 *
 *   # Create the delegation:
 *   npx tsx scripts/sign-aegis-delegation.ts > /tmp/aegis-delegation.json
 *   curl -X POST http://localhost:3000/api/delegation \
 *     -H "Authorization: Bearer $AEGIS_API_KEY" \
 *     -H "Content-Type: application/json" \
 *     -d @/tmp/aegis-delegation.json
 */

import 'dotenv/config';
import {
  keccak256,
  encodePacked,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// ─── EIP-712 helpers (inlined to avoid circular imports) ─────────────────────

const EIP712_DOMAIN_NAME = 'AegisDelegation';
const EIP712_DOMAIN_VERSION = '1';

const DELEGATION_TYPE_STRING =
  'Delegation(address delegator,address agent,bytes32 permissionsHash,uint256 gasBudgetWei,uint256 validFrom,uint256 validUntil,uint256 nonce)';

function hashPermissions(permissions: object): Hex {
  const normalized = {
    contracts: [],
    functions: [],
    maxValuePerTx: '0',
    maxGasPerTx: 500000,
    maxDailySpend: 100,
    maxTxPerDay: 50,
    maxTxPerHour: 10,
    ...permissions,
  };
  const json = JSON.stringify(normalized);
  return keccak256(encodePacked(['string'], [json]));
}

function buildDomainSeparator(chainId: number, verifyingContract: Address): Hex {
  const typeHash = keccak256(
    encodePacked(['string'], ['EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'])
  );
  const nameHash = keccak256(encodePacked(['string'], [EIP712_DOMAIN_NAME]));
  const versionHash = keccak256(encodePacked(['string'], [EIP712_DOMAIN_VERSION]));
  return keccak256(
    encodePacked(
      ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
      [typeHash, nameHash, versionHash, BigInt(chainId), verifyingContract]
    )
  );
}

function buildStructHash(params: {
  delegator: Address;
  agent: Address;
  permissionsHash: Hex;
  gasBudgetWei: bigint;
  validFrom: bigint;
  validUntil: bigint;
  nonce: bigint;
}): Hex {
  const typeHash = keccak256(encodePacked(['string'], [DELEGATION_TYPE_STRING]));
  return keccak256(
    encodePacked(
      ['bytes32', 'address', 'address', 'bytes32', 'uint256', 'uint256', 'uint256', 'uint256'],
      [
        typeHash,
        params.delegator,
        params.agent,
        params.permissionsHash,
        params.gasBudgetWei,
        params.validFrom,
        params.validUntil,
        params.nonce,
      ]
    )
  );
}

function buildDigest(chainId: number, verifyingContract: Address, structHash: Hex): Hex {
  const domainSeparator = buildDomainSeparator(chainId, verifyingContract);
  return keccak256(
    encodePacked(['string', 'bytes32', 'bytes32'], ['\x19\x01', domainSeparator, structHash])
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    console.error(`[sign-aegis] ERROR: ${name} is not set`);
    process.exit(1);
  }
  return v.trim();
}

function normalizePrivateKey(raw: string): `0x${string}` {
  let s = raw.trim().replace(/^["']|["']$/g, '');
  if (!s.startsWith('0x') && !s.startsWith('0X')) {
    if (/^[0-9a-fA-F]{64}$/.test(s)) s = `0x${s}`;
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(s)) {
    console.error('[sign-aegis] ERROR: private key must be 32 bytes hex (0x + 64 chars)');
    process.exit(1);
  }
  return s as `0x${string}`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const rawKey = requireEnv('DELEGATOR_PRIVATE_KEY');
  const registryAddr = requireEnv('DELEGATION_REGISTRY_ADDRESS') as Address;
  const agentAddress = requireEnv('AGENT_WALLET_ADDRESS') as Address;

  const chainId = parseInt(process.env.DELEGATION_CHAIN_ID ?? '8453', 10);
  const gasBudgetWei = BigInt(process.env.DELEGATION_GAS_BUDGET_WEI ?? '1000000000000000000');
  const validDays = parseInt(process.env.DELEGATION_VALID_DAYS ?? '30', 10);

  const privateKey = normalizePrivateKey(rawKey);
  const account = privateKeyToAccount(privateKey);
  const delegatorAddress = account.address as Address;

  if (delegatorAddress.toLowerCase() === agentAddress.toLowerCase()) {
    console.error('[sign-aegis] ERROR: delegator and agent must be different addresses');
    console.error(`  delegator: ${delegatorAddress}`);
    console.error(`  agent:     ${agentAddress}`);
    console.error('  Set AGENT_WALLET_ADDRESS to your agent smart account address');
    process.exit(1);
  }

  const now = new Date();
  const validFrom = now;
  const validUntil = new Date(now.getTime() + validDays * 24 * 60 * 60 * 1000);
  const nonce = BigInt(Date.now());

  const permissions = {
    contracts: [],
    functions: [],
    maxValuePerTx: '0',
    maxGasPerTx: 500000,
    maxDailySpend: 100,
    maxTxPerDay: 50,
    maxTxPerHour: 10,
  };

  const validFromUnix = BigInt(Math.floor(validFrom.getTime() / 1000));
  const validUntilUnix = BigInt(Math.floor(validUntil.getTime() / 1000));
  const permissionsHash = hashPermissions(permissions);

  const structHash = buildStructHash({
    delegator: delegatorAddress,
    agent: agentAddress,
    permissionsHash,
    gasBudgetWei,
    validFrom: validFromUnix,
    validUntil: validUntilUnix,
    nonce,
  });

  const digest = buildDigest(chainId, registryAddr, structHash);

  console.error(`[sign-aegis] Signing Aegis Delegation`);
  console.error(`[sign-aegis] Network:   chainId ${chainId}`);
  console.error(`[sign-aegis] Registry:  ${registryAddr}`);
  console.error(`[sign-aegis] delegator: ${delegatorAddress}`);
  console.error(`[sign-aegis] agent:     ${agentAddress}`);
  console.error(`[sign-aegis] budget:    ${gasBudgetWei} wei`);
  console.error(`[sign-aegis] validUntil: ${validUntil.toISOString()}`);
  console.error(`[sign-aegis] nonce:     ${nonce}`);

  const signature = await account.sign({ hash: digest });
  console.error(`[sign-aegis] Signature: ${signature.slice(0, 20)}...`);

  // Output JSON body for POST /api/delegation
  const body = {
    delegator: delegatorAddress,
    agent: agentAddress,
    permissions,
    gasBudgetWei: gasBudgetWei.toString(),
    validFrom: validFrom.toISOString(),
    validUntil: validUntil.toISOString(),
    signature,
    nonce: nonce.toString(),
  };

  process.stdout.write(JSON.stringify(body, null, 2) + '\n');
  console.error('[sign-aegis] Done. Pipe the JSON above to POST /api/delegation');
}

main().catch((err) => {
  console.error('[sign-aegis] Fatal error:', err);
  process.exit(1);
});
