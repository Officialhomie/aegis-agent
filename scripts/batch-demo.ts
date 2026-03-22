/**
 * Aegis Batch Demo — Register 100 agents across 5 archetypes, sponsor 50 transactions
 *
 * Phase 1 (free — DB only):
 *   - Seeds 1 protocol sponsor with $1000 budget
 *   - Registers 100 deterministic agent wallets across 5 archetypes (20 each)
 *   - Creates 100 delegations with archetype-specific permission profiles
 *
 * Phase 2 (on-chain — costs ETH from paymaster deposit):
 *   - Checks paymaster EntryPoint deposit
 *   - Submits N sponsored UserOps, cycling through delegations
 *   - Writes DelegationUsage record per op for live frontend tracking
 *
 * Phase 3 (report):
 *   - Prints full summary by archetype + txHashes
 *
 * Archetypes (20 agents each):
 *   POWER    — Power User       ($1000/day, 100 tx/day, 20 tx/hr)
 *   DEFI     — DeFi Trader      ($500/day,  50 tx/day, 10 tx/hr)
 *   NFT      — NFT Collector    ($100/day,  20 tx/day,  5 tx/hr)
 *   STANDARD — Standard User    ($100/day,  50 tx/day, 10 tx/hr)
 *   CAUTIOUS — Cautious User    ($10/day,   10 tx/day,  2 tx/hr)
 *
 * Required env vars:
 *   AEGIS_PAYMASTER_ADDRESS, AEGIS_PAYMASTER_SIGNING_KEY,
 *   BUNDLER_RPC_URL, DATABASE_URL, AGENT_WALLET_ADDRESS,
 *   DEMO_AGENT_WALLET_PRIVATE_KEY
 *
 * Usage:
 *   npx tsx scripts/batch-demo.ts                    # 50 UserOps (default)
 *   npx tsx scripts/batch-demo.ts --ops 100          # 100 UserOps
 *   npx tsx scripts/batch-demo.ts --setup-only       # Phase 1 only (no on-chain txs)
 *   npx tsx scripts/batch-demo.ts --check-deposit    # Check ETH balance only
 */

import 'dotenv/config';
import crypto from 'crypto';
import {
  createPublicClient,
  http,
  formatEther,
  keccak256,
  encodePacked,
  encodeFunctionData,
  concat,
  toHex,
  type Address,
} from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import {
  signPaymasterApproval,
} from '../src/lib/agent/execute/paymaster-signer';

// ─── Archetypes ────────────────────────────────────────────────────────────────

const ARCHETYPES = [
  {
    id: 'POWER',
    label: 'Power User',
    permissions: {
      contracts: [] as string[],
      functions: [] as string[],
      maxValuePerTx: '0',
      maxGasPerTx: 800000,
      maxDailySpend: 1000,
      maxTxPerDay: 100,
      maxTxPerHour: 20,
    },
  },
  {
    id: 'DEFI',
    label: 'DeFi Trader',
    permissions: {
      contracts: [] as string[],
      functions: [] as string[],
      maxValuePerTx: '0',
      maxGasPerTx: 600000,
      maxDailySpend: 500,
      maxTxPerDay: 50,
      maxTxPerHour: 10,
    },
  },
  {
    id: 'NFT',
    label: 'NFT Collector',
    permissions: {
      contracts: [] as string[],
      functions: [] as string[],
      maxValuePerTx: '0',
      maxGasPerTx: 400000,
      maxDailySpend: 100,
      maxTxPerDay: 20,
      maxTxPerHour: 5,
    },
  },
  {
    id: 'STANDARD',
    label: 'Standard User',
    permissions: {
      contracts: [] as string[],
      functions: [] as string[],
      maxValuePerTx: '0',
      maxGasPerTx: 500000,
      maxDailySpend: 100,
      maxTxPerDay: 50,
      maxTxPerHour: 10,
    },
  },
  {
    id: 'CAUTIOUS',
    label: 'Cautious User',
    permissions: {
      contracts: [] as string[],
      functions: [] as string[],
      maxValuePerTx: '0',
      maxGasPerTx: 200000,
      maxDailySpend: 10,
      maxTxPerDay: 10,
      maxTxPerHour: 2,
    },
  },
] as const;

type ArchetypeId = typeof ARCHETYPES[number]['id'];

// ─── Config ───────────────────────────────────────────────────────────────────

