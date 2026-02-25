/**
 * Smart Account Validation
 *
 * Ensures only valid smart contract accounts are eligible for sponsorship.
 * EOAs (Externally Owned Accounts) are strictly rejected.
 */

import { createPublicClient, http, type Address } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { logger } from '../../logger';

export interface AccountValidationResult {
  isValid: boolean;
  accountType: 'smart_account' | 'eoa' | 'unknown';
  reason: string;
  bytecodeHash?: string;
  isERC4337Compatible?: boolean;
  isERC8004Registered?: boolean;
}

/**
 * Check if address has deployed bytecode (is a contract)
 */
export async function isSmartAccount(
  address: Address,
  chainName: 'base' | 'baseSepolia' = 'base'
): Promise<boolean> {
  try {
    const chain = chainName === 'base' ? base : baseSepolia;
    const rpcUrl = chainName === 'base'
      ? (process.env.RPC_URL_BASE ?? process.env.BASE_RPC_URL)
      : process.env.RPC_URL_BASE_SEPOLIA;

    if (!rpcUrl) {
      logger.warn('[AccountValidator] RPC URL not configured', { chainName });
      return false;
    }

    const client = createPublicClient({
      chain,
      transport: http(rpcUrl, { timeout: 5000 }),
    });

    const bytecode = await client.getBytecode({ address });

    // EOAs have no bytecode or '0x'
    const hasCode = bytecode && bytecode !== '0x' && bytecode.length > 2;

    logger.debug('[AccountValidator] Smart account check', {
      address: address.slice(0, 10) + '...',
      hasCode,
      bytecodeLength: bytecode?.length ?? 0,
    });

    return hasCode;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[AccountValidator] Smart account check failed', { address, error: message });
    return false;
  }
}

/**
 * Check if account supports ERC-4337 (has validateUserOp method)
 */
export async function isERC4337Compatible(
  address: Address,
  chainName: 'base' | 'baseSepolia' = 'base'
): Promise<boolean> {
  try {
    const chain = chainName === 'base' ? base : baseSepolia;
    const rpcUrl = chainName === 'base'
      ? (process.env.RPC_URL_BASE ?? process.env.BASE_RPC_URL)
      : process.env.RPC_URL_BASE_SEPOLIA;

    if (!rpcUrl) return false;

    const client = createPublicClient({
      chain,
      transport: http(rpcUrl, { timeout: 5000 }),
    });

    // Check for ERC-4337 validateUserOp function (0x3a871cdd)
    const validateUserOpSelector = '0x3a871cdd';

    // Try to check if contract implements the interface
    const bytecode = await client.getBytecode({ address });
    if (!bytecode || bytecode === '0x') return false;

    // Simple heuristic: check if validateUserOp selector exists in bytecode
    const hasValidateUserOp = bytecode.toLowerCase().includes(validateUserOpSelector.toLowerCase().slice(2));

    return hasValidateUserOp;
  } catch {
    return false;
  }
}

/**
 * Check if account is registered in ERC-8004 agent registry
 * Delegates to erc8004-registry module for actual implementation
 */
export async function isERC8004RegisteredAgent(
  address: Address,
  chainName: 'base' | 'baseSepolia' = 'base'
): Promise<boolean> {
  const { isERC8004RegisteredAgent: checkRegistry } = await import('./erc8004-registry');
  return checkRegistry(address, chainName);
}

/**
 * Comprehensive account validation
 * Returns detailed validation result
 */
export async function validateAccount(
  address: Address,
  chainName: 'base' | 'baseSepolia' = 'base'
): Promise<AccountValidationResult> {
  // Check if it's a smart account (has bytecode)
  const hasCode = await isSmartAccount(address, chainName);

  if (!hasCode) {
    return {
      isValid: false,
      accountType: 'eoa',
      reason: 'Address is an EOA (no contract bytecode)',
    };
  }

  // Check ERC-4337 compatibility
  const erc4337Compatible = await isERC4337Compatible(address, chainName);

  // Check ERC-8004 registration
  const erc8004Registered = await isERC8004RegisteredAgent(address, chainName);

  return {
    isValid: true,
    accountType: 'smart_account',
    reason: erc8004Registered
      ? 'ERC-8004 registered agent'
      : erc4337Compatible
      ? 'ERC-4337 compatible smart account'
      : 'Smart contract account',
    isERC4337Compatible: erc4337Compatible,
    isERC8004Registered: erc8004Registered,
  };
}

/**
 * Batch validate multiple accounts
 * Filters out EOAs and returns only valid smart accounts
 */
export async function filterSmartAccounts(
  addresses: Address[],
  chainName: 'base' | 'baseSepolia' = 'base'
): Promise<{
  valid: Address[];
  rejected: { address: Address; reason: string }[];
}> {
  const results = await Promise.all(
    addresses.map(async (address) => {
      const validation = await validateAccount(address, chainName);
      return { address, validation };
    })
  );

  const valid: Address[] = [];
  const rejected: { address: Address; reason: string }[] = [];

  for (const { address, validation } of results) {
    if (validation.isValid) {
      valid.push(address);
    } else {
      rejected.push({ address, reason: validation.reason });
    }
  }

  logger.info('[AccountValidator] Batch validation complete', {
    total: addresses.length,
    valid: valid.length,
    rejected: rejected.length,
  });

  return { valid, rejected };
}
