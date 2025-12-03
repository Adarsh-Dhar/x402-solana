import type { PrismaClient } from "@prisma/client"

/**
 * Calculate and update user points based on vote accuracy
 * 
 * Points calculation:
 * - +3 points if user's vote matches final consensus
 * - -1 point if user's vote is opposite of consensus
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
      const pointsChange = userVote === consensusDecision ? 3 : -1

      try {
        // Use atomic update to prevent race conditions
        await userModel.update({
          where: { id: vote.userId },
          data: {
            points: {
              increment: pointsChange,
            },
          },
        })

        console.log(
          `[Points Calculator] Updated points for user ${vote.user.email}: ${pointsChange > 0 ? "+" : ""}${pointsChange} points (vote: ${userVote}, consensus: ${consensusDecision})`
        )
        updatedCount++
      } catch (error: any) {
        console.error(
          `[Points Calculator] Failed to update points for user ${vote.userId}:`,
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

