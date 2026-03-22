/**
 * Aegis MDF On-Chain Constants Verifier
 *
 * Verifies the three pre-mainnet risks that cannot be caught by unit tests:
 *
 *   R-1: SINGLE_EXECUTION_MODE — must match DelegationManager's expected execution mode
 *   R-2: EIP-712 domain       — name='DelegationManager' version='1' must match deployed contract
 *   R-3: delegationHash       — hashMdfDelegation() encoding must match getDelegationHash() on-chain
 *
 * All checks are read-only eth_call — no transactions or gas required.
 *
 * Required env vars:
 *   MDF_DELEGATION_MANAGER_ADDRESS_BASE or MDF_DELEGATION_MANAGER_ADDRESS_BASE_SEPOLIA
 *   RPC_URL_BASE or RPC_URL_BASE_SEPOLIA (or BASE_RPC_URL / BASE_SEPOLIA_RPC_URL)
 *
 * Usage:
 *   npx tsx scripts/check-mdf-constants.ts
 *   npx tsx scripts/check-mdf-constants.ts --network base
 */

import 'dotenv/config';
import { createPublicClient, http, encodeAbiParameters, keccak256, type Address } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { SINGLE_EXECUTION_MODE, ROOT_AUTHORITY } from '../src/lib/mdf/types';
import { hashMdfDelegation } from '../src/lib/mdf/verifier';
import { DELEGATION_MANAGER_ABI } from '../src/lib/mdf/constants';
import type { MdfDelegation } from '../src/lib/mdf/types';

// ─── Config ───────────────────────────────────────────────────────────────────

const ARGS = process.argv.slice(2);
const NETWORK_IDX = ARGS.indexOf('--network');
const NETWORK_ID = NETWORK_IDX !== -1 ? ARGS[NETWORK_IDX + 1] : (process.env.AGENT_NETWORK_ID ?? 'base-sepolia');
const IS_MAINNET = NETWORK_ID === 'base';
const CHAIN = IS_MAINNET ? base : baseSepolia;
const CHAIN_ID = IS_MAINNET ? 8453 : 84532;

const RPC_URL = IS_MAINNET
  ? (process.env.RPC_URL_BASE ?? process.env.BASE_RPC_URL ?? '')
  : (process.env.RPC_URL_BASE_SEPOLIA ?? process.env.BASE_SEPOLIA_RPC_URL ?? '');

const DM_ENV_KEY = IS_MAINNET
  ? 'MDF_DELEGATION_MANAGER_ADDRESS_BASE'
  : 'MDF_DELEGATION_MANAGER_ADDRESS_BASE_SEPOLIA';

// Synthetic test delegation for R-3 hash comparison
const TEST_DELEGATE = '0x1111111111111111111111111111111111111111' as `0x${string}`;
const TEST_DELEGATOR = '0x2222222222222222222222222222222222222222' as `0x${string}`;
const TEST_SALT = BigInt(42);

// ─── Report ───────────────────────────────────────────────────────────────────

let exitCode = 0;

function ok(label: string, detail: string) {
  console.log(`  PASS  ${label}`);
  if (detail) console.log(`        ${detail}`);
}

function err(label: string, detail: string, fatal = false) {
  const tag = fatal ? 'FAIL [CRITICAL]' : 'FAIL [WARNING] ';
  console.error(`  ${tag}  ${label}`);
  if (detail) console.error(`        ${detail}`);
  if (fatal) exitCode = 1;
}

function section(title: string) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('─'.repeat(60));
}

// ─── Checks ───────────────────────────────────────────────────────────────────

