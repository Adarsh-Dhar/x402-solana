import type { PrismaClient } from "@prisma/client"
import { createConsensusNotification } from "./notifications"
import type { UserRank } from "./rank-calculator"

export type PenaltyType = "CADET_XP_RESET" | "OFFICER_STAKE_BURN" | "ARBITER_CORRUPTION"

/**
 * Apply rank-based penalty for incorrect vote
 * 
 * Penalties:
 * - CADET: Reset points to 0 (XP bar reset)
 * - OFFICER: Burn 50% of stakeAmount
 * - ARBITER: Check for corruption pattern, if detected: ban + drain wallet
 * 
 * @param prisma - Prisma client instance
 * @param userId - User ID to penalize
 * @param taskId - Task ID where the incorrect vote occurred
 * @param userRank - User's current rank
 * @returns Promise resolving to the penalty type applied
 */
export async function applyStakePenalty(
  prisma: PrismaClient,
  userId: string,
  taskId: string,
  userRank: UserRank | null
): Promise<PenaltyType | null> {
  try {
    const prismaAny = prisma as any
    const userModel = prismaAny.user

    const rank = userRank || "CADET"

    switch (rank) {
      case "CADET":
        return await applyCadetPenalty(prisma, userId, taskId)

      case "OFFICER":
        return await applyOfficerPenalty(prisma, userId, taskId)

      case "ARBITER":
        return await applyArbiterPenalty(prisma, userId, taskId)

      default:
        // Unknown rank, apply cadet penalty as default
        return await applyCadetPenalty(prisma, userId, taskId)
    }
  } catch (error: any) {
    console.error("[Stake Penalty] Error applying penalty:", error)
    return null
  }
}

/**
 * Apply Cadet penalty: Reset points to 0 (XP bar reset)
 */
async function applyCadetPenalty(
  prisma: PrismaClient,
  userId: string,
  taskId: string
): Promise<PenaltyType> {
  try {
    const prismaAny = prisma as any
    const userModel = prismaAny.user

    // Get current points
    const user = await userModel.findUnique({
      where: { id: userId },
      select: { points: true },
    })

    const currentPoints = user?.points || 0

    // Reset points to 0
    await userModel.update({
      where: { id: userId },
      data: {
        points: 0,
      },
    })

    // Create notification
    await createConsensusNotification(prisma, {
      kind: "PENALTY_CADET_XP_RESET",
      userId,
      taskId,
      pointsDelta: -currentPoints,
    })

    console.log(`[Stake Penalty] Applied Cadet penalty to user ${userId}: Reset ${currentPoints} points to 0`)
    return "CADET_XP_RESET"
  } catch (error: any) {
    console.error("[Stake Penalty] Error applying Cadet penalty:", error)
    throw error
  }
}

/**
 * Apply Officer penalty: Burn 50% of stakeAmount
 */
async function applyOfficerPenalty(
  prisma: PrismaClient,
  userId: string,
  taskId: string
): Promise<PenaltyType> {
  try {
    const prismaAny = prisma as any
    const userModel = prismaAny.user

    // Get current stake
    const user = await userModel.findUnique({
      where: { id: userId },
      select: {
        stakeAmount: true,
        points: true,
      },
    })

    if (!user || !user.stakeAmount) {
      // No stake to burn, just log
      console.log(`[Stake Penalty] User ${userId} has no stake to burn`)
      return "OFFICER_STAKE_BURN"
    }

    const currentStake = parseFloat(user.stakeAmount.toString())
    const penaltyAmount = currentStake * 0.5
    const newStake = currentStake - penaltyAmount

    // Update stake amount (burn 50%)
    await userModel.update({
      where: { id: userId },
      data: {
        stakeAmount: newStake,
      },
    })

    // Create notification
    await createConsensusNotification(prisma, {
      kind: "PENALTY_OFFICER_STAKE_BURN",
      userId,
      taskId,
      metadata: {
        penaltyAmount,
        previousStake: currentStake,
        newStake,
      },
    })

    console.log(
      `[Stake Penalty] Applied Officer penalty to user ${userId}: Burned ${penaltyAmount} (50% of ${currentStake}), new stake: ${newStake}`
    )
    return "OFFICER_STAKE_BURN"
  } catch (error: any) {
    console.error("[Stake Penalty] Error applying Officer penalty:", error)
    throw error
  }
}

/**
 * Apply Arbiter penalty: Check for corruption pattern, if detected: ban + drain wallet
 * 
 * Corruption pattern: Multiple incorrect votes in a short period (e.g., 3+ wrong votes in 24 hours)
 */
async function applyArbiterPenalty(
  prisma: PrismaClient,
  userId: string,
  taskId: string
): Promise<PenaltyType> {
  try {
    const prismaAny = prisma as any
    const userModel = prismaAny.user
    const voteAccuracyModel = prismaAny.voteAccuracy

    // Check for corruption pattern: count incorrect votes in last 24 hours
    const twentyFourHoursAgo = new Date()
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24)

    const recentIncorrectVotes = await voteAccuracyModel.findMany({
      where: {
        userId,
        isCorrect: false,
        createdAt: {
          gte: twentyFourHoursAgo,
        },
      },
    })

    const incorrectCount = recentIncorrectVotes.length

    // Corruption threshold: 3+ incorrect votes in 24 hours
    const CORRUPTION_THRESHOLD = 3

    if (incorrectCount >= CORRUPTION_THRESHOLD) {
      // Corruption detected: ban + drain wallet
      const user = await userModel.findUnique({
        where: { id: userId },
        select: {
          stakeAmount: true,
        },
      })

      const stakeToDrain = user?.stakeAmount || 0

      await userModel.update({
        where: { id: userId },
        data: {
          isBanned: true,
          stakeAmount: 0, // Drain wallet
        },
      })

      // Create notification
      await createConsensusNotification(prisma, {
        kind: "PENALTY_ARBITER_CORRUPTION",
        userId,
        taskId,
        metadata: {
          incorrectVotesIn24h: incorrectCount,
          stakeDrained: parseFloat(stakeToDrain.toString()),
        },
      })

      console.log(
        `[Stake Penalty] Applied Arbiter corruption penalty to user ${userId}: Banned and drained ${stakeToDrain} stake (${incorrectCount} incorrect votes in 24h)`
      )
      return "ARBITER_CORRUPTION"
    } else {
      // No corruption pattern yet, just log the incorrect vote
      console.log(
        `[Stake Penalty] Arbiter ${userId} had incorrect vote (${incorrectCount}/${CORRUPTION_THRESHOLD} incorrect votes in 24h)`
      )
      return "ARBITER_CORRUPTION" // Still return the type, but no action taken
    }
  } catch (error: any) {
    console.error("[Stake Penalty] Error applying Arbiter penalty:", error)
    throw error
  }
}

