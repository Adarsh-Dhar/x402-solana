import { NextResponse } from "next/server"
import { Connection, PublicKey, LAMPORTS_PER_SOL, SystemProgram, Transaction } from "@solana/web3.js"
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token"
import { SOLANA_RPC_URL } from "@/lib/solanaConfig"
import type { PrismaClient } from "@prisma/client"
import { calculateConsensusParams } from "@/lib/consensus-algorithm"

// Ensure this route always returns JSON, not HTML error pages
export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// Payment configuration
const PRICE_SOL = parseFloat(process.env.PAYMENT_AMOUNT_SOL || "0.1") // Default: 0.1 SOL payment required
const PRICE_LAMPORTS = PRICE_SOL * LAMPORTS_PER_SOL

// Per-task reward configuration (how much SOL is distributed to winners)
// By default this matches PRICE_SOL so the full payment is used as the reward pool.
export const TASK_REWARD_SOL = parseFloat(process.env.TASK_REWARD_SOL || "0.1")
export const TASK_REWARD_LAMPORTS = TASK_REWARD_SOL * LAMPORTS_PER_SOL

// USDC configuration (devnet USDC mint)
const USDC_MINT_ADDRESS = process.env.USDC_MINT_ADDRESS || "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
const PRICE_USDC = parseInt(process.env.PAYMENT_AMOUNT_USDC || "100") // 100 = 0.0001 USDC (6 decimals)

// Treasury wallet (uses staking wallet)
const TREASURY_WALLET =
  process.env.STAKING_WALLET_ADDRESS || process.env.NEXT_PUBLIC_STAKING_WALLET || "11111111111111111111111111111111"

// Payment type preference (SOL or USDC)
const PAYMENT_TYPE = (process.env.PAYMENT_TYPE || "SOL").toUpperCase()

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
 * Get the associated token account address for the treasury wallet
 */
async function getTreasuryTokenAccount(mintAddress: string): Promise<PublicKey> {
  const mint = new PublicKey(mintAddress)
  const treasury = new PublicKey(TREASURY_WALLET)
  return await getAssociatedTokenAddress(mint, treasury)
}

/**
 * Return 402 Payment Required response with payment details
 */
function getPaymentRequiredResponse(paymentType: "SOL" | "USDC" = PAYMENT_TYPE as "SOL" | "USDC") {
  if (paymentType === "USDC") {
    // For USDC, we need to return token account and mint
    return NextResponse.json(
      {
        payment: {
          recipientWallet: TREASURY_WALLET,
          tokenAccount: null, // Will be set dynamically
          mint: USDC_MINT_ADDRESS,
          amount: PRICE_USDC,
          amountUSDC: PRICE_USDC / 1_000_000, // USDC has 6 decimals
          cluster: SOLANA_RPC_URL.includes("devnet") ? "devnet" : "mainnet-beta",
          message: "Send USDC to the token account",
        },
      },
      {
        status: 402,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
      }
    )
  } else {
    // For SOL
    return NextResponse.json(
      {
        payment: {
          recipientWallet: TREASURY_WALLET,
          amount: PRICE_LAMPORTS,
          amountSOL: PRICE_SOL,
          cluster: SOLANA_RPC_URL.includes("devnet") ? "devnet" : "mainnet-beta",
          message: "Send SOL to the recipient wallet",
        },
      },
      {
        status: 402,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
      }
    )
  }
}

/**
 * Verify USDC/SPL token payment on-chain
 * Checks:
 * 1. Transaction exists and is confirmed
 * 2. Amount matches expected USDC amount
 * 3. Recipient token account is the treasury's associated token account
 */
