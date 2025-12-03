import type { PrismaClient } from "@prisma/client"

type ConsensusNotificationKind =
  | "CONSENSUS_WIN"
  | "CONSENSUS_LOSS"
  | "CONSENSUS_STAGE_CHANGE"
  | "CONSENSUS_FINAL_NO_CONSENSUS"

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

export type CreateConsensusNotificationPayload =
  | ConsensusWinLossPayload
  | ConsensusStageChangePayload
  | ConsensusFinalNoConsensusPayload

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


