import type { PrismaClient } from "@prisma/client"

type ConsensusNotificationKind =
  | "CONSENSUS_WIN"
  | "CONSENSUS_LOSS"
  | "CONSENSUS_STAGE_CHANGE"
  | "CONSENSUS_FINAL_NO_CONSENSUS"
  | "PENALTY_CADET_XP_RESET"
  | "PENALTY_OFFICER_STAKE_BURN"
  | "PENALTY_ARBITER_CORRUPTION"

interface BaseConsensusNotificationPayload {
  userId: string
  taskId: string
}

interface ConsensusWinLossPayload extends BaseConsensusNotificationPayload {
  kind: "CONSENSUS_WIN" | "CONSENSUS_LOSS"
  pointsDelta: number
  solDeltaLamports?: number
}

interface ConsensusStageChangePayload extends BaseConsensusNotificationPayload {
  kind: "CONSENSUS_STAGE_CHANGE"
  fromStage: number
  toStage: number
}

interface ConsensusFinalNoConsensusPayload extends BaseConsensusNotificationPayload {
  kind: "CONSENSUS_FINAL_NO_CONSENSUS"
}

interface PenaltyCadetXpResetPayload extends BaseConsensusNotificationPayload {
  kind: "PENALTY_CADET_XP_RESET"
  pointsDelta: number
}

interface PenaltyOfficerStakeBurnPayload extends BaseConsensusNotificationPayload {
  kind: "PENALTY_OFFICER_STAKE_BURN"
  metadata?: {
    penaltyAmount: number
    previousStake: number
    newStake: number
  }
}

interface PenaltyArbiterCorruptionPayload extends BaseConsensusNotificationPayload {
  kind: "PENALTY_ARBITER_CORRUPTION"
  metadata?: {
    incorrectVotesIn24h: number
    stakeDrained: number
  }
}

export type CreateConsensusNotificationPayload =
  | ConsensusWinLossPayload
  | ConsensusStageChangePayload
  | ConsensusFinalNoConsensusPayload
  | PenaltyCadetXpResetPayload
  | PenaltyOfficerStakeBurnPayload
  | PenaltyArbiterCorruptionPayload

export async function createConsensusNotification(
  prisma: PrismaClient,
  payload: CreateConsensusNotificationPayload
) {
  const { userId, taskId } = payload

  let title = ""
  let body = ""
  let type: ConsensusNotificationKind = payload.kind

  if (payload.kind === "CONSENSUS_WIN") {
    const points = payload.pointsDelta
    const sol = payload.solDeltaLamports ? payload.solDeltaLamports / 1_000_000_000 : 0
    title = "Consensus Win"
    body =
      sol > 0
        ? `You aligned with consensus on task ${taskId}. +${points} points, +${sol.toFixed(4)} SOL.`
        : `You aligned with consensus on task ${taskId}. +${points} points.`
  } else if (payload.kind === "CONSENSUS_LOSS") {
    const points = payload.pointsDelta
    title = "Consensus Loss"
    body = `Your vote disagreed with consensus on task ${taskId}. ${points < 0 ? points : -Math.abs(points)} points.`
  } else if (payload.kind === "CONSENSUS_STAGE_CHANGE") {
    const { fromStage, toStage } = payload
    title = "Consensus Not Reached"
    body = `Task ${taskId} did not reach consensus in Phase ${fromStage} and is moving to Phase ${toStage} for additional review.`
  } else if (payload.kind === "CONSENSUS_FINAL_NO_CONSENSUS") {
    title = "Consensus Failed"
    body = `Task ${taskId} did not reach consensus after all voting phases.`
  } else if (payload.kind === "PENALTY_CADET_XP_RESET") {
    const points = payload.pointsDelta
    title = "XP Reset - Wrong Answer"
    body = `Your points have been reset to 0 due to an incorrect vote on task ${taskId}. Lost ${Math.abs(points)} points.`
  } else if (payload.kind === "PENALTY_OFFICER_STAKE_BURN") {
    const metadata = payload.metadata
    title = "Stake Penalty - Wrong Answer"
    body = metadata
      ? `50% of your stake has been burned due to an incorrect vote on task ${taskId}. Lost $${metadata.penaltyAmount.toFixed(2)} (was $${metadata.previousStake.toFixed(2)}, now $${metadata.newStake.toFixed(2)}).`
      : `50% of your stake has been burned due to an incorrect vote on task ${taskId}.`
  } else if (payload.kind === "PENALTY_ARBITER_CORRUPTION") {
    const metadata = payload.metadata
    title = "Account Banned - Corruption Detected"
    body = metadata
      ? `Your account has been permanently banned and your stake drained ($${metadata.stakeDrained.toFixed(2)}) due to ${metadata.incorrectVotesIn24h} incorrect votes in 24 hours.`
      : `Your account has been permanently banned due to corruption.`
  }

  const prismaAny = prisma as any
  const notificationModel = prismaAny.notification

  if (!notificationModel) {
    console.error("[Notifications] Notification model not found on Prisma client")
    return
  }

  return notificationModel.create({
    data: {
      userId,
      type,
      title,
      body,
      metadata: payload as any,
    },
  })
}


