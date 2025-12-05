/**
 * Backfill script for gamification system
 * 
 * This script:
 * 1. Calculates initial ranks for all users
 * 2. Sets default taskTier for existing tasks (TRAINING)
 * 3. Initializes accuracy tracking fields
 * 
 * Run with: npx tsx scripts/backfill-gamification.ts
 */

import { PrismaClient } from "@prisma/client"
import { updateAllUserRanks } from "../lib/rank-calculator"

const prisma = new PrismaClient()

async function main() {
  console.log("Starting gamification backfill...")

  try {
    // 1. Update all user ranks
    console.log("\n1. Calculating ranks for all users...")
    const updatedRanks = await updateAllUserRanks(prisma)
    console.log(`✓ Updated ranks for ${updatedRanks} users`)

    // 2. Set default taskTier for existing tasks
    console.log("\n2. Setting default task tiers...")
    const prismaAny = prisma as any
    const taskModel = prismaAny.task

    const tasksWithoutTier = await taskModel.findMany({
      where: {
        taskTier: null,
      },
    })

    if (tasksWithoutTier.length > 0) {
      const updateResult = await taskModel.updateMany({
        where: {
          taskTier: null,
        },
        data: {
          taskTier: "TRAINING", // Default to training tier
        },
      })
      console.log(`✓ Set default tier (TRAINING) for ${updateResult.count} tasks`)
    } else {
      console.log("✓ All tasks already have tiers assigned")
    }

    // 3. Initialize accuracy tracking for users with votes but no stats
    console.log("\n3. Initializing accuracy tracking...")
    const userModel = prismaAny.user
    const voteModel = prismaAny.vote

    // Get all users
    const allUsers = await userModel.findMany({
      select: {
        id: true,
        totalVotes: true,
        correctVotes: true,
      },
    })

    let initializedCount = 0
    for (const user of allUsers) {
      // Count user's votes
      const voteCount = await voteModel.count({
        where: {
          userId: user.id,
        },
      })

      // If user has votes but no stats initialized, we'll need to calculate from VoteAccuracy
      // For now, just ensure the fields exist (they should from schema)
      if (voteCount > 0 && (user.totalVotes === 0 || user.correctVotes === 0)) {
        // Note: We can't calculate accuracy without consensus results
        // This will be populated as tasks reach consensus
        initializedCount++
      }
    }

    console.log(`✓ Checked ${allUsers.length} users, ${initializedCount} need accuracy calculation from future votes`)

    console.log("\n✅ Gamification backfill completed successfully!")
  } catch (error) {
    console.error("❌ Error during backfill:", error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

main()
  .catch((error) => {
    console.error("Fatal error:", error)
    process.exit(1)
  })

