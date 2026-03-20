/**
 * Aegis End-to-End Demo Script
 *
 * Proves the full sponsorship flow works without CDP approval:
 *   1. Register a protocol → immediate LIVE mode (sovereign paymaster)
 *   2. Seed protocol budget in DB
 *   3. Approve a demo agent wallet
 *   4. Build and sign a paymaster-sponsored UserOp
 *   5. Submit to bundler (Pimlico or CDP)
 *   6. Print txHash + Basescan link
 *
 * Required env vars:
 *   AEGIS_PAYMASTER_ADDRESS       — deployed AegisPaymaster contract
 *   AEGIS_PAYMASTER_SIGNING_KEY   — private key for approval signing
 *   BUNDLER_RPC_URL               — Pimlico or equivalent bundler endpoint
 *   DATABASE_URL                  — PostgreSQL connection string
 *
 * Optional:
 *   DEMO_AGENT_WALLET             — agent wallet to sponsor (default: a known Sepolia test wallet)
 *   DEMO_PROTOCOL_ID              — protocol id to use (default: demo-hackathon)
 *   DEMO_BUDGET_USD               — protocol budget to seed in USD (default: 50)
 *   AGENT_NETWORK_ID              — 'base' or 'base-sepolia' (default: base-sepolia)
 *
 * Usage:
 *   SKIP_LEGITIMACY_CHECK=true \
 *   RESERVE_THRESHOLD_ETH=0.01 \
 *   npx tsx scripts/demo-e2e.ts
 */

import 'dotenv/config';
import crypto from 'crypto';
import { createPublicClient, http, encodeAbiParameters, encodePacked, keccak256, toHex, type Address } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { signPaymasterApproval, decodePaymasterAndData } from '../src/lib/agent/execute/paymaster-signer';

// ─── Config ───────────────────────────────────────────────────────────────────

const PROTOCOL_ID = process.env.DEMO_PROTOCOL_ID ?? 'demo-hackathon';
const AGENT_WALLET = (process.env.DEMO_AGENT_WALLET ?? '0x0a8Cf29A55cAb0833A27A3A50A333614c602858a') as Address;
const BUDGET_USD = parseFloat(process.env.DEMO_BUDGET_USD ?? '50');
const NETWORK_ID = process.env.AGENT_NETWORK_ID ?? 'base-sepolia';
const CHAIN = NETWORK_ID === 'base' ? base : baseSepolia;
const BASESCAN = NETWORK_ID === 'base' ? 'https://basescan.org' : 'https://sepolia.basescan.org';

const ENTRY_POINT_V07 = '0x0000000071727De22E5E9d8BAf0edAc6f37da032' as Address;

function log(msg: string) {
  console.log(`[Demo] ${msg}`);
}

// ─── ERC-4337 v0.7 UserOp hash ────────────────────────────────────────────────

/**
 * Computes the ERC-4337 v0.7 userOpHash that the account's validateUserOp
 * receives. Must match EntryPoint.getUserOpHash() exactly.
 *
 * Spec: https://eips.ethereum.org/EIPS/eip-4337 (v0.7)
 *   innerHash = keccak256(abi.encode(sender, nonce, keccak256(initCode),
 *     keccak256(callData), accountGasLimits, preVerificationGas, gasFees,
 *     keccak256(paymasterAndData), keccak256(signature=empty)))
 *   userOpHash = keccak256(abi.encode(innerHash, entryPoint, chainId))
 */
