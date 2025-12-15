-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "taskTier" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "accuracy30DayStart" TIMESTAMP(3),
ADD COLUMN     "consecutiveCorrectDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "correctVotes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "godModeBadge" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "godModeBadgeEarnedAt" TIMESTAMP(3),
ADD COLUMN     "isBanned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rank" TEXT,
ADD COLUMN     "rankUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "totalVotes" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "VoteAccuracy" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "voteDecision" TEXT NOT NULL,
    "consensusDecision" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoteAccuracy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VoteAccuracy_userId_createdAt_idx" ON "VoteAccuracy"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "VoteAccuracy_taskId_idx" ON "VoteAccuracy"("taskId");

-- AddForeignKey
ALTER TABLE "VoteAccuracy" ADD CONSTRAINT "VoteAccuracy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoteAccuracy" ADD CONSTRAINT "VoteAccuracy_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
