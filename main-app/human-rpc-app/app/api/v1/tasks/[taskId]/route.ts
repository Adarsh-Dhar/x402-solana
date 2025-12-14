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

    // Return task with status, result, and consensus information including phase data
    const yesVotes = task.yesVotes || 0
    const noVotes = task.noVotes || 0
    const currentVoteCount = task.currentVoteCount || 0
    const requiredVoters = task.requiredVoters || 3
    const consensusThreshold = task.consensusThreshold ? parseFloat(task.consensusThreshold.toString()) : 0.51
    const aiCertainty = task.aiCertainty ? parseFloat(task.aiCertainty.toString()) : null
    const currentPhase = task.currentPhase || 1

    // Import phase utilities for description
    const { getPhaseDescription } = await import("@/lib/multi-phase-voting/types")
    const phaseDescription = getPhaseDescription(currentPhase)

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
          phase: currentPhase,
          phaseDescription: phaseDescription,
          phaseMeta: task.phaseMeta,
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

    // Check for consensus using multi-phase logic
    const requiredVoters = task.requiredVoters || 3
    const consensusThreshold = task.consensusThreshold ? parseFloat(task.consensusThreshold.toString()) : 0.51
    const currentPhase = task.currentPhase || 1

    // Import multi-phase voting components
    const { checkMultiPhaseConsensus } = await import("@/lib/consensus-checker")
    const { phaseManager } = await import("@/lib/multi-phase-voting/phase-manager")
    const multiPhaseTypes = await import("@/lib/multi-phase-voting/types")
    const VotingPhase = multiPhaseTypes.VotingPhase

    // Check consensus for current phase
    const consensusResult = checkMultiPhaseConsensus(
      newYesVotes,
      newNoVotes,
      requiredVoters,
      consensusThreshold,
      currentPhase
    )

    let newStatus = task.status
    let result = task.result
    let phaseTransitioned = false

    if (consensusResult.reached) {
      // Consensus reached - complete the task
      newStatus = "completed"
      result = {
        ...result,
        consensus: consensusResult.decision,
        finalVotes: { yes: newYesVotes, no: newNoVotes },
        finalPhase: currentPhase,
        completedAt: new Date().toISOString(),
      }

      // Calculate and update user points based on vote accuracy
      try {
        const { calculateAndUpdatePoints } = await import("@/lib/points-calculator")
        await calculateAndUpdatePoints(prisma, resolvedParams.taskId, consensusResult.decision)
        console.log("[Task API] Points calculated successfully for task:", resolvedParams.taskId)
      } catch (pointsError: any) {
        // Log error but don't fail the request - points calculation is non-critical
        console.error("[Task API] Failed to calculate points:", pointsError?.message || pointsError)
      }

      // Distribute SOL rewards to winning voters
      try {
        const { distributeSolRewardToWinners, TASK_REWARD_LAMPORTS } = await import("@/lib/rewards-payout")
        const rewards = await distributeSolRewardToWinners(
          prisma,
          resolvedParams.taskId,
          consensusResult.decision,
          TASK_REWARD_LAMPORTS
        )

        // Persist rewards metadata on the task result for UI/inspection
        if (rewards) {
          result = {
            ...result,
            rewards,
          }
          console.log("[Task API] SOL rewards distributed:", {
            taskId: resolvedParams.taskId,
            winnersCount: rewards.winnersCount,
            totalDistributed: rewards.totalLamportsDistributed,
            totalSol: rewards.totalLamportsDistributed / 1000000000, // Convert lamports to SOL
          })
        }
      } catch (rewardsError: any) {
        // Log error but don't fail the request - rewards distribution is non-critical
        console.error("[Task API] Failed to distribute SOL rewards:", rewardsError?.message || rewardsError)
      }
    } else if (consensusResult.shouldTransition) {
      // No consensus but should transition to next phase
      try {
        phaseTransitioned = await phaseManager.transitionToNextPhase(resolvedParams.taskId)
        console.log(`[Task API] Phase transition result: ${phaseTransitioned}`)
      } catch (error) {
        console.error("[Task API] Error during phase transition:", error)
        // Continue with single-phase logic if phase transition fails
      }
    } else if (newVoteCount >= requiredVoters && !consensusResult.nextPhase) {
      // All votes collected, no consensus, and no next phase available - task fails
      newStatus = "failed"
      result = {
        ...result,
        consensus: "failed",
        reason: "No consensus reached after all phases",
        finalVotes: { yes: newYesVotes, no: newNoVotes },
        finalPhase: currentPhase,
        completedAt: new Date().toISOString(),
      }
    }

    // Update task status if consensus reached or failed
    if (newStatus !== task.status) {
      await taskModel.update({
        where: { id: resolvedParams.taskId },
        data: {
          status: newStatus,
          result: result,
        },
      })
    }

    // Get updated task information after potential phase transition
    const updatedTask = await taskModel.findUnique({
      where: { id: resolvedParams.taskId },
    })

    const finalCurrentPhase = updatedTask?.currentPhase || currentPhase

    return NextResponse.json(
      {
        success: true,
        voteCount: newVoteCount,
        requiredVoters,
        consensusReached: newStatus === "completed",
        status: newStatus,
        phaseTransitioned: phaseTransitioned,
        consensus: {
          aiCertainty: task.aiCertainty ? parseFloat(task.aiCertainty.toString()) : null,
          requiredVoters,
          consensusThreshold,
          currentVoteCount: newVoteCount,
          yesVotes: newYesVotes,
          noVotes: newNoVotes,
          reached: newStatus === "completed",
          phase: finalCurrentPhase,
          phaseDescription: consensusResult.phaseDescription,
          shouldTransition: consensusResult.shouldTransition,
          nextPhase: consensusResult.nextPhase,
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