async function verifyUSDCPaymentOnChain(
  signature: string,
  expectedAmount: number,
  expectedTokenAccount: PublicKey
): Promise<boolean> {
  try {
    console.log("[Tasks API] Starting USDC payment verification...")
    console.log("[Tasks API] Signature:", signature)
    console.log("[Tasks API] Expected amount:", expectedAmount)
    console.log("[Tasks API] Expected token account:", expectedTokenAccount.toBase58())
    
    const connection = new Connection(SOLANA_RPC_URL, "confirmed")
    
    // Get transaction
    const tx = await connection.getTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
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

    // Verify SPL Token transfer instruction
    // Handle both legacy and versioned transactions
    const accountKeys = tx.transaction.message.getAccountKeys()
    const staticAccountKeys = accountKeys.staticAccountKeys
    const instructions = tx.transaction.message.compiledInstructions || 
      (tx.transaction.message as any).instructions || []

    let validTransfer = false
    let transferAmount = 0

    for (const ix of instructions) {
      const programIdIndex = ix.programIdIndex
      const programIdKey = staticAccountKeys[programIdIndex]

      let programIdString: string | null = null
      if (programIdKey) {
        if (programIdKey.toBase58) {
          programIdString = programIdKey.toBase58()
        } else if (programIdKey.toString) {
          programIdString = programIdKey.toString()
        }
      }

      // Check if this is a Token Program instruction
      if (programIdString === TOKEN_PROGRAM_ID.toBase58()) {
        // SPL Token Transfer instruction layout:
        // [0] = instruction type (3 for Transfer)
        // [1-8] = amount (u64, little-endian)
        if (ix.data) {
          const dataBytes = typeof ix.data === 'string' 
            ? Buffer.from(ix.data, 'base64') 
            : Buffer.from(ix.data)
          
          if (dataBytes.length >= 9 && dataBytes[0] === 3) {
            // Read the amount (u64 in little-endian, starts at byte 1)
            transferAmount = Number(dataBytes.readBigUInt64LE(1))

            // Verify accounts: [source, destination, owner]
            const accountKeyIndexes = (ix as any).accountKeyIndexes || []
            if (accountKeyIndexes.length >= 2) {
              const destAccountIndex = accountKeyIndexes[1]
              const destAccountKey = staticAccountKeys[destAccountIndex]

              let destPubkey: string | null = null
              if (destAccountKey) {
                if (destAccountKey.toBase58) {
                  destPubkey = destAccountKey.toBase58()
                } else if (destAccountKey.toString) {
                  destPubkey = destAccountKey.toString()
                }
              }

              if (destPubkey === expectedTokenAccount.toBase58() && transferAmount >= expectedAmount) {
                validTransfer = true
                console.log(`[Tasks API] ✓ Valid USDC transfer: ${transferAmount / 1_000_000} USDC`)
                break
              }
            }
          }
        }
      }
    }

    if (!validTransfer) {
      console.error("[Tasks API] No valid USDC transfer instruction found")
      return false
    }

    // Verify using token balance changes
    const postTokenBalances = tx.meta?.postTokenBalances ?? []
    const preTokenBalances = tx.meta?.preTokenBalances ?? []

    let amountReceived = 0
    for (let i = 0; i < postTokenBalances.length; i++) {
      const postBal = postTokenBalances[i]
      const preBal = preTokenBalances.find(
        (pre) => pre.accountIndex === postBal.accountIndex
      )

      // Get account key from transaction
      const accountKeys = tx.transaction.message.getAccountKeys()
      const allKeys = accountKeys.keySegments().flat()
      const accountKey = allKeys[postBal.accountIndex]
      
      if (accountKey && accountKey.toBase58() === expectedTokenAccount.toBase58()) {
        const postAmount = postBal.uiTokenAmount.amount
        const preAmount = preBal?.uiTokenAmount.amount ?? "0"
        amountReceived = Number(postAmount) - Number(preAmount)
        break
      }
    }

    if (amountReceived < expectedAmount) {
      console.error(`[Tasks API] Insufficient payment: received ${amountReceived}, expected ${expectedAmount}`)
      return false
    }

    console.log(`[Tasks API] USDC payment verified: ${amountReceived / 1_000_000} USDC received`)
    return true
  } catch (error: any) {
    console.error("[Tasks API] USDC payment verification error:", error)
    return false
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

/**
 * Parse X-PAYMENT header and verify/submit transaction
 * Returns transaction signature if successful, null otherwise
 */
async function processX402Payment(
  xPaymentHeader: string,
  paymentType: "SOL" | "USDC" = PAYMENT_TYPE as "SOL" | "USDC"
): Promise<{ signature: string; verified: boolean } | null> {
  try {
    console.log("[Tasks API] Processing X-PAYMENT header...")
    
    // Decode base64 and parse JSON
    const paymentData = JSON.parse(
      Buffer.from(xPaymentHeader, "base64").toString("utf-8")
    ) as {
      x402Version: number
      scheme: string
      network: string
      payload: {
        serializedTransaction: string
      }
    }

    console.log("[Tasks API] Payment data:", {
      version: paymentData.x402Version,
      scheme: paymentData.scheme,
      network: paymentData.network,
    })

    // Deserialize the transaction
    const txBuffer = Buffer.from(paymentData.payload.serializedTransaction, "base64")
    const tx = Transaction.from(txBuffer)

    console.log("[Tasks API] Transaction deserialized successfully")

    // Simulate the transaction BEFORE submitting
    const connection = new Connection(SOLANA_RPC_URL, "confirmed")
    console.log("[Tasks API] Simulating transaction...")
    
    try {
      const simulation = await connection.simulateTransaction(tx)
      if (simulation.value.err) {
        console.error("[Tasks API] Simulation failed:", simulation.value.err)
        return null
      }
      console.log("[Tasks API] ✓ Simulation successful")
    } catch (simError) {
      console.error("[Tasks API] Simulation error:", simError)
      return null
    }

    // Verify transaction before submission
    const treasuryPubkey = new PublicKey(TREASURY_WALLET)
    let verified = false

    if (paymentType === "USDC") {
      // Verify USDC transfer instruction structure before submission
      const treasuryTokenAccount = await getTreasuryTokenAccount(USDC_MINT_ADDRESS)
      const instructions = tx.instructions
      for (const ix of instructions) {
        if (ix.programId.equals(TOKEN_PROGRAM_ID)) {
          const dataBytes = ix.data
          if (dataBytes.length >= 9 && dataBytes[0] === 3) {
            const transferAmount = Number(dataBytes.readBigUInt64LE(1))
            if (transferAmount >= PRICE_USDC) {
              // Check recipient
              if (ix.keys.length >= 2 && ix.keys[1].pubkey.equals(treasuryTokenAccount)) {
                verified = true
                break
              }
            }
          }
        }
      }
    } else {
      // Verify SOL transfer
      const instructions = tx.instructions
      for (const ix of instructions) {
        if (ix.programId.equals(SystemProgram.programId)) {
          const dataBytes = ix.data
          if (dataBytes.length >= 9) {
            const transferAmount = Number(dataBytes.readBigUInt64LE(1))
            if (transferAmount >= PRICE_LAMPORTS) {
              // Check recipient
              if (ix.keys.length >= 2 && ix.keys[1].pubkey.equals(treasuryPubkey)) {
                verified = true
                break
              }
            }
          }
        }
      }
    }

    if (!verified) {
      console.error("[Tasks API] Transaction verification failed")
      return null
    }

    // Submit the transaction
    console.log("[Tasks API] Submitting transaction to network...")
    const signature = await connection.sendRawTransaction(txBuffer, {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    })

    console.log(`[Tasks API] Transaction submitted: ${signature}`)

    // Wait for confirmation
    const confirmation = await connection.confirmTransaction(signature, "confirmed")
    if (confirmation.value.err) {
      console.error("[Tasks API] Transaction failed on-chain:", confirmation.value.err)
      return null
    }

    // Final verification on-chain
    if (paymentType === "USDC") {
      const treasuryTokenAccount = await getTreasuryTokenAccount(USDC_MINT_ADDRESS)
      verified = await verifyUSDCPaymentOnChain(signature, PRICE_USDC, treasuryTokenAccount)
    } else {
      verified = await verifyPaymentOnChain(signature, PRICE_LAMPORTS)
    }

    if (!verified) {
      console.error("[Tasks API] Final on-chain verification failed")
      return null
    }

    console.log(`[Tasks API] Payment verified and confirmed: ${signature}`)
    return { signature, verified: true }
  } catch (error: any) {
    console.error("[Tasks API] X-PAYMENT processing error:", error)
    return null
  }
}

export async function POST(req: Request) {
  console.log("[Tasks API] POST handler called")
  console.log("[Tasks API] Request URL:", req.url)
  console.log("[Tasks API] Request headers:", Object.fromEntries(req.headers.entries()))

  try {
    // Check for X-PAYMENT header (x402 standard)
    const xPaymentHeader = req.headers.get("X-PAYMENT") || req.headers.get("x-payment")
    
    // If no payment provided, return 402 Payment Required
    if (!xPaymentHeader) {
      console.log("[Tasks API] No X-PAYMENT header found, returning 402 Payment Required")
      
      // For USDC, we need to get the token account address
      if (PAYMENT_TYPE === "USDC") {
        try {
          const treasuryTokenAccount = await getTreasuryTokenAccount(USDC_MINT_ADDRESS)
          const response = getPaymentRequiredResponse("USDC")
          const responseData = await response.json()
          responseData.payment.tokenAccount = treasuryTokenAccount.toBase58()
          return NextResponse.json(responseData, {
            status: 402,
            headers: {
              "Content-Type": "application/json; charset=utf-8",
            },
          })
        } catch (error) {
          console.error("[Tasks API] Error getting token account:", error)
          return getPaymentRequiredResponse("USDC")
        }
      } else {
        return getPaymentRequiredResponse("SOL")
      }
    }

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
      context
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

    // Process x402 payment
    console.log("[Tasks API] Processing x402 payment...")
    const paymentResult = await processX402Payment(xPaymentHeader, PAYMENT_TYPE as "SOL" | "USDC")
    
    if (!paymentResult || !paymentResult.verified) {
      console.error("[Tasks API] Payment verification failed")
      return NextResponse.json(
        { 
          error: "Payment verification failed",
          details: "Transaction could not be verified or submitted"
        },
        { 
          status: 402,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
          }
        }
      )
    }

    const paymentSignature = paymentResult.signature
    console.log("[Tasks API] Payment verified successfully:", paymentSignature)

    // Sanity check: ensure incoming payment covers the configured per-task reward (for SOL rewards)
    if (PAYMENT_TYPE === "SOL") {
      if (PRICE_LAMPORTS < TASK_REWARD_LAMPORTS) {
        console.warn(
          "[Tasks API] Incoming SOL payment is less than TASK_REWARD_LAMPORTS. " +
            `PRICE_LAMPORTS=${PRICE_LAMPORTS}, TASK_REWARD_LAMPORTS=${TASK_REWARD_LAMPORTS}`
        )
      }
    }

    // 🚀 Process the task and save to database (only after payment verification)
    console.log("[Tasks API] Saving task to database...")
    const prisma = await getPrisma()

    try {
      // Store payment info
      const paymentInfo = {
        signature: paymentSignature,
        amount: PAYMENT_TYPE === "USDC" ? PRICE_USDC : PRICE_LAMPORTS,
        amountDisplay: PAYMENT_TYPE === "USDC" 
          ? `${PRICE_USDC / 1_000_000} USDC` 
          : `${PRICE_SOL} SOL`,
        currency: PAYMENT_TYPE,
        explorerUrl: `https://explorer.solana.com/tx/${paymentSignature}?cluster=${SOLANA_RPC_URL.includes("devnet") ? "devnet" : "mainnet-beta"}`,
      }

      // Find or create agent session
      let agentSessionId = null
      if (agentName) {
        const agentSessionModel = (prisma as any).agentSession
        
        // Try to find active session for this agent
        // We'll use the wallet address from the payment transaction
        const connection = new Connection(SOLANA_RPC_URL, "confirmed")
        const tx = await connection.getTransaction(paymentSignature, {
          commitment: "confirmed",
        })
        
        let senderWallet = null
        if (tx && tx.transaction.message.accountKeys.length > 0) {
          // First account is typically the sender
          const senderKey = tx.transaction.message.accountKeys[0]
          senderWallet = senderKey.toBase58 ? senderKey.toBase58() : senderKey.toString()
        }

        if (senderWallet) {
          // Find or create agent session
          let agentSession = await agentSessionModel.findFirst({
            where: {
              agentName,
              walletAddress: senderWallet,
              status: "active"
            }
          })

          if (!agentSession) {
            // Create new session
            agentSession = await agentSessionModel.create({
              data: {
                agentName,
                walletAddress: senderWallet,
                status: "active",
                lastHeartbeat: new Date(),
                metadata: {
                  createdFromTask: true,
                  firstTaskId: null // Will be updated after task creation
                }
              }
            })
            console.log(`[Tasks API] Created new agent session ${agentSession.id} for ${agentName}`)
          } else {
            // Update heartbeat
            await agentSessionModel.update({
              where: { id: agentSession.id },
              data: { lastHeartbeat: new Date() }
            })
            console.log(`[Tasks API] Updated heartbeat for agent session ${agentSession.id}`)
          }

          agentSessionId = agentSession.id
        }
      }

      // Validate new context structure with required fields
      if (!context || typeof context !== 'object' || !('data' in context)) {
        return NextResponse.json(
          { error: "Context with data field is required" },
          { 
            status: 400,
            headers: {
              "Content-Type": "application/json; charset=utf-8",
            }
          }
        )
      }

      const contextData = (context as any).data
      if (!contextData || typeof contextData !== 'object') {
        return NextResponse.json(
          { error: "Context.data must be an object" },
          { 
            status: 400,
            headers: {
              "Content-Type": "application/json; charset=utf-8",
            }
          }
        )
      }

      // Validate required fields: userQuery, agentConclusion, confidence, reasoning
      const { userQuery, agentConclusion, confidence, reasoning } = contextData

      if (!userQuery || typeof userQuery !== 'string' || userQuery.trim().length === 0) {
        return NextResponse.json(
          { error: "userQuery (string) is required in context.data" },
          { 
            status: 400,
            headers: {
              "Content-Type": "application/json; charset=utf-8",
            }
          }
        )
      }

      if (!agentConclusion || typeof agentConclusion !== 'string' || agentConclusion.trim().length === 0) {
        return NextResponse.json(
          { error: "agentConclusion (string) is required in context.data" },
          { 
            status: 400,
            headers: {
              "Content-Type": "application/json; charset=utf-8",
            }
          }
        )
      }

      if (confidence === undefined || confidence === null || typeof confidence !== 'number') {
        return NextResponse.json(
          { error: "confidence (number 0-1) is required in context.data" },
          { 
            status: 400,
            headers: {
              "Content-Type": "application/json; charset=utf-8",
            }
          }
        )
      }

      const confidenceValue = parseFloat(confidence.toString())
      if (isNaN(confidenceValue) || confidenceValue < 0 || confidenceValue > 1) {
        return NextResponse.json(
          { error: "confidence must be a number between 0 and 1" },
          { 
            status: 400,
            headers: {
              "Content-Type": "application/json; charset=utf-8",
            }
          }
        )
      }

      if (!reasoning || typeof reasoning !== 'string' || reasoning.trim().length === 0) {
        return NextResponse.json(
          { error: "reasoning (string) is required in context.data" },
          { 
            status: 400,
            headers: {
              "Content-Type": "application/json; charset=utf-8",
            }
          }
        )
      }

      // Use confidence as aiCertainty for consensus algorithm
      const aiCertainty = confidenceValue

      // Calculate consensus parameters using Inverse Confidence Sliding Scale algorithm
      const consensusParams = calculateConsensusParams(aiCertainty)
      const { requiredVoters, consensusThreshold } = consensusParams

      // Log calculated values to server console
      console.log("[Tasks API] Consensus Algorithm Results:", {
        aiCertainty: aiCertainty.toFixed(2),
        requiredVoters: requiredVoters,
        consensusThreshold: (consensusThreshold * 100).toFixed(1) + "%",
      })

      // TypeScript workaround: task model exists at runtime but types may not be recognized
      // This is safe as we verified the model exists after Prisma generation
      const task = await (prisma as PrismaClient & { task: any }).task.create({
        data: {
          text,
          taskType: task_type || "sentiment_analysis",
          paymentSignature: paymentSignature, // Store verified payment signature
          status: "pending",
          agentName: agentName || null,
          reward: reward || null,
          rewardAmount: rewardAmount ? parseFloat(rewardAmount.toString()) : null,
          category: category || null,
          escrowAmount: escrowAmount || null,
          agentSessionId: agentSessionId, // Link to agent session
          aiCertainty: aiCertainty,
          requiredVoters: requiredVoters,
          consensusThreshold: consensusThreshold,
          currentVoteCount: 0,
          yesVotes: 0,
          noVotes: 0,
          context: {
            type: context?.type || task_type || "sentiment_analysis",
            summary: context?.summary || `Agent analysis: ${agentConclusion}`,
            data: {
              userQuery,
              agentConclusion,
              confidence: confidenceValue,
              reasoning,
              payment: paymentInfo
            }
          },
          result: {
            message: "Task created and awaiting human review",
            timestamp: new Date().toISOString(),
            payment: paymentInfo,
            consensus: {
              aiCertainty: aiCertainty,
              requiredVoters: requiredVoters,
              consensusThreshold: consensusThreshold,
              calculatedAt: new Date().toISOString(),
            },
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
        paymentDetails: {
          signature: paymentSignature,
          amount: PAYMENT_TYPE === "USDC" ? PRICE_USDC / 1_000_000 : PRICE_SOL,
          currency: PAYMENT_TYPE,
          explorerUrl: `https://explorer.solana.com/tx/${paymentSignature}?cluster=${SOLANA_RPC_URL.includes("devnet") ? "devnet" : "mainnet-beta"}`,
        },
      }
      
      console.log("[Tasks API] Returning response:", JSON.stringify(responseData))
      
      return NextResponse.json(
        responseData,
        { 
          status: 200, // 200 OK after successful payment verification
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
function mapStatus(dbStatus: string): "open" | "urgent" | "completed" | "aborted" {
  if (dbStatus === "pending") return "open"
  if (dbStatus === "urgent") return "urgent"
  if (dbStatus === "completed") return "completed"
  if (dbStatus === "aborted") return "aborted"
  return "open" // default
}

/**
 * Get individual task by ID (workaround for dynamic route issue)
 */
async function getIndividualTask(prisma: PrismaClient, taskId: string) {
  try {
    console.log("[Tasks API] Fetching individual task:", taskId)
    
    const taskModel = getTaskModel(prisma)
    
    // Find task by ID
    const task = await taskModel.findUnique({
      where: { id: taskId },
    })

    console.log("[Tasks API] Query result:", task ? "Task found" : "Task not found")
    if (task) {
      console.log("[Tasks API] Found task details:", {
        id: task.id,
        agentName: task.agentName,
        status: task.status,
        createdAt: task.createdAt
      })
    }

    if (!task) {
      console.log("[Tasks API] Task not found, returning 404")
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      )
    }

    // Return task with status, result, and consensus information
    const yesVotes = task.yesVotes || 0
    const noVotes = task.noVotes || 0
    const currentVoteCount = task.currentVoteCount || 0
    const requiredVoters = task.requiredVoters || 3
    const consensusThreshold = task.consensusThreshold ? parseFloat(task.consensusThreshold.toString()) : 0.51
    const aiCertainty = task.aiCertainty ? parseFloat(task.aiCertainty.toString()) : null

    return NextResponse.json(
      {
        id: task.id,
        status: task.status,
        result: task.result,
        text: task.text,
        agentName: task.agentName,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        consensus: {
          aiCertainty,
          requiredVoters,
          consensusThreshold,
          currentVoteCount,
          yesVotes,
          noVotes,
        },
      },
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
      }
    )
  } catch (error: any) {
    console.error("[Tasks API] Individual task error:", error)
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
 * Clean up expired agent sessions and their tasks
 */
async function cleanupExpiredSessions(prisma: PrismaClient) {
  try {
    const agentSessionModel = (prisma as any).agentSession
    const taskModel = getTaskModel(prisma)

    // Session timeout: 5 minutes
    const timeoutDate = new Date(Date.now() - 5 * 60 * 1000)

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

    console.log(`[Tasks API] Found ${expiredSessions.length} expired agent sessions`)

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

    console.log(`[Tasks API] Expired ${expiredSessions.length} sessions, aborted ${abortedTasks.count} tasks`)

  } catch (error: any) {
    console.error("[Tasks API] Session cleanup error:", error)
  }
}

export async function GET(req: Request) {
  try {
    console.log("[Tasks API] GET handler called")
    const prisma = await getPrisma()
    console.log("[Tasks API] Prisma client obtained")

    // Check for individual task ID in query params (workaround for dynamic route issue)
    const url = new URL(req.url)
    const taskId = url.searchParams.get("taskId")
    const userId = url.searchParams.get("userId")
    const userEmail = url.searchParams.get("userEmail")

    // If taskId is provided, return individual task (workaround for [taskId] route issue)
    if (taskId) {
      console.log("[Tasks API] Individual task request for ID:", taskId)
      return await getIndividualTask(prisma, taskId)
    }

    // Get task model safely
    const taskModel = getTaskModel(prisma)
    console.log("[Tasks API] Task model accessed successfully")

    // Clean up expired agent sessions first
    await cleanupExpiredSessions(prisma)

    // Get filter parameter for task category
    const category = url.searchParams.get("category") || "ongoing" // Default to ongoing

    // Fetch tasks based on category
    let tasks
    let whereClause: any = {}
    
    if (category === "ongoing") {
      // Only tasks from active agent sessions with pending/urgent status
      whereClause = {
        AND: [
          {
            OR: [
              // Tasks with active agent sessions
              {
                agentSession: {
                  status: "active"
                }
              },
              // Tasks without agent sessions (legacy tasks) that are still pending
              {
                AND: [
                  { agentSessionId: null },
                  { status: { in: ["pending", "urgent"] } }
                ]
              }
            ]
          },
          {
            status: { in: ["pending", "urgent"] }
          }
        ]
      }
    } else if (category === "aborted") {
      // Tasks that were aborted due to agent termination
      whereClause = {
        status: "aborted"
      }
    } else if (category === "completed") {
      // Tasks that reached consensus
      whereClause = {
        status: "completed"
      }
    } else {
      // Invalid category, default to ongoing
      whereClause = {
        AND: [
          {
            OR: [
              {
                agentSession: {
                  status: "active"
                }
              },
              {
                AND: [
                  { agentSessionId: null },
                  { status: { in: ["pending", "urgent"] } }
                ]
              }
            ]
          },
          {
            status: { in: ["pending", "urgent"] }
          }
        ]
      }
    }

    try {
      tasks = await taskModel.findMany({
        where: whereClause,
        include: {
          agentSession: {
            select: {
              id: true,
              agentName: true,
              status: true,
              lastHeartbeat: true
            }
          }
        },
        orderBy: {
          createdAt: "desc",
        },
      })
      console.log(`[Tasks API] Found ${tasks.length} ${category} tasks`)
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

    // Filter tasks by user eligibility if userId/userEmail provided
    let eligibleTaskIds: string[] = []
    if (userId || userEmail) {
      const prismaAny = prisma as any
      const userModel = prismaAny.user
      
      let resolvedUserId: string | null = null
      if (userId) {
        resolvedUserId = userId
      } else if (userEmail) {
        const user = await userModel.findUnique({
          where: { email: userEmail },
          select: { id: true },
        })
        if (user) {
          resolvedUserId = user.id
        }
      }

      if (resolvedUserId) {
        const { filterEligibleTasks } = await import("@/lib/task-eligibility")
        const taskIds = tasks.map((t: any) => t.id)
        eligibleTaskIds = await filterEligibleTasks(prisma, resolvedUserId, taskIds)
        console.log(`[Tasks API] Filtered to ${eligibleTaskIds.length} eligible tasks for user ${resolvedUserId}`)
        
        // Also filter out tasks the user has already voted on
        const prismaAny = prisma as any
        const voteModel = prismaAny.vote
        const userVotes = await voteModel.findMany({
          where: {
            userId: resolvedUserId,
          },
          select: {
            taskId: true,
          },
        })
        const votedTaskIds = new Set(userVotes.map((v: any) => v.taskId))
        console.log(`[Tasks API] User has voted on ${votedTaskIds.size} tasks`)
        
        // Filter out tasks user has already voted on
        tasks = tasks.filter((task: any) => !votedTaskIds.has(task.id))
        console.log(`[Tasks API] After filtering voted tasks: ${tasks.length} tasks remaining`)
      }
    }

    // Transform tasks to frontend format
    const transformedTasks = tasks
      .filter((task: any) => {
        // If user filtering is enabled, only show eligible tasks
        if ((userId || userEmail) && eligibleTaskIds.length > 0) {
          return eligibleTaskIds.includes(task.id)
        }
        // Otherwise show all tasks
        return true
      })
      .map((task: any) => {
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

        // Extract payment info from context.data.payment or result
        let paymentInfo = null
        if (contextData && typeof contextData === 'object' && 'data' in contextData) {
          const data = (contextData as any).data
          if (data && typeof data === 'object' && 'payment' in data) {
            paymentInfo = data.payment
          }
        } else if (contextData && typeof contextData === 'object' && 'payment' in contextData) {
          // Fallback for old structure
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
          taskId: taskId, // Include full database ID for API calls
          agentName: task.agentName || "Unknown Agent",
          reward: task.reward || "0 USDC",
          rewardAmount,
          status: mapStatus(task.status || "pending"),
          createdAt: task.createdAt 
            ? formatRelativeTime(new Date(task.createdAt)) 
            : "Just now",
          category: task.category || "General",
          escrowAmount: task.escrowAmount || null,
          taskTier: task.taskTier || "TRAINING", // Include task tier in response
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
          taskId: String(task.id || ""), // Include full database ID
          agentName: "Unknown Agent",
          reward: "0 USDC",
          rewardAmount: 0,
          status: "open" as const,
          createdAt: "Just now",
          category: "General",
          escrowAmount: null,
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

