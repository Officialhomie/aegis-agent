/**
 * Aegis Agent - Startup Validation
 *
 * Validates critical configuration before agent startup.
 * In production mode, fails startup if required config is missing.
 * Ensures explicit network configuration (no silent testnet defaults).
 */

import { CriticalConfigMissingError } from './errors';
import { logger } from './logger';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const FAIL_ON_MISSING_CONFIG = process.env.FAIL_ON_MISSING_CONFIG === 'true' || IS_PRODUCTION;

export interface StartupValidationResult {
  valid: boolean;
  network: string;
  errors: string[];
  warnings: string[];
  config: {
    networkId: string | undefined;
    rpcUrl: string | undefined;
    bundlerUrl: string | undefined;
    agentWallet: string | undefined;
    activityLoggerAddress: string | undefined;
  };
}

/**
 * Required environment variables for production.
 */
const REQUIRED_CONFIG = [
  {
    key: 'AGENT_NETWORK_ID',
    description: 'Network identifier (base or base-sepolia)',
    defaultAllowed: false,
    validate: (val: string) => ['base', 'base-sepolia'].includes(val),
    errorMessage: 'Must be "base" or "base-sepolia"',
  },
  {
    key: 'AGENT_WALLET_ADDRESS',
    description: 'Agent wallet address for sponsorship',
    defaultAllowed: false,
    validate: (val: string) => /^0x[a-fA-F0-9]{40}$/.test(val),
    errorMessage: 'Must be a valid Ethereum address (0x...)',
  },
] as const;

interface RecommendedConfigItem {
  key: string;
  description: string;
  validate: (val: string) => boolean;
  warningIf?: (val: string) => boolean;
  warningMessage?: string;
}

/**
 * Recommended configuration for production (warnings if missing).
 */
const RECOMMENDED_CONFIG: RecommendedConfigItem[] = [
  {
    key: 'BUNDLER_RPC_URL',
    description: 'Pimlico bundler RPC URL for UserOp submission',
    validate: (val: string) => val.startsWith('http'),
  },
  {
    key: 'BASE_RPC_URL',
    description: 'Base network RPC URL',
    validate: (val: string) => val.startsWith('http') && !val.includes('sepolia'),
    warningIf: (val: string) => val.includes('sepolia') && process.env.AGENT_NETWORK_ID === 'base',
    warningMessage: 'RPC URL contains "sepolia" but network is set to "base" mainnet',
  },
  {
    key: 'ACTIVITY_LOGGER_ADDRESS',
    description: 'On-chain activity logger contract address',
    validate: (val: string) => /^0x[a-fA-F0-9]{40}$/.test(val),
  },
  {
    key: 'DATABASE_URL',
    description: 'PostgreSQL database connection string',
    validate: (val: string) => val.startsWith('postgres'),
  },
  {
    key: 'REDIS_URL',
    description: 'Redis connection for state persistence',
    validate: (val: string) => val.startsWith('redis'),
  },
];

/**
 * Validate all startup configuration.
 * Throws CriticalConfigMissingError in production if required config is missing.
 */
export function validateStartupConfig(): StartupValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required configuration
  for (const req of REQUIRED_CONFIG) {
    const value = process.env[req.key];
    if (!value || value.trim() === '') {
      errors.push(`${req.key}: ${req.description} (required)`);
    } else if (req.validate && !req.validate(value)) {
      errors.push(`${req.key}: ${req.errorMessage}`);
    }
  }

  // Check recommended configuration
  for (const rec of RECOMMENDED_CONFIG) {
    const value = process.env[rec.key];
    if (!value || value.trim() === '') {
      warnings.push(`${rec.key}: ${rec.description} (recommended)`);
    } else if (rec.warningIf && rec.warningIf(value)) {
      warnings.push(`${rec.key}: ${rec.warningMessage}`);
    }
  }

  const networkId = process.env.AGENT_NETWORK_ID ?? 'base-sepolia';
  const isMainnet = networkId === 'base';

  // Additional mainnet-specific checks
  if (isMainnet) {
    const rpcUrl = process.env.BASE_RPC_URL ?? process.env.RPC_URL_BASE;
    if (rpcUrl?.includes('sepolia')) {
      errors.push('BASE_RPC_URL: Contains "sepolia" but network is set to mainnet');
    }
    if (!process.env.BUNDLER_RPC_URL) {
      errors.push('BUNDLER_RPC_URL: Required for mainnet sponsorship');
    }
    if (!process.env.ACTIVITY_LOGGER_ADDRESS) {
      warnings.push('ACTIVITY_LOGGER_ADDRESS: Required for on-chain audit trail');
    }
  }

  const result: StartupValidationResult = {
    valid: errors.length === 0,
    network: networkId,
    errors,
    warnings,
    config: {
      networkId: process.env.AGENT_NETWORK_ID,
      rpcUrl: process.env.BASE_RPC_URL ?? process.env.RPC_URL_BASE,
      bundlerUrl: process.env.BUNDLER_RPC_URL,
      agentWallet: process.env.AGENT_WALLET_ADDRESS,
      activityLoggerAddress: process.env.ACTIVITY_LOGGER_ADDRESS,
    },
  };

  return result;
}

