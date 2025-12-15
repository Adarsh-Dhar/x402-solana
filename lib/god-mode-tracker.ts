import type { PrismaClient } from "@prisma/client"

/**
 * Check if user has maintained 100% accuracy for 30 consecutive days
 * and award God Mode badge if eligible
 * 
 * @param prisma - Prisma client instance
 * @param userId - User ID to check
 * @returns Promise resolving to true if badge was awarded, false otherwise
 */
export async function checkAndAwardGodModeBadge(
  prisma: PrismaClient,
  userId: string
): Promise<boolean> {
  try {
    const prismaAny = prisma as any
    const userModel = prismaAny.user
    const voteAccuracyModel = prismaAny.voteAccuracy

    // Get user's current badge status
    const user = await userModel.findUnique({
      where: { id: userId },
      select: {
        id: true,
        godModeBadge: true,
        godModeBadgeEarnedAt: true,
        accuracy30DayStart: true,
        consecutiveCorrectDays: true,
      },
    })

    if (!user) {
      console.error("[God Mode Tracker] User not found:", userId)
      return false
    }

    // If already has badge, no need to check again
    if (user.godModeBadge) {
      return false
    }

    // Get all votes from the last 30 days
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const recentVotes = await voteAccuracyModel.findMany({
      where: {
        userId,
        createdAt: {
          gte: thirtyDaysAgo,
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    })

    if (recentVotes.length === 0) {
      // No votes in last 30 days, reset tracking
      await userModel.update({
        where: { id: userId },
        data: {
          accuracy30DayStart: null,
          consecutiveCorrectDays: 0,
        },
      })
      return false
    }

    // Check if all votes in the last 30 days are correct
    const allCorrect = recentVotes.every((vote: any) => vote.isCorrect)

    if (!allCorrect) {
      // Not 100% accurate, reset consecutive days
      await userModel.update({
        where: { id: userId },
        data: {
          accuracy30DayStart: null,
          consecutiveCorrectDays: 0,
        },
      })
      return false
    }

    // All votes are correct - check if we have 30 consecutive days
    // Group votes by day and check for 30 consecutive days
    const votesByDay = new Map<string, number>()
    
    for (const vote of recentVotes) {
      const dayKey = vote.createdAt.toISOString().split("T")[0]
      votesByDay.set(dayKey, (votesByDay.get(dayKey) || 0) + 1)
    }

    const sortedDays = Array.from(votesByDay.keys()).sort()
    
    if (sortedDays.length < 30) {
      // Don't have 30 days of voting yet
      const startDate = sortedDays[0] ? new Date(sortedDays[0]) : null
      await userModel.update({
        where: { id: userId },
        data: {
          accuracy30DayStart: startDate,
          consecutiveCorrectDays: sortedDays.length,
        },
      })
      return false
    }

    // Check if we have 30 consecutive days
    let consecutiveDays = 1
    let maxConsecutive = 1

    for (let i = 1; i < sortedDays.length; i++) {
      const prevDate = new Date(sortedDays[i - 1])
      const currDate = new Date(sortedDays[i])
      const daysDiff = Math.floor((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24))

      if (daysDiff === 1) {
        consecutiveDays++
        maxConsecutive = Math.max(maxConsecutive, consecutiveDays)
      } else {
        consecutiveDays = 1
      }
    }

    // Also check if the period spans exactly 30 days
    const firstDay = new Date(sortedDays[0])
    const lastDay = new Date(sortedDays[sortedDays.length - 1])
    const totalDaysSpan = Math.floor((lastDay.getTime() - firstDay.getTime()) / (1000 * 60 * 60 * 24)) + 1

    // Award badge if we have 30 consecutive days OR if the period spans 30+ days with all correct votes
    if (maxConsecutive >= 30 || (totalDaysSpan >= 30 && allCorrect)) {
      await userModel.update({
        where: { id: userId },
        data: {
          godModeBadge: true,
          godModeBadgeEarnedAt: new Date(),
          consecutiveCorrectDays: maxConsecutive,
        },
      })

      console.log(`[God Mode Tracker] Awarded God Mode badge to user ${userId}`)
      return true
    }

    // Update tracking but don't award badge yet
    await userModel.update({
      where: { id: userId },
      data: {
        accuracy30DayStart: firstDay,
        consecutiveCorrectDays: maxConsecutive,
      },
    })

    return false
  } catch (error: any) {
    console.error("[God Mode Tracker] Error checking badge eligibility:", error)
    return false
  }
}

/**
 * Record a vote accuracy for God Mode tracking
 * This should be called after consensus is reached
 * 
 * @param prisma - Prisma client instance
 * @param userId - User ID
 * @param taskId - Task ID
 * @param voteDecision - User's vote decision
 * @param consensusDecision - Final consensus decision
 * @param isCorrect - Whether the user was correct
 */
export async function recordVoteAccuracy(
  prisma: PrismaClient,
  userId: string,
  taskId: string,
  voteDecision: "yes" | "no",
  consensusDecision: "yes" | "no",
  isCorrect: boolean
): Promise<void> {
  try {
    const prismaAny = prisma as any
    const voteAccuracyModel = prismaAny.voteAccuracy

    await voteAccuracyModel.create({
      data: {
        userId,
        taskId,
        voteDecision,
        consensusDecision,
        isCorrect,
      },
    })

    // Check if user is now eligible for God Mode badge
    await checkAndAwardGodModeBadge(prisma, userId)
  } catch (error: any) {
    console.error("[God Mode Tracker] Error recording vote accuracy:", error)
    // Don't throw - this is non-critical
  }
}