function computeUserOpHash(params: {
  sender: Address;
  nonce: bigint;
  callData: `0x${string}`;
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  paymaster: Address;
  paymasterData: `0x${string}`;
  paymasterVerificationGasLimit: bigint;
  paymasterPostOpGasLimit: bigint;
}, chainId: number): `0x${string}` {
  // accountGasLimits: verificationGasLimit (high 128 bits) | callGasLimit (low 128 bits)
  const accountGasLimits = toHex(
    (params.verificationGasLimit << BigInt(128)) | params.callGasLimit,
    { size: 32 }
  ) as `0x${string}`;

  // gasFees: maxPriorityFeePerGas (high 128 bits) | maxFeePerGas (low 128 bits)
  const gasFees = toHex(
    (params.maxPriorityFeePerGas << BigInt(128)) | params.maxFeePerGas,
    { size: 32 }
  ) as `0x${string}`;

  // Packed paymasterAndData as EntryPoint v0.7 encodes it
  const paymasterAndDataPacked = encodePacked(
    ['address', 'uint128', 'uint128', 'bytes'],
    [params.paymaster, params.paymasterVerificationGasLimit, params.paymasterPostOpGasLimit, params.paymasterData]
  );

  // UserOperationLib.encode() has 8 fields — signature is NOT included in the hash.
  // See: lib/account-abstraction/contracts/core/UserOperationLib.sol:encode()
  const innerHash = keccak256(
    encodeAbiParameters(
      [
        { type: 'address' },  // sender
        { type: 'uint256' },  // nonce
        { type: 'bytes32' },  // keccak256(initCode) — empty
        { type: 'bytes32' },  // keccak256(callData)
        { type: 'bytes32' },  // accountGasLimits
        { type: 'uint256' },  // preVerificationGas
        { type: 'bytes32' },  // gasFees
        { type: 'bytes32' },  // keccak256(paymasterAndData)
      ],
      [
        params.sender,
        params.nonce,
        keccak256('0x'),
        keccak256(params.callData),
        accountGasLimits,
        params.preVerificationGas,
        gasFees,
        keccak256(paymasterAndDataPacked),
      ]
    )
  );

  return keccak256(
    encodeAbiParameters(
      [{ type: 'bytes32' }, { type: 'address' }, { type: 'uint256' }],
      [innerHash, ENTRY_POINT_V07, BigInt(chainId)]
    )
  );
}

function fail(msg: string): never {
  console.error(`[Demo] FAILED: ${msg}`);
  process.exit(1);
}

// ─── Preflight checks ─────────────────────────────────────────────────────────

function checkEnv() {
  const required = [
    'AEGIS_PAYMASTER_ADDRESS',
    'AEGIS_PAYMASTER_SIGNING_KEY',
    'BUNDLER_RPC_URL',
    'DATABASE_URL',
  ];
  const missing = required.filter((k) => !process.env[k]?.trim());
  if (missing.length > 0) {
    fail(`Missing required env vars:\n  ${missing.join('\n  ')}`);
  }
  log('Env check passed.');
}

// ─── Database helpers ─────────────────────────────────────────────────────────

async function setupProtocol() {
  const { getPrisma } = await import('../src/lib/db');
  const db = getPrisma();

  // Upsert protocol — create if not exists
  const existing = await db.protocolSponsor.findUnique({ where: { protocolId: PROTOCOL_ID } });

  if (!existing) {
    await db.protocolSponsor.create({
      data: {
        protocolId: PROTOCOL_ID,
        name: 'Aegis Hackathon Demo',
        balanceUSD: BUDGET_USD,
        onboardingStatus: 'APPROVED_SIMULATION',
        cdpAllowlistStatus: 'NOT_SUBMITTED',
        simulationModeUntil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        notificationEmail: 'demo@aegis.build',
        apiKeyHash: crypto.createHash('sha256').update('demo-key').digest('hex'),
      },
    });
    log(`Protocol created: ${PROTOCOL_ID} (budget: $${BUDGET_USD})`);
  } else {
    // Ensure budget is topped up
    await db.protocolSponsor.update({
      where: { protocolId: PROTOCOL_ID },
      data: { balanceUSD: { increment: BUDGET_USD } },
    });
    log(`Protocol exists: ${PROTOCOL_ID} — topped up by $${BUDGET_USD}`);
  }
}

async function approveAgent() {
  const { getPrisma } = await import('../src/lib/db');
  const db = getPrisma();

  const agentAddress = AGENT_WALLET.toLowerCase();

  await db.approvedAgent.upsert({
    where: {
      protocolId_agentAddress: { protocolId: PROTOCOL_ID, agentAddress },
    },
    create: {
      protocolId: PROTOCOL_ID,
      agentAddress,
      agentName: 'Demo Agent',
      approvedBy: 'demo-script',
      maxDailyBudget: 10,
      isActive: true,
      agentTier: 2,
    },
    update: {
      isActive: true,
      maxDailyBudget: 10,
    },
  });

  log(`Agent approved: ${AGENT_WALLET.slice(0, 14)}... (tier 2, $10/day budget)`);
}

