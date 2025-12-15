import type { PrismaClient } from "@prisma/client"
import type { UserRank } from "./rank-calculator"

export type TaskTier = "TRAINING" | "LIVE_FIRE" | "DISPUTE"

/**
 * Check if a user is eligible to access a task based on their rank and the task tier
 * 
 * Tier access rules:
 * - TRAINING: All ranks (CADET, OFFICER, ARBITER)
 * - LIVE_FIRE: OFFICER and ARBITER only
 * - DISPUTE: ARBITER only
 * 
 * @param prisma - Prisma client instance
 * @param userId - User ID to check
 * @param taskId - Task ID to check eligibility for
 * @returns Promise resolving to true if eligible, false otherwise
 */
export async function isUserEligibleForTask(
  prisma: PrismaClient,
  userId: string,
  taskId: string
): Promise<boolean> {
  try {
    const prismaAny = prisma as any
    const userModel = prismaAny.user
    const taskModel = prismaAny.task

    // Get user's rank
    const user = await userModel.findUnique({
      where: { id: userId },
      select: {
        id: true,
        rank: true,
        isBanned: true,
      },
    })

    if (!user) {
      return false
    }

    // Banned users cannot access any tasks
    if (user.isBanned) {
      return false
    }

    // Get task tier
    const task = await taskModel.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        taskTier: true,
      },
    })

    if (!task) {
      return false
    }

    // Default to TRAINING if no tier specified (backward compatibility)
    const taskTier = (task.taskTier as TaskTier) || "TRAINING"
    const userRank = (user.rank as UserRank) || "CADET"

    // Check eligibility based on tier and rank
    return isRankEligibleForTier(userRank, taskTier)
  } catch (error: any) {
    console.error("[Task Eligibility] Error checking eligibility:", error)
    return false
  }
}

/**
 * Check if a rank is eligible for a task tier
 * 
 * @param rank - User's rank
 * @param tier - Task tier
 * @returns true if eligible, false otherwise
 */
export function isRankEligibleForTier(rank: UserRank | null, tier: TaskTier | null): boolean {
  // Default to CADET if no rank, TRAINING if no tier
  const userRank = rank || "CADET"
  const taskTier = tier || "TRAINING"

  switch (taskTier) {
    case "TRAINING":
      // All ranks can access training tasks
      return true

    case "LIVE_FIRE":
      // Officer and Arbiter can access live fire tasks
      return userRank === "OFFICER" || userRank === "ARBITER"

    case "DISPUTE":
      // Only Arbiters can access dispute resolution tasks
      return userRank === "ARBITER"

    default:
      // Unknown tier, default to training (allow access)
      return true
  }
}

/**
 * Get all task tiers a user can access based on their rank
 * 
 * @param rank - User's rank
 * @returns Array of accessible task tiers
 */
export function getAccessibleTiers(rank: UserRank | null): TaskTier[] {
  const userRank = rank || "CADET"

  switch (userRank) {
    case "ARBITER":
      return ["TRAINING", "LIVE_FIRE", "DISPUTE"]
    case "OFFICER":
      return ["TRAINING", "LIVE_FIRE"]
    case "CADET":
    default:
      return ["TRAINING"]
  }
}

/**
 * Filter tasks by user eligibility
 * 
 * @param prisma - Prisma client instance
 * @param userId - User ID
 * @param tasks - Array of task IDs or task objects
 * @returns Promise resolving to array of eligible task IDs
 */
export async function filterEligibleTasks(
  prisma: PrismaClient,
  userId: string,
  taskIds: string[]
): Promise<string[]> {
  try {
    const prismaAny = prisma as any
    const userModel = prismaAny.user
    const taskModel = prismaAny.task

    // Get user's rank
    const user = await userModel.findUnique({
      where: { id: userId },
      select: {
        id: true,
        rank: true,
        isBanned: true,
      },
    })

    if (!user || user.isBanned) {
      return []
    }

    const userRank = (user.rank as UserRank) || "CADET"

    // Get all tasks with their tiers
    const tasks = await taskModel.findMany({
      where: {
        id: {
          in: taskIds,
        },
      },
      select: {
        id: true,
        taskTier: true,
      },
    })

    // Filter by eligibility
    const eligibleTaskIds = tasks
      .filter((task) => {
        const taskTier = (task.taskTier as TaskTier) || "TRAINING"
        return isRankEligibleForTier(userRank, taskTier)
      })
      .map((task) => task.id)

    return eligibleTaskIds
  } catch (error: any) {
    console.error("[Task Eligibility] Error filtering tasks:", error)
    return []
  }
}