const ARGS = process.argv.slice(2);
const OPS_IDX = ARGS.indexOf('--ops');
const TARGET_OPS = OPS_IDX !== -1 ? parseInt(ARGS[OPS_IDX + 1], 10) : 50;
const SETUP_ONLY = ARGS.includes('--setup-only');
const CHECK_DEPOSIT = ARGS.includes('--check-deposit');
const CORRUPT_SIG = ARGS.includes('--corrupt-sig');
const TAMPER_AFTER_SIGN = ARGS.includes('--tamper-after-sign');
const REVERTING_CALL = ARGS.includes('--reverting-call');
const FRESH_WALLET = ARGS.includes('--fresh-wallet');
const TIMEOUT_IDX = ARGS.indexOf('--timeout-ms');
const TIMEOUT_MS = TIMEOUT_IDX !== -1 ? parseInt(ARGS[TIMEOUT_IDX + 1], 10) : 120_000;
const TEST_POLICY = ARGS.includes('--test-policy');
const CONCURRENCY = 3;
const AGENT_COUNT = 100;
const PROTOCOL_ID = 'aegis-batch-demo';
const BUDGET_USD = 1000;

const ENTRY_POINT = '0x0000000071727De22E5E9d8BAf0edAc6f37da032' as Address;
const PAYMASTER = process.env.AEGIS_PAYMASTER_ADDRESS as Address;
const AGENT_WALLET = process.env.AGENT_WALLET_ADDRESS as Address;
const NETWORK_ID = process.env.AGENT_NETWORK_ID ?? 'base-sepolia';
const IS_MAINNET = NETWORK_ID === 'base';
const BASESCAN = IS_MAINNET ? 'https://basescan.org' : 'https://sepolia.basescan.org';
const CHAIN = base;

const DELEGATION_REGISTRY = process.env.DELEGATION_REGISTRY_ADDRESS as Address;
const CHAIN_ID = 8453;
const ACTIVITY_LOGGER = process.env.ACTIVITY_LOGGER_ADDRESS as Address | undefined;

// ─── Logging ──────────────────────────────────────────────────────────────────

function log(msg: string) { console.log(`[Batch] ${msg}`); }
function warn(msg: string) { console.warn(`[Batch] WARN: ${msg}`); }
function err(msg: string) { console.error(`[Batch] ERROR: ${msg}`); }

// ─── ETH / EntryPoint deposit check ──────────────────────────────────────────

const DEPOSIT_ABI = [{
  name: 'getDepositInfo',
  inputs: [{ name: 'account', type: 'address' as const }],
  outputs: [{
    type: 'tuple' as const,
    components: [
      { name: 'deposit', type: 'uint112' as const },
      { name: 'staked', type: 'bool' as const },
      { name: 'stake', type: 'uint112' as const },
      { name: 'unstakeDelaySec', type: 'uint32' as const },
      { name: 'withdrawTime', type: 'uint48' as const },
    ],
  }],
  stateMutability: 'view' as const,
  type: 'function' as const,
}];

async function checkPaymasterDeposit() {
  const client = createPublicClient({ chain: CHAIN, transport: http(process.env.RPC_URL_BASE) });
  const info = await client.readContract({
    address: ENTRY_POINT, abi: DEPOSIT_ABI, functionName: 'getDepositInfo', args: [PAYMASTER],
  }) as { deposit: bigint; staked: boolean; stake: bigint };

  const depositEth = parseFloat(formatEther(info.deposit));
  // Conservative: 200k gas per UserOp at 2 gwei = 0.0004 ETH
  const perOpEst = 0.0004;
  const opsAffordable = Math.floor(depositEth / perOpEst);

  log(`Paymaster deposit: ${formatEther(info.deposit)} ETH`);
  log(`Staked: ${info.staked} (${formatEther(info.stake)} ETH stake)`);
  log(`Estimated UserOps affordable at current deposit: ~${opsAffordable}`);

  if (opsAffordable < TARGET_OPS) {
    const needed = (TARGET_OPS * perOpEst - depositEth).toFixed(4);
    warn(`Conservative estimate: deposit may be low for ${TARGET_OPS} ops at 2 gwei. Need ~${needed} more ETH.`);
    warn(`Fund with:`);
    warn(`  cast send ${ENTRY_POINT} "depositTo(address)" ${PAYMASTER} \\`);
    warn(`    --value ${needed}ether \\`);
    warn(`    --rpc-url $RPC_URL_BASE \\`);
    warn(`    --private-key $DEPOSITOR_PRIVATE_KEY`);
    warn(`(Base mainnet gas is usually much lower than 2 gwei — attempting anyway)`);
  } else {
    log(`Deposit sufficient for ${TARGET_OPS} ops.`);
  }

  return { depositEth, opsAffordable };
}

// ─── Phase 1: Protocol + Agent DB setup ───────────────────────────────────────

