export function extractTxAndDecision(data?: Record<string, unknown>): {
  txHash?: string | null;
  decisionHash?: string | null;
} {
  if (!data) return {};
  const txHash =
    typeof data.txHash === 'string'
      ? data.txHash
      : typeof data.transactionHash === 'string'
        ? data.transactionHash
        : null;
  const decisionHash = typeof data.decisionHash === 'string' ? data.decisionHash : null;
  return { txHash, decisionHash };
}
