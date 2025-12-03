import { NextResponse } from "next/server"
import type { PrismaClient } from "@prisma/client"
import { checkConsensus } from "@/lib/consensus-checker"
import { calculateAndUpdatePoints } from "@/lib/points-calculator"

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

// Helper to safely access models
function getModels(prisma: PrismaClient) {
  const prismaAny = prisma as any
  return {
    task: prismaAny.task,
    vote: prismaAny.vote,
  }
}

/**
 * GET handler - Retrieve task by ID for polling
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ taskId: string }> | { taskId: string } }
) {
  try {
    // Handle both sync and async params (Next.js 15+ uses async params)
    const resolvedParams = params instanceof Promise ? await params : params
    const { taskId } = resolvedParams
    console.log("[Task API] GET handler called for task:", taskId)

    if (!taskId) {
      return NextResponse.json(
        { error: "Task ID is required" },
        { status: 400 }
      )
    }

    const prisma = await getPrisma()
    const taskModel = getTaskModel(prisma)

    // Find task by ID
    const task = await taskModel.findUnique({
      where: { id: taskId },
    })

    if (!task) {
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

/**
 * PATCH handler - Submit decision for a task
 * 
 * NOTE: For backward compatibility, this endpoint routes votes to the new votes endpoint.
 * The new consensus system requires multiple votes before completion.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ taskId: string }> | { taskId: string } }
) {
  try {
    // Handle both sync and async params (Next.js 15+ uses async params)
    const resolvedParams = params instanceof Promise ? await params : params
    const { taskId } = resolvedParams
    console.log("[Task API] PATCH handler called for task:", taskId)

    if (!taskId) {
      return NextResponse.json(
        { error: "Task ID is required" },
        { status: 400 }
      )
    }

    // Parse request body
    let body
    try {
      body = await req.json()
    } catch (parseError: any) {
      console.error("[Task API] Failed to parse request body:", parseError)
      return NextResponse.json(
        { error: "Invalid request body. Expected JSON." },
        {
          status: 400,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
          },
        }
      )
    }

    const { decision, userId } = body

    if (!decision || (decision !== "yes" && decision !== "no")) {
      return NextResponse.json(
        { error: "Decision must be 'yes' or 'no'" },
        {
          status: 400,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
          },
        }
      )
    }

    // Use consensus-based voting system
    console.log("[Task API] Processing vote through consensus system...")
    
    const prisma = await getPrisma()
    const { task: taskModel, vote: voteModel } = getModels(prisma)

    // Check if task exists
    const existingTask = await taskModel.findUnique({
      where: { id: taskId },
    })

    if (!existingTask) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      )
    }

    // Check if task is already completed
    if (existingTask.status === "completed") {
      return NextResponse.json(
        {
          error: "Task is already completed",
          result: existingTask.result,
        },
        {
          status: 409,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
          },
        }
      )
    }

    // Check if user already voted (if userId provided)
    if (userId) {
      const existingVote = await voteModel.findFirst({
        where: {
          taskId: taskId,
          userId: userId,
        },
      })

      if (existingVote) {
        return NextResponse.json(
          {
            error: "User has already voted on this task",
            existingVote: {
              decision: existingVote.decision,
              createdAt: existingVote.createdAt,
            },
          },
          {
            status: 409,
            headers: {
              "Content-Type": "application/json; charset=utf-8",
            },
          }
        )
      }
    }

    // Create vote record
    const vote = await voteModel.create({
      data: {
        taskId: taskId,
        userId: userId || null,
        decision: decision,
      },
    })

    console.log("[Task API] Vote created:", vote.id)

    // Update task vote counts
    const isYes = decision === "yes"
    const updatedTask = await taskModel.update({
      where: { id: taskId },
      data: {
        currentVoteCount: {
          increment: 1,
        },
        yesVotes: isYes ? { increment: 1 } : undefined,
        noVotes: !isYes ? { increment: 1 } : undefined,
      },
    })

    // Get updated vote counts
    const yesVotes = updatedTask.yesVotes || 0
    const noVotes = updatedTask.noVotes || 0
    const currentVoteCount = updatedTask.currentVoteCount || 0
    const requiredVoters = updatedTask.requiredVoters || 3
    const consensusThreshold = updatedTask.consensusThreshold ? parseFloat(updatedTask.consensusThreshold.toString()) : 0.51

    // Check if consensus is reached
    const consensusResult = checkConsensus(
      yesVotes,
      noVotes,
      requiredVoters,
      consensusThreshold
    )

    console.log("[Task API] Consensus check:", {
      taskId,
      currentVotes: currentVoteCount,
      requiredVoters,
      yesVotes,
      noVotes,
      consensusReached: consensusResult.reached,
      majorityPercentage: (consensusResult.majorityPercentage * 100).toFixed(1) + "%",
      threshold: (consensusThreshold * 100).toFixed(1) + "%",
    })

    // If consensus reached, update task status to completed
    if (consensusResult.reached && consensusResult.decision) {
      const sentiment = consensusResult.decision === "yes" ? "POSITIVE" : "NEGATIVE"
      const confidence = 1.0

      const completedTask = await taskModel.update({
        where: { id: taskId },
        data: {
          status: "completed",
          result: {
            sentiment,
            confidence,
            decision: consensusResult.decision,
            timestamp: new Date().toISOString(),
            message: `Consensus reached: ${consensusResult.decision.toUpperCase()} with ${(consensusResult.majorityPercentage * 100).toFixed(1)}% agreement`,
            consensus: {
              requiredVoters,
              consensusThreshold,
              currentVoteCount,
              yesVotes,
              noVotes,
              majorityPercentage: consensusResult.majorityPercentage,
              reachedAt: new Date().toISOString(),
            },
          },
        },
      })

      console.log("[Task API] Task completed with consensus:", completedTask.id)

      // Calculate and update user points based on vote accuracy
      try {
        await calculateAndUpdatePoints(prisma, taskId, consensusResult.decision)
      } catch (pointsError: any) {
        // Log error but don't fail the request - points calculation is non-critical
        console.error("[Task API] Failed to calculate points:", pointsError?.message || pointsError)
      }

      return NextResponse.json(
        {
          status: "Vote submitted - Consensus reached",
          task_id: taskId,
          vote_id: vote.id,
          consensus: {
            reached: true,
            decision: consensusResult.decision,
            majorityPercentage: consensusResult.majorityPercentage,
            requiredVoters,
            currentVoteCount,
            consensusThreshold,
          },
          result: {
            sentiment,
            confidence,
            decision: consensusResult.decision,
          },
        },
        {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
          },
        }
      )
    }

    // Consensus not reached yet
    return NextResponse.json(
      {
        status: "Vote submitted",
        task_id: taskId,
        vote_id: vote.id,
        consensus: {
          reached: false,
          currentVoteCount,
          requiredVoters,
          yesVotes,
          noVotes,
          consensusThreshold,
          majorityPercentage: consensusResult.majorityPercentage,
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
    console.error("[Task API] PATCH error:", error)
    return NextResponse.json(
      {
        error: `Failed to submit decision: ${error?.message || "Unknown error"}`,
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

