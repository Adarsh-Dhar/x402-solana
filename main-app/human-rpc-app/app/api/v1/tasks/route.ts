import { NextResponse } from "next/server"
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js"
import { SOLANA_RPC_URL } from "@/lib/solanaConfig"
import type { PrismaClient } from "@prisma/client"

// Ensure this route always returns JSON, not HTML error pages
export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// Payment configuration
const PRICE_SOL = 0.01 // 0.01 SOL payment required
const PRICE_LAMPORTS = PRICE_SOL * LAMPORTS_PER_SOL

// Treasury wallet (uses staking wallet)
const TREASURY_WALLET =
  process.env.STAKING_WALLET_ADDRESS || process.env.NEXT_PUBLIC_STAKING_WALLET || "11111111111111111111111111111111"

// Lazy load prisma to catch initialization errors
async function getPrisma(): Promise<PrismaClient> {
  try {
    const { prisma } = await import("@/lib/prisma")
    if (!prisma) {
      throw new Error("Prisma client is not initialized")
    }
    return prisma as PrismaClient
  } catch (error: any) {
    console.error("[Tasks API] Failed to import prisma:", error)
    throw new Error(`Database connection error: ${error?.message || "Failed to initialize database client"}`)
  }
}

/**
 * Verify payment on-chain
 * Checks:
 * 1. Transaction exists and is confirmed
 * 2. Amount matches exactly (0.01 SOL = 10,000,000 lamports)
 * 3. Recipient is the treasury/staking wallet
 */
async function verifyPaymentOnChain(signature: string, expectedAmountLamports: number): Promise<boolean> {
  try {
    const connection = new Connection(SOLANA_RPC_URL, "confirmed")
    
    // Get transaction
    const tx = await connection.getTransaction(signature, {
      commitment: "confirmed",
    })

    if (!tx) {
      console.error("[Tasks API] Transaction not found:", signature)
      return false
    }

    // Check if transaction failed
    if (tx.meta?.err) {
      console.error("[Tasks API] Transaction failed:", tx.meta.err)
      return false
    }

    // Verify recipient is treasury wallet
    const treasuryPubkey = new PublicKey(TREASURY_WALLET)
    
    // Check account keys to find the recipient
    const accountKeys = tx.transaction.message.accountKeys
    if (!accountKeys || accountKeys.length === 0) {
      console.error("[Tasks API] Transaction has no account keys")
      return false
    }

    // Find the treasury wallet in the transaction
    let treasuryFound = false
    let totalAmountReceived = 0

    // Check pre and post balances to find the transfer amount
    const preBalances = tx.meta?.preBalances || []
    const postBalances = tx.meta?.postBalances || []

    for (let i = 0; i < accountKeys.length; i++) {
      const key: any = accountKeys[i]
      if (!key) continue

      let pubkey: PublicKey | null = null

      // Handle PublicKey object directly
      if (key.equals && typeof key.equals === "function") {
        try {
          if (key.equals(treasuryPubkey)) {
            pubkey = key as PublicKey
          }
        } catch (e) {
          // Skip if comparison fails
        }
      }

      // Handle AccountMeta object with pubkey property
      if (!pubkey && key.pubkey) {
        try {
          if (key.pubkey.equals && typeof key.pubkey.equals === "function") {
            if (key.pubkey.equals(treasuryPubkey)) {
              pubkey = key.pubkey as PublicKey
            }
          }
        } catch (e) {
          // Skip if comparison fails
        }
      }

      if (pubkey) {
        treasuryFound = true
        
        // Calculate amount received by treasury
        if (i < preBalances.length && i < postBalances.length) {
          const preBalance = preBalances[i]
          const postBalance = postBalances[i]
          totalAmountReceived = postBalance - preBalance
        }
        break
      }
    }

    if (!treasuryFound) {
      console.error("[Tasks API] Treasury wallet not found in transaction")
      return false
    }

    // Verify amount matches exactly
    if (totalAmountReceived !== expectedAmountLamports) {
      console.error(
        `[Tasks API] Amount mismatch. Expected: ${expectedAmountLamports}, Received: ${totalAmountReceived}`
      )
      return false
    }

    console.log("[Tasks API] Payment verified successfully:", {
      signature,
      amount: totalAmountReceived,
      recipient: TREASURY_WALLET,
    })

    return true
  } catch (error: any) {
    console.error("[Tasks API] Payment verification error:", error)
    return false
  }
}

export async function POST(req: Request) {
  console.log("[Tasks API] POST handler called")

  try {
    // Parse request body
    let body
    try {
      body = await req.json()
    } catch (parseError: any) {
      console.error("[Tasks API] Failed to parse request body:", parseError)
      return NextResponse.json({ error: "Invalid request body. Expected JSON." }, { status: 400 })
    }

    const { text, task_type } = body

    if (!text) {
      return NextResponse.json({ error: "Text field is required" }, { status: 400 })
    }

    // Check for payment signature header (lowercase)
    const signature = req.headers.get("x-payment-signature")

    if (!signature) {
      // ⛔ STOP: No payment proof found. Return 402.
      console.log("[Tasks API] Payment required (402). No signature header.")
      return NextResponse.json(
        {
          error: "Payment Required",
          payment_address: TREASURY_WALLET,
          amount: PRICE_SOL,
          currency: "SOL",
        },
        { status: 402 }
      )
    }

    // ✅ VERIFY: Check if the signature is valid on-chain
    console.log("[Tasks API] Verifying payment signature:", signature)
    const isValid = await verifyPaymentOnChain(signature, PRICE_LAMPORTS)

    if (!isValid) {
      console.error("[Tasks API] Payment verification failed")
      return NextResponse.json({ error: "Invalid or insufficient payment" }, { status: 403 })
    }

    // 🚀 SUCCESS: Process the task and save to database
    console.log("[Tasks API] Payment verified. Saving task to database...")
    const prisma = await getPrisma()

    try {
      // TypeScript workaround: task model exists at runtime but types may not be recognized
      // This is safe as we verified the model exists after Prisma generation
      const task = await (prisma as PrismaClient & { task: any }).task.create({
        data: {
          text,
          taskType: task_type || "sentiment_analysis",
          paymentSignature: signature,
          status: "completed",
          result: {
            message: "Task accepted and processed",
            timestamp: new Date().toISOString(),
          },
        },
      })

      console.log("[Tasks API] Task saved successfully:", task.id)

      return NextResponse.json(
        {
          status: "Task Accepted",
          task_id: task.id,
          sentiment: "POSITIVE", // Placeholder - would be actual analysis result
          confidence: 0.95, // Placeholder
        },
        { status: 202 }
      )
    } catch (dbError: any) {
      console.error("[Tasks API] Database error:", dbError)
      return NextResponse.json(
        { error: `Failed to save task: ${dbError?.message || "Database error"}` },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error("[Tasks API] Top-level error:", error)
    return NextResponse.json(
      { error: `Internal server error: ${error?.message || "Unknown error"}` },
      {
        status: 500,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
      }
    )
  }
}

// Export error handler for unsupported methods
export async function GET() {
  return NextResponse.json({ error: "Method not allowed. Use POST." }, {
    status: 405,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  })
}