async function setupProtocol(db: ReturnType<typeof import('../src/lib/db')['getPrisma']>) {
  const existing = await db.protocolSponsor.findUnique({ where: { protocolId: PROTOCOL_ID } });
  if (!existing) {
    await db.protocolSponsor.create({
      data: {
        protocolId: PROTOCOL_ID,
        name: 'Aegis Batch Demo — 100 Agents, 5 Archetypes',
        balanceUSD: BUDGET_USD,
        onboardingStatus: 'APPROVED_SIMULATION',
        simulationModeUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        notificationEmail: 'demo@aegis.build',
        apiKeyHash: crypto.createHash('sha256').update('batch-demo-key').digest('hex'),
      },
    });
    log(`Protocol created: ${PROTOCOL_ID} ($${BUDGET_USD} budget)`);
  } else {
    log(`Protocol already exists: ${PROTOCOL_ID}`);
  }
}

function generateAgentWallets(count: number): { address: Address; index: number; archetype: typeof ARCHETYPES[number] }[] {
  return Array.from({ length: count }, (_, i) => {
    const seed = `aegis-batch-demo-agent-${i.toString().padStart(4, '0')}`;
    const privateKey = keccak256(encodePacked(['string'], [seed]));
    const account = privateKeyToAccount(privateKey);
    return { address: account.address, index: i, archetype: ARCHETYPES[i % ARCHETYPES.length] };
  });
}

async function registerAgents(
  db: ReturnType<typeof import('../src/lib/db')['getPrisma']>,
  agents: { address: Address; index: number; archetype: typeof ARCHETYPES[number] }[]
) {
  log(`Registering ${agents.length} agent wallets across ${ARCHETYPES.length} archetypes...`);
  let created = 0;
  let skipped = 0;

  for (const { address, index, archetype } of agents) {
    const addr = address.toLowerCase();
    const existing = await db.approvedAgent.findUnique({
      where: { protocolId_agentAddress: { protocolId: PROTOCOL_ID, agentAddress: addr } },
    });
    if (existing) { skipped++; continue; }

    await db.approvedAgent.create({
      data: {
        protocolId: PROTOCOL_ID,
        agentAddress: addr,
        agentName: `Batch:${archetype.id}:#${String(index).padStart(3, '0')}`,
        approvedBy: `batch-demo:${archetype.id}`,
        maxDailyBudget: archetype.permissions.maxDailySpend,
        isActive: true,
        agentTier: 2,
        agentType: 'ERC4337_ACCOUNT',
        tierOverride: true,
      },
    });
    created++;

    if ((created + skipped) % 10 === 0) {
      log(`  Registered ${created + skipped}/${agents.length}...`);
    }
  }
  log(`Agents: ${created} created, ${skipped} already existed`);
  return { created, skipped };
}

async function createDelegations(
  db: ReturnType<typeof import('../src/lib/db')['getPrisma']>,
  agents: { address: Address; index: number; archetype: typeof ARCHETYPES[number] }[]
) {
  log(`Creating ${agents.length} delegations with archetype-specific permissions...`);

  if (!DELEGATION_REGISTRY || DELEGATION_REGISTRY === '0x0000000000000000000000000000000000000000') {
    warn('DELEGATION_REGISTRY_ADDRESS not set — skipping delegations');
    return 0;
  }

  const validFrom = new Date();
  const validUntil = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  let created = 0;
  let skipped = 0;

  const { keccak256: hashFn, encodePacked: packFn } = await import('viem');
  const { privateKeyToAccount: toAccount } = await import('viem/accounts');

  const DOMAIN_NAME = 'AegisDelegation';
  const DOMAIN_VERSION = '1';
  const TYPE_STRING = 'Delegation(address delegator,address agent,bytes32 permissionsHash,uint256 gasBudgetWei,uint256 validFrom,uint256 validUntil,uint256 nonce)';

  const gasBudget = BigInt('1000000000000000000');
  const validFromUnix = BigInt(Math.floor(validFrom.getTime() / 1000));
  const validUntilUnix = BigInt(Math.floor(validUntil.getTime() / 1000));

  function buildDomain(chainId: number, verifyingContract: Address) {
    const typeHash = hashFn(packFn(['string'], ['EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)']));
    return hashFn(packFn(['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'], [
      typeHash,
      hashFn(packFn(['string'], [DOMAIN_NAME])),
      hashFn(packFn(['string'], [DOMAIN_VERSION])),
      BigInt(chainId),
      verifyingContract,
    ]));
  }

  const domainSep = buildDomain(CHAIN_ID, DELEGATION_REGISTRY);
  const typeHash = hashFn(packFn(['string'], [TYPE_STRING]));

  for (const { address, index, archetype } of agents) {
    const delegatorAddr = address.toLowerCase() as Address;
    const agentAddr = AGENT_WALLET.toLowerCase() as Address;
    const nonce = BigInt(Date.now() + index);

    const existing = await db.delegation.findFirst({
      where: { delegator: delegatorAddr, agent: agentAddr },
    });
    if (existing) { skipped++; continue; }

    const seed = `aegis-batch-demo-agent-${index.toString().padStart(4, '0')}`;
    const privateKey = hashFn(packFn(['string'], [seed]));
    const account = toAccount(privateKey);

    const permHash = hashFn(packFn(['string'], [JSON.stringify(archetype.permissions)]));

    const structHash = hashFn(packFn(
      ['bytes32', 'address', 'address', 'bytes32', 'uint256', 'uint256', 'uint256', 'uint256'],
      [typeHash, account.address, agentAddr, permHash, gasBudget, validFromUnix, validUntilUnix, nonce]
    ));
    const digest = hashFn(packFn(['string', 'bytes32', 'bytes32'], ['\x19\x01', domainSep, structHash]));
    const signature = await account.sign({ hash: digest });

    await db.delegation.create({
      data: {
        delegator: delegatorAddr,
        agent: agentAddr,
        signature,
        signatureNonce: nonce,
        permissions: archetype.permissions as object,
        gasBudgetWei: gasBudget,
        gasBudgetSpent: BigInt(0),
        status: 'ACTIVE',
        validFrom,
        validUntil,
      },
    });
    created++;

    if ((created + skipped) % 10 === 0) {
      log(`  Delegations: ${created + skipped}/${agents.length}...`);
    }
  }

  log(`Delegations: ${created} created, ${skipped} skipped`);
  return created;
}

