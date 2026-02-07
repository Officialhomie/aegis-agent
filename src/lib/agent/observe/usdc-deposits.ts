/**
 * Aegis Agent - USDC Deposit Verification
 *
 * Verifies on-chain USDC deposits to the Aegis treasury and credits protocol balances.
 * This ensures protocols can only top-up via verified on-chain transactions.
 */

import { createPublicClient, http, parseAbi, type Address, type Hex } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { getPrisma } from '../../db';
import { logger } from '../../logger';

const BASE_CHAIN_ID = 8453;
const BASE_SEPOLIA_CHAIN_ID = 84532;

// USDC contract addresses
const USDC_ADDRESSES: Record<number, Address> = {
  [BASE_CHAIN_ID]: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  [BASE_SEPOLIA_CHAIN_ID]: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
};

// USDC has 6 decimals
const USDC_DECIMALS = 6;

// ERC20 Transfer event ABI
const ERC20_TRANSFER_EVENT = parseAbi([
  'event Transfer(address indexed from, address indexed to, uint256 value)',
]);

// Minimum confirmations required
const MIN_CONFIRMATIONS = Number(process.env.DEPOSIT_MIN_CONFIRMATIONS) || 3;

export interface DepositVerificationResult {
  verified: boolean;
  txHash: string;
  amount?: number; // USD value
  tokenAmount?: bigint;
  senderAddress?: string;
  blockNumber?: bigint;
  error?: string;
}

export interface DepositRecord {
  protocolId: string;
  txHash: string;
  amount: number;
  tokenAmount: bigint;
  senderAddress: string;
  chainId: number;
  blockNumber: bigint;
}

function getChainId(): number {
  const networkId = process.env.AGENT_NETWORK_ID ?? 'base-sepolia';
  return networkId === 'base' ? BASE_CHAIN_ID : BASE_SEPOLIA_CHAIN_ID;
}

function getChain() {
  return getChainId() === BASE_CHAIN_ID ? base : baseSepolia;
}

function getPublicClient() {
  const rpcUrl = process.env.BASE_RPC_URL ?? process.env.RPC_URL_BASE;
  return createPublicClient({
    chain: getChain(),
    transport: http(rpcUrl),
  });
}

function getTreasuryAddress(): Address | null {
  const addr = process.env.AEGIS_TREASURY_ADDRESS;
  if (!addr || !addr.startsWith('0x') || addr.length !== 42) {
    return null;
  }
  return addr as Address;
}

function getUsdcAddress(): Address {
  const chainId = getChainId();
  const envAddr = process.env.USDC_ADDRESS as Address | undefined;
  return envAddr ?? USDC_ADDRESSES[chainId] ?? USDC_ADDRESSES[BASE_SEPOLIA_CHAIN_ID];
}

/**
 * Verify a USDC deposit transaction on-chain.
 * Checks that the transaction is a valid USDC transfer to the treasury.
 */
export async function verifyUsdcDeposit(txHash: Hex): Promise<DepositVerificationResult> {
  const treasuryAddress = getTreasuryAddress();
  if (!treasuryAddress) {
    return {
      verified: false,
      txHash,
      error: 'AEGIS_TREASURY_ADDRESS not configured',
    };
  }

  const client = getPublicClient();
  const chainId = getChainId();
  const usdcAddress = getUsdcAddress();

  try {
    // Get transaction receipt
    const receipt = await client.getTransactionReceipt({ hash: txHash });

    if (!receipt) {
      return {
        verified: false,
        txHash,
        error: 'Transaction not found or not yet mined',
      };
    }

    // Check transaction status
    if (receipt.status !== 'success') {
      return {
        verified: false,
        txHash,
        error: 'Transaction failed',
      };
    }

    // Check confirmations
    const currentBlock = await client.getBlockNumber();
    const confirmations = currentBlock - receipt.blockNumber;
    if (confirmations < BigInt(MIN_CONFIRMATIONS)) {
      return {
        verified: false,
        txHash,
        error: `Insufficient confirmations: ${confirmations}/${MIN_CONFIRMATIONS}`,
      };
    }

    // Parse Transfer events from the receipt
    const transferLogs = receipt.logs.filter(
      (log) =>
        log.address.toLowerCase() === usdcAddress.toLowerCase() &&
        log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' // Transfer event signature
    );

    if (transferLogs.length === 0) {
      return {
        verified: false,
        txHash,
        error: 'No USDC transfer found in transaction',
      };
    }

    // Find transfer to treasury
    let depositAmount: bigint | null = null;
    let senderAddress: Address | null = null;

    for (const log of transferLogs) {
      // topics[2] is the 'to' address (padded to 32 bytes)
      const toAddress = ('0x' + log.topics[2]?.slice(26)) as Address;

      if (toAddress.toLowerCase() === treasuryAddress.toLowerCase()) {
        // topics[1] is the 'from' address
        senderAddress = ('0x' + log.topics[1]?.slice(26)) as Address;
        // data contains the value
        depositAmount = BigInt(log.data);
        break;
      }
    }

    if (!depositAmount || !senderAddress) {
      return {
        verified: false,
        txHash,
        error: 'No transfer to treasury address found',
      };
    }

    // Convert to USD value (USDC has 6 decimals)
    const usdValue = Number(depositAmount) / 10 ** USDC_DECIMALS;

    logger.info('[DepositVerification] USDC deposit verified', {
      txHash,
      amount: usdValue,
      tokenAmount: depositAmount.toString(),
      senderAddress,
      blockNumber: receipt.blockNumber.toString(),
      chainId,
    });

    return {
      verified: true,
      txHash,
      amount: usdValue,
      tokenAmount: depositAmount,
      senderAddress,
      blockNumber: receipt.blockNumber,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[DepositVerification] Failed to verify deposit', {
      txHash,
      error: message,
    });
    return {
      verified: false,
      txHash,
      error: message,
    };
  }
}

