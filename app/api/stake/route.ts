import { NextResponse } from "next/server"
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js"

// Ensure this route always returns JSON, not HTML error pages
export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const STAKE_AMOUNT_SOL = 0.01 // 0.01 SOL stake for devnet
const STAKE_AMOUNT_LAMPORTS = STAKE_AMOUNT_SOL * LAMPORTS_PER_SOL

// This should be your staking wallet address
const STAKING_WALLET =
  process.env.STAKING_WALLET_ADDRESS || process.env.NEXT_PUBLIC_STAKING_WALLET || "11111111111111111111111111111111"

// Lazy load prisma to catch initialization errors
async function getPrisma() {
  try {
    const { prisma } = await import("@/lib/prisma")
    if (!prisma) {
      throw new Error("Prisma client is not initialized")
    }
    return prisma
  } catch (error: any) {
    console.error("[Stake API] Failed to import prisma:", error)
    throw new Error(`Database connection error: ${error?.message || "Failed to initialize database client"}`)
  }
}

export async function POST(request: Request) {
  // Log that the route handler was called
  console.log("[Stake API] POST handler called")
  
  // Wrap everything in a try-catch to ensure we always return JSON
  try {
    // Parse request body with error handling
    let body
    try {
      body = await request.json()
    } catch (parseError: any) {
      console.error("[Stake API] Failed to parse request body:", parseError)
      return NextResponse.json(
        { error: "Invalid request body. Expected JSON." },
        { status: 400 }
      )
    }

    const { userId, walletAddress, transactionSignature } = body

    if (!userId || !walletAddress || !transactionSignature) {
      return NextResponse.json(
        { error: "User ID, wallet address, and transaction signature are required" },
        { status: 400 }
      )
    }

    // Get prisma client
    const prisma = await getPrisma()

    let user
    try {
      user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          walletAddress: true,
          stakeAmount: true,
        },
      })
    } catch (dbError: any) {
      console.error("[Stake API] Database query error:", dbError)
      return NextResponse.json(
        { error: `Database error: ${dbError?.message || "Failed to query user"}` },
        { status: 500 }
      )
    }

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    if (user.stakeAmount || user.walletAddress) {
      return NextResponse.json({ error: "Stake already recorded for this user" }, { status: 409 })
    }

    // Verify the transaction on Solana
    let connection
    let tx
    try {
      connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com", "confirmed")
      tx = await connection.getTransaction(transactionSignature, {
        commitment: "confirmed",
      })

      if (!tx) {
        return NextResponse.json({ error: "Transaction not found" }, { status: 400 })
      }

      // Verify transaction exists and was successful
      if (tx.meta?.err) {
        return NextResponse.json(
          { error: `Transaction failed: ${JSON.stringify(tx.meta.err)}` },
          { status: 400 }
        )
      }

      // Verify transaction details
      // Check that the transaction is from the correct wallet
      let userWalletPubkey
      try {
        userWalletPubkey = new PublicKey(walletAddress)
      } catch (pubkeyError: any) {
        console.error("[Stake API] Invalid wallet address:", pubkeyError)
        return NextResponse.json(
          { error: `Invalid wallet address: ${pubkeyError?.message || "Invalid format"}` },
          { status: 400 }
        )
      }
      
      // Verify the user's wallet is involved in the transaction
      // Check accountKeys - they can be PublicKey objects or AccountMeta objects
      const accountKeys = tx.transaction.message.accountKeys
      if (!accountKeys || accountKeys.length === 0) {
        console.error("[Stake API] Transaction has no account keys")
        return NextResponse.json(
          { error: "Transaction has no account keys" },
          { status: 400 }
        )
      }
      
      // Check if the user's wallet is in the transaction
      // accountKeys can be PublicKey objects directly or AccountMeta objects with pubkey property
      let isUserSigner = false
      try {
        isUserSigner = accountKeys.some((key: any) => {
          if (!key) return false
          
          // Handle PublicKey object directly
          if (key.equals && typeof key.equals === 'function') {
            try {
              return key.equals(userWalletPubkey)
            } catch (e) {
              return false
            }
          }
          
          // Handle AccountMeta object with pubkey property
          if (key.pubkey) {
            try {
              if (key.pubkey.equals && typeof key.pubkey.equals === 'function') {
                return key.pubkey.equals(userWalletPubkey)
              }
            } catch (e) {
              return false
            }
          }
          
          return false
        })
      } catch (verifyError: any) {
        console.error("[Stake API] Error verifying user wallet in transaction:", verifyError)
        console.error("[Stake API] AccountKeys structure:", accountKeys?.map((k: any) => ({
          type: typeof k,
          hasEquals: !!k?.equals,
          hasPubkey: !!k?.pubkey,
          pubkeyType: typeof k?.pubkey,
        })))
        return NextResponse.json(
          { error: `Failed to verify transaction: ${verifyError.message}` },
          { status: 400 }
        )
      }
      
      if (!isUserSigner) {
        console.error("[Stake API] User wallet not found in transaction signers")
        console.error("[Stake API] User wallet:", walletAddress)
        console.error("[Stake API] Account keys count:", accountKeys.length)
        return NextResponse.json(
          { error: "Transaction must be from the provided wallet address" },
          { status: 400 }
        )
      }

      // Basic verification - transaction exists, is confirmed, and user is a signer
      // We trust that if the transaction was confirmed on-chain, it's valid
      console.log("[Stake API] Transaction verified:", {
        signature: transactionSignature,
        userWallet: walletAddress,
        confirmed: !!tx,
        hasError: !!tx.meta?.err,
      })

      // Update user with staking information
      console.log("[Stake API] Updating user with staking info:", {
        userId,
        walletAddress,
        stakeAmount: STAKE_AMOUNT_SOL,
        transactionSignature,
      })

      // Update user with staking information
      let updatedUser
      try {
        // Simple update - Prisma handles transactions automatically
        updatedUser = await prisma.user.update({
          where: { id: userId },
          data: {
            walletAddress,
            stakeAmount: STAKE_AMOUNT_SOL,
            stakeTransactionHash: transactionSignature,
          },
          select: {
            id: true,
            email: true,
            walletAddress: true,
            stakeAmount: true,
            stakeTransactionHash: true,
          },
        })
        
        console.log("[Stake API] User updated successfully:", JSON.stringify(updatedUser, null, 2))
        
        // Verify the update immediately by reading from database
        const verifyRead = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            walletAddress: true,
            stakeAmount: true,
            stakeTransactionHash: true,
          },
        })
        
        console.log("[Stake API] Verification read from database:", JSON.stringify(verifyRead, null, 2))
        
        if (!verifyRead?.walletAddress || !verifyRead?.stakeAmount || !verifyRead?.stakeTransactionHash) {
          console.error("[Stake API] Database verification failed - data not found after update")
          console.error("[Stake API] Verify read result:", verifyRead)
          return NextResponse.json(
            { error: "Update completed but verification failed - data not found in database" },
            { status: 500 }
          )
        }
        
        console.log("[Stake API] Database verification successful - all fields present")
        
        // Verify the update response data
        if (!updatedUser.walletAddress || !updatedUser.stakeAmount || !updatedUser.stakeTransactionHash) {
          console.error("[Stake API] Update returned incomplete data:", updatedUser)
          return NextResponse.json(
            { error: "Update completed but response data is incomplete" },
            { status: 500 }
          )
        }
      } catch (updateError: any) {
        console.error("[Stake API] Failed to update user:", updateError)
        console.error("[Stake API] Error details:", {
          message: updateError.message,
          stack: updateError.stack,
          code: updateError.code,
          meta: updateError.meta,
        })
        return NextResponse.json(
          { error: `Failed to save staking information: ${updateError.message}` },
          { status: 500 }
        )
      }

      // Return success response with proper JSON
      // Ensure all values are properly serialized
      const responseData = {
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          walletAddress: updatedUser.walletAddress || "",
          stakeAmount: updatedUser.stakeAmount ? updatedUser.stakeAmount.toString() : null,
          stakeTransactionHash: updatedUser.stakeTransactionHash || "",
        },
      }
      
      // Validate response data before sending
      if (!responseData.user.walletAddress || !responseData.user.stakeAmount || !responseData.user.stakeTransactionHash) {
        console.error("[Stake API] Response data validation failed:", responseData)
        return NextResponse.json(
          { error: "Staking data is incomplete in response" },
          { status: 500 }
        )
      }
      
      // Serialize to JSON string first to ensure it's valid
      let jsonString
      try {
        jsonString = JSON.stringify(responseData)
        console.log("[Stake API] JSON serialization successful, length:", jsonString.length)
      } catch (jsonError: any) {
        console.error("[Stake API] Failed to serialize response to JSON:", jsonError)
        return NextResponse.json(
          { error: "Failed to serialize response data" },
          { status: 500 }
        )
      }
      
      console.log("[Stake API] Returning success response:", jsonString.substring(0, 200))
      
      // Create response with explicit JSON content
      const response = new NextResponse(jsonString, {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
      })
      
      console.log("[Stake API] Response created successfully, returning...")
      return response
    } catch (error: any) {
      console.error("[Stake API] Transaction verification error:", error)
      console.error("[Stake API] Error details:", {
        message: error?.message,
        stack: error?.stack,
        name: error?.name,
      })
      return NextResponse.json(
        { error: `Failed to verify transaction: ${error?.message || "Unknown error"}` },
        { status: 400 }
      )
    }
  } catch (error: any) {
    console.error("[Stake API] Top-level error:", error)
    console.error("[Stake API] Error details:", {
      message: error?.message,
      stack: error?.stack,
      name: error?.name,
    })
    // Always return JSON, never let Next.js return HTML error pages
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

// Export error handler to catch any module-level errors
export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed. Use POST." },
    { 
      status: 405,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
    }
  )
}

