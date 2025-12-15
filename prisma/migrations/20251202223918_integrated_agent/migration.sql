-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "agentName" TEXT,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "context" JSONB,
ADD COLUMN     "escrowAmount" TEXT,
ADD COLUMN     "reward" TEXT,
ADD COLUMN     "rewardAmount" DECIMAL(10,2);
