import type { PrismaClient } from "@prisma/client"

export type UserRank = "CADET" | "OFFICER" | "ARBITER"

/**
 * Calculate user rank based on leaderboard percentile
 * 
 * Rank distribution:
 * - Top 10% → ARBITER
 * - 50-90% → OFFICER
 * - 0-50% → CADET
 * 
 * @param prisma - Prisma client instance
 * @param userId - User ID to calculate rank for
 * @returns Promise resolving to the user's rank
 */
export async function calculateUserRank(
  prisma: PrismaClient,
  userId: string
): Promise<UserRank> {
  try {
    const prismaAny = prisma as any
    const userModel = prismaAny.user

    // Get all users ordered by points (descending)
    const allUsers = await userModel.findMany({
      select: {
        id: true,
        points: true,
      },
      orderBy: [
        { points: "desc" },
        { createdAt: "asc" }, // Tie-breaker: older users rank higher
      ],
    })

    if (allUsers.length === 0) {
      return "CADET" // Default rank if no users
    }

    // Find the user's position
    const userIndex = allUsers.findIndex((u: any) => u.id === userId)
    
    if (userIndex === -1) {
      return "CADET" // User not found, default to Cadet
    }

    // Calculate percentile: (users above / total users) * 100
    const usersAbove = userIndex
    const totalUsers = allUsers.length
    const percentile = (usersAbove / totalUsers) * 100

    // Handle ties: if multiple users have same points, they get same rank
    const userPoints = allUsers[userIndex].points
    let actualUsersAbove = usersAbove
    
    // Count users with strictly higher points
    for (let i = userIndex - 1; i >= 0; i--) {
      if (allUsers[i].points > userPoints) {
        actualUsersAbove = i + 1
        break
      }
    }

    const actualPercentile = (actualUsersAbove / totalUsers) * 100

    // Assign rank based on percentile
    if (actualPercentile >= 90) {
      return "ARBITER" // Top 10%
    } else if (actualPercentile >= 50) {
      return "OFFICER" // 50-90%
    } else {
      return "CADET" // 0-50%
    }
  } catch (error: any) {
    console.error("[Rank Calculator] Error calculating rank:", error)
    return "CADET" // Default to Cadet on error
  }
}

/**
 * Update user's rank in the database
 * 
 * @param prisma - Prisma client instance
 * @param userId - User ID to update
 * @returns Promise resolving to the updated rank
 */
export async function updateUserRank(
  prisma: PrismaClient,
  userId: string
): Promise<UserRank> {
  try {
    const prismaAny = prisma as any
    const userModel = prismaAny.user

    const newRank = await calculateUserRank(prisma, userId)

    await userModel.update({
      where: { id: userId },
      data: {
        rank: newRank,
        rankUpdatedAt: new Date(),
      },
    })

    console.log(`[Rank Calculator] Updated rank for user ${userId}: ${newRank}`)
    return newRank
  } catch (error: any) {
    console.error("[Rank Calculator] Error updating rank:", error)
    throw new Error(`Failed to update user rank: ${error?.message || "Unknown error"}`)
  }
}

/**
 * Calculate and update ranks for all users
 * Useful for batch updates or initial rank assignment
 * 
 * @param prisma - Prisma client instance
 * @returns Promise resolving to number of users updated
 */
export async function updateAllUserRanks(
  prisma: PrismaClient
): Promise<number> {
  try {
    const prismaAny = prisma as any
    const userModel = prismaAny.user

    // Get all users ordered by points
    const allUsers = await userModel.findMany({
      select: {
        id: true,
        points: true,
      },
      orderBy: [
        { points: "desc" },
        { createdAt: "asc" },
      ],
    })

    if (allUsers.length === 0) {
      return 0
    }

    const totalUsers = allUsers.length
    let updatedCount = 0

    // Calculate rank for each user
    for (let i = 0; i < allUsers.length; i++) {
      const user = allUsers[i]
      const usersAbove = i
      
      // Handle ties
      let actualUsersAbove = usersAbove
      for (let j = i - 1; j >= 0; j--) {
        if (allUsers[j].points > user.points) {
          actualUsersAbove = j + 1
          break
        }
      }

      const percentile = (actualUsersAbove / totalUsers) * 100
      let rank: UserRank = "CADET"

      if (percentile >= 90) {
        rank = "ARBITER"
      } else if (percentile >= 50) {
        rank = "OFFICER"
      }

      // Update user rank
      try {
        await userModel.update({
          where: { id: user.id },
          data: {
            rank,
            rankUpdatedAt: new Date(),
          },
        })
        updatedCount++
      } catch (updateError: any) {
        console.error(`[Rank Calculator] Failed to update rank for user ${user.id}:`, updateError)
      }
    }

    console.log(`[Rank Calculator] Updated ranks for ${updatedCount} users`)
    return updatedCount
  } catch (error: any) {
    console.error("[Rank Calculator] Error updating all ranks:", error)
    throw new Error(`Failed to update all user ranks: ${error?.message || "Unknown error"}`)
  }
}

