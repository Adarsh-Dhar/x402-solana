import { NextResponse } from "next/server"
import type { PrismaClient } from "@prisma/client"
import { checkConsensus } from "@/lib/consensus-checker"
import { calculateAndUpdatePoints } from "@/lib/points-calculator"
import { createConsensusNotification } from "@/lib/notifications"
import { getEligibleUserIdsForPhase } from "@/lib/consensus-eligibility"

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

// Helper to safely access task model (for backwards-compatible code paths)
function getTaskModel(prisma: PrismaClient) {
  const prismaAny = prisma as any
  return prismaAny.task
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

    const { decision, userId: rawUserId, userEmail } = body
    let resolvedUserId: string | null = null

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
    const prismaAny = prisma as any
    const userModel = prismaAny.user

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

    const currentPhase = existingTask.currentPhase || 1

    // Enforce leaderboard-based eligibility for later phases
    if (currentPhase > 1) {
      if (!resolvedUserId) {
        return NextResponse.json(
          { error: "You must be logged in to participate in this voting phase." },
          { status: 403 }
        )
      }

      const eligibleUserIds = await getEligibleUserIdsForPhase(prisma, currentPhase)
      if (eligibleUserIds && !eligibleUserIds.has(resolvedUserId)) {
        return NextResponse.json(
          {
            error:
              currentPhase === 2
                ? "You are not in the top half of the leaderboard for Phase 2 voting."
                : "You are not in the top 10% of the leaderboard for Phase 3 voting.",
          },
          { status: 403 }
        )
      }
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

    // Resolve userId from userEmail (or raw userId if passed explicitly)
    if (rawUserId) {
      resolvedUserId = rawUserId
    } else if (userEmail) {
      try {
        let user = await userModel.findUnique({
          where: { email: userEmail },
        })

        if (!user) {
          // Auto-create a minimal user record for this email so points can be tracked
          user = await userModel.create({
            data: {
              email: userEmail,
              password: "placeholder", // NOTE: replace with real password handling when wiring auth
            },
          })
        }

        resolvedUserId = user.id
      } catch (e) {
        console.error("[Task API] Failed to resolve user by email:", e)
        resolvedUserId = null
      }
    }

    // Check if user already voted (if user identified)
    if (resolvedUserId) {
      const existingVote = await voteModel.findFirst({
        where: {
          taskId: taskId,
          userId: resolvedUserId,
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
        userId: resolvedUserId,   // link vote to user so points can be awarded
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

      // Create notifications for all participating users (winners & losers)
      try {
        const votesForTask = await voteModel.findMany({
          where: {
            taskId,
            userId: { not: null },
          },
        })

        const pointsForWinner = 3
        const pointsForLoser = -1

        const notificationPromises = votesForTask.map((v: any) => {
          if (!v.userId) return null
          const isWinner = v.decision === consensusResult.decision
          const pointsDelta = isWinner ? pointsForWinner : pointsForLoser

          return createConsensusNotification(prisma, {
            kind: isWinner ? "CONSENSUS_WIN" : "CONSENSUS_LOSS",
            userId: v.userId,
            taskId,
            pointsDelta,
          })
        })

        await Promise.all(notificationPromises.filter(Boolean) as Promise<unknown>[])
      } catch (notifyError: any) {
        console.error("[Task API] Failed to create consensus notifications:", notifyError?.message || notifyError)
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
    // If we have enough voters but threshold not met, handle phase transitions
    if (!consensusResult.reached && currentVoteCount >= requiredVoters) {
      // Capture current phase voters before any reset
      const phaseVotes = await voteModel.findMany({
        where: {
          taskId,
          userId: { not: null },
        },
      })

      const phase = updatedTask.currentPhase || 1

      if (phase === 1 || phase === 2) {
        const nextPhase = phase + 1

        // Reset votes and counts for the new phase
        await voteModel.deleteMany({
          where: { taskId },
        })

        await taskModel.update({
          where: { id: taskId },
          data: {
            currentPhase: nextPhase,
            currentVoteCount: 0,
            yesVotes: 0,
            noVotes: 0,
          },
        })

        // Notify all participants of the phase transition
        try {
          const notificationPromises = phaseVotes.map((v: any) => {
            if (!v.userId) return null
            return createConsensusNotification(prisma, {
              kind: "CONSENSUS_STAGE_CHANGE",
              userId: v.userId,
              taskId,
              fromStage: phase,
              toStage: nextPhase,
            })
          })

          await Promise.all(notificationPromises.filter(Boolean) as Promise<unknown>[])
        } catch (notifyError: any) {
          console.error(
            "[Task API] Failed to create phase-change consensus notifications:",
            notifyError?.message || notifyError
          )
        }
      } else if (phase === 3) {
        // Final phase failed - mark as no-consensus and notify participants
        try {
          await taskModel.update({
            where: { id: taskId },
            data: {
              status: "completed",
              result: {
                consensus: {
                  requiredVoters,
                  consensusThreshold,
                  finalPhase: 3,
                  currentVoteCount,
                  yesVotes,
                  noVotes,
                  majorityPercentage: consensusResult.majorityPercentage,
                  reached: false,
                },
                decision: null,
                message: "Consensus was not reached after three voting phases.",
                timestamp: new Date().toISOString(),
              },
            },
          })

          const notificationPromises = phaseVotes.map((v: any) => {
            if (!v.userId) return null
            return createConsensusNotification(prisma, {
              kind: "CONSENSUS_FINAL_NO_CONSENSUS",
              userId: v.userId,
              taskId,
            })
          })

          await Promise.all(notificationPromises.filter(Boolean) as Promise<unknown>[])
        } catch (notifyError: any) {
          console.error(
            "[Task API] Failed to create final no-consensus notifications:",
            notifyError?.message || notifyError
          )
        }
      }
    }

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

    // Return a safe, user-friendly error message instead of leaking internal details
    const isPrismaValidationError =
      typeof error?.name === "string" && error.name.includes("PrismaClientValidationError")

    const message = isPrismaValidationError
      ? "We hit a configuration issue while processing this vote. Please try again later while we finalize the consensus upgrade."
      : "Failed to submit decision due to an unexpected server error. Please try again."

    return NextResponse.json(
      {
        error: message,
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

