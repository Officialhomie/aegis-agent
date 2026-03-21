/**
 * Aegis MDF Layer - MDF Delegation Signature Verifier
 *
 * Hashing and EIP-712 digest must match MetaMask delegation-framework
 * `EncoderLib._getDelegationHash` and `DelegationManager.redeemDelegations` signature checks:
 * https://github.com/MetaMask/delegation-framework/blob/main/src/libraries/EncoderLib.sol
 */

import {
  keccak256,
  encodeAbiParameters,
  encodePacked,
  concat,
  recoverAddress,
  createPublicClient,
  http,
  hashDomain,
  stringToBytes,
  defineChain,
  type Chain,
} from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { verifyHash } from 'viem/actions';
import type { MdfCaveat, MdfDelegation, MdfVerificationResult } from './types';

/** @see MetaMask delegation-framework `src/utils/Constants.sol` */
const DELEGATION_TYPE_STRING =
  'Delegation(address delegate,address delegator,bytes32 authority,Caveat[] caveats,uint256 salt)Caveat(address enforcer,bytes terms)';

const CAVEAT_TYPE_STRING = 'Caveat(address enforcer,bytes terms)';

const DELEGATION_TYPEHASH = keccak256(stringToBytes(DELEGATION_TYPE_STRING));
const CAVEAT_TYPEHASH = keccak256(stringToBytes(CAVEAT_TYPE_STRING));

const EIP712_DOMAIN_TYPES = {
  EIP712Domain: [
    { name: 'name', type: 'string' },
    { name: 'version', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'verifyingContract', type: 'address' },
  ],
} as const;

function chainFromId(chainId: number): Chain {
  if (chainId === 8453) return base;
  if (chainId === 84532) return baseSepolia;
  return defineChain({
    id: chainId,
    name: 'custom',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [''] } },
  });
}

function rpcUrlForChain(chainId: number): string {
  if (chainId === 8453) {
    return process.env.RPC_URL_BASE ?? process.env.BASE_RPC_URL ?? process.env.RPC_URL_8453 ?? '';
  }
  return (
    process.env.RPC_URL_BASE_SEPOLIA ??
    process.env.BASE_SEPOLIA_RPC_URL ??
    process.env.RPC_URL_84532 ??
    ''
  );
}

/**
 * @see EncoderLib._getCaveatPacketHash — `args` is not included.
 */
function hashCaveatPacket(caveat: MdfCaveat): `0x${string}` {
  const encoded = encodeAbiParameters(
    [{ type: 'bytes32' }, { type: 'address' }, { type: 'bytes32' }],
    [CAVEAT_TYPEHASH, caveat.enforcer, keccak256(caveat.terms)]
  );
  return keccak256(encoded);
}

/**
 * @see EncoderLib._getCaveatArrayPacketHash
 */
function hashCaveatArrayPacket(caveats: MdfCaveat[]): `0x${string}` {
  const hashes = caveats.map(hashCaveatPacket);
  if (hashes.length === 0) {
    return keccak256(new Uint8Array(0));
  }
  const types = hashes.map(() => 'bytes32' as const);
  return keccak256(encodePacked(types, [...hashes]));
}

/** Matches `MessageHashUtils.toTypedDataHash` + MetaMask `EncoderLib._getDelegationHash` input. */
export function mdfDelegationTypedDataDigest(
  delegation: MdfDelegation,
  delegationManagerAddress: `0x${string}`,
  chainId: number
): `0x${string}` {
  const domainSeparator = hashDomain({
    domain: {
      name: 'DelegationManager',
      version: '1',
      chainId: BigInt(chainId),
      verifyingContract: delegationManagerAddress,
    },
    types: EIP712_DOMAIN_TYPES,
  });
  const structHash = hashMdfDelegation(delegation);
  return keccak256(concat(['0x1901', domainSeparator, structHash]));
}

/**
 * Verify an MDF delegation signature (EOA via `recoverAddress`, smart account via ERC-1271 / `verifyHash`).
 * MetaMask signs `keccak256(0x1901 ‖ domainSeparator ‖ structHash)` where `structHash` is `hashMdfDelegation`.
 */
export async function verifyMdfDelegationSignature(
  delegation: MdfDelegation,
  delegationManagerAddress: `0x${string}`,
  chainId: number
): Promise<MdfVerificationResult> {
  try {
    const digest = mdfDelegationTypedDataDigest(delegation, delegationManagerAddress, chainId);

    const recovered = await recoverAddress({
      hash: digest,
      signature: delegation.signature,
    }).catch(() => null as `0x${string}` | null);

    if (recovered && recovered.toLowerCase() === delegation.delegator.toLowerCase()) {
      return { valid: true };
    }

    const rpcUrl = rpcUrlForChain(chainId);
    if (!rpcUrl) {
      return {
        valid: false,
        error:
          'RPC URL not configured (RPC_URL_BASE / RPC_URL_BASE_SEPOLIA) — cannot verify ERC-1271 delegator signature',
      };
    }

    const client = createPublicClient({
      chain: chainFromId(chainId),
      transport: http(rpcUrl),
    });

    const ok = await verifyHash(client, {
      address: delegation.delegator,
      hash: digest,
      signature: delegation.signature,
    });

    return { valid: ok };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : 'Signature verification failed',
    };
  }
}

/**
 * Delegation hash for `disabledDelegations` / `isDelegationDisabled` — matches `DelegationManager.getDelegationHash`.
 * Omits `signature`; caveat `args` omitted per EncoderLib.
 */
export function hashMdfDelegation(delegation: MdfDelegation): `0x${string}` {
  const caveatsHash = hashCaveatArrayPacket(delegation.caveats);
  const encoded = encodeAbiParameters(
    [
      { type: 'bytes32' },
      { type: 'address' },
      { type: 'address' },
      { type: 'bytes32' },
      { type: 'bytes32' },
      { type: 'uint256' },
    ],
    [
      DELEGATION_TYPEHASH,
      delegation.delegate,
      delegation.delegator,
      delegation.authority,
      caveatsHash,
      delegation.salt,
    ]
  );
  return keccak256(encoded);
}
