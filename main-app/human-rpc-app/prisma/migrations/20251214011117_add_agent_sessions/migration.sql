-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "agentSessionId" TEXT;

-- CreateTable
CREATE TABLE "AgentSession" (
    "id" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastHeartbeat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentSession_agentName_status_idx" ON "AgentSession"("agentName", "status");

-- CreateIndex
CREATE INDEX "AgentSession_walletAddress_status_idx" ON "AgentSession"("walletAddress", "status");

-- CreateIndex
CREATE INDEX "AgentSession_lastHeartbeat_idx" ON "AgentSession"("lastHeartbeat");

-- CreateIndex
CREATE INDEX "Task_agentSessionId_idx" ON "Task"("agentSessionId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_agentSessionId_fkey" FOREIGN KEY ("agentSessionId") REFERENCES "AgentSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
