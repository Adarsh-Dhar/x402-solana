-- CreateTable
CREATE TABLE "PhaseTransition" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "fromPhase" INTEGER NOT NULL,
    "toPhase" INTEGER,
    "reason" TEXT NOT NULL,
    "voterCount" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhaseTransition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoterEligibility" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phase" INTEGER NOT NULL,
    "eligible" BOOLEAN NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoterEligibility_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PhaseTransition_taskId_idx" ON "PhaseTransition"("taskId");

-- CreateIndex
CREATE INDEX "PhaseTransition_timestamp_idx" ON "PhaseTransition"("timestamp");

-- CreateIndex
CREATE INDEX "VoterEligibility_taskId_phase_idx" ON "VoterEligibility"("taskId", "phase");

-- CreateIndex
CREATE INDEX "VoterEligibility_userId_phase_idx" ON "VoterEligibility"("userId", "phase");

-- CreateIndex
CREATE UNIQUE INDEX "VoterEligibility_taskId_userId_phase_key" ON "VoterEligibility"("taskId", "userId", "phase");

-- CreateIndex
CREATE INDEX "Task_currentPhase_idx" ON "Task"("currentPhase");

-- AddForeignKey
ALTER TABLE "PhaseTransition" ADD CONSTRAINT "PhaseTransition_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoterEligibility" ADD CONSTRAINT "VoterEligibility_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoterEligibility" ADD CONSTRAINT "VoterEligibility_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
