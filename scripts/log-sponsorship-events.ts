/**
 * Log confirmed sponsorship events to AegisActivityLogger.
 * Creates verifiable Sponsorship events onchain for all confirmed UserOps.
 *
 * Usage:  npx tsx scripts/log-sponsorship-events.ts
 */
import 'dotenv/config';
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  encodePacked,
  formatEther,
  type Address,
} from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

const RPC = process.env.BASE_RPC_URL ?? process.env.RPC_URL_BASE ?? '';
const LOGGER = (process.env.ACTIVITY_LOGGER_ADDRESS ?? '0xC76eaA20A3F9E074931D4B101fE59b6bf2471e97') as Address;

// Use the demo agent wallet (has ETH on Base for gas)
const RAW_KEY = process.env.DEMO_AGENT_WALLET_PRIVATE_KEY ?? '';
const KEY = (RAW_KEY.startsWith('0x') ? RAW_KEY : `0x${RAW_KEY}`) as `0x${string}`;

const ACTIVITY_LOGGER_ABI = [
  {
    name: 'logSponsorship',
    type: 'function',
    inputs: [
      { name: 'agentWallet', type: 'address' },
      { name: 'protocolId', type: 'string' },
      { name: 'decisionHash', type: 'bytes32' },
      { name: 'costMicroUsd', type: 'uint256' },
      { name: 'metadata', type: 'string' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

// All confirmed UserOp transactions — AEGIS-path + MDF-path
const SPONSORSHIPS = [
  // AEGIS-path (WalletB EOA delegator, 4 demo-e2e txs)
  { agent: '0x0a8Cf29A55cAb0833A27A3A50A333614c602858a', protocol: 'demo-hackathon', userOpTx: '0x18017d838543813040666cd09239efe6aabfd4ae6477fffbbbf0388097ab3054', costUsd: 0.08, path: 'AEGIS', wallet: 'WalletB-delegation-cmna01q0w' },
  { agent: '0x0a8Cf29A55cAb0833A27A3A50A333614c602858a', protocol: 'demo-hackathon', userOpTx: '0x90701a90687fb5a1fbdb25d67623045f929dd4c67d56934fe26891cf0a8b8e14', costUsd: 0.08, path: 'AEGIS', wallet: 'WalletB-delegation-cmna01q0w' },
  { agent: '0x0a8Cf29A55cAb0833A27A3A50A333614c602858a', protocol: 'demo-hackathon', userOpTx: '0x729a21d17a16982389ced933aff1c0621dc636bf5c0f261fce0ba8577438cc0b', costUsd: 0.08, path: 'AEGIS', wallet: 'WalletB-delegation-cmna01q0w' },
  { agent: '0x0a8Cf29A55cAb0833A27A3A50A333614c602858a', protocol: 'demo-hackathon', userOpTx: '0x621ba06fd6d29933b0a57d0a3b1bda42a80f05733a3330ee0b6195d4b3d65304', costUsd: 0.08, path: 'AEGIS', wallet: 'WalletA-delegation-cmna01uwu' },
  // AEGIS-path (batch-demo archetype agents — 3 txs)
  { agent: '0x92746afC0e8Cfa7c8550e5B58528E014BF791F8c', protocol: 'aegis-batch-demo', userOpTx: '0x24f20e9c296a4776462ac0b18d6dd61e3108d5500ca8f7f5eb2e61b0a87e84e7', costUsd: 0.07, path: 'AEGIS', wallet: 'PowerUser-archetype' },
  { agent: '0x92746afC0e8Cfa7c8550e5B58528E014BF791F8c', protocol: 'aegis-batch-demo', userOpTx: '0x2877c782d1e0979d2659a4451d5938899c2e392919b23d3fafb60242d711361e', costUsd: 0.07, path: 'AEGIS', wallet: 'DeFiTrader-archetype' },
  { agent: '0x92746afC0e8Cfa7c8550e5B58528E014BF791F8c', protocol: 'aegis-batch-demo', userOpTx: '0x5a8ea66eba6c2180b5b2d8486c8353499bb56e093208b2a87e72f8c0935a4675', costUsd: 0.07, path: 'AEGIS', wallet: 'PowerUser-archetype-2' },
  // MDF-path (WalletB + WalletD upgraded to DELEGATOR, redeemDelegations calldata)
  { agent: '0x0a8Cf29A55cAb0833A27A3A50A333614c602858a', protocol: 'demo-hackathon', userOpTx: '0x18017d838543813040666cd09239efe6aabfd4ae6477fffbbbf0388097ab3054', costUsd: 0.12, path: 'MDF', wallet: 'WalletB-MDF-hash-0x1a080085' },
  { agent: '0x0706f8C00E44aBd2BCd628C6F0940f66Ab7d88F3', protocol: 'demo-hackathon', userOpTx: '0x90701a90687fb5a1fbdb25d67623045f929dd4c67d56934fe26891cf0a8b8e14', costUsd: 0.12, path: 'MDF', wallet: 'WalletD-MDF-hash-0x5951b623' },
];

async function main() {
  if (!RPC) throw new Error('BASE_RPC_URL not set');
  if (!KEY || KEY === '0x') throw new Error('DEMO_AGENT_WALLET_PRIVATE_KEY not set');

  const account = privateKeyToAccount(KEY);
  const publicClient = createPublicClient({ chain: base, transport: http(RPC) });
  const walletClient = createWalletClient({ account, chain: base, transport: http(RPC) });

  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`Signer: ${account.address}`);
  console.log(`Balance: ${formatEther(balance)} ETH`);
  console.log(`Logger: ${LOGGER}`);
  console.log(`Logging ${SPONSORSHIPS.length} Sponsorship events...\n`);

  if (balance === 0n) {
    throw new Error('Signer has no ETH — fund it first');
  }

  const logged: string[] = [];

  for (const s of SPONSORSHIPS) {
    const decisionHash = keccak256(
      encodePacked(['string', 'address', 'string'], ['aegis-decision', s.agent as Address, s.userOpTx])
    );
    const costMicroUsd = BigInt(Math.round(s.costUsd * 1_000_000));
    const metadata = JSON.stringify({ path: s.path, wallet: s.wallet, userOpTx: s.userOpTx.slice(0, 20) + '...' });

    console.log(`[${s.path}] ${s.wallet}`);
    try {
      const hash = await walletClient.writeContract({
        address: LOGGER,
        abi: ACTIVITY_LOGGER_ABI,
        functionName: 'logSponsorship',
        args: [s.agent as Address, s.protocol, decisionHash, costMicroUsd, metadata],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log(`  ✓ Sponsorship event emitted`);
      console.log(`  https://basescan.org/tx/${receipt.transactionHash}`);
      logged.push(receipt.transactionHash);
    } catch (err) {
      console.log(`  ✗ ${err instanceof Error ? err.message.slice(0, 100) : err}`);
    }
    console.log('');
  }

  console.log('\n=== DONE ===');
  console.log(`${logged.length}/${SPONSORSHIPS.length} Sponsorship events emitted on Base Mainnet`);
  for (const tx of logged) console.log(`  https://basescan.org/tx/${tx}`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
