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

    // Verify agent belongs to user
    const agent = await prisma.agent.findFirst({
      where: {
        OR: [{ agentId: agentId }, { id: agentId }],
        userId: user.id,
      },
      select: { id: true },
    })

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 })
    }

    // Parse query parameters
    const url = new URL(request.url)
    const page = parseInt(url.searchParams.get("page") || "1")
    const limit = parseInt(url.searchParams.get("limit") || "50")
    const status = url.searchParams.get("status")
    const startDate = url.searchParams.get("startDate")
    const endDate = url.searchParams.get("endDate")

    // Build where clause
    const where: any = {
      agentId: agent.id,
    }

    if (status) {
      where.status = status
    }

    if (startDate || endDate) {
      where.timestamp = {}
      if (startDate) {
        where.timestamp.gte = new Date(startDate)
      }
      if (endDate) {
        where.timestamp.lte = new Date(endDate)
      }
    }

    // Get activities with pagination
    const [activities, total] = await Promise.all([
      prisma.agentActivity.findMany({
        where,
        orderBy: { timestamp: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          agent: {
            select: {
              name: true,
              agentId: true,
            },
          },
        },
      }),
      prisma.agentActivity.count({ where }),
    ])

    // If taskId exists, fetch task details
    const activitiesWithTasks = await Promise.all(
      activities.map(async (activity) => {
        let taskDetails = null
        if (activity.taskId) {
          try {
            const task = await prisma.task.findUnique({
              where: { id: activity.taskId },
              select: {
                id: true,
                text: true,
                context: true,
                result: true,
                status: true,
              },
            })
            taskDetails = task
          } catch (error) {
            // Task might not exist, ignore
          }
        }

        return {
          id: activity.id,
          agentId: activity.agentId,
          agentName: activity.agent.name,
          taskId: activity.taskId,
          query: activity.query,
          aiConfidence: activity.aiConfidence?.toNumber() ? activity.aiConfidence.toNumber() * 100 : null,
          status: activity.status,
          humanVerdict: activity.humanVerdict,
          cost: activity.cost?.toNumber() || null,
          timestamp: activity.timestamp,
          task: taskDetails,
        }
      })
    )

    return NextResponse.json(
      {
        activities: activitiesWithTasks,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error("Get agent activity error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