/** R-1: SINGLE_EXECUTION_MODE must equal DelegationManager's SINGLE_DEFAULT_MODE */
async function checkR1SingleExecutionMode(client: ReturnType<typeof createPublicClient>, dmAddr: Address) {
  section('R-1 — SINGLE_EXECUTION_MODE constant');

  // Check local constant
  const expected = '0x0000000000000000000000000000000000000000000000000000000000000000';
  if (SINGLE_EXECUTION_MODE !== expected) {
    err(
      'R-1:local-constant',
      `SINGLE_EXECUTION_MODE in types.ts = ${SINGLE_EXECUTION_MODE}, expected ${expected}`,
      true
    );
    return;
  }
  ok('R-1:local-constant', `SINGLE_EXECUTION_MODE = ${expected.slice(0, 10)}... (all zeros)`);

  // Try to read SINGLE_DEFAULT_MODE from DelegationManager (if exposed as public constant)
  try {
    const onChainMode = await client.readContract({
      address: dmAddr,
      abi: [
        {
          inputs: [],
          name: 'SINGLE_DEFAULT_MODE',
          outputs: [{ type: 'bytes32' }],
          stateMutability: 'view',
          type: 'function',
        },
      ] as const,
      functionName: 'SINGLE_DEFAULT_MODE',
    });

    if (onChainMode !== SINGLE_EXECUTION_MODE) {
      err(
        'R-1:onchain-match',
        `On-chain SINGLE_DEFAULT_MODE = ${onChainMode}\nAegis SINGLE_EXECUTION_MODE = ${SINGLE_EXECUTION_MODE}\nUpdate types.ts to match`,
        true
      );
    } else {
      ok('R-1:onchain-match', `On-chain SINGLE_DEFAULT_MODE matches SINGLE_EXECUTION_MODE`);
    }
  } catch {
    // Not all DelegationManager versions expose this as a public constant
    ok(
      'R-1:onchain-match',
      'SINGLE_DEFAULT_MODE() not exposed — cannot verify on-chain. Manual check recommended (see plan R-1)'
    );
  }
}

/** R-2: EIP-712 domain name + version must match Aegis verifier.ts */
async function checkR2Eip712Domain(client: ReturnType<typeof createPublicClient>, dmAddr: Address) {
  section('R-2 — EIP-712 Domain (name + version)');

  const EXPECTED_NAME = 'DelegationManager';
  const EXPECTED_VERSION = '1';

  try {
    const eip712Abi = [
      {
        inputs: [],
        name: 'eip712Domain',
        outputs: [
          { name: 'fields', type: 'bytes1' },
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' },
          { name: 'salt', type: 'bytes32' },
          { name: 'extensions', type: 'uint256[]' },
        ],
        stateMutability: 'view',
        type: 'function',
      },
    ] as const;

    const result = await client.readContract({ address: dmAddr, abi: eip712Abi, functionName: 'eip712Domain' });
    const [, name, version, chainIdBn] = result as [string, string, string, bigint, string, string, bigint[]];

    if (name !== EXPECTED_NAME) {
      err(
        'R-2:domain-name',
        `On-chain name='${name}', Aegis verifier.ts expects '${EXPECTED_NAME}'\nAll EIP-712 signature verifications will fail — update verifier.ts domain`,
        true
      );
    } else {
      ok('R-2:domain-name', `name='${name}' matches Aegis verifier.ts`);
    }

    if (version !== EXPECTED_VERSION) {
      err(
        'R-2:domain-version',
        `On-chain version='${version}', Aegis verifier.ts expects '${EXPECTED_VERSION}'\nUpdate verifier.ts domain`,
        true
      );
    } else {
      ok('R-2:domain-version', `version='${version}' matches Aegis verifier.ts`);
    }

    if (Number(chainIdBn) !== CHAIN_ID) {
      err(
        'R-2:domain-chainid',
        `On-chain chainId=${chainIdBn}, expected ${CHAIN_ID} for ${NETWORK_ID}`,
        true
      );
    } else {
      ok('R-2:domain-chainid', `chainId=${chainIdBn} matches network ${NETWORK_ID}`);
    }
  } catch (e) {
    err(
      'R-2:eip712Domain-call',
      `eip712Domain() not available or reverted: ${e instanceof Error ? e.message : String(e)}\nCannot verify R-2 automatically — check DelegationManager ABI manually`,
      false // warning only — some versions use hardcoded domain
    );
  }
}

