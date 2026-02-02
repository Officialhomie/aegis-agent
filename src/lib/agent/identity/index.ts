/**
 * Aegis Agent - Identity (ERC-8004)
 */

export {
  registerAgentIdentity,
  registerWithRegistry,
  setAgentURI,
  getAgentIdentity,
  getIdentityRegistryAddress,
  uploadToIPFS,
  type AgentMetadata,
  type AgentRegistrationFile,
} from './erc8004';

export {
  submitReputationAttestation,
  recordExecution,
  getReputationScore,
  calculateQualityScore,
  giveFeedback,
  getFeedbackSummary,
  readAgentFeedback,
  type ReputationAttestationInput,
} from './reputation';

export {
  getUnifiedReputation,
  getPaymentSuccessRate,
  type UnifiedReputation,
  type PaymentSuccessMetrics,
} from './unified-reputation';
