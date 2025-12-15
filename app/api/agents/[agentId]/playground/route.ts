import { NextResponse } from "next/server"
import { auth } from "@/lib/nextauth"
import { prisma } from "@/lib/prisma"

// Simulate AI confidence calculation (in production, this would call actual AI model)
function calculateAIConfidence(query: string): number {
  // Simple heuristic: longer queries with specific keywords have lower confidence
  const lowerQuery = query.toLowerCase()
  const hasUncertainty = /(maybe|perhaps|might|could|possibly|not sure|unsure|doubt)/.test(lowerQuery)
  const hasComplexity = /(refund|return|cancel|dispute|complaint|issue|problem)/.test(lowerQuery)
  const length = query.length

  let confidence = 0.85 // Base confidence

  if (hasUncertainty) confidence -= 0.2
  if (hasComplexity) confidence -= 0.15
  if (length > 200) confidence -= 0.1
  if (length < 20) confidence += 0.1

  return Math.max(0.1, Math.min(0.99, confidence))
}

// Simulate human response
function simulateHumanResponse(query: string, aiConfidence: number): string | null {
  if (aiConfidence >= 0.9) {
    return null // AI auto, no human needed
  }

  // Mock human responses based on query content
  const lowerQuery = query.toLowerCase()
  if (lowerQuery.includes("refund")) {
    return "Grant Refund - Customer has valid reason and meets refund policy criteria."
  }
  if (lowerQuery.includes("cancel")) {
    return "Approve Cancellation - Request is within cancellation window."
  }
  if (lowerQuery.includes("complaint")) {
    return "Escalate to Support - Issue requires human intervention and follow-up."
  }

  return "Human Review Required - Query requires additional context and verification."
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

    const body = await request.json()
    const { query } = body

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 })
    }

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
      select: {
        id: true,
        confidenceThreshold: true,
      },
    })

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 })
    }

    // Calculate AI confidence
    const aiConfidence = calculateAIConfidence(query)
    const confidenceThreshold = agent.confidenceThreshold.toNumber()

    // Determine if human would be triggered
    const wouldTriggerHuman = aiConfidence < confidenceThreshold

    // Simulate human response if triggered
    const humanResponse = wouldTriggerHuman ? simulateHumanResponse(query, aiConfidence) : null

    // Calculate estimated cost (if human triggered)
    const estimatedCost = wouldTriggerHuman ? 0.05 : 0 // $0.05 per human call

    return NextResponse.json(
      {
        query,
        aiConfidence: aiConfidence * 100, // Return as percentage
        confidenceThreshold: confidenceThreshold * 100,
        wouldTriggerHuman,
        status: wouldTriggerHuman ? "pending" : "ai_auto",
        humanResponse,
        estimatedCost,
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error("Playground error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