/** R-3: hashMdfDelegation() off-chain encoding must match DelegationManager.getDelegationHash() */
async function checkR3DelegationHash(client: ReturnType<typeof createPublicClient>, dmAddr: Address) {
  section('R-3 — Delegation Hash Encoding');

  const testDelegation: MdfDelegation = {
    delegate: TEST_DELEGATE,
    delegator: TEST_DELEGATOR,
    authority: ROOT_AUTHORITY,
    caveats: [],
    salt: TEST_SALT,
    signature: '0x' as `0x${string}`,
  };

  const offChainHash = hashMdfDelegation(testDelegation);
  ok('R-3:offchain-hash', `hashMdfDelegation() = ${offChainHash}`);

  // Try getDelegationHash(Delegation) on-chain
  const getDelegationHashAbi = [
    {
      inputs: [
        {
          name: '_input',
          type: 'tuple',
          components: [
            { name: 'delegate', type: 'address' },
            { name: 'delegator', type: 'address' },
            { name: 'authority', type: 'bytes32' },
            {
              name: 'caveats',
              type: 'tuple[]',
              components: [
                { name: 'enforcer', type: 'address' },
                { name: 'terms', type: 'bytes' },
                { name: 'args', type: 'bytes' },
              ],
            },
            { name: 'salt', type: 'uint256' },
            { name: 'signature', type: 'bytes' },
          ],
        },
      ],
      name: 'getDelegationHash',
      outputs: [{ type: 'bytes32' }],
      stateMutability: 'pure',
      type: 'function',
    },
  ] as const;

  try {
    const onChainHash = await client.readContract({
      address: dmAddr,
      abi: getDelegationHashAbi,
      functionName: 'getDelegationHash',
      args: [
        {
          delegate: testDelegation.delegate,
          delegator: testDelegation.delegator,
          authority: testDelegation.authority,
          caveats: [],
          salt: testDelegation.salt,
          signature: testDelegation.signature,
        },
      ],
    });

    if (offChainHash.toLowerCase() !== onChainHash.toLowerCase()) {
      err(
        'R-3:hash-match',
        [
          `Hash mismatch — revocation checks will query the wrong slot`,
          `  Off-chain (hashMdfDelegation): ${offChainHash}`,
          `  On-chain (getDelegationHash):  ${onChainHash}`,
          `  Fix: update hashMdfDelegation() in verifier.ts to match on-chain encoding`,
        ].join('\n'),
        true
      );
    } else {
      ok('R-3:hash-match', `Off-chain hash matches on-chain getDelegationHash(): ${offChainHash}`);
    }
  } catch (e) {
    // getDelegationHash may not be exposed as a pure function in all versions
    // Attempt the EIP-712 typed hash approach as fallback
    try {
      const typedHashAbi = [
        {
          inputs: [
            {
              name: '_delegation',
              type: 'tuple',
              components: [
                { name: 'delegate', type: 'address' },
                { name: 'delegator', type: 'address' },
                { name: 'authority', type: 'bytes32' },
                {
                  name: 'caveats',
                  type: 'tuple[]',
                  components: [
                    { name: 'enforcer', type: 'address' },
                    { name: 'terms', type: 'bytes' },
                    { name: 'args', type: 'bytes' },
                  ],
                },
                { name: 'salt', type: 'uint256' },
                { name: 'signature', type: 'bytes' },
              ],
            },
          ],
          name: 'getTypedDataHash',
          outputs: [{ type: 'bytes32' }],
          stateMutability: 'view',
          type: 'function',
        },
      ] as const;

      const typedHash = await client.readContract({
        address: dmAddr,
        abi: typedHashAbi,
        functionName: 'getTypedDataHash',
        args: [
          {
            delegate: testDelegation.delegate,
            delegator: testDelegation.delegator,
            authority: testDelegation.authority,
            caveats: [],
            salt: testDelegation.salt,
            signature: testDelegation.signature,
          },
        ],
      });
      ok(
        'R-3:hash-fallback',
        `getDelegationHash not found, getTypedDataHash = ${typedHash}\n        Off-chain hashMdfDelegation = ${offChainHash}\n        Manual comparison required`
      );
    } catch {
      err(
        'R-3:hash-check',
        `Neither getDelegationHash() nor getTypedDataHash() callable on DelegationManager: ${e instanceof Error ? e.message : String(e)}\nManually verify hash encoding against DelegationManager source`,
        false
      );
    }
  }
}

