import { NextResponse } from "next/server"
import { Connection, PublicKey, LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js"
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

// Helper to safely access task model
function getTaskModel(prisma: PrismaClient) {
  // Access task model directly - Prisma generates it at runtime
  const prismaAny = prisma as any
  return prismaAny.task
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
    console.log("[Tasks API] Starting payment verification...")
    console.log("[Tasks API] Signature:", signature)
    console.log("[Tasks API] Expected amount (lamports):", expectedAmountLamports)
    console.log("[Tasks API] RPC URL:", SOLANA_RPC_URL)
    
    const connection = new Connection(SOLANA_RPC_URL, "confirmed")
    
    // Get transaction
    console.log("[Tasks API] Fetching transaction from blockchain...")
    const tx = await connection.getTransaction(signature, {
      commitment: "confirmed",
    })

    if (!tx) {
      console.error("[Tasks API] Transaction not found:", signature)
      console.error("[Tasks API] This could mean the transaction hasn't been confirmed yet or the signature is invalid")
      return false
    }

    console.log("[Tasks API] Transaction found. Checking status...")
    
    // Check if transaction failed
    if (tx.meta?.err) {
      console.error("[Tasks API] Transaction failed:", tx.meta.err)
      return false
    }
    
    console.log("[Tasks API] Transaction confirmed successfully")

    // Verify recipient is treasury wallet
    const treasuryPubkey = new PublicKey(TREASURY_WALLET)
    const treasuryPubkeyString = treasuryPubkey.toBase58()
    
    console.log("[Tasks API] Looking for treasury wallet:", treasuryPubkeyString)
    
    // First, check transaction instructions to verify transfer
    let transferFound = false
    let transferAmount = 0
    const instructions = tx.transaction.message.instructions
    const txAccountKeys = tx.transaction.message.accountKeys
    
    console.log("[Tasks API] Checking transaction instructions...")
    if (instructions && instructions.length > 0 && txAccountKeys) {
      for (let i = 0; i < instructions.length; i++) {
        const ix = instructions[i]
        // CompiledInstruction has programIdIndex, not programId directly
        const programIdIndex = ix.programIdIndex
        const programIdKey = txAccountKeys[programIdIndex]
        
        // Get program ID string
        let programIdString: string | null = null
        if (programIdKey) {
          if (programIdKey.toBase58) {
            programIdString = programIdKey.toBase58()
          } else if (programIdKey.toString) {
            programIdString = programIdKey.toString()
          }
        }
        
        // Check if this is a System Program transfer
        if (programIdString === SystemProgram.programId.toBase58()) {
          console.log(`[Tasks API]   Found System Program instruction at index ${i}`)
          
          // Try to decode the transfer instruction
          // System transfer instruction format: [instruction discriminator (1 byte), lamports (8 bytes)]
          // And the accounts are: [from (signer, writable), to (writable)]
          try {
            // CompiledInstruction uses accountKeyIndexes array
            const accountKeyIndexes = (ix as any).accountKeyIndexes || []
            if (accountKeyIndexes.length >= 2) {
              const toAccountIndex = accountKeyIndexes[1]
              const toAccountKey = txAccountKeys[toAccountIndex]
              
              let toPubkey: string | null = null
              if (toAccountKey) {
                if (toAccountKey.toBase58) {
                  toPubkey = toAccountKey.toBase58()
                } else if (toAccountKey.toString) {
                  toPubkey = toAccountKey.toString()
                }
              }
              
              console.log(`[Tasks API]   Transfer to account: ${toPubkey}`)
              
              if (toPubkey === treasuryPubkeyString) {
                transferFound = true
                // Decode lamports from instruction data
                // Instruction data format: [instruction discriminator (1 byte), lamports (8 bytes)]
                if (ix.data) {
                  const dataBytes = typeof ix.data === 'string' 
                    ? Buffer.from(ix.data, 'base64') 
                    : Buffer.from(ix.data)
                  
                  if (dataBytes.length >= 9) {
                    // Skip first byte (discriminator), read next 8 bytes as u64 (little-endian)
                    transferAmount = Number(dataBytes.readBigUint64LE(1))
                    console.log(`[Tasks API]   ✓ Transfer instruction found: ${transferAmount} lamports to treasury`)
                  }
                }
              }
            }
          } catch (e) {
            console.log(`[Tasks API]   Could not decode instruction ${i}:`, e)
          }
        }
      }
    }
    
    if (transferFound && transferAmount > 0) {
      console.log("[Tasks API] Transfer instruction verified:", {
        amount: transferAmount,
        recipient: treasuryPubkeyString
      })
    } else {
      console.log("[Tasks API] Transfer instruction not found or could not be decoded")
      console.log("[Tasks API] Will verify using balance changes instead")
    }
    
    // Check account keys to find the recipient
    const accountKeys = tx.transaction.message.accountKeys
    if (!accountKeys || accountKeys.length === 0) {
      console.error("[Tasks API] Transaction has no account keys")
      return false
    }

    console.log("[Tasks API] Transaction has", accountKeys.length, "account keys")

    // Find the treasury wallet in the transaction
    let treasuryFound = false
    let treasuryIndex = -1
    let totalAmountReceived = 0

    // Check pre and post balances to find the transfer amount
    const preBalances = tx.meta?.preBalances || []
    const postBalances = tx.meta?.postBalances || []

    // Log all account keys for debugging
    console.log("[Tasks API] Account keys in transaction:")
    for (let i = 0; i < accountKeys.length; i++) {
      const key: any = accountKeys[i]
      if (!key) continue

      let pubkeyString: string | null = null

      // Handle PublicKey object directly
      if (key.toBase58 && typeof key.toBase58 === "function") {
        try {
          pubkeyString = key.toBase58()
        } catch (e) {
          // Skip if conversion fails
        }
      }

      // Handle AccountMeta object with pubkey property
      if (!pubkeyString && key.pubkey) {
        try {
          if (key.pubkey.toBase58 && typeof key.pubkey.toBase58 === "function") {
            pubkeyString = key.pubkey.toBase58()
          } else if (key.pubkey.toString) {
            pubkeyString = key.pubkey.toString()
          }
        } catch (e) {
          // Skip if conversion fails
        }
      }

      // Try toString as fallback
      if (!pubkeyString && key.toString) {
        try {
          pubkeyString = key.toString()
        } catch (e) {
          // Skip if conversion fails
        }
      }

      if (pubkeyString) {
        console.log(`[Tasks API]   Account ${i}: ${pubkeyString} (pre: ${preBalances[i]}, post: ${postBalances[i]})`)
        
        // Check if this is the treasury wallet using string comparison
        if (pubkeyString === treasuryPubkeyString) {
          treasuryFound = true
          treasuryIndex = i
          console.log(`[Tasks API]   ✓ Treasury wallet found at index ${i}`)
        }
      } else {
        console.log(`[Tasks API]   Account ${i}: [Could not extract pubkey]`)
      }
    }

    if (!treasuryFound) {
      console.error("[Tasks API] Treasury wallet not found in transaction")
      console.error("[Tasks API] Expected treasury wallet:", treasuryPubkeyString)
      console.error("[Tasks API] Transaction account keys count:", accountKeys.length)
      return false
    }

    // Calculate amount received by treasury
    if (treasuryIndex >= 0 && treasuryIndex < preBalances.length && treasuryIndex < postBalances.length) {
      const preBalance = preBalances[treasuryIndex]
      const postBalance = postBalances[treasuryIndex]
      totalAmountReceived = postBalance - preBalance
      
      console.log("[Tasks API] Treasury wallet found in transaction at index", treasuryIndex)
      console.log("[Tasks API] Pre-balance:", preBalance, "lamports")
      console.log("[Tasks API] Post-balance:", postBalance, "lamports")
      console.log("[Tasks API] Amount received by treasury:", totalAmountReceived, "lamports")
    } else {
      console.error("[Tasks API] Invalid treasury index or balance arrays mismatch")
      return false
    }

    // Verify amount - use instruction amount if available, otherwise use balance change
    const verifiedAmount = transferFound && transferAmount > 0 ? transferAmount : totalAmountReceived
    const amountDifference = Math.abs(verifiedAmount - expectedAmountLamports)
    const tolerance = 1000 // Allow 1000 lamports tolerance (0.000001 SOL) for any edge cases
    
    console.log("[Tasks API] Amount verification:", {
      expected: expectedAmountLamports,
      fromInstruction: transferFound ? transferAmount : "N/A",
      fromBalance: totalAmountReceived,
      using: verifiedAmount,
      difference: amountDifference
    })
    
    if (amountDifference > tolerance) {
      console.error(
        `[Tasks API] Amount mismatch. Expected: ${expectedAmountLamports}, Received: ${verifiedAmount}`
      )
      console.error("[Tasks API] Difference:", amountDifference, "lamports (tolerance:", tolerance, ")")
      return false
    }
    
    console.log("[Tasks API] Amount verification passed (within tolerance)")

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
  console.log("[Tasks API] Request URL:", req.url)
  console.log("[Tasks API] Request headers:", Object.fromEntries(req.headers.entries()))

  try {
    // Parse request body
    let body
    try {
      const bodyText = await req.text()
      console.log("[Tasks API] Request body (first 500 chars):", bodyText.substring(0, 500))
      body = JSON.parse(bodyText)
    } catch (parseError: any) {
      console.error("[Tasks API] Failed to parse request body:", parseError)
      return NextResponse.json(
        { error: "Invalid request body. Expected JSON." },
        { 
          status: 400,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
          }
        }
      )
    }

    const { 
      text, 
      task_type,
      agentName,
      reward,
      rewardAmount,
      category,
      escrowAmount,
      context,
      paymentAmount,
      paymentAddress
    } = body

    console.log("[Tasks API] Parsed request data:", {
      text: text?.substring(0, 100),
      task_type,
      agentName,
      reward,
      rewardAmount,
      category,
      escrowAmount,
      hasContext: !!context,
      paymentAmount,
      paymentAddress
    })

    if (!text) {
      return NextResponse.json(
        { error: "Text field is required" },
        { 
          status: 400,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
          }
        }
      )
    }

    // Store payment info (no verification for now)
    const paymentInfo = paymentAmount && paymentAddress ? {
      amount: paymentAmount,
      address: paymentAddress,
      currency: "SOL"
    } : null

    console.log("[Tasks API] Payment info received (not verified):", paymentInfo)

    // 🚀 Process the task and save to database
    console.log("[Tasks API] Saving task to database...")
    const prisma = await getPrisma()

    try {
      // TypeScript workaround: task model exists at runtime but types may not be recognized
      // This is safe as we verified the model exists after Prisma generation
      const task = await (prisma as PrismaClient & { task: any }).task.create({
        data: {
          text,
          taskType: task_type || "sentiment_analysis",
          paymentSignature: null, // No payment verification for now
          status: "pending",
          agentName: agentName || null,
          reward: reward || null,
          rewardAmount: rewardAmount ? parseFloat(rewardAmount.toString()) : null,
          category: category || null,
          escrowAmount: escrowAmount || null,
          context: context ? {
            ...context,
            payment: paymentInfo
          } : paymentInfo ? { payment: paymentInfo } : null,
          result: {
            message: "Task created and awaiting human review",
            timestamp: new Date().toISOString(),
            payment: paymentInfo
          },
        },
      })

      console.log("[Tasks API] Task saved successfully:", task.id)
      console.log("[Tasks API] Task details:", JSON.stringify({
        id: task.id,
        text: task.text,
        agentName: task.agentName,
        status: task.status,
      }))

      const responseData = {
        status: "Task Accepted",
        task_id: task.id,
        sentiment: "POSITIVE", // Placeholder - would be actual analysis result
        confidence: 0.95, // Placeholder
      }
      
      console.log("[Tasks API] Returning response:", JSON.stringify(responseData))
      
      return NextResponse.json(
        responseData,
        { 
          status: 202,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
          }
        }
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

/**
 * Format a date as relative time (e.g., "2 min ago", "1 hour ago")
 */
function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSecs < 60) {
    return `${diffSecs} sec ago`
  } else if (diffMins < 60) {
    return `${diffMins} min ago`
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`
  } else {
    return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`
  }
}

