-- CreateTable
CREATE TABLE "SponsoredMethod" (
    "id" TEXT NOT NULL,
    "commandName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "riskTier" TEXT NOT NULL,
    "isPremium" BOOLEAN NOT NULL DEFAULT false,
    "defaultDailyLimit" INTEGER NOT NULL DEFAULT 10,
    "defaultTotalLimit" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SponsoredMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAgentPolicy" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "protocolId" TEXT NOT NULL,
    "agentAddress" TEXT,
    "sponsoredMethodId" TEXT NOT NULL,
    "dailyLimit" INTEGER NOT NULL,
    "totalLimit" INTEGER NOT NULL,
    "windowHours" INTEGER NOT NULL DEFAULT 24,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAgentPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicySnapshot" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "snapshotJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductExecutionRecord" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "protocolId" TEXT NOT NULL,
    "policyId" TEXT,
    "policySnapshotId" TEXT,
    "openClawAuditId" TEXT,
    "rawUserText" TEXT NOT NULL,
    "parsedCommand" TEXT NOT NULL,
    "policyDecision" TEXT NOT NULL,
    "policyReason" TEXT,
    "summaryText" TEXT,
    "success" BOOLEAN NOT NULL,
    "txHash" TEXT,
    "decisionHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductExecutionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entitlement" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'FREE',
    "expiresAt" TIMESTAMP(3),
    "orgId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Entitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlOnboardingState" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "completionPct" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ControlOnboardingState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SponsoredMethod_commandName_key" ON "SponsoredMethod"("commandName");

-- CreateIndex
CREATE INDEX "UserAgentPolicy_sessionId_idx" ON "UserAgentPolicy"("sessionId");

-- CreateIndex
CREATE INDEX "UserAgentPolicy_protocolId_idx" ON "UserAgentPolicy"("protocolId");

-- CreateIndex
CREATE UNIQUE INDEX "UserAgentPolicy_sessionId_sponsoredMethodId_key" ON "UserAgentPolicy"("sessionId", "sponsoredMethodId");

-- CreateIndex
CREATE INDEX "PolicySnapshot_policyId_idx" ON "PolicySnapshot"("policyId");

-- CreateIndex
CREATE INDEX "ProductExecutionRecord_sessionId_createdAt_idx" ON "ProductExecutionRecord"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "ProductExecutionRecord_protocolId_createdAt_idx" ON "ProductExecutionRecord"("protocolId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Entitlement_sessionId_key" ON "Entitlement"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "ControlOnboardingState_sessionId_key" ON "ControlOnboardingState"("sessionId");

-- AddForeignKey
ALTER TABLE "UserAgentPolicy" ADD CONSTRAINT "UserAgentPolicy_sponsoredMethodId_fkey" FOREIGN KEY ("sponsoredMethodId") REFERENCES "SponsoredMethod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicySnapshot" ADD CONSTRAINT "PolicySnapshot_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "UserAgentPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductExecutionRecord" ADD CONSTRAINT "ProductExecutionRecord_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "UserAgentPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductExecutionRecord" ADD CONSTRAINT "ProductExecutionRecord_policySnapshotId_fkey" FOREIGN KEY ("policySnapshotId") REFERENCES "PolicySnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
