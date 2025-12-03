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

    // Return task with status and result
    return NextResponse.json(
      {
        id: task.id,
        status: task.status,
        result: task.result,
        text: task.text,
        agentName: task.agentName,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
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

    const { decision } = body

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

    const prisma = await getPrisma()
    const taskModel = getTaskModel(prisma)

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
          status: 409, // Conflict
          headers: {
            "Content-Type": "application/json; charset=utf-8",
          },
        }
      )
    }

    // Map decision to sentiment
    const sentiment = decision === "yes" ? "POSITIVE" : "NEGATIVE"
    const confidence = 1.0 // Human decisions have full confidence

    // Update task with decision
    const updatedTask = await taskModel.update({
      where: { id: taskId },
      data: {
        status: "completed",
        result: {
          sentiment,
          confidence,
          decision,
          timestamp: new Date().toISOString(),
          message: `Human decision: ${decision.toUpperCase()}`,
        },
      },
    })

    console.log("[Task API] Task updated successfully:", updatedTask.id)

    return NextResponse.json(
      {
        status: "Decision submitted",
        task_id: updatedTask.id,
        sentiment: sentiment,
        confidence: confidence,
        decision: decision,
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

