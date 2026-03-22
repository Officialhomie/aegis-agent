/**
 * Aegis MDF Layer - Caveat Builders
 *
 * Maps Aegis DelegationPermissions to MDF Caveat[] arrays.
 * Each Aegis permission field corresponds to one or more standard caveat enforcers.
 *
 * Standard enforcer addresses must be configured via env vars in constants.ts.
 */

import { encodeAbiParameters, parseAbiParameters } from 'viem';
import type { MdfCaveat } from './types';
import type { DelegationPermissions } from '../delegation/schemas';
import { CAVEAT_ENFORCERS_BASE_SEPOLIA } from './constants';

/** Resolve enforcer addresses for the current network. */
function getEnforcers() {
  // Currently only Base Sepolia supported for hackathon MVP.
  // Post-hackathon: resolve by chainId from env.
  return CAVEAT_ENFORCERS_BASE_SEPOLIA;
}

/**
 * Build a Caveat that restricts calls to a whitelist of target contract addresses.
 * Maps to AllowedTargetsEnforcer.
 *
 * terms = abi.encode(address[])
 */
export function buildAllowedTargetsCaveat(addresses: `0x${string}`[]): MdfCaveat {
  const enforcers = getEnforcers();
  return {
    enforcer: enforcers.AllowedTargets,
    terms: encodeAbiParameters(parseAbiParameters('address[]'), [addresses]),
    args: '0x',
  };
}

/**
 * Build a Caveat that restricts calls to specific function selectors.
 * Maps to AllowedMethodsEnforcer.
 *
 * terms = abi.encode(bytes4[])
 */
export function buildAllowedMethodsCaveat(selectors: `0x${string}`[]): MdfCaveat {
  const enforcers = getEnforcers();
  return {
    enforcer: enforcers.AllowedMethods,
    terms: encodeAbiParameters(parseAbiParameters('bytes4[]'), [selectors as `0x${string}`[]]),
    args: '0x',
  };
}

/**
 * Build a Caveat that enforces a time window (valid-after / valid-before).
 * Maps to TimestampEnforcer.
 *
 * terms = abi.encode(uint128 validAfter, uint128 validBefore)
 */
export function buildTimestampCaveat(validFrom: Date, validUntil: Date): MdfCaveat {
  const enforcers = getEnforcers();
  return {
    enforcer: enforcers.Timestamp,
    terms: encodeAbiParameters(parseAbiParameters('uint128, uint128'), [
      BigInt(Math.floor(validFrom.getTime() / 1000)),
      BigInt(Math.floor(validUntil.getTime() / 1000)),
    ]),
    args: '0x',
  };
}

/**
 * Build a Caveat that caps the ETH value per call.
 * Maps to ValueLteEnforcer.
 *
 * terms = abi.encode(uint256 maxValue)
 */
export function buildValueLteCaveat(maxValueWei: bigint): MdfCaveat {
  const enforcers = getEnforcers();
  return {
    enforcer: enforcers.ValueLte,
    terms: encodeAbiParameters(parseAbiParameters('uint256'), [maxValueWei]),
    args: '0x',
  };
}

/**
 * Convert Aegis DelegationPermissions to an array of MDF Caveats.
 * Only emits caveats for fields that are actually set (non-empty/non-default).
 */
export function buildCaveatsFromPermissions(
  permissions: DelegationPermissions,
  validFrom: Date,
  validUntil: Date
): MdfCaveat[] {
  const caveats: MdfCaveat[] = [];

  // Target contract whitelist
  if (permissions.contracts.length > 0) {
    caveats.push(buildAllowedTargetsCaveat(permissions.contracts as `0x${string}`[]));
  }

  // Function selector whitelist
  if (permissions.functions.length > 0) {
    caveats.push(buildAllowedMethodsCaveat(permissions.functions as `0x${string}`[]));
  }

  // ETH value cap (only if explicitly set and non-zero)
  const maxValue = BigInt(permissions.maxValuePerTx ?? '0');
  if (maxValue > BigInt(0)) {
    caveats.push(buildValueLteCaveat(maxValue));
  }

  // Time window (always include — delegation has explicit validFrom/validUntil)
  caveats.push(buildTimestampCaveat(validFrom, validUntil));

  return caveats;
}