// ─── LightAccount v2 — Alchemy LightAccount Factory (v0.7 EntryPoint) ─────────

const LIGHT_ACCOUNT_FACTORY = '0x0000000000400CdFef5E2714E63d8040b700BC24' as Address;

const LIGHT_ACCOUNT_FACTORY_ABI = [
  {
    type: 'function' as const,
    name: 'getAddress',
    inputs: [{ name: 'owner', type: 'address' as const }, { name: 'salt', type: 'uint256' as const }],
    outputs: [{ type: 'address' as const }],
    stateMutability: 'view' as const,
  },
  {
    type: 'function' as const,
    name: 'createAccount',
    inputs: [{ name: 'owner', type: 'address' as const }, { name: 'salt', type: 'uint256' as const }],
    outputs: [{ type: 'address' as const }],
    stateMutability: 'payable' as const,
  },
];

const GET_USER_OP_HASH_ABI = [
  {
    type: 'function' as const,
    name: 'getUserOpHash',
    inputs: [
      {
        name: 'userOp',
        type: 'tuple' as const,
        components: [
          { name: 'sender', type: 'address' as const },
          { name: 'nonce', type: 'uint256' as const },
          { name: 'initCode', type: 'bytes' as const },
          { name: 'callData', type: 'bytes' as const },
          { name: 'accountGasLimits', type: 'bytes32' as const },
          { name: 'preVerificationGas', type: 'uint256' as const },
          { name: 'gasFees', type: 'bytes32' as const },
          { name: 'paymasterAndData', type: 'bytes' as const },
          { name: 'signature', type: 'bytes' as const },
        ],
      },
    ],
    outputs: [{ type: 'bytes32' as const }],
    stateMutability: 'view' as const,
  },
];

// LightAccount v2 execute() ABI — used by --reverting-call to build a callData that will revert
const EXECUTE_ABI = [
  {
    type: 'function' as const,
    name: 'execute',
    inputs: [
      { name: 'target', type: 'address' as const },
      { name: 'value', type: 'uint256' as const },
      { name: 'data', type: 'bytes' as const },
    ],
    outputs: [] as const,
    stateMutability: 'nonpayable' as const,
  },
];

// ─── Phase 2: Sponsored UserOps ───────────────────────────────────────────────

