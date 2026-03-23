import type { CommandResult } from '@/src/lib/agent/openclaw/types';
import type { PolicyGateDecision } from '@/src/lib/product/gate/policy-gate';

export interface SummaryInput {
  rawUserText: string;
  parsedCommand: string;
  policyDecision: PolicyGateDecision;
  policyReason?: string;
  result?: CommandResult;
  txHash?: string | null;
  decisionHash?: string | null;
}

export function buildSummary(input: SummaryInput): string {
  const { rawUserText, parsedCommand, policyDecision, policyReason, result, txHash, decisionHash } =
    input;
  const preview = rawUserText.length > 120 ? `${rawUserText.slice(0, 117)}...` : rawUserText;

  if (policyDecision === 'PREMIUM_BLOCKED') {
    return `You asked: "${preview}". Command "${parsedCommand}" is a premium sponsorable method. ${policyReason ?? 'Upgrade to Pro or Team to enable it.'}`;
  }
  if (policyDecision === 'DENIED') {
    return `You asked: "${preview}". Policy denied "${parsedCommand}". ${policyReason ?? ''}`.trim();
  }

  if (policyDecision === 'SKIPPED' && result) {
    const status = result.success ? 'Success' : 'Failed';
    return `You asked: "${preview}". Command "${parsedCommand}" (policy gate skipped for non-sponsored actions). ${status}: ${result.message}`;
  }

  if (!result) {
    return `You asked: "${preview}". Command "${parsedCommand}" — ${policyReason ?? 'No execution result.'}`;
  }

  const status = result.success ? 'Success' : 'Failed';
  const parts = [
    `You asked: "${preview}".`,
    `Command: ${parsedCommand} (${policyDecision}).`,
    `${status}: ${result.message}`,
  ];
  if (txHash) parts.push(`Tx: ${txHash}`);
  if (decisionHash) parts.push(`Decision: ${decisionHash}`);
  return parts.join(' ');
}