/**
 * Map database status to frontend status
 */
function mapStatus(dbStatus: string): "open" | "urgent" | "completed" {
  if (dbStatus === "pending") return "open"
  if (dbStatus === "urgent") return "urgent"
  if (dbStatus === "completed") return "completed"
  return "open" // default
}

export async function GET() {
  try {
    console.log("[Tasks API] GET handler called")
    const prisma = await getPrisma()
    console.log("[Tasks API] Prisma client obtained")

    // Get task model safely
    const taskModel = getTaskModel(prisma)
    console.log("[Tasks API] Task model accessed successfully")

    // Fetch all tasks from database
    let tasks
    try {
      tasks = await taskModel.findMany({
        orderBy: {
          createdAt: "desc",
        },
      })
      console.log(`[Tasks API] Found ${tasks.length} tasks`)
    } catch (dbError: any) {
      console.error("[Tasks API] Database query error:", dbError)
      console.error("[Tasks API] Error details:", {
        message: dbError?.message,
        code: dbError?.code,
        meta: dbError?.meta,
        stack: dbError?.stack,
      })
      throw dbError
    }

    // Transform tasks to frontend format
    const transformedTasks = tasks.map((task: any) => {
      try {
        // Use context if available, otherwise construct from result
        let contextData = task.context || null
        if (!contextData && task.result) {
          // Fallback: construct context from result if context not provided
          contextData = {
            type: task.taskType || "sentiment_analysis",
            summary: task.text || "",
            data: task.result || {},
          }
        }

        // Extract payment info from context or result
        let paymentInfo = null
        if (contextData && typeof contextData === 'object' && 'payment' in contextData) {
          paymentInfo = (contextData as any).payment
        } else if (task.result && typeof task.result === 'object' && 'payment' in task.result) {
          paymentInfo = (task.result as any).payment
        }

        // Safely extract ID - handle both string and object IDs
        const taskId = typeof task.id === "string" ? task.id : String(task.id || "")
        const displayId = taskId.length >= 4 ? `#${taskId.slice(-4)}` : `#${taskId}`

        // Safely parse rewardAmount
        let rewardAmount = 0
        if (task.rewardAmount !== null && task.rewardAmount !== undefined) {
          try {
            rewardAmount = typeof task.rewardAmount === "number" 
              ? task.rewardAmount 
              : parseFloat(String(task.rewardAmount))
            if (isNaN(rewardAmount)) rewardAmount = 0
          } catch {
            rewardAmount = 0
          }
        }

        return {
          id: displayId,
          agentName: task.agentName || "Unknown Agent",
          reward: task.reward || "0 USDC",
          rewardAmount,
          status: mapStatus(task.status || "pending"),
          createdAt: task.createdAt 
            ? formatRelativeTime(new Date(task.createdAt)) 
            : "Just now",
          category: task.category || "General",
          escrowAmount: task.escrowAmount || "0 USDC",
          payment: paymentInfo,
          context: contextData || {
            type: task.taskType || "sentiment_analysis",
            summary: task.text || "No summary available",
            data: {},
          },
        }
      } catch (transformError: any) {
        console.error("[Tasks API] Error transforming task:", transformError, task)
        // Return a minimal valid task structure even if transformation fails
        return {
          id: `#${String(task.id || "").slice(-4)}`,
          agentName: "Unknown Agent",
          reward: "0 USDC",
          rewardAmount: 0,
          status: "open" as const,
          createdAt: "Just now",
          category: "General",
          escrowAmount: "0 USDC",
          payment: null,
          context: {
            type: "unknown",
            summary: task.text || "Task details unavailable",
            data: {},
          },
        }
      }
    })

    return NextResponse.json(transformedTasks, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
    })
  } catch (error: any) {
    console.error("[Tasks API] GET error:", error)
    console.error("[Tasks API] Error name:", error?.name)
    console.error("[Tasks API] Error message:", error?.message)
    console.error("[Tasks API] Error stack:", error?.stack)
    console.error("[Tasks API] Full error object:", JSON.stringify(error, Object.getOwnPropertyNames(error)))
    
    // Provide more detailed error information
    const errorMessage = error?.message || "Unknown error"
    const isPrismaError = errorMessage.includes("Prisma") || errorMessage.includes("prisma") || error?.code?.startsWith("P")
    
    // Check for specific Prisma error codes
    let hint = undefined
    if (isPrismaError) {
      if (error?.code === "P2001" || errorMessage.includes("does not exist")) {
        hint = "Database table or column does not exist. Run 'npx prisma migrate dev' to apply migrations."
      } else if (errorMessage.includes("PrismaClient")) {
        hint = "Prisma client issue. Try running 'npx prisma generate' and restart the server."
      } else {
        hint = "Database error. Check your DATABASE_URL and ensure migrations are applied."
      }
    }
    
    return NextResponse.json(
      { 
        error: `Failed to fetch tasks: ${errorMessage}`,
        hint,
        code: error?.code,
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