async function submitSponsoredOps(
  targetOps: number,
  db: ReturnType<typeof import('../src/lib/db')['getPrisma']>,
  delegationIds: string[]
) {
  const { submitAndWaitForUserOp } = await import('../src/lib/agent/execute/bundler-client');
  const { getNonce } = await import('../src/lib/agent/execute/nonce-manager');
  const client = createPublicClient({ chain: CHAIN, transport: http(process.env.RPC_URL_BASE) });

  // Owner EOA: ephemeral for --fresh-wallet, else DEMO_AGENT_WALLET_PRIVATE_KEY
  let ownerAccount: ReturnType<typeof privateKeyToAccount>;
  if (FRESH_WALLET) {
    const freshKey = generatePrivateKey();
    ownerAccount = privateKeyToAccount(freshKey);
    log(`--fresh-wallet: ephemeral owner ${ownerAccount.address}`);
  } else {
    const ownerPrivKey = process.env.DEMO_AGENT_WALLET_PRIVATE_KEY?.trim();
    if (!ownerPrivKey) {
      err('DEMO_AGENT_WALLET_PRIVATE_KEY not set — cannot sign UserOps');
      return [];
    }
    const normalizedKey = (ownerPrivKey.startsWith('0x') ? ownerPrivKey : `0x${ownerPrivKey}`) as `0x${string}`;
    ownerAccount = privateKeyToAccount(normalizedKey);
  }

  // Compute LightAccount sender address (CREATE2 counterfactual)
  const SENDER = await client.readContract({
    address: LIGHT_ACCOUNT_FACTORY,
    abi: LIGHT_ACCOUNT_FACTORY_ABI,
    functionName: 'getAddress',
    args: [ownerAccount.address, 0n],
  }) as Address;

  log(`LightAccount sender: ${SENDER} (owner: ${ownerAccount.address})`);

  // Check if wallet is already deployed
  const existingCode = await client.getCode({ address: SENDER });
  let walletDeployed = !!(existingCode && existingCode !== '0x');
  log(`Wallet deployed: ${walletDeployed}`);

  // Factory calldata to deploy LightAccount inline in the first UserOp
  const deployFactoryData = encodeFunctionData({
    abi: LIGHT_ACCOUNT_FACTORY_ABI,
    functionName: 'createAccount',
    args: [ownerAccount.address, 0n],
  });
  const deployInitCode = concat([LIGHT_ACCOUNT_FACTORY, deployFactoryData]) as `0x${string}`;

  // Gas parameters — conservative values for Base mainnet
  const paymasterVerificationGasLimit = BigInt(150_000);
  const paymasterPostOpGasLimit = BigInt(75_000);
  const callGasLimit = BigInt(21_000);
  const verificationGasLimit = BigInt(200_000); // extra headroom for first-op deployment
  const preVerificationGas = BigInt(60_000);
  const maxFeePerGas = BigInt(2_000_000_000);       // 2 gwei
  const maxPriorityFeePerGas = BigInt(100_000_000); // 0.1 gwei

  const accountGasLimits = toHex((verificationGasLimit << BigInt(128)) | callGasLimit, { size: 32 }) as `0x${string}`;
  const gasFees = toHex((maxPriorityFeePerGas << BigInt(128)) | maxFeePerGas, { size: 32 }) as `0x${string}`;

  const results: { op: number; success: boolean; txHash?: string; error?: string; delegationId: string }[] = [];

  log(`Submitting ${targetOps} sponsored UserOps (sequential)...`);

  // Fetch initial nonce for sender from EntryPoint
  let currentNonce: bigint;
  try {
    currentNonce = await getNonce(SENDER);
  } catch {
    currentNonce = 0n;
  }

  // --test-policy: create a 1-wei-budget delegation for op 0 policy rejection test
  let policyTestDelegationId: string | null = null;
  if (TEST_POLICY) {
    const { keccak256: hashFn, encodePacked: packFn } = await import('viem');
    const policyKey = hashFn(packFn(['string'], [`aegis-policy-test-${Date.now()}`]));
    const { privateKeyToAccount: toAccount } = await import('viem/accounts');
    const policyAccount = toAccount(policyKey);
    const policyDel = await db.delegation.create({
      data: {
        delegator: policyAccount.address.toLowerCase(),
        agent: AGENT_WALLET.toLowerCase(),
        signature: '0x' + '00'.repeat(65),
        signatureNonce: BigInt(Date.now()),
        permissions: {} as object,
        gasBudgetWei: BigInt(1),
        gasBudgetSpent: BigInt(0),
        status: 'ACTIVE',
        validFrom: new Date(),
        validUntil: new Date(Date.now() + 86400_000),
      },
    });
    policyTestDelegationId = policyDel.id;
    log(`--test-policy: delegation ${policyTestDelegationId} with gasBudgetWei=1`);
  }

  for (let opIndex = 0; opIndex < targetOps; opIndex++) {
    const delegationId = (TEST_POLICY && opIndex === 0 && policyTestDelegationId)
      ? policyTestDelegationId
      : delegationIds.length > 0
        ? delegationIds[opIndex % delegationIds.length]
        : 'unknown';

    // --test-policy: check budget before op 0 reaches the bundler
    if (TEST_POLICY && opIndex === 0 && policyTestDelegationId) {
      const delRow = await db.delegation.findUnique({ where: { id: policyTestDelegationId } });
      const estimatedGasWei = paymasterVerificationGasLimit * maxFeePerGas;
      const remaining = delRow ? (delRow.gasBudgetWei - delRow.gasBudgetSpent) : BigInt(0);
      if (remaining < estimatedGasWei) {
        const errMsg = 'POLICY_REJECTED: budget exhausted';
        log(`  [${opIndex + 1}/${targetOps}] ${errMsg}`);
        try {
          await db.delegationUsage.create({
            data: {
              delegationId: policyTestDelegationId,
              targetContract: ACTIVITY_LOGGER ?? '0x0000000000000000000000000000000000000000',
              valueWei: BigInt(0),
              gasUsed: BigInt(0),
              gasCostWei: BigInt(0),
              txHash: null,
              success: false,
              errorMessage: errMsg,
            },
          });
        } catch { /* ignore */ }
        results.push({ op: opIndex, success: false, error: errMsg, delegationId: policyTestDelegationId });
        continue;
      }
    }

    try {
      const nonce = currentNonce;

      // --reverting-call: op 0 uses LightAccount.execute() targeting a nonexistent selector
      // Paymaster signs legitimately; execution reverts onchain → success=false in receipt
      let callData: `0x${string}` = '0x';
      if (REVERTING_CALL && opIndex === 0) {
        callData = encodeFunctionData({
          abi: EXECUTE_ABI,
          functionName: 'execute',
          args: [ACTIVITY_LOGGER ?? ENTRY_POINT, 0n, '0xdeadbeef'],
        });
        log(`  --reverting-call: op 0 callData = execute(target, 0, 0xdeadbeef)`);
      }

      // Include factory initCode only for the first op when wallet is not yet deployed
      const initCode = (opIndex === 0 && !walletDeployed) ? deployInitCode : ('0x' as `0x${string}`);

      // 1. Get paymaster approval (signs sender + nonce + callData)
      const signed = await signPaymasterApproval({
        sender: SENDER,
        nonce,
        callData,
        agentTier: 2,
        validationGasLimit: paymasterVerificationGasLimit,
        postOpGasLimit: paymasterPostOpGasLimit,
      });

      // --tamper-after-sign: change callData after paymaster signed → paymaster hash mismatch → AA33
      if (TAMPER_AFTER_SIGN && opIndex === 0) {
        callData = '0xdeadbeef00' as `0x${string}`;
        log(`  --tamper-after-sign: callData tampered for op 0 (paymaster hash mismatch)`);
      }

      const pad = signed.paymasterAndData;
      const paymaster = `0x${pad.slice(2, 42)}` as Address;
      const paymasterData = `0x${pad.slice(106)}` as `0x${string}`;

      // 2. Get UserOpHash from EntryPoint (hash includes paymasterAndData and potentially tampered callData)
      const userOpHash = await client.readContract({
        address: ENTRY_POINT,
        abi: GET_USER_OP_HASH_ABI,
        functionName: 'getUserOpHash',
        args: [{
          sender: SENDER,
          nonce,
          initCode,
          callData,
          accountGasLimits,
          preVerificationGas,
          gasFees,
          paymasterAndData: signed.paymasterAndData,
          signature: '0x',
        }],
      }) as `0x${string}`;

      // 3. LightAccount v2: owner signs UserOpHash with EIP-191 personal sign
      const rawSig = await ownerAccount.signMessage({ message: { raw: userOpHash } });
      let signature: `0x${string}`;
      if (CORRUPT_SIG && opIndex === 0) {
        // --corrupt-sig: skip 0x00 EOA type prefix → AA23 InvalidSignatureType()
        signature = rawSig;
        log(`  --corrupt-sig: omitting 0x00 type prefix for op 0`);
      } else {
        // Prepend 0x00 (EOA type byte) — LightAccount v2 requires SignatureType prefix
        signature = concat(['0x00', rawSig]) as `0x${string}`;
      }

      // 4. Build and submit v0.7 UserOp
      const userOp = {
        sender: SENDER,
        nonce,
        callData,
        callGasLimit,
        verificationGasLimit,
        preVerificationGas,
        maxFeePerGas,
        maxPriorityFeePerGas,
        paymaster,
        paymasterData,
        paymasterVerificationGasLimit,
        paymasterPostOpGasLimit,
        signature,
        ...(initCode !== '0x' ? { factory: LIGHT_ACCOUNT_FACTORY, factoryData: deployFactoryData } : {}),
      };

      const result = await submitAndWaitForUserOp(userOp as never, { timeout: TIMEOUT_MS });

      const success = result.success;
      const txHash = result.transactionHash ?? undefined;
      const errorMessage = success ? null : (result.error ?? null);

      // Advance nonce for next op (re-fetch from chain to stay in sync)
      if (success) {
        walletDeployed = true;
        try {
          currentNonce = await getNonce(SENDER);
        } catch {
          currentNonce = nonce + 1n;
        }
      } else {
        // On failure, nonce is likely not consumed; re-fetch to be safe
        try {
          currentNonce = await getNonce(SENDER);
        } catch {
          currentNonce = nonce + 1n;
        }
      }

      if (delegationId !== 'unknown') {
        try {
          await db.delegationUsage.create({
            data: {
              delegationId,
              targetContract: ACTIVITY_LOGGER ?? '0x0000000000000000000000000000000000000000',
              valueWei: BigInt(0),
              gasUsed: BigInt(200000),
              gasCostWei: BigInt(0),
              txHash: txHash ?? null,
              success,
              errorMessage,
            },
          });
        } catch {
          // Don't fail the op if DB write fails
        }
      }

      if (success) {
        log(`  [${opIndex + 1}/${targetOps}] PASS txHash: ${txHash}`);
        results.push({ op: opIndex, success: true, txHash, delegationId });
      } else {
        warn(`  [${opIndex + 1}/${targetOps}] FAIL: ${result.error}`);
        results.push({ op: opIndex, success: false, error: result.error ?? undefined, delegationId });
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);

      try {
        currentNonce = await getNonce(SENDER);
      } catch {
        currentNonce++;
      }

      if (delegationId !== 'unknown') {
        try {
          await db.delegationUsage.create({
            data: {
              delegationId,
              targetContract: ACTIVITY_LOGGER ?? '0x0000000000000000000000000000000000000000',
              valueWei: BigInt(0),
              gasUsed: BigInt(0),
              gasCostWei: BigInt(0),
              txHash: null,
              success: false,
              errorMessage: errorMsg,
            },
          });
        } catch {
          // Ignore
        }
      }

      warn(`  [${opIndex + 1}/${targetOps}] THROW: ${errorMsg.slice(0, 200)}`);
      results.push({ op: opIndex, success: false, error: errorMsg, delegationId });
    }
  }

  return results;
}

