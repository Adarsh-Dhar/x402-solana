import { NextResponse } from "next/server"
import type { PrismaClient } from "@prisma/client"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"

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
    console.error("[User Profile API] Failed to import prisma:", error)
    throw new Error(`Database connection error: ${error?.message || "Failed to initialize database client"}`)
  }
}

/**
 * GET handler - Get current user's profile with rank, stats, and badges
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    const prisma = await getPrisma()
    const prismaAny = prisma as any
    const userModel = prismaAny.user

    const user = await userModel.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        email: true,
        points: true,
        rank: true,
        rankUpdatedAt: true,
        godModeBadge: true,
        godModeBadgeEarnedAt: true,
        totalVotes: true,
        correctVotes: true,
        consecutiveCorrectDays: true,
        stakeAmount: true,
        isBanned: true,
        createdAt: true,
      },
    })

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      )
    }

    // Calculate accuracy percentage
    const accuracy = user.totalVotes > 0 
      ? (user.correctVotes / user.totalVotes) * 100 
      : 0

    return NextResponse.json(
      {
        id: user.id,
        email: user.email,
        points: user.points || 0,
        rank: user.rank || "CADET",
        rankUpdatedAt: user.rankUpdatedAt,
        godModeBadge: user.godModeBadge || false,
        godModeBadgeEarnedAt: user.godModeBadgeEarnedAt,
        totalVotes: user.totalVotes || 0,
        correctVotes: user.correctVotes || 0,
        accuracy: Math.round(accuracy * 100) / 100, // Round to 2 decimal places
        consecutiveCorrectDays: user.consecutiveCorrectDays || 0,
        stakeAmount: user.stakeAmount ? parseFloat(user.stakeAmount.toString()) : null,
        isBanned: user.isBanned || false,
        createdAt: user.createdAt,
      },
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
      }
    )
  } catch (error: any) {
    console.error("[User Profile API] GET error:", error)
    return NextResponse.json(
      {
        error: `Failed to fetch user profile: ${error?.message || "Unknown error"}`,
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

