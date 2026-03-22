/**
 * Aegis MDF Layer - redeemDelegations Calldata Builder
 *
 * Builds the calldata for DelegationManager.redeemDelegations() that is used as
 * the UserOp.callData when executing a delegated action.
 *
 * Execution flow:
 *   Aegis agent smart account (delegate)
 *     → calls DelegationManager.redeemDelegations(...)
 *     → DelegationManager validates caveat chain
 *     → DelegationManager calls delegator's DeleGator account
 *     → DeleGator account executes the target contract call
 *
 * The Aegis AegisPaymaster continues to sponsor gas for this UserOp unchanged —
 * the paymaster signs keccak256(callData) which now contains redeemDelegations calldata.
 */

import {
  encodeFunctionData,
  encodeAbiParameters,
  parseAbiParameters,
  encodePacked,
  keccak256,
} from 'viem';
import type { MdfDelegation, MdfCalldataResult } from './types';
import { SINGLE_EXECUTION_MODE } from './types';
import { DELEGATION_MANAGER_ABI } from './constants';

/**
 * Serialize an MdfDelegation struct to bytes[] format expected by DelegationManager.
 * DelegationManager.redeemDelegations takes bytes[] permissionContexts where each
 * element is an ABI-encoded Delegation struct.
 */
function encodeDelegationAsBytes(delegation: MdfDelegation): `0x${string}` {
  return encodeAbiParameters(
    [
      {
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
    [
      {
        delegate: delegation.delegate,
        delegator: delegation.delegator,
        authority: delegation.authority,
        caveats: delegation.caveats,
        salt: delegation.salt,
        signature: delegation.signature,
      },
    ]
  );
}

/**
 * Encode the execution data for a single ERC-7579 call.
 * For SINGLE execution mode: encodePacked(address target, uint256 value, bytes calldata)
 */
function encodeExecutionData(
  target: `0x${string}`,
  value: bigint,
  callData: `0x${string}`
): `0x${string}` {
  return encodePacked(['address', 'uint256', 'bytes'], [target, value, callData]);
}

/**
 * Build the complete redeemDelegations calldata for a single delegation + single execution.
 *
 * @param delegation - The MDF Delegation struct (signed by the delegator)
 * @param targetContract - The contract the delegated call should invoke
 * @param value - ETH value to send with the inner call (typically 0 for DeFi)
 * @param innerCalldata - The calldata for the inner call to targetContract
 * @returns callData ready to use as UserOp.callData
 */
export function buildRedeemDelegationsCalldata(params: {
  delegation: MdfDelegation;
  targetContract: `0x${string}`;
  value: bigint;
  innerCalldata: `0x${string}`;
}): MdfCalldataResult {
  const { delegation, targetContract, value, innerCalldata } = params;

  // Encode the delegation struct as bytes (DelegationManager expects bytes[] permissionContexts)
  const encodedDelegation = encodeDelegationAsBytes(delegation);

  // Encode the execution call: target + value + calldata (ERC-7579 single execution format)
  const executionCallData = encodeExecutionData(targetContract, value, innerCalldata);

  // Build redeemDelegations calldata
  const callData = encodeFunctionData({
    abi: DELEGATION_MANAGER_ABI,
    functionName: 'redeemDelegations',
    args: [
      [encodedDelegation],    // bytes[] permissionContexts — one delegation chain
      [SINGLE_EXECUTION_MODE], // bytes32[] modes — single ERC-7579 execution
      [executionCallData],    // bytes[] executionCallDatas — the actual call
    ],
  });

  // Compute the delegation hash for reference (revocation checks use this)
  const delegationHash = keccak256(encodedDelegation);

  return { callData, delegationHash };
}

/**
 * Deserialize an MdfDelegation from the JSON stored in Delegation.serializedMdfDelegation.
 * Handles bigint serialization (stored as string).
 */
export function deserializeMdfDelegation(serialized: string): MdfDelegation {
  const raw = JSON.parse(serialized) as Record<string, unknown>;
  return {
    delegate: raw.delegate as `0x${string}`,
    delegator: raw.delegator as `0x${string}`,
    authority: raw.authority as `0x${string}`,
    caveats: (raw.caveats as Array<{ enforcer: string; terms: string; args: string }>).map(
      (c) => ({
        enforcer: c.enforcer as `0x${string}`,
        terms: c.terms as `0x${string}`,
        args: c.args as `0x${string}`,
      })
    ),
    salt: BigInt(raw.salt as string),
    signature: raw.signature as `0x${string}`,
  };
}

/**
 * Serialize an MdfDelegation to JSON (bigint serialized as string for DB storage).
 */
export function serializeMdfDelegation(delegation: MdfDelegation): string {
  return JSON.stringify({
    ...delegation,
    salt: delegation.salt.toString(),
  });
}
