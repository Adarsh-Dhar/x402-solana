import { NextResponse } from "next/server"
import { auth } from "@/lib/nextauth"
import { prisma } from "@/lib/prisma"
import { Connection, PublicKey } from "@solana/web3.js"
import { verifyEscrowDepositTransaction, getUSDCMint } from "@/lib/escrow"

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
    const { amount, transactionSignature } = body

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "Amount must be a positive number" }, { status: 400 })
    }

    if (!transactionSignature) {
      return NextResponse.json({ error: "Transaction signature is required" }, { status: 400 })
    }

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

    // Verify escrow deposit transaction on-chain
    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com"
    const connection = new Connection(rpcUrl, "confirmed")

    try {
      // Verify the transaction is an escrow deposit for this agent
      const isValidEscrowDeposit = await verifyEscrowDepositTransaction(
        connection,
        transactionSignature,
        agent.agentId, // Use the agent's public agentId
        amount
      )

      if (!isValidEscrowDeposit) {
        return NextResponse.json(
          { error: "Transaction is not a valid escrow deposit for this agent" },
          { status: 400 }
        )
      }
    } catch (error) {
      console.error("Transaction verification error:", error)
      return NextResponse.json({ error: "Failed to verify transaction" }, { status: 400 })
    }

    // Update agent balance (this represents the escrow balance for the agent)
    // The actual USDC is held in the escrow contract
    const updatedAgent = await prisma.agent.update({
      where: { id: agent.id },
      data: {
        balance: {
          increment: amount,
        },
      },
      select: {
        balance: true,
      },
    })

    // Create transaction record
    await prisma.agentTransaction.create({
      data: {
        agentId: agent.id,
        type: "topup",
        amount: amount,
        signature: transactionSignature,
        metadata: {
          verified: true,
        },
      },
    })

    return NextResponse.json(
      {
        success: true,
        newBalance: updatedAgent.balance.toNumber(),
        transactionSignature,
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error("Top-up error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