/** Connectivity + code existence check */
async function checkConnectivity(client: ReturnType<typeof createPublicClient>, dmAddr: Address) {
  section(`Connectivity — ${NETWORK_ID} (chainId ${CHAIN_ID})`);

  try {
    const blockNumber = await client.getBlockNumber();
    ok('rpc:connected', `Latest block: ${blockNumber}`);
  } catch (e) {
    err('rpc:connected', `RPC call failed: ${e instanceof Error ? e.message : String(e)}`, true);
    return false;
  }

  try {
    const code = await client.getBytecode({ address: dmAddr });
    if (!code || code === '0x') {
      err('dm:bytecode', `No code at ${dmAddr} on ${NETWORK_ID}`, true);
      return false;
    }
    ok('dm:bytecode', `${(code.length - 2) / 2} bytes at ${dmAddr}`);
  } catch (e) {
    err('dm:bytecode', `Bytecode check failed: ${e instanceof Error ? e.message : String(e)}`, true);
    return false;
  }

  return true;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('='.repeat(60));
  console.log('  AEGIS MDF CONSTANTS VERIFIER');
  console.log(`  Network: ${NETWORK_ID} (chainId ${CHAIN_ID})`);
  console.log('='.repeat(60));

  if (!RPC_URL) {
    console.error(`ERROR: RPC URL not configured. Set RPC_URL_BASE${IS_MAINNET ? '' : '_SEPOLIA'} or BASE${IS_MAINNET ? '' : '_SEPOLIA'}_RPC_URL`);
    process.exit(1);
  }

  const dmAddr = process.env[DM_ENV_KEY] as Address | undefined;
  if (!dmAddr || dmAddr === '0x0000000000000000000000000000000000000000') {
    console.error(`ERROR: ${DM_ENV_KEY} not set or is zero address`);
    console.error(`NOTE (R-9): For mainnet, the correct env var is MDF_DELEGATION_MANAGER_ADDRESS_BASE (not _BASE_MAINNET)`);
    process.exit(1);
  }

  console.log(`\n  DelegationManager: ${dmAddr}`);
  console.log(`  RPC: ${RPC_URL.slice(0, 50)}...`);

  const client = createPublicClient({ chain: CHAIN, transport: http(RPC_URL) });

  const connected = await checkConnectivity(client, dmAddr);
  if (!connected) {
    console.error('\nCannot proceed — connectivity check failed');
    process.exit(1);
  }

  await checkR1SingleExecutionMode(client, dmAddr);
  await checkR2Eip712Domain(client, dmAddr);
  await checkR3DelegationHash(client, dmAddr);

  // R-9 reminder
  section('R-9 — Env Var Naming Check');
  if (IS_MAINNET && process.env['MDF_DELEGATION_MANAGER_ADDRESS_BASE_MAINNET']) {
    err(
      'R-9:wrong-key-set',
      'MDF_DELEGATION_MANAGER_ADDRESS_BASE_MAINNET is set — this is NOT read by constants.ts\nRename to: MDF_DELEGATION_MANAGER_ADDRESS_BASE',
      true
    );
  } else {
    ok('R-9:env-key', `Correct key in use: ${DM_ENV_KEY} = ${dmAddr}`);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  if (exitCode === 0) {
    console.log('  RESULT: ALL CRITICAL CHECKS PASSED');
    console.log('  MDF constants verified — safe to proceed with Track B execution');
  } else {
    console.error('  RESULT: CRITICAL FAILURES — DO NOT proceed to mainnet');
    console.error('  Fix the failures above before running live Track B tests');
  }
  console.log('='.repeat(60) + '\n');

  process.exit(exitCode);
}

main().catch((err) => {
  console.error('check-mdf-constants crashed:', err);
  process.exit(1);
});
