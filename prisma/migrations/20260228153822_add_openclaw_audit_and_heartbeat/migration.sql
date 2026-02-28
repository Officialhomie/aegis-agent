-- CreateTable
CREATE TABLE "OpenClawAudit" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "protocolId" TEXT NOT NULL,
    "userPhoneHash" TEXT,
    "commandName" TEXT NOT NULL,
    "commandArgs" JSONB NOT NULL,
    "rawInput" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "success" BOOLEAN NOT NULL,
    "errorMessage" TEXT,
    "executionMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpenClawAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HeartbeatSchedule" (
    "id" TEXT NOT NULL,
    "protocolId" TEXT NOT NULL,
    "agentAddress" TEXT NOT NULL,
    "intervalMs" INTEGER NOT NULL DEFAULT 900000,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastBeatAt" TIMESTAMP(3),
    "nextBeatAt" TIMESTAMP(3),
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HeartbeatSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HeartbeatRecord" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "txHash" TEXT,
    "success" BOOLEAN NOT NULL,
    "latencyMs" INTEGER,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HeartbeatRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OpenClawAudit_sessionId_idx" ON "OpenClawAudit"("sessionId");

-- CreateIndex
CREATE INDEX "OpenClawAudit_protocolId_createdAt_idx" ON "OpenClawAudit"("protocolId", "createdAt");

-- CreateIndex
CREATE INDEX "OpenClawAudit_commandName_idx" ON "OpenClawAudit"("commandName");

-- CreateIndex
CREATE INDEX "HeartbeatSchedule_isActive_nextBeatAt_idx" ON "HeartbeatSchedule"("isActive", "nextBeatAt");

-- CreateIndex
CREATE UNIQUE INDEX "HeartbeatSchedule_protocolId_agentAddress_key" ON "HeartbeatSchedule"("protocolId", "agentAddress");

-- CreateIndex
CREATE INDEX "HeartbeatRecord_scheduleId_createdAt_idx" ON "HeartbeatRecord"("scheduleId", "createdAt");

-- AddForeignKey
ALTER TABLE "HeartbeatRecord" ADD CONSTRAINT "HeartbeatRecord_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "HeartbeatSchedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
