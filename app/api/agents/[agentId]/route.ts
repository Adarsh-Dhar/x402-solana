import { NextResponse } from "next/server"
import { auth } from "@/lib/nextauth"
import { prisma } from "@/lib/prisma"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ agentId: string }> | { agentId: string } }
) {
  try {
    const session = await auth()

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const resolvedParams = await Promise.resolve(params)
    const { agentId } = resolvedParams

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Get agent by agentId (public identifier) or id
    const agent = await prisma.agent.findFirst({
      where: {
        OR: [{ agentId: agentId }, { id: agentId }],
        userId: user.id,
      },
      include: {
        activities: {
          take: 50,
          orderBy: { timestamp: "desc" },
        },
        transactions: {
          take: 20,
          orderBy: { createdAt: "desc" },
        },
        _count: {
          select: {
            activities: true,
            transactions: true,
          },
        },
      },
    })

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 })
    }

    // Calculate metrics
    const totalHumanCalls = agent.activities.filter((a) => a.status === "resolved").length
    const totalCalls = agent.activities.length
    const accuracyRate =
      totalCalls > 0
        ? agent.activities.filter((a) => a.status === "resolved" && a.humanVerdict).length / totalCalls
        : 0

    return NextResponse.json(
      {
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
        recentActivity: agent.activities.slice(0, 10),
        recentTransactions: agent.transactions,
        createdAt: agent.createdAt,
        updatedAt: agent.updatedAt,
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error("Get agent error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ agentId: string }> | { agentId: string } }
) {
  try {
    const session = await auth()

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const resolvedParams = await Promise.resolve(params)
    const { agentId } = resolvedParams

    const body = await request.json()
    const { confidenceThreshold, maxDailyBudget, responseTime, autoRefuelEnabled, autoRefuelThreshold, autoRefuelAmount } =
      body

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Find agent
    const agent = await prisma.agent.findFirst({
      where: {
        OR: [{ agentId: agentId }, { id: agentId }],
        userId: user.id,
      },
    })

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 })
    }

    // Build update data
    const updateData: any = {}

    if (confidenceThreshold !== undefined) {
      if (confidenceThreshold < 0 || confidenceThreshold > 100) {
        return NextResponse.json({ error: "Confidence threshold must be between 0 and 100" }, { status: 400 })
      }
      updateData.confidenceThreshold = confidenceThreshold / 100
    }

    if (maxDailyBudget !== undefined) {
      if (maxDailyBudget < 0) {
        return NextResponse.json({ error: "Max daily budget must be a positive number" }, { status: 400 })
      }
      updateData.maxDailyBudget = maxDailyBudget
    }

    if (responseTime !== undefined) {
      if (!["fast", "standard", "economy"].includes(responseTime)) {
        return NextResponse.json({ error: "Response time must be 'fast', 'standard', or 'economy'" }, { status: 400 })
      }
      updateData.responseTime = responseTime
    }

    if (autoRefuelEnabled !== undefined) {
      updateData.autoRefuelEnabled = autoRefuelEnabled
    }

    if (autoRefuelThreshold !== undefined) {
      updateData.autoRefuelThreshold = autoRefuelThreshold
    }

    if (autoRefuelAmount !== undefined) {
      updateData.autoRefuelAmount = autoRefuelAmount
    }

    // Update agent
    const updatedAgent = await prisma.agent.update({
      where: { id: agent.id },
      data: updateData,
      select: {
        id: true,
        name: true,
        confidenceThreshold: true,
        maxDailyBudget: true,
        responseTime: true,
        autoRefuelEnabled: true,
        autoRefuelThreshold: true,
        autoRefuelAmount: true,
        updatedAt: true,
      },
    })

    return NextResponse.json(
      {
        ...updatedAgent,
        confidenceThreshold: updatedAgent.confidenceThreshold.toNumber() * 100,
        maxDailyBudget: updatedAgent.maxDailyBudget.toNumber(),
        autoRefuelThreshold: updatedAgent.autoRefuelThreshold?.toNumber() || null,
        autoRefuelAmount: updatedAgent.autoRefuelAmount?.toNumber() || null,
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error("Update agent error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

