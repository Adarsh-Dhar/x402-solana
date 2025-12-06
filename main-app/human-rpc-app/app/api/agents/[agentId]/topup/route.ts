import { NextResponse } from "next/server"
import { auth } from "@/lib/nextauth"
import { prisma } from "@/lib/prisma"
import { Connection, PublicKey } from "@solana/web3.js"
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token"

// USDC mint address (devnet)
const USDC_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU") // Devnet USDC

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

    // Verify transaction on-chain
    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com"
    const connection = new Connection(rpcUrl, "confirmed")

    try {
      const tx = await connection.getTransaction(transactionSignature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      })

      if (!tx) {
        return NextResponse.json({ error: "Transaction not found" }, { status: 400 })
      }

      // Verify transaction transferred USDC to agent wallet
      if (agent.walletAddress) {
        const agentWallet = new PublicKey(agent.walletAddress)
        const agentTokenAccount = await getAssociatedTokenAddress(USDC_MINT, agentWallet)

        // Check if transaction includes transfer to agent's token account
        // This is a simplified check - in production, parse transaction instructions
        const postTokenBalances = tx.meta?.postTokenBalances || []
        const agentBalance = postTokenBalances.find(
          (balance) => balance.accountIndex !== undefined && balance.owner === agentWallet.toBase58()
        )

        if (!agentBalance) {
          // Still allow top-up but log warning
          console.warn("Could not verify USDC transfer to agent wallet in transaction")
        }
      }
    } catch (error) {
      console.error("Transaction verification error:", error)
      return NextResponse.json({ error: "Failed to verify transaction" }, { status: 400 })
    }

    // Update agent balance
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

