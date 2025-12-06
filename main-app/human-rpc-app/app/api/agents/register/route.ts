import { NextResponse } from "next/server"
import { auth } from "@/lib/nextauth"
import { prisma } from "@/lib/prisma"
import { hashPassword } from "@/lib/auth"
import { randomBytes } from "crypto"
import { Keypair, Connection } from "@solana/web3.js"

// Generate a secure API key
function generateApiKey(): string {
  return `hrpc_${randomBytes(32).toString("base64url")}`
}

// Generate a unique agent ID
function generateAgentId(): string {
  return `agent_${randomBytes(16).toString("base64url")}`
}

// Create Solana wallet for agent (simplified - in production, use program-derived addresses)
async function createAgentWallet(): Promise<{ publicKey: string; secretKey: string }> {
  const keypair = Keypair.generate()
  return {
    publicKey: keypair.publicKey.toBase58(),
    secretKey: Buffer.from(keypair.secretKey).toString("base64"),
  }
}

// Register agent on-chain (placeholder - integrate with x402 program)
async function registerAgentOnChain(
  walletAddress: string,
  agentId: string,
  connection: Connection
): Promise<string | null> {
  // TODO: Integrate with x402 program for on-chain registration
  // For now, return a mock transaction signature
  // In production, this would create a program-derived address (PDA) for the agent
  return null // Placeholder
}

export async function POST(request: Request) {
  try {
    const session = await auth()

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { name, description, avatarUrl, confidenceThreshold, maxDailyBudget, responseTime, transactionSignature } = body

    // Validation
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ error: "Agent name is required" }, { status: 400 })
    }

    if (confidenceThreshold === undefined || confidenceThreshold < 0 || confidenceThreshold > 100) {
      return NextResponse.json({ error: "Confidence threshold must be between 0 and 100" }, { status: 400 })
    }

    if (maxDailyBudget === undefined || maxDailyBudget < 0) {
      return NextResponse.json({ error: "Max daily budget must be a positive number" }, { status: 400 })
    }

    if (!responseTime || !["fast", "standard", "economy"].includes(responseTime)) {
      return NextResponse.json({ error: "Response time must be 'fast', 'standard', or 'economy'" }, { status: 400 })
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Generate agent ID and API key
    const agentId = generateAgentId()
    const apiKey = generateApiKey()
    const apiKeyHash = await hashPassword(apiKey) // Reuse password hashing for API keys

    // Create Solana wallet for agent
    const { publicKey: walletAddress } = await createAgentWallet()

    // Convert confidence threshold from percentage to decimal (0-1)
    const confidenceDecimal = confidenceThreshold / 100

    // Register on-chain (if transaction signature provided)
    let onChainAddress: string | null = null
    if (transactionSignature) {
      // Verify transaction and extract on-chain address
      // TODO: Implement x402 program integration
      const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com"
      const connection = new Connection(rpcUrl, "confirmed")
      onChainAddress = await registerAgentOnChain(walletAddress, agentId, connection)
    }

    // Create agent in database
    const agent = await prisma.agent.create({
      data: {
        userId: user.id,
        name: name.trim(),
        description: description?.trim() || null,
        avatarUrl: avatarUrl || null,
        confidenceThreshold: confidenceDecimal,
        maxDailyBudget: maxDailyBudget,
        responseTime: responseTime,
        agentId: agentId,
        apiKeyHash: apiKeyHash,
        walletAddress: walletAddress,
        onChainAddress: onChainAddress,
        balance: 0,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        description: true,
        avatarUrl: true,
        confidenceThreshold: true,
        maxDailyBudget: true,
        responseTime: true,
        agentId: true,
        balance: true,
        walletAddress: true,
        onChainAddress: true,
        isActive: true,
        createdAt: true,
      },
    })

    // Return agent with API key (only shown once)
    return NextResponse.json(
      {
        agent: {
          ...agent,
          confidenceThreshold: agent.confidenceThreshold.toNumber() * 100, // Convert back to percentage
          maxDailyBudget: agent.maxDailyBudget.toNumber(),
          balance: agent.balance.toNumber(),
        },
        apiKey: apiKey, // Only returned once during registration
      },
      { status: 201 }
    )
  } catch (error: any) {
    console.error("Agent registration error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

