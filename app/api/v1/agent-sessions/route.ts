import { NextResponse } from "next/server"
import type { PrismaClient } from "@prisma/client"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// Session timeout in minutes
const SESSION_TIMEOUT_MINUTES = 5

// Lazy load prisma to catch initialization errors
async function getPrisma(): Promise<PrismaClient> {
  try {
    const { prisma } = await import("@/lib/prisma")
    if (!prisma) {
      throw new Error("Prisma client is not initialized")
    }
    return prisma as PrismaClient
  } catch (error: any) {
    console.error("[Agent Sessions API] Failed to import prisma:", error)
    throw new Error(`Database connection error: ${error?.message || "Failed to initialize database client"}`)
  }
}

// Helper to safely access models
function getAgentSessionModel(prisma: PrismaClient) {
  const prismaAny = prisma as any
  return prismaAny.agentSession
}

function getTaskModel(prisma: PrismaClient) {
  const prismaAny = prisma as any
  return prismaAny.task
}

/**
 * POST /api/v1/agent-sessions
 * Create or update an agent session (heartbeat)
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { agentName, walletAddress, metadata } = body

    if (!agentName || !walletAddress) {
      return NextResponse.json(
        { error: "agentName and walletAddress are required" },
        { status: 400 }
      )
    }

    const prisma = await getPrisma()
    const agentSessionModel = getAgentSessionModel(prisma)

    // Find existing active session for this agent
    const existingSession = await agentSessionModel.findFirst({
      where: {
        agentName,
        walletAddress,
        status: "active"
      }
    })

    let session
    if (existingSession) {
      // Update heartbeat for existing session
      session = await agentSessionModel.update({
        where: { id: existingSession.id },
        data: {
          lastHeartbeat: new Date(),
          metadata: metadata || existingSession.metadata
        }
      })
      console.log(`[Agent Sessions] Updated heartbeat for session ${session.id}`)
    } else {
      // Create new session
      session = await agentSessionModel.create({
        data: {
          agentName,
          walletAddress,
          status: "active",
          lastHeartbeat: new Date(),
          metadata: metadata || {}
        }
      })
      console.log(`[Agent Sessions] Created new session ${session.id} for agent ${agentName}`)
    }

    return NextResponse.json({
      sessionId: session.id,
      status: session.status,
      message: existingSession ? "Heartbeat updated" : "Session created"
    })

  } catch (error: any) {
    console.error("[Agent Sessions API] POST error:", error)
    return NextResponse.json(
      { error: `Failed to manage session: ${error?.message || "Unknown error"}` },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/v1/agent-sessions
 * Terminate an agent session
 */
export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url)
    const sessionId = url.searchParams.get("sessionId")
    const agentName = url.searchParams.get("agentName")
    const walletAddress = url.searchParams.get("walletAddress")

    if (!sessionId && (!agentName || !walletAddress)) {
      return NextResponse.json(
        { error: "Either sessionId or (agentName + walletAddress) is required" },
        { status: 400 }
      )
    }

    const prisma = await getPrisma()
    const agentSessionModel = getAgentSessionModel(prisma)
    const taskModel = getTaskModel(prisma)

    let session
    if (sessionId) {
      session = await agentSessionModel.findUnique({
        where: { id: sessionId }
      })
    } else {
      session = await agentSessionModel.findFirst({
        where: {
          agentName,
          walletAddress,
          status: "active"
        }
      })
    }

    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      )
    }

    // Terminate the session
    await agentSessionModel.update({
      where: { id: session.id },
      data: {
        status: "terminated",
        endedAt: new Date()
      }
    })

    // Mark pending tasks from this session as aborted (don't delete them)
    const abortedTasks = await taskModel.updateMany({
      where: {
        agentSessionId: session.id,
        status: {
          in: ["pending", "urgent"]
        }
      },
      data: {
        status: "aborted",
        result: {
          message: "Task aborted - agent session terminated",
          timestamp: new Date().toISOString(),
          reason: "agent_terminated"
        }
      }
    })

    console.log(`[Agent Sessions] Terminated session ${session.id}, aborted ${abortedTasks.count} tasks`)

    return NextResponse.json({
      message: "Session terminated",
      sessionId: session.id,
      tasksAborted: abortedTasks.count
    })

  } catch (error: any) {
    console.error("[Agent Sessions API] DELETE error:", error)
    return NextResponse.json(
      { error: `Failed to terminate session: ${error?.message || "Unknown error"}` },
      { status: 500 }
    )
  }
}

/**
 * GET /api/v1/agent-sessions
 * Get active agent sessions
 */
export async function GET(req: Request) {
  try {
    const prisma = await getPrisma()
    const agentSessionModel = getAgentSessionModel(prisma)

    // Clean up expired sessions first
    await cleanupExpiredSessions(prisma)

    // Get active sessions
    const sessions = await agentSessionModel.findMany({
      where: {
        status: "active"
      },
      include: {
        _count: {
          select: {
            tasks: {
              where: {
                status: {
                  in: ["pending", "urgent"]
                }
              }
            }
          }
        }
      },
      orderBy: {
        lastHeartbeat: "desc"
      }
    })

    const formattedSessions = sessions.map((session: any) => ({
      id: session.id,
      agentName: session.agentName,
      walletAddress: session.walletAddress,
      status: session.status,
      lastHeartbeat: session.lastHeartbeat,
      startedAt: session.startedAt,
      activeTasks: session._count.tasks,
      metadata: session.metadata
    }))

    return NextResponse.json(formattedSessions)

  } catch (error: any) {
    console.error("[Agent Sessions API] GET error:", error)
    return NextResponse.json(
      { error: `Failed to fetch sessions: ${error?.message || "Unknown error"}` },
      { status: 500 }
    )
  }
}

/**
 * Clean up expired sessions and their tasks
 */
async function cleanupExpiredSessions(prisma: PrismaClient) {
  try {
    const agentSessionModel = getAgentSessionModel(prisma)
    const taskModel = getTaskModel(prisma)

    const timeoutDate = new Date(Date.now() - SESSION_TIMEOUT_MINUTES * 60 * 1000)

    // Find expired sessions
    const expiredSessions = await agentSessionModel.findMany({
      where: {
        status: "active",
        lastHeartbeat: {
          lt: timeoutDate
        }
      }
    })

    if (expiredSessions.length === 0) {
      return
    }

    console.log(`[Agent Sessions] Found ${expiredSessions.length} expired sessions`)

    // Mark sessions as expired
    await agentSessionModel.updateMany({
      where: {
        id: {
          in: expiredSessions.map((s: any) => s.id)
        }
      },
      data: {
        status: "expired",
        endedAt: new Date()
      }
    })

    // Mark pending tasks from expired sessions as aborted
    const abortedTasks = await taskModel.updateMany({
      where: {
        agentSessionId: {
          in: expiredSessions.map((s: any) => s.id)
        },
        status: {
          in: ["pending", "urgent"]
        }
      },
      data: {
        status: "aborted",
        result: {
          message: "Task aborted - agent session expired",
          timestamp: new Date().toISOString(),
          reason: "session_expired"
        }
      }
    })

    console.log(`[Agent Sessions] Expired ${expiredSessions.length} sessions, aborted ${abortedTasks.count} tasks`)

  } catch (error: any) {
    console.error("[Agent Sessions] Cleanup error:", error)
  }
}