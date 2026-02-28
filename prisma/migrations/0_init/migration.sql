-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "DelegationStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED', 'EXHAUSTED');

-- CreateEnum
CREATE TYPE "DecisionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXECUTED', 'FAILED');

-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('PENDING', 'SUBMITTED', 'CONFIRMED', 'FAILED', 'REVERTED');

-- CreateEnum
CREATE TYPE "MemoryType" AS ENUM ('OBSERVATION', 'DECISION', 'OUTCOME', 'LEARNED_PATTERN', 'USER_FEEDBACK');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'EXECUTED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED_SIMULATION', 'PENDING_CDP', 'LIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "CDPStatus" AS ENUM ('NOT_SUBMITTED', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RuntimeOverrideType" AS ENUM ('PAUSE_UNTIL', 'MAX_GAS_PRICE_GWEI', 'DAILY_BUDGET_USD', 'RATE_LIMIT_OVERRIDE');

-- CreateEnum
CREATE TYPE "PassportTier" AS ENUM ('NEWCOMER', 'ACTIVE', 'TRUSTED', 'PREMIUM', 'WHALE', 'FLAGGED');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "GuaranteeType" AS ENUM ('GAS_BUDGET', 'TX_COUNT', 'TIME_WINDOW');

-- CreateEnum
CREATE TYPE "GuaranteeStatus" AS ENUM ('PENDING', 'ACTIVE', 'DEPLETED', 'EXPIRED', 'BREACHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ServiceTier" AS ENUM ('BRONZE', 'SILVER', 'GOLD');

-- CreateEnum
CREATE TYPE "BreachType" AS ENUM ('SLA_MISSED', 'EXECUTION_FAILED', 'BUDGET_EXCEEDED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'APPROVED', 'REFUNDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AgentType" AS ENUM ('ERC8004_AGENT', 'ERC4337_ACCOUNT', 'SMART_CONTRACT', 'EOA', 'UNKNOWN');

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "onChainId" TEXT,
    "walletAddress" TEXT,
    "moltbookApiKey" TEXT,
    "moltbookAgentName" TEXT,
    "moltbookClaimedAt" TIMESTAMP(3),
    "confidenceThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.75,
    "maxTransactionValue" BIGINT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Observation" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,
    "chainId" INTEGER,
    "blockNumber" BIGINT,
    "stateData" JSONB NOT NULL,
    "context" TEXT,

    CONSTRAINT "Observation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "observationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" TEXT NOT NULL,
    "parameters" JSONB,
    "confidence" DOUBLE PRECISION NOT NULL,
    "reasoning" TEXT NOT NULL,
    "status" "DecisionStatus" NOT NULL DEFAULT 'PENDING',
    "policyPassed" BOOLEAN NOT NULL DEFAULT false,
    "policyErrors" TEXT[],

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Execution" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "chainId" INTEGER NOT NULL,
    "txHash" TEXT,
    "blockNumber" BIGINT,
    "gasUsed" BIGINT,
    "gasCost" BIGINT,
    "status" "ExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "success" BOOLEAN,
    "outcomeData" JSONB,

    CONSTRAINT "Execution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Memory" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" "MemoryType" NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "embeddingId" TEXT,
    "importance" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    "lastAccessed" TIMESTAMP(3),

    CONSTRAINT "Memory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentRecord" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paymentHash" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "requestedAction" TEXT NOT NULL,
    "requester" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "executionId" TEXT,

    CONSTRAINT "PaymentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReputationAttestation" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "agentOnChainId" TEXT NOT NULL,
    "attestor" TEXT NOT NULL,
    "attestationType" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "metadata" JSONB,
    "chainId" INTEGER NOT NULL,
    "txHash" TEXT,

    CONSTRAINT "ReputationAttestation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProtocolSponsor" (
    "id" TEXT NOT NULL,
    "protocolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "balanceUSD" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalSpent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sponsorshipCount" INTEGER NOT NULL DEFAULT 0,
    "whitelistedContracts" TEXT[],
    "tier" TEXT NOT NULL DEFAULT 'bronze',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "onboardingStatus" "OnboardingStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "cdpAllowlistStatus" "CDPStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
    "cdpAllowlistSubmittedAt" TIMESTAMP(3),
    "cdpAllowlistApprovedAt" TIMESTAMP(3),
    "simulationModeUntil" TIMESTAMP(3),
    "notificationEmail" TEXT,
    "notificationWebhook" TEXT,
    "policyConfig" JSONB,
    "apiKeyHash" TEXT,
    "apiKeyCreatedAt" TIMESTAMP(3),
    "totalGuaranteedUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "guaranteeReserveUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minAgentTier" INTEGER NOT NULL DEFAULT 1,
    "requireERC8004" BOOLEAN NOT NULL DEFAULT false,
    "requireERC4337" BOOLEAN NOT NULL DEFAULT false,
    "tierPausedUntil" JSONB,

    CONSTRAINT "ProtocolSponsor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepositTransaction" (
    "id" TEXT NOT NULL,
    "protocolId" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "tokenAmount" BIGINT NOT NULL,
    "tokenSymbol" TEXT NOT NULL DEFAULT 'USDC',
    "chainId" INTEGER NOT NULL,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "blockNumber" BIGINT,
    "confirmedAt" TIMESTAMP(3),
    "senderAddress" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepositTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovedAgent" (
    "id" TEXT NOT NULL,
    "protocolId" TEXT NOT NULL,
    "agentAddress" TEXT NOT NULL,
    "agentName" TEXT,
    "approvedBy" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "maxDailyBudget" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "agentTier" INTEGER NOT NULL DEFAULT 3,
    "agentType" "AgentType" NOT NULL DEFAULT 'UNKNOWN',
    "tierOverride" BOOLEAN NOT NULL DEFAULT false,
    "lastValidated" TIMESTAMP(3),

    CONSTRAINT "ApprovedAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SponsorshipRecord" (
    "id" TEXT NOT NULL,
    "userAddress" TEXT NOT NULL,
    "protocolId" TEXT NOT NULL,
    "decisionHash" TEXT NOT NULL,
    "estimatedCostUSD" DOUBLE PRECISION NOT NULL,
    "actualCostUSD" DOUBLE PRECISION,
    "txHash" TEXT,
    "signature" TEXT NOT NULL,
    "ipfsCid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "agentTier" INTEGER NOT NULL DEFAULT 3,
    "agentType" "AgentType" NOT NULL DEFAULT 'UNKNOWN',
    "isERC8004" BOOLEAN NOT NULL DEFAULT false,
    "isERC4337" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SponsorshipRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueItem" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "protocolId" TEXT NOT NULL,
    "agentAddress" TEXT NOT NULL,
    "agentTier" INTEGER NOT NULL,
    "agentType" "AgentType" NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processingStartedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "QueueItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingEvent" (
    "id" TEXT NOT NULL,
    "protocolId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnboardingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyOverride" (
    "id" TEXT NOT NULL,
    "protocolId" TEXT NOT NULL,
    "ruleType" TEXT NOT NULL,
    "overrideValue" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "PolicyOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuntimeOverride" (
    "id" TEXT NOT NULL,
    "protocolId" TEXT NOT NULL,
    "overrideType" "RuntimeOverrideType" NOT NULL,
    "value" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "RuntimeOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlockedWallet" (
    "id" TEXT NOT NULL,
    "protocolId" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "reason" TEXT,
    "blockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "blockedBy" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "BlockedWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Delegation" (
    "id" TEXT NOT NULL,
    "delegator" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "agentOnChainId" TEXT,
    "signature" TEXT NOT NULL,
    "signatureNonce" BIGINT NOT NULL,
    "permissions" JSONB NOT NULL,
    "gasBudgetWei" BIGINT NOT NULL,
    "gasBudgetSpent" BIGINT NOT NULL DEFAULT 0,
    "status" "DelegationStatus" NOT NULL DEFAULT 'ACTIVE',
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "onChainTxHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Delegation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DelegationUsage" (
    "id" TEXT NOT NULL,
    "delegationId" TEXT NOT NULL,
    "targetContract" TEXT NOT NULL,
    "functionSelector" TEXT,
    "valueWei" BIGINT NOT NULL,
    "gasUsed" BIGINT NOT NULL,
    "gasCostWei" BIGINT NOT NULL,
    "txHash" TEXT,
    "success" BOOLEAN NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DelegationUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GasPassportSnapshot" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "sponsorshipCount" INTEGER NOT NULL,
    "successRateBps" INTEGER NOT NULL,
    "protocolCount" INTEGER NOT NULL,
    "totalValueSponsoredUSD" DOUBLE PRECISION NOT NULL,
    "trustScore" INTEGER NOT NULL,
    "tier" "PassportTier" NOT NULL,
    "riskLevel" "RiskLevel" NOT NULL,
    "avgSponsorshipsPerWeek" DOUBLE PRECISION NOT NULL,
    "consistencyScore" DOUBLE PRECISION NOT NULL,
    "recencyDays" INTEGER NOT NULL,
    "peakActivityHour" INTEGER,
    "avgSponsorshipValueUSD" DOUBLE PRECISION NOT NULL,
    "maxSponsorshipValueUSD" DOUBLE PRECISION NOT NULL,
    "valuePercentile" INTEGER NOT NULL,
    "failureRateBps" INTEGER NOT NULL,
    "rejectionRateBps" INTEGER NOT NULL,
    "flagCount" INTEGER NOT NULL DEFAULT 0,
    "flags" JSONB,
    "ensName" TEXT,
    "basename" TEXT,
    "farcasterFid" INTEGER,
    "farcasterFollowers" INTEGER,
    "onChainTxCount" INTEGER,
    "isContractDeployer" BOOLEAN NOT NULL DEFAULT false,
    "accountAgeOnChainDays" INTEGER,
    "reputationHash" TEXT,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSponsorshipAt" TIMESTAMP(3),
    "firstSponsorshipAt" TIMESTAMP(3),

    CONSTRAINT "GasPassportSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutionGuarantee" (
    "id" TEXT NOT NULL,
    "type" "GuaranteeType" NOT NULL,
    "beneficiary" TEXT NOT NULL,
    "protocolId" TEXT NOT NULL,
    "budgetWei" BIGINT,
    "budgetUsd" DOUBLE PRECISION,
    "usedWei" BIGINT NOT NULL DEFAULT 0,
    "usedUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "txCount" INTEGER,
    "usedTxCount" INTEGER NOT NULL DEFAULT 0,
    "maxGasPerTx" BIGINT,
    "maxLatencyMs" INTEGER,
    "breachPenalty" DOUBLE PRECISION,
    "maxGasPrice" BIGINT,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "lockedAmountUsd" DOUBLE PRECISION NOT NULL,
    "premiumPaid" DOUBLE PRECISION NOT NULL,
    "refundsIssued" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tier" "ServiceTier" NOT NULL DEFAULT 'SILVER',
    "status" "GuaranteeStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "activatedAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "breachedAt" TIMESTAMP(3),

    CONSTRAINT "ExecutionGuarantee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuaranteeUsage" (
    "id" TEXT NOT NULL,
    "guaranteeId" TEXT NOT NULL,
    "userOpHash" TEXT NOT NULL,
    "txHash" TEXT,
    "gasUsed" BIGINT NOT NULL,
    "gasPriceWei" BIGINT NOT NULL,
    "costWei" BIGINT NOT NULL,
    "costUsd" DOUBLE PRECISION NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "includedAt" TIMESTAMP(3),
    "latencyMs" INTEGER,
    "slaMet" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuaranteeUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuaranteeBreach" (
    "id" TEXT NOT NULL,
    "guaranteeId" TEXT NOT NULL,
    "usageId" TEXT,
    "breachType" "BreachType" NOT NULL,
    "breachDetails" JSONB NOT NULL,
    "refundAmount" DOUBLE PRECISION NOT NULL,
    "refundStatus" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuaranteeBreach_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Agent_onChainId_key" ON "Agent"("onChainId");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_walletAddress_key" ON "Agent"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_moltbookApiKey_key" ON "Agent"("moltbookApiKey");

-- CreateIndex
CREATE INDEX "Agent_walletAddress_idx" ON "Agent"("walletAddress");

-- CreateIndex
CREATE INDEX "Observation_agentId_createdAt_idx" ON "Observation"("agentId", "createdAt");

-- CreateIndex
CREATE INDEX "Observation_source_idx" ON "Observation"("source");

-- CreateIndex
CREATE INDEX "Decision_agentId_createdAt_idx" ON "Decision"("agentId", "createdAt");

-- CreateIndex
CREATE INDEX "Decision_status_idx" ON "Decision"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Execution_decisionId_key" ON "Execution"("decisionId");

-- CreateIndex
CREATE INDEX "Execution_agentId_createdAt_idx" ON "Execution"("agentId", "createdAt");

-- CreateIndex
CREATE INDEX "Execution_txHash_idx" ON "Execution"("txHash");

-- CreateIndex
CREATE INDEX "Execution_status_idx" ON "Execution"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Memory_embeddingId_key" ON "Memory"("embeddingId");

-- CreateIndex
CREATE INDEX "Memory_agentId_type_idx" ON "Memory"("agentId", "type");

-- CreateIndex
CREATE INDEX "Memory_importance_idx" ON "Memory"("importance");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRecord_paymentHash_key" ON "PaymentRecord"("paymentHash");

-- CreateIndex
CREATE INDEX "PaymentRecord_paymentHash_idx" ON "PaymentRecord"("paymentHash");

-- CreateIndex
CREATE INDEX "PaymentRecord_requester_idx" ON "PaymentRecord"("requester");

-- CreateIndex
CREATE INDEX "ReputationAttestation_agentOnChainId_idx" ON "ReputationAttestation"("agentOnChainId");

-- CreateIndex
CREATE INDEX "ReputationAttestation_attestor_idx" ON "ReputationAttestation"("attestor");

-- CreateIndex
CREATE UNIQUE INDEX "ProtocolSponsor_protocolId_key" ON "ProtocolSponsor"("protocolId");

-- CreateIndex
CREATE UNIQUE INDEX "ProtocolSponsor_apiKeyHash_key" ON "ProtocolSponsor"("apiKeyHash");

-- CreateIndex
CREATE INDEX "ProtocolSponsor_protocolId_idx" ON "ProtocolSponsor"("protocolId");

-- CreateIndex
CREATE UNIQUE INDEX "DepositTransaction_txHash_key" ON "DepositTransaction"("txHash");

-- CreateIndex
CREATE INDEX "DepositTransaction_protocolId_idx" ON "DepositTransaction"("protocolId");

-- CreateIndex
CREATE INDEX "DepositTransaction_txHash_idx" ON "DepositTransaction"("txHash");

-- CreateIndex
CREATE INDEX "DepositTransaction_senderAddress_idx" ON "DepositTransaction"("senderAddress");

-- CreateIndex
CREATE INDEX "DepositTransaction_confirmed_idx" ON "DepositTransaction"("confirmed");

-- CreateIndex
CREATE INDEX "ApprovedAgent_protocolId_idx" ON "ApprovedAgent"("protocolId");

-- CreateIndex
CREATE INDEX "ApprovedAgent_agentAddress_idx" ON "ApprovedAgent"("agentAddress");

-- CreateIndex
CREATE INDEX "ApprovedAgent_isActive_idx" ON "ApprovedAgent"("isActive");

-- CreateIndex
CREATE INDEX "ApprovedAgent_agentTier_idx" ON "ApprovedAgent"("agentTier");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovedAgent_protocolId_agentAddress_key" ON "ApprovedAgent"("protocolId", "agentAddress");

-- CreateIndex
CREATE UNIQUE INDEX "SponsorshipRecord_decisionHash_key" ON "SponsorshipRecord"("decisionHash");

-- CreateIndex
CREATE INDEX "SponsorshipRecord_userAddress_idx" ON "SponsorshipRecord"("userAddress");

-- CreateIndex
CREATE INDEX "SponsorshipRecord_protocolId_idx" ON "SponsorshipRecord"("protocolId");

-- CreateIndex
CREATE INDEX "SponsorshipRecord_decisionHash_idx" ON "SponsorshipRecord"("decisionHash");

-- CreateIndex
CREATE INDEX "SponsorshipRecord_agentTier_createdAt_idx" ON "SponsorshipRecord"("agentTier", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "QueueItem_requestId_key" ON "QueueItem"("requestId");

-- CreateIndex
CREATE INDEX "QueueItem_status_agentTier_priority_createdAt_idx" ON "QueueItem"("status", "agentTier", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "QueueItem_protocolId_status_idx" ON "QueueItem"("protocolId", "status");

-- CreateIndex
CREATE INDEX "QueueItem_agentAddress_idx" ON "QueueItem"("agentAddress");

-- CreateIndex
CREATE INDEX "OnboardingEvent_protocolId_createdAt_idx" ON "OnboardingEvent"("protocolId", "createdAt");

-- CreateIndex
CREATE INDEX "PolicyOverride_protocolId_idx" ON "PolicyOverride"("protocolId");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyOverride_protocolId_ruleType_key" ON "PolicyOverride"("protocolId", "ruleType");

-- CreateIndex
CREATE INDEX "RuntimeOverride_protocolId_overrideType_isActive_idx" ON "RuntimeOverride"("protocolId", "overrideType", "isActive");

-- CreateIndex
CREATE INDEX "RuntimeOverride_expiresAt_idx" ON "RuntimeOverride"("expiresAt");

-- CreateIndex
CREATE INDEX "BlockedWallet_protocolId_isActive_idx" ON "BlockedWallet"("protocolId", "isActive");

-- CreateIndex
CREATE INDEX "BlockedWallet_walletAddress_idx" ON "BlockedWallet"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "BlockedWallet_protocolId_walletAddress_key" ON "BlockedWallet"("protocolId", "walletAddress");

-- CreateIndex
CREATE INDEX "Delegation_delegator_idx" ON "Delegation"("delegator");

-- CreateIndex
CREATE INDEX "Delegation_agent_idx" ON "Delegation"("agent");

-- CreateIndex
CREATE INDEX "Delegation_status_validUntil_idx" ON "Delegation"("status", "validUntil");

-- CreateIndex
CREATE INDEX "Delegation_agentOnChainId_idx" ON "Delegation"("agentOnChainId");

-- CreateIndex
CREATE UNIQUE INDEX "Delegation_delegator_agent_signatureNonce_key" ON "Delegation"("delegator", "agent", "signatureNonce");

-- CreateIndex
CREATE INDEX "DelegationUsage_delegationId_createdAt_idx" ON "DelegationUsage"("delegationId", "createdAt");

-- CreateIndex
CREATE INDEX "DelegationUsage_txHash_idx" ON "DelegationUsage"("txHash");

-- CreateIndex
CREATE UNIQUE INDEX "GasPassportSnapshot_walletAddress_key" ON "GasPassportSnapshot"("walletAddress");

-- CreateIndex
CREATE INDEX "GasPassportSnapshot_walletAddress_idx" ON "GasPassportSnapshot"("walletAddress");

-- CreateIndex
CREATE INDEX "GasPassportSnapshot_tier_idx" ON "GasPassportSnapshot"("tier");

-- CreateIndex
CREATE INDEX "GasPassportSnapshot_trustScore_idx" ON "GasPassportSnapshot"("trustScore");

-- CreateIndex
CREATE INDEX "ExecutionGuarantee_beneficiary_status_idx" ON "ExecutionGuarantee"("beneficiary", "status");

-- CreateIndex
CREATE INDEX "ExecutionGuarantee_protocolId_status_idx" ON "ExecutionGuarantee"("protocolId", "status");

-- CreateIndex
CREATE INDEX "ExecutionGuarantee_validUntil_idx" ON "ExecutionGuarantee"("validUntil");

-- CreateIndex
CREATE INDEX "GuaranteeUsage_guaranteeId_idx" ON "GuaranteeUsage"("guaranteeId");

-- CreateIndex
CREATE INDEX "GuaranteeUsage_submittedAt_idx" ON "GuaranteeUsage"("submittedAt");

-- CreateIndex
CREATE INDEX "GuaranteeBreach_guaranteeId_idx" ON "GuaranteeBreach"("guaranteeId");

-- CreateIndex
CREATE INDEX "GuaranteeBreach_refundStatus_idx" ON "GuaranteeBreach"("refundStatus");

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "Observation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Execution" ADD CONSTRAINT "Execution_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Execution" ADD CONSTRAINT "Execution_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Memory" ADD CONSTRAINT "Memory_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositTransaction" ADD CONSTRAINT "DepositTransaction_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "ProtocolSponsor"("protocolId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovedAgent" ADD CONSTRAINT "ApprovedAgent_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "ProtocolSponsor"("protocolId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingEvent" ADD CONSTRAINT "OnboardingEvent_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "ProtocolSponsor"("protocolId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyOverride" ADD CONSTRAINT "PolicyOverride_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "ProtocolSponsor"("protocolId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuntimeOverride" ADD CONSTRAINT "RuntimeOverride_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "ProtocolSponsor"("protocolId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockedWallet" ADD CONSTRAINT "BlockedWallet_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "ProtocolSponsor"("protocolId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DelegationUsage" ADD CONSTRAINT "DelegationUsage_delegationId_fkey" FOREIGN KEY ("delegationId") REFERENCES "Delegation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionGuarantee" ADD CONSTRAINT "ExecutionGuarantee_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "ProtocolSponsor"("protocolId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuaranteeUsage" ADD CONSTRAINT "GuaranteeUsage_guaranteeId_fkey" FOREIGN KEY ("guaranteeId") REFERENCES "ExecutionGuarantee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuaranteeBreach" ADD CONSTRAINT "GuaranteeBreach_guaranteeId_fkey" FOREIGN KEY ("guaranteeId") REFERENCES "ExecutionGuarantee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

