import { NextResponse } from "next/server"
import { auth } from "@/lib/nextauth"
import { prisma } from "@/lib/prisma"
import { hashPassword } from "@/lib/auth"
import { randomBytes } from "crypto"

// Generate a secure API key
function generateApiKey(): string {
  return `hrpc_${randomBytes(32).toString("base64url")}`
}

export async function POST(
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

    // Generate new API key
    const newApiKey = generateApiKey()
    const apiKeyHash = await hashPassword(newApiKey)

    // Update agent with new API key hash
    await prisma.agent.update({
      where: { id: agent.id },
      data: {
        apiKeyHash: apiKeyHash,
      },
    })

    // Return the new API key (only shown once)
    return NextResponse.json(
      {
        apiKey: newApiKey,
        message: "API key regenerated successfully. Save this key now - you won't be able to see it again.",
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error("Regenerate API key error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