/**
 * Check if a deposit transaction has already been processed.
 */
export async function isDepositAlreadyProcessed(txHash: string): Promise<boolean> {
  const db = getPrisma();
  const existing = await db.depositTransaction.findUnique({
    where: { txHash },
  });
  return existing !== null;
}

/**
 * Record a verified deposit and credit the protocol balance.
 */
export async function recordAndCreditDeposit(
  protocolId: string,
  deposit: DepositRecord
): Promise<{ success: boolean; error?: string; newBalance?: number }> {
  const db = getPrisma();

  try {
    // Check if already processed (idempotency)
    const existing = await db.depositTransaction.findUnique({
      where: { txHash: deposit.txHash },
    });

    if (existing) {
      if (existing.confirmed) {
        return {
          success: true,
          error: 'Deposit already processed',
        };
      }
      // If exists but not confirmed, update it
    }

    // Verify protocol exists
    const protocol = await db.protocolSponsor.findUnique({
      where: { protocolId },
    });

    if (!protocol) {
      return {
        success: false,
        error: `Protocol not found: ${protocolId}`,
      };
    }

    // Transaction: create deposit record and update balance atomically
    const result = await db.$transaction(async (tx) => {
      // Upsert deposit record
      await tx.depositTransaction.upsert({
        where: { txHash: deposit.txHash },
        create: {
          protocolId,
          txHash: deposit.txHash,
          amount: deposit.amount,
          tokenAmount: deposit.tokenAmount,
          tokenSymbol: 'USDC',
          chainId: deposit.chainId,
          senderAddress: deposit.senderAddress,
          blockNumber: deposit.blockNumber,
          confirmed: true,
          confirmedAt: new Date(),
        },
        update: {
          confirmed: true,
          confirmedAt: new Date(),
          blockNumber: deposit.blockNumber,
        },
      });

      // Credit protocol balance
      const updated = await tx.protocolSponsor.update({
        where: { protocolId },
        data: {
          balanceUSD: { increment: deposit.amount },
        },
      });

      return updated;
    });

    logger.info('[DepositVerification] Deposit credited to protocol', {
      protocolId,
      txHash: deposit.txHash,
      amount: deposit.amount,
      newBalance: result.balanceUSD,
    });

    return {
      success: true,
      newBalance: result.balanceUSD,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[DepositVerification] Failed to record deposit', {
      protocolId,
      txHash: deposit.txHash,
      error: message,
    });
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Verify and credit a deposit in one operation.
 * This is the main function to call from the API.
 */
export async function verifyAndCreditDeposit(
  protocolId: string,
  txHash: Hex
): Promise<{
  success: boolean;
  amount?: number;
  newBalance?: number;
  error?: string;
}> {
  // Check if already processed
  if (await isDepositAlreadyProcessed(txHash)) {
    const db = getPrisma();
    const existing = await db.depositTransaction.findUnique({
      where: { txHash },
    });
    if (existing?.confirmed) {
      return {
        success: true,
        amount: existing.amount,
        error: 'Deposit already credited',
      };
    }
  }

  // Verify on-chain
  const verification = await verifyUsdcDeposit(txHash);
  if (!verification.verified) {
    return {
      success: false,
      error: verification.error,
    };
  }

  // Credit the deposit
  const chainId = getChainId();
  const creditResult = await recordAndCreditDeposit(protocolId, {
    protocolId,
    txHash,
    amount: verification.amount!,
    tokenAmount: verification.tokenAmount!,
    senderAddress: verification.senderAddress!,
    chainId,
    blockNumber: verification.blockNumber!,
  });

  return {
    success: creditResult.success,
    amount: verification.amount,
    newBalance: creditResult.newBalance,
    error: creditResult.error,
  };
}

/**
 * Get all deposits for a protocol.
 */
export async function getProtocolDeposits(protocolId: string) {
  const db = getPrisma();
  return db.depositTransaction.findMany({
    where: { protocolId },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Get unconfirmed deposits (for background verification).
 */
export async function getUnconfirmedDeposits() {
  const db = getPrisma();
  return db.depositTransaction.findMany({
    where: { confirmed: false },
    orderBy: { createdAt: 'asc' },
  });
}
