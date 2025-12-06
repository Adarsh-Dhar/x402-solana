-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "avatarUrl" TEXT,
    "confidenceThreshold" DECIMAL(3,2) NOT NULL,
    "maxDailyBudget" DECIMAL(10,2) NOT NULL,
    "responseTime" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "apiKeyHash" TEXT NOT NULL,
    "balance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "walletAddress" TEXT,
    "onChainAddress" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "autoRefuelEnabled" BOOLEAN NOT NULL DEFAULT false,
    "autoRefuelThreshold" DECIMAL(10,2),
    "autoRefuelAmount" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentActivity" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "taskId" TEXT,
    "query" TEXT NOT NULL,
    "aiConfidence" DECIMAL(3,2),
    "status" TEXT NOT NULL,
    "humanVerdict" TEXT,
    "cost" DECIMAL(10,2),
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentTransaction" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "signature" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Agent_agentId_key" ON "Agent"("agentId");

-- CreateIndex
CREATE INDEX "Agent_userId_idx" ON "Agent"("userId");

-- CreateIndex
CREATE INDEX "Agent_agentId_idx" ON "Agent"("agentId");

-- CreateIndex
CREATE INDEX "AgentActivity_agentId_timestamp_idx" ON "AgentActivity"("agentId", "timestamp");

-- CreateIndex
CREATE INDEX "AgentActivity_taskId_idx" ON "AgentActivity"("taskId");

-- CreateIndex
CREATE INDEX "AgentTransaction_agentId_createdAt_idx" ON "AgentTransaction"("agentId", "createdAt");

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentActivity" ADD CONSTRAINT "AgentActivity_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTransaction" ADD CONSTRAINT "AgentTransaction_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
