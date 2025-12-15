-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "aiCertainty" DECIMAL(3,2),
ADD COLUMN     "consensusThreshold" DECIMAL(3,2),
ADD COLUMN     "currentVoteCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "noVotes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "requiredVoters" INTEGER DEFAULT 3,
ADD COLUMN     "yesVotes" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Vote" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT,
    "decision" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Vote_taskId_idx" ON "Vote"("taskId");

-- CreateIndex
CREATE INDEX "Vote_userId_idx" ON "Vote"("userId");

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
