import { NextResponse } from "next/server"
import { auth } from "@/lib/nextauth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    const session = await auth()

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Get all agents for user with activity summary
    const agents = await prisma.agent.findMany({
      where: { userId: user.id },
      include: {
        activities: {
          take: 10,
          orderBy: { timestamp: "desc" },
        },
        _count: {
          select: {
            activities: true,
            transactions: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    // Calculate metrics for each agent
    const agentsWithMetrics = agents.map((agent) => {
      const totalHumanCalls = agent.activities.filter((a) => a.status === "resolved").length
      const totalCalls = agent.activities.length
      const accuracyRate =
        totalCalls > 0
          ? agent.activities.filter((a) => a.status === "resolved" && a.humanVerdict).length / totalCalls
          : 0

      return {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        avatarUrl: agent.avatarUrl,
        confidenceThreshold: agent.confidenceThreshold.toNumber() * 100,
        maxDailyBudget: agent.maxDailyBudget.toNumber(),
        responseTime: agent.responseTime,
        agentId: agent.agentId,
        balance: agent.balance.toNumber(),
        walletAddress: agent.walletAddress,
        onChainAddress: agent.onChainAddress,
        isActive: agent.isActive,
        autoRefuelEnabled: agent.autoRefuelEnabled,
        autoRefuelThreshold: agent.autoRefuelThreshold?.toNumber() || null,
        autoRefuelAmount: agent.autoRefuelAmount?.toNumber() || null,
        metrics: {
          totalHumanCalls,
          totalCalls,
          accuracyRate: accuracyRate * 100,
        },
        recentActivity: agent.activities.slice(0, 5),
        createdAt: agent.createdAt,
        updatedAt: agent.updatedAt,
      }
    })

    return NextResponse.json({ agents: agentsWithMetrics }, { status: 200 })
  } catch (error: any) {
    console.error("Get agents error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