// ─── Paymaster signing test ────────────────────────────────────────────────────

async function testPaymasterSigning() {
  log('Testing paymaster approval signing...');

  const signed = await signPaymasterApproval({
    sender: AGENT_WALLET,
    nonce: BigInt(0),
    callData: '0x',
    agentTier: 2,
  });

  const decoded = decodePaymasterAndData(signed.paymasterAndData);

  log(`Approval hash: ${signed.approvalHash}`);
  log(`Valid window: ${new Date(signed.validAfter * 1000).toISOString()} → ${new Date(signed.validUntil * 1000).toISOString()}`);
  log(`paymasterAndData: ${(signed.paymasterAndData.length - 2) / 2} bytes (expect 162)`);

  if ((signed.paymasterAndData.length - 2) / 2 !== 162) {
    fail(`paymasterAndData wrong length: ${(signed.paymasterAndData.length - 2) / 2} (expected 162)`);
  }

  return signed;
}

// ─── Bundler health check ──────────────────────────────────────────────────────

async function checkBundler() {
  const { checkBundlerHealth } = await import('../src/lib/agent/execute/bundler-client');
  log('Checking bundler health...');
  const health = await checkBundlerHealth();
  if (!health.available) {
    fail(`Bundler unavailable: ${health.error}`);
  }
  log(`Bundler OK — latency: ${health.latencyMs}ms, chainId: ${health.chainId}`);
  log(`Supported entry points: ${health.supportedEntryPoints?.join(', ')}`);
  return health;
}

// ─── Submit a UserOp ──────────────────────────────────────────────────────────

