import { NextResponse } from "next/server"
import type { PrismaClient } from "@prisma/client"

// Ensure this route always returns JSON, not HTML error pages
export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// Lazy load prisma to catch initialization errors
async function getPrisma(): Promise<PrismaClient> {
  try {
    const { prisma } = await import("@/lib/prisma")
    if (!prisma) {
      throw new Error("Prisma client is not initialized")
    }
    return prisma as PrismaClient
  } catch (error: any) {
    console.error("[Leaderboard API] Failed to import prisma:", error)
    throw new Error(`Database connection error: ${error?.message || "Failed to initialize database client"}`)
  }
}

/**
 * GET handler - Get leaderboard of users sorted by points
 */
export async function GET() {
  try {
    console.log("[Leaderboard API] GET handler called")
    const prisma = await getPrisma()

    // Fetch all users with points, ordered by points descending
    const users = await prisma.user.findMany({
      where: {
        points: {
          gte: 0, // Include users with 0 or more points
        },
      },
      select: {
        id: true,
        email: true,
        points: true,
      },
      orderBy: {
        points: "desc",
      },
    })

    console.log(`[Leaderboard API] Found ${users.length} users`)

    // Calculate ranks (handle ties - same points = same rank)
    let currentRank = 1
    let previousPoints: number | null = null
    const leaderboard = users.map((user, index: number) => {
      const points = user.points || 0

      // If this user has different points than previous, update rank
      if (previousPoints !== null && points !== previousPoints) {
        currentRank = index + 1
      } else if (previousPoints === null) {
        currentRank = 1
      }

      previousPoints = points

      return {
        rank: currentRank,
        email: user.email,
        points: points,
      }
    })

    return NextResponse.json(
      {
        leaderboard,
        totalUsers: leaderboard.length,
      },
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
      }
    )
  } catch (error: any) {
    console.error("[Leaderboard API] GET error:", error)
    return NextResponse.json(
      {
        error: `Failed to fetch leaderboard: ${error?.message || "Unknown error"}`,
      },
      {
        status: 500,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
      }
    )
  }
}

