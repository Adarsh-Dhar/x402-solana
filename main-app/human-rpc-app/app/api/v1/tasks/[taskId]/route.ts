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
    console.error("[Task API] Failed to import prisma:", error)
    throw new Error(`Database connection error: ${error?.message || "Failed to initialize database client"}`)
  }
}

// Helper to safely access task model
function getTaskModel(prisma: PrismaClient) {
  // Access task model directly - Prisma generates it at runtime
  const prismaAny = prisma as any
  return prismaAny.task
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const resolvedParams = await params
    console.log("[Task API] GET handler called for task:", resolvedParams.taskId)
    const prisma = await getPrisma()
    
    const taskModel = getTaskModel(prisma)
    
    // Find task by ID
    const task = await taskModel.findUnique({
      where: { id: resolvedParams.taskId },
      include: {
        agentSession: {
          select: {
            id: true,
            agentName: true,
            status: true,
            lastHeartbeat: true
          }
        }
      }
    })

    if (!task) {
      console.log("[Task API] Task not found:", resolvedParams.taskId)
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      )
    }

    // Return task with status, result, and consensus information
    const yesVotes = task.yesVotes || 0
    const noVotes = task.noVotes || 0
    const currentVoteCount = task.currentVoteCount || 0
    const requiredVoters = task.requiredVoters || 3
    const consensusThreshold = task.consensusThreshold ? parseFloat(task.consensusThreshold.toString()) : 0.51
    const aiCertainty = task.aiCertainty ? parseFloat(task.aiCertainty.toString()) : null

    return NextResponse.json(
      {
        id: task.id,
        status: task.status,
        result: task.result,
        text: task.text,
        agentName: task.agentName,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        context: task.context,
        consensus: {
          aiCertainty,
          requiredVoters,
          consensusThreshold,
          currentVoteCount,
          yesVotes,
          noVotes,
        },
      },
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
      }
    )
  } catch (error: any) {
    console.error("[Task API] GET error:", error)
    return NextResponse.json(
      {
        error: `Failed to fetch task: ${error?.message || "Unknown error"}`,
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

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const resolvedParams = await params
    console.log("[Task API] PATCH handler called for task:", resolvedParams.taskId)
    const prisma = await getPrisma()
    
    const body = await req.json()
    const { decision, userId, userEmail } = body

    if (!decision || !["yes", "no"].includes(decision)) {
      return NextResponse.json(
        { error: "Decision must be 'yes' or 'no'" },
        { status: 400 }
      )
    }

    if (!userId && !userEmail) {
      return NextResponse.json(
        { error: "Either userId or userEmail is required" },
        { status: 400 }
      )
    }

    const taskModel = getTaskModel(prisma)
    
    // Find task
    const task = await taskModel.findUnique({
      where: { id: resolvedParams.taskId },
    })

    if (!task) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      )
    }

    if (task.status !== "pending" && task.status !== "urgent") {
      return NextResponse.json(
        { error: "Task is not accepting votes" },
        { status: 400 }
      )
    }

    // Resolve user ID
    let resolvedUserId = userId
    if (!resolvedUserId && userEmail) {
      const prismaAny = prisma as any
      const userModel = prismaAny.user
      const user = await userModel.findUnique({
        where: { email: userEmail },
        select: { id: true },
      })
      if (user) {
        resolvedUserId = user.id
      } else {
        return NextResponse.json(
          { error: "User not found" },
          { status: 404 }
        )
      }
    }

    // Check if user already voted
    const prismaAny = prisma as any
    const voteModel = prismaAny.vote
    const existingVote = await voteModel.findFirst({
      where: {
        taskId: resolvedParams.taskId,
        userId: resolvedUserId,
      },
    })

    if (existingVote) {
      return NextResponse.json(
        { error: "User has already voted on this task" },
        { status: 400 }
      )
    }

    // Create vote
    await voteModel.create({
      data: {
        taskId: resolvedParams.taskId,
        userId: resolvedUserId,
        decision: decision,
        createdAt: new Date(),
      },
    })

    // Update task vote counts
    const yesVotes = task.yesVotes || 0
    const noVotes = task.noVotes || 0
    const newYesVotes = decision === "yes" ? yesVotes + 1 : yesVotes
    const newNoVotes = decision === "no" ? noVotes + 1 : noVotes
    const newVoteCount = newYesVotes + newNoVotes

    await taskModel.update({
      where: { id: resolvedParams.taskId },
      data: {
        yesVotes: newYesVotes,
        noVotes: newNoVotes,
        currentVoteCount: newVoteCount,
      },
    })

    // Check for consensus
    const requiredVoters = task.requiredVoters || 3
    const consensusThreshold = task.consensusThreshold ? parseFloat(task.consensusThreshold.toString()) : 0.51

    let newStatus = task.status
    let result = task.result

    if (newVoteCount >= requiredVoters) {
      const yesPercentage = newYesVotes / newVoteCount
      const noPercentage = newNoVotes / newVoteCount

      if (yesPercentage >= consensusThreshold) {
        newStatus = "completed"
        result = {
          ...result,
          consensus: "yes",
          finalVotes: { yes: newYesVotes, no: newNoVotes },
          completedAt: new Date().toISOString(),
        }
      } else if (noPercentage >= consensusThreshold) {
        newStatus = "completed"
        result = {
          ...result,
          consensus: "no",
          finalVotes: { yes: newYesVotes, no: newNoVotes },
          completedAt: new Date().toISOString(),
        }
      }
    }

    // Update task status if consensus reached
    if (newStatus !== task.status) {
      await taskModel.update({
        where: { id: resolvedParams.taskId },
        data: {
          status: newStatus,
          result: result,
        },
      })
    }

    return NextResponse.json(
      {
        success: true,
        voteCount: newVoteCount,
        requiredVoters,
        consensusReached: newStatus === "completed",
        status: newStatus,
        consensus: {
          aiCertainty: task.aiCertainty ? parseFloat(task.aiCertainty.toString()) : null,
          requiredVoters,
          consensusThreshold,
          currentVoteCount: newVoteCount,
          yesVotes: newYesVotes,
          noVotes: newNoVotes,
          reached: newStatus === "completed",
        },
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error("[Task API] PATCH error:", error)
    return NextResponse.json(
      {
        error: `Failed to submit vote: ${error?.message || "Unknown error"}`,
      },
      { status: 500 }
    )
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  // Delegate to PATCH handler for backward compatibility
  return PATCH(req, { params })
}