// ─── Phase 3: Report ──────────────────────────────────────────────────────────

async function printReport(
  db: ReturnType<typeof import('../src/lib/db')['getPrisma']>,
  opsResults: { op: number; success: boolean; txHash?: string; error?: string; delegationId: string }[]
) {
  const totalDelegations = await db.delegation.count({ where: { agent: AGENT_WALLET.toLowerCase() } });
  const totalAgents = await db.approvedAgent.count({ where: { protocolId: PROTOCOL_ID } });

  const passed = opsResults.filter((r) => r.success);
  const failed = opsResults.filter((r) => !r.success);

  // Per-archetype breakdown from results
  const archetypeStats = new Map<ArchetypeId, { submitted: number; success: number }>();
  for (const arc of ARCHETYPES) {
    archetypeStats.set(arc.id, { submitted: 0, success: 0 });
  }

  const agentRows = await db.approvedAgent.findMany({
    where: { protocolId: PROTOCOL_ID },
    select: { agentName: true, agentAddress: true },
  });

  const delegationRows = await db.delegation.findMany({
    where: { agent: AGENT_WALLET.toLowerCase() },
    select: { id: true, delegator: true },
  });

  const delegatorToArchetype = new Map<string, ArchetypeId>();
  for (const agent of agentRows) {
    const match = agent.agentName?.match(/^Batch:([A-Z]+):/);
    if (match) {
      delegatorToArchetype.set(agent.agentAddress, match[1] as ArchetypeId);
    }
  }

  const delegationToArchetype = new Map<string, ArchetypeId>();
  for (const del of delegationRows) {
    const arc = delegatorToArchetype.get(del.delegator.toLowerCase());
    if (arc) delegationToArchetype.set(del.id, arc);
  }

  for (const result of opsResults) {
    const arc = delegationToArchetype.get(result.delegationId);
    if (arc && archetypeStats.has(arc)) {
      const stats = archetypeStats.get(arc)!;
      stats.submitted++;
      if (result.success) stats.success++;
    }
  }

  console.log('\n' + '='.repeat(64));
  console.log('  AEGIS BATCH DEMO — FINAL REPORT');
  console.log('='.repeat(64));
  console.log(`\n  Protocol:   ${PROTOCOL_ID}`);
  console.log(`  Network:    ${NETWORK_ID} (chainId ${CHAIN_ID})`);
  console.log(`  Agent:      ${AGENT_WALLET}`);
  console.log(`\n  REGISTRATION`);
  console.log(`    Agents registered (DB): ${totalAgents}`);
  console.log(`    Delegations created:    ${totalDelegations}`);
  console.log(`\n  SPONSORSHIP BY ARCHETYPE`);
  console.log(`    ${'Archetype'.padEnd(14)} ${'Submitted'.padStart(9)} ${'Success'.padStart(7)} ${'Failed'.padStart(6)}`);
  console.log(`    ${'-'.repeat(40)}`);
  for (const arc of ARCHETYPES) {
    const stats = archetypeStats.get(arc.id)!;
    console.log(
      `    ${arc.label.padEnd(14)} ${String(stats.submitted).padStart(9)} ${String(stats.success).padStart(7)} ${String(stats.submitted - stats.success).padStart(6)}`
    );
  }
  console.log(`\n  TOTAL`);
  console.log(`    UserOps submitted:  ${opsResults.length}`);
  console.log(`    Successful:         ${passed.length}`);
  console.log(`    Failed:             ${failed.length}`);
  console.log(`    Success rate:       ${opsResults.length > 0 ? Math.round((passed.length / opsResults.length) * 100) : 0}%`);

  if (passed.length > 0) {
    console.log(`\n  TRANSACTION HASHES (first 10):`);
    for (const r of passed.slice(0, 10)) {
      console.log(`    ${BASESCAN}/tx/${r.txHash}`);
    }
    if (passed.length > 10) {
      console.log(`    ... and ${passed.length - 10} more`);
    }
  }

  if (failed.length > 0) {
    console.log(`\n  FAILURES:`);
    for (const r of failed.slice(0, 5)) {
      console.log(`    op ${r.op}: ${r.error}`);
    }
  }

  console.log('\n' + '='.repeat(64));
  const verdict = failed.length === 0 || passed.length >= Math.floor(opsResults.length * 0.9)
    ? 'PASSED' : 'PARTIAL';
  console.log(`  VERDICT: ${verdict}`);
  console.log(`  Aegis sponsored ${passed.length} UserOps across ${totalAgents} registered agents (${ARCHETYPES.length} archetypes).`);
  console.log(`  Live stats: http://localhost:3000/dashboard`);
  console.log('='.repeat(64) + '\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n' + '='.repeat(64));
  console.log('  AEGIS BATCH DEMO');
  console.log(`  Target: ${AGENT_COUNT} agents (${ARCHETYPES.length} archetypes), ${TARGET_OPS} UserOps`);
  console.log('='.repeat(64) + '\n');

  if (!PAYMASTER) { err('AEGIS_PAYMASTER_ADDRESS not set'); process.exit(1); }
  if (!AGENT_WALLET) { err('AGENT_WALLET_ADDRESS not set'); process.exit(1); }

  const { depositEth, opsAffordable } = await checkPaymasterDeposit();
  if (CHECK_DEPOSIT) return;

  const { getPrisma } = await import('../src/lib/db');
  const db = getPrisma();

  // Phase 1: DB setup
  log('\n--- Phase 1: Protocol + Agent Registration ---');
  await setupProtocol(db);
  const agents = generateAgentWallets(AGENT_COUNT);
  await registerAgents(db, agents);
  await createDelegations(db, agents);

  if (SETUP_ONLY) {
    log('\nSetup-only complete. Run without --setup-only to submit UserOps.');
    log('Live stats: http://localhost:3000/dashboard');
    await db.$disconnect();
    return;
  }

  // Fetch delegation IDs for op-to-delegation linking
  const delegationRows = await db.delegation.findMany({
    where: { agent: AGENT_WALLET.toLowerCase(), status: 'ACTIVE' },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  const delegationIds = delegationRows.map((d) => d.id);
  log(`Found ${delegationIds.length} active delegations to cycle through`);

  // Phase 2: Sponsored UserOps — attempt TARGET_OPS regardless of conservative estimate
  log('\n--- Phase 2: Sponsored UserOps ---');
  if (opsAffordable < TARGET_OPS) {
    warn(`Conservative estimate says ~${opsAffordable} ops affordable. Base gas is usually much cheaper — attempting ${TARGET_OPS}.`);
  }

  const opsResults = TARGET_OPS > 0
    ? await submitSponsoredOps(TARGET_OPS, db, delegationIds)
    : [];

  // Phase 3: Report
  log('\n--- Phase 3: Report ---');
  await printReport(db, opsResults);

  await db.$disconnect();
}

main().catch((e) => {
  err(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
