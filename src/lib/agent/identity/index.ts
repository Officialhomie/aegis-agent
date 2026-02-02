/**
 * Aegis Agent - Identity (ERC-8004)
 */

export {
  registerAgentIdentity,
  uploadToIPFS,
  type AgentMetadata,
} from './erc8004';

export {
  submitReputationAttestation,
  recordExecution,
  getReputationScore,
  calculateQualityScore,
  type ReputationAttestationInput,
} from './reputation';

export {
  getUnifiedReputation,
  getPaymentSuccessRate,
  type UnifiedReputation,
  type PaymentSuccessMetrics,
} from './unified-reputation';