/**
 * Run startup validation and log results.
 * In production (or FAIL_ON_MISSING_CONFIG=true), throws on errors.
 */
export function runStartupValidation(): void {
  const result = validateStartupConfig();

  // Log startup banner
  logger.info('='.repeat(60));
  logger.info('Aegis Agent - Startup Validation');
  logger.info('='.repeat(60));
  logger.info(`Network: ${result.network}`);
  logger.info(`Mode: ${IS_PRODUCTION ? 'PRODUCTION' : 'DEVELOPMENT'}`);
  logger.info(`Strict validation: ${FAIL_ON_MISSING_CONFIG ? 'ENABLED' : 'DISABLED'}`);

  // Log configuration status
  logger.info('-'.repeat(60));
  logger.info('Configuration:');
  logger.info(`  Network ID: ${result.config.networkId ?? '(not set)'}`);
  logger.info(`  RPC URL: ${result.config.rpcUrl ? maskUrl(result.config.rpcUrl) : '(not set)'}`);
  logger.info(`  Bundler URL: ${result.config.bundlerUrl ? maskUrl(result.config.bundlerUrl) : '(not set)'}`);
  logger.info(`  Agent Wallet: ${result.config.agentWallet ?? '(not set)'}`);
  logger.info(`  Activity Logger: ${result.config.activityLoggerAddress ?? '(not set)'}`);

  // Log errors
  if (result.errors.length > 0) {
    logger.info('-'.repeat(60));
    logger.error('Configuration Errors:');
    for (const error of result.errors) {
      logger.error(`  - ${error}`);
    }
  }

  // Log warnings
  if (result.warnings.length > 0) {
    logger.info('-'.repeat(60));
    logger.warn('Configuration Warnings:');
    for (const warning of result.warnings) {
      logger.warn(`  - ${warning}`);
    }
  }

  logger.info('='.repeat(60));

  // Throw if validation failed and strict mode enabled
  if (!result.valid && FAIL_ON_MISSING_CONFIG) {
    throw new CriticalConfigMissingError(
      `Startup validation failed with ${result.errors.length} error(s): ${result.errors.join('; ')}`,
      result.errors[0]?.split(':')[0]
    );
  }

  if (result.valid) {
    logger.info(`Startup validation passed. Network: ${result.network}`);
  } else {
    logger.warn(`Startup validation has ${result.errors.length} error(s) - continuing in degraded mode`);
  }
}

/**
 * Mask sensitive parts of URLs for logging.
 */
function maskUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Mask API keys in query params
    if (parsed.searchParams.has('apikey')) {
      parsed.searchParams.set('apikey', '***');
    }
    if (parsed.searchParams.has('api_key')) {
      parsed.searchParams.set('api_key', '***');
    }
    // Mask password in URL
    if (parsed.password) {
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    // If URL parsing fails, mask everything after the first slash
    const parts = url.split('/');
    if (parts.length > 3) {
      return `${parts.slice(0, 3).join('/')}/***`;
    }
    return url;
  }
}

/**
 * Get the current network name for display purposes.
 */
export function getCurrentNetworkName(): string {
  const networkId = process.env.AGENT_NETWORK_ID ?? 'base-sepolia';
  return networkId === 'base' ? 'Base Mainnet' : 'Base Sepolia (Testnet)';
}

/**
 * Check if running on mainnet.
 */
export function isMainnet(): boolean {
  return process.env.AGENT_NETWORK_ID === 'base';
}

/**
 * Check if running on testnet.
 */
export function isTestnet(): boolean {
  return process.env.AGENT_NETWORK_ID !== 'base';
}
