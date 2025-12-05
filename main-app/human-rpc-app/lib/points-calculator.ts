import type { PrismaClient } from "@prisma/client"
import { updateUserRank } from "./rank-calculator"
import { applyStakePenalty } from "./stake-penalty"
import { recordVoteAccuracy } from "./god-mode-tracker"

/**
 * Calculate and update user points based on vote accuracy
 * 
 * Points calculation:
 * - +3 points if user's vote matches final consensus
 * - -1 point if user's vote is opposite of consensus
 * 
 * Enhanced with:
 * - Rank-based penalties for wrong answers
 * - Accuracy tracking for God Mode badge
 * - Automatic rank updates
 * 
 * @param prisma - Prisma client instance
 * @param taskId - Task ID that reached consensus
 * @param consensusDecision - Final consensus decision ("yes" or "no")
 * @returns Promise resolving to number of users whose points were updated
 */
export async function calculateAndUpdatePoints(
  prisma: PrismaClient,
  taskId: string,
  consensusDecision: "yes" | "no"
): Promise<number> {
  try {
    console.log("[Points Calculator] Calculating points for task:", taskId, "consensus:", consensusDecision)

    // Get all votes for this task
    const prismaAny = prisma as any
    const voteModel = prismaAny.vote
    const userModel = prismaAny.user

    const votes = await voteModel.findMany({
      where: {
        taskId: taskId,
        userId: { not: null }, // Only process votes with associated users
      },
      include: {
        user: true,
      },
    })

    if (votes.length === 0) {
      console.log("[Points Calculator] No votes with associated users found for task:", taskId)
      return 0
    }

    console.log(`[Points Calculator] Found ${votes.length} votes to process`)

    // Update points for each user atomically
    let updatedCount = 0
    const updatePromises = votes.map(async (vote: any) => {
      if (!vote.userId || !vote.user) {
        return // Skip votes without associated users
      }

      const userVote = vote.decision
      const isCorrect = userVote === consensusDecision
      const pointsChange = isCorrect ? 3 : -1

      try {
        // Get user's current rank before updating
        const userBefore = await userModel.findUnique({
          where: { id: vote.userId },
          select: {
            id: true,
            rank: true,
            points: true,
            totalVotes: true,
            correctVotes: true,
          },
        })

        if (!userBefore) {
          return // User not found, skip
        }

        const userRank = userBefore.rank || "CADET"
        const currentPoints = userBefore.points || 0

        // Calculate new points (but don't apply yet - need to handle Cadet penalty)
        let newPoints = currentPoints + pointsChange

        // Apply rank-based penalties for wrong answers
        if (!isCorrect) {
          if (userRank === "CADET") {
            // Cadet penalty: Reset points to 0 (XP bar reset)
            newPoints = 0
          }
          // Officer and Arbiter penalties are handled in applyStakePenalty (stake burning/banning)
        }

        // Update user with points, vote counts, and accuracy tracking
        const updatedUser = await userModel.update({
          where: { id: vote.userId },
          data: {
            points: newPoints < 0 ? 0 : newPoints, // Never go below 0
            totalVotes: {
              increment: 1,
            },
            correctVotes: isCorrect
              ? {
                  increment: 1,
                }
              : undefined,
          },
          select: {
            id: true,
            email: true,
            points: true,
            totalVotes: true,
            correctVotes: true,
            rank: true,
          },
        })

        console.log(
          `[Points Calculator] Updated points for user ${updatedUser.email}: ${
            pointsChange > 0 ? "+" : ""
          }${pointsChange} points (vote: ${userVote}, consensus: ${consensusDecision}), new total: ${
            updatedUser.points
          }`
        )

        // Record vote accuracy for God Mode tracking
        try {
          await recordVoteAccuracy(prisma, vote.userId, taskId, userVote, consensusDecision, isCorrect)
        } catch (accuracyError: any) {
          console.error(`[Points Calculator] Failed to record vote accuracy:`, accuracyError)
          // Non-critical, continue
        }

        // Apply rank-based penalties for wrong answers (after points update)
        if (!isCorrect) {
          try {
            await applyStakePenalty(prisma, vote.userId, taskId, userRank as any)
          } catch (penaltyError: any) {
            console.error(`[Points Calculator] Failed to apply penalty:`, penaltyError)
            // Non-critical, continue
          }
        }

        // Update user rank (may have changed due to points change)
        try {
          await updateUserRank(prisma, vote.userId)
        } catch (rankError: any) {
          console.error(`[Points Calculator] Failed to update rank:`, rankError)
          // Non-critical, continue
        }

        // If the user's total points went negative (shouldn't happen with new logic, but keep as safety)
        if (updatedUser.points < 0) {
          await userModel.update({
            where: { id: updatedUser.id },
            data: {
              points: 0,
            },
          })
          console.log(
            `[Points Calculator] Reset negative points to 0 for user ${updatedUser.email}`
          )
        }

        updatedCount++
      } catch (error: any) {
        console.error(
          `[Points Calculator] Failed to update user ${vote.userId}:`,
          error?.message || error
        )
        // Continue processing other users even if one fails
      }
    })

    await Promise.all(updatePromises)

    console.log(`[Points Calculator] Successfully updated points for ${updatedCount} users`)
    return updatedCount
  } catch (error: any) {
    console.error("[Points Calculator] Error calculating points:", error)
    throw new Error(`Failed to calculate points: ${error?.message || "Unknown error"}`)
  }
}

