/**
 * Aegis Agent - Bankr-Compatible Output
 *
 * Produces decision output in a format that users/agents can pass to Bankr
 * for execution (alternative to AgentKit).
 */

import type { Decision } from '../reason/schemas';
import type { TransferParams, SwapParams, ExecuteParams } from '../reason/schemas';

const BASE_CHAIN_ID = 8453;

export interface BankrOutput {
  bankrPrompt: string;
  rawTransaction?: {
    to: string;
    data: string;
    value: string;
    chainId: number;
  };
}

/**
 * Convert a decision to a Bankr-compatible prompt and optional raw transaction.
 * Use when the consumer will execute via Bankr instead of AgentKit.
 */
export function toBankrPrompt(decision: Decision): BankrOutput | null {
  if (decision.action === 'WAIT' || decision.action === 'ALERT_HUMAN' || decision.action === 'ALERT_PROTOCOL') {
    return null;
  }
  if (decision.action === 'DEPLOY_TOKEN' && decision.parameters) {
    const p = decision.parameters as { name: string; symbol: string };
    return { bankrPrompt: `Deploy token ${p.name} (${p.symbol}) on Base via Clanker` };
  }
  if (decision.action === 'DONATE_TO_CHARITY' && decision.parameters) {
    const p = decision.parameters as { ein: string; amountUsd: number };
    return { bankrPrompt: `Donate $${p.amountUsd} to 501(c)(3) EIN ${p.ein} on Base via Endaoment` };
  }
  if (decision.action === 'SPONSOR_TRANSACTION' || decision.action === 'SWAP_RESERVES') {
    const p = decision.parameters as { agentWallet?: string; protocolId?: string } | { tokenIn?: string; tokenOut?: string; amountIn?: string } | null;
    if (decision.action === 'SPONSOR_TRANSACTION' && p && 'protocolId' in p) {
      return {
        bankrPrompt: `Sponsorship is handled by Aegis paymaster; use the agent cycle or paymaster API. Agent: ${p.agentWallet ?? '?'}, Protocol: ${p.protocolId ?? '?'}.`,
      };
    }
    if (decision.action === 'SWAP_RESERVES' && p && 'amountIn' in p) {
      return {
        bankrPrompt: `Swap ${p.amountIn ?? '?'} ${p.tokenIn ?? 'USDC'} for ${p.tokenOut ?? 'ETH'} on Base`,
      };
    }
    return null;
  }
  if (decision.action === 'TRANSFER' && decision.parameters) {
    const p = decision.parameters as TransferParams;
    return {
      bankrPrompt: `Send ${p.amount} ${p.token} to ${p.recipient} on Base`,
      rawTransaction: undefined,
    };
  }
  if ((decision.action === 'SWAP' || decision.action === 'REBALANCE') && decision.parameters) {
    const p = decision.parameters as SwapParams;
    return {
      bankrPrompt: `Swap ${p.amountIn} ${p.tokenIn} for ${p.tokenOut} on Base`,
      rawTransaction: undefined,
    };
  }
  if (decision.action === 'EXECUTE' && decision.parameters) {
    const p = decision.parameters as ExecuteParams;
    return {
      bankrPrompt: `Execute ${p.functionName} on contract ${p.contractAddress} on Base`,
      rawTransaction: {
        to: p.contractAddress,
        data: '0x',
        value: p.value ?? '0',
        chainId: BASE_CHAIN_ID,
      },
    };
  }
  return null;
}
