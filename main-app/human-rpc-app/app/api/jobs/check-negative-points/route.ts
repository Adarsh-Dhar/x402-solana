import { NextResponse } from "next/server"
import type { PrismaClient } from "@prisma/client"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

async function getPrisma(): Promise<PrismaClient> {
  try {
    const { prisma } = await import("@/lib/prisma")
    if (!prisma) {
      throw new Error("Prisma client is not initialized")
    }
    return prisma as PrismaClient
  } catch (error: any) {
    console.error("[Negative Points Job] Failed to import prisma:", error)
    throw new Error(`Database connection error: ${error?.message || "Failed to initialize database client"}`)
  }
}

function getUserModel(prisma: PrismaClient) {
  const prismaAny = prisma as any
  return prismaAny.user
}

/**
 * DELETE users whose total points are negative.
 *
 * This endpoint is designed to be triggered by a cron/scheduler.
 * It is guarded by an env flag to prevent accidental execution.
 */
export async function POST() {
  try {
    const enabled = process.env.ENABLE_NEGATIVE_POINTS_CLEANUP === "true"
    if (!enabled) {
      return NextResponse.json(
        {
          status: "disabled",
          message: "Negative points cleanup job is disabled. Set ENABLE_NEGATIVE_POINTS_CLEANUP=true to enable.",
        },
        { status: 200 }
      )
    }

    const prisma = await getPrisma()
    const userModel = getUserModel(prisma)

    // Find all users with negative points
    const negativeUsers = await userModel.findMany({
      where: {
        points: {
          lt: 0,
        },
      },
      select: {
        id: true,
        email: true,
        points: true,
      },
    })

    if (negativeUsers.length === 0) {
      return NextResponse.json(
        {
          status: "ok",
          deletedCount: 0,
          message: "No users with negative points found.",
        },
        { status: 200 }
      )
    }

    const userIds = negativeUsers.map((u) => u.id)

    // Hard-delete users. Related votes will be set to null via Prisma relation config.
    const result = await userModel.deleteMany({
      where: {
        id: {
          in: userIds,
        },
      },
    })

    console.log("[Negative Points Job] Deleted users with negative points:", {
      deletedCount: result.count,
      users: negativeUsers,
    })

    return NextResponse.json(
      {
        status: "ok",
        deletedCount: result.count,
        users: negativeUsers,
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error("[Negative Points Job] Error running cleanup:", error)
    return NextResponse.json(
      {
        status: "error",
        error: error?.message || "Unknown error",
      },
      { status: 500 }
    )
  }
}