async function submitUserOp() {
  const { signPaymasterApproval } = await import('../src/lib/agent/execute/paymaster-signer');
  const { submitAndWaitForUserOp, getEntryPointAddress } = await import('../src/lib/agent/execute/bundler-client');
  const { getNonce } = await import('../src/lib/agent/execute/nonce-manager');

  log('Fetching nonce for agent wallet...');
  const nonce = await getNonce(AGENT_WALLET);
  log(`Nonce: ${nonce}`);

  // callData: a simple self-call (no-op) to prove sponsorship works
  const callData = '0x' as `0x${string}`;

  // Gas limits for the paymaster — used in BOTH the UserOp and the paymasterAndData blob.
  // They must match exactly, because the EntryPoint reconstructs paymasterAndData =
  // encodePacked(paymaster, verGasLimit, postOpGasLimit, paymasterData) and that goes
  // into keccak256(paymasterAndData) inside the account's typed-data hash.
  const paymasterVerificationGasLimit = BigInt(80_000);
  const paymasterPostOpGasLimit = BigInt(15_000);

  log('Signing paymaster approval...');
  const signed = await signPaymasterApproval({
    sender: AGENT_WALLET,
    nonce,
    callData,
    agentTier: 2,
    validationGasLimit: paymasterVerificationGasLimit,
    postOpGasLimit: paymasterPostOpGasLimit,
  });

  // Split paymasterAndData into viem v0.7 UserOp fields
  const pad = signed.paymasterAndData;
  const paymaster = `0x${pad.slice(2, 42)}` as Address;
  const paymasterData = `0x${pad.slice(106)}` as `0x${string}`; // bytes 52-162

  const userOpBase = {
    sender: AGENT_WALLET,
    nonce,
    callData,
    callGasLimit: BigInt(21_000),
    verificationGasLimit: BigInt(45_000),
    preVerificationGas: BigInt(46_000),
    maxFeePerGas: BigInt(1_000_000_000),         // 1 gwei (Base L2 actual fees are ~0.001 gwei)
    maxPriorityFeePerGas: BigInt(100_000_000),   // 0.1 gwei
    paymaster,
    paymasterData,
    paymasterVerificationGasLimit,
    paymasterPostOpGasLimit,
  };

  // Sign the UserOp with the agent wallet's private key.
  // The account at AGENT_WALLET exposes getPackedUserOperationHash() which wraps
  // the standard userOpHash in EIP-712 before signing. We call that to get the
  // correct hash, then sign it with personal_sign (EIP-191).
  const walletPrivKey = process.env.DEMO_AGENT_WALLET_PRIVATE_KEY?.trim();
  let signature: `0x${string}` = '0x';
  if (walletPrivKey) {
    const normalizedKey = (walletPrivKey.startsWith('0x') ? walletPrivKey : `0x${walletPrivKey}`) as `0x${string}`;
    const walletAccount = privateKeyToAccount(normalizedKey);

    // Build the full paymasterAndData blob (paymaster address + packed gas limits + custom data)
    const fullPad = signed.paymasterAndData;

    // Pack the UserOp fields as the on-chain struct expects
    const accountGasLimits = toHex(
      (userOpBase.verificationGasLimit << BigInt(128)) | userOpBase.callGasLimit,
      { size: 32 }
    ) as `0x${string}`;
    const gasFees = toHex(
      (userOpBase.maxPriorityFeePerGas << BigInt(128)) | userOpBase.maxFeePerGas,
      { size: 32 }
    ) as `0x${string}`;

    // Call getPackedUserOperationTypedDataHash on the account.
    // This returns keccak256("\x19\x01" + domainSeparator + structHash) — the full EIP-712
    // hash that validateUserOp reconstructs internally before calling ECDSA.recover().
    const publicClient = createPublicClient({ chain: CHAIN, transport: http() });
    const userOpTuple = {
      type: 'tuple',
      components: [
        { name: 'sender', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'initCode', type: 'bytes' },
        { name: 'callData', type: 'bytes' },
        { name: 'accountGasLimits', type: 'bytes32' },
        { name: 'preVerificationGas', type: 'uint256' },
        { name: 'gasFees', type: 'bytes32' },
        { name: 'paymasterAndData', type: 'bytes' },
        { name: 'signature', type: 'bytes' },
      ],
    };
    const hashToSign = await publicClient.readContract({
      address: AGENT_WALLET,
      abi: [{
        type: 'function',
        name: 'getPackedUserOperationTypedDataHash',
        inputs: [{ ...userOpTuple }],
        outputs: [{ type: 'bytes32' }],
        stateMutability: 'view',
      }],
      functionName: 'getPackedUserOperationTypedDataHash',
      args: [{
        sender: AGENT_WALLET,
        nonce,
        initCode: '0x',
        callData,
        accountGasLimits,
        preVerificationGas: userOpBase.preVerificationGas,
        gasFees,
        paymasterAndData: fullPad,
        signature: '0x',
      }],
    }) as `0x${string}`;

    log(`EIP-712 typed data hash from account: ${hashToSign}`);
    // The typed data hash already includes \x19\x01 + domain. Sign with raw ECDSA.
    signature = await walletAccount.sign({ hash: hashToSign });
    log(`Account signature: ${signature.slice(0, 20)}...`);
  } else {
    log('DEMO_AGENT_WALLET_PRIVATE_KEY not set — submitting without account signature');
  }

  const userOp = { ...userOpBase, signature };

  log('Submitting UserOperation to bundler...');
  const result = await submitAndWaitForUserOp(userOp as never);

  return result;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== Aegis Sovereign Paymaster — End-to-End Demo ===\n');

  checkEnv();

  await setupProtocol();
  await approveAgent();
  await testPaymasterSigning();
  await checkBundler();

  log('\nAll preflight checks passed. Submitting sponsored UserOp...\n');

  const result = await submitUserOp();

  if (result.success) {
    console.log('\n=== SUCCESS ===');
    log(`UserOp hash:  ${result.userOpHash}`);
    log(`Tx hash:      ${result.transactionHash}`);
    log(`Gas used:     ${result.actualGasUsed?.toString() ?? 'unknown'}`);
    log(`Basescan:     ${BASESCAN}/tx/${result.transactionHash}`);
    console.log('\nAegis sponsored a UserOp without CDP approval.');
    console.log('The paymaster contract signed and verified the approval on-chain.\n');
  } else {
    console.log('\n=== UserOp not confirmed (check bundler config) ===');
    log(`Error: ${result.error ?? 'unknown'}`);
    log(`UserOp hash: ${result.userOpHash ?? 'not submitted'}`);
    console.log('\nNote: Paymaster signing was tested successfully (see above).');
    console.log('To produce a real on-chain tx, ensure BUNDLER_RPC_URL points to a');
    console.log('Pimlico endpoint that supports Base Sepolia + EntryPoint v0.7.\n');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[Demo] Fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
