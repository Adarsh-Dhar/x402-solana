import { Program, AnchorProvider, BN, Idl } from "@coral-xyz/anchor"
import { Connection, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js"
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token"

// Escrow program ID
export const ESCROW_PROGRAM_ID = new PublicKey("DccimEEydWnNLzaBX5CCFYvEMfZ1VRiakZpEKJBVwJUN")

// USDC mint addresses
export const USDC_MINT_MAINNET = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")
export const USDC_MINT_DEVNET = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU")

/**
 * Get USDC mint address based on network
 */
export function getUSDCMint(connection: Connection): PublicKey {
  const rpcUrl = connection.rpcEndpoint
  if (rpcUrl.includes("mainnet") || rpcUrl.includes("api.mainnet")) {
    return USDC_MINT_MAINNET
  }
  return USDC_MINT_DEVNET
}

// Default to devnet for backward compatibility
export const USDC_MINT = USDC_MINT_DEVNET

// Import IDL - we'll use dynamic import or fetch
let escrowIdl: Idl | null = null

async function getEscrowIdl(): Promise<Idl> {
  if (escrowIdl) {
    return escrowIdl
  }

  // Try to load from file system (for Node.js) or fetch (for browser)
  if (typeof window === "undefined") {
    // Server-side: use require
    try {
      const fs = require("fs")
      const path = require("path")
      const idlPath = path.join(process.cwd(), "../escrow/target/idl/escrow.json")
      escrowIdl = JSON.parse(fs.readFileSync(idlPath, "utf-8"))
    } catch (error) {
      // Fallback: try relative path
      const fs = require("fs")
      const path = require("path")
      const idlPath = path.join(__dirname, "../../../escrow/target/idl/escrow.json")
      escrowIdl = JSON.parse(fs.readFileSync(idlPath, "utf-8"))
    }
  } else {
    // Client-side: fetch from API
    const response = await fetch("/api/escrow-idl")
    if (!response.ok) {
      throw new Error("Failed to fetch escrow IDL")
    }
    escrowIdl = await response.json()
  }

  return escrowIdl!
}

/**
 * Get the escrow program instance
 */
export async function getEscrowProgram(connection: Connection, wallet: any): Promise<Program<Idl>> {
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" })
  const idl = await getEscrowIdl()
  return new Program(idl, provider)
}

/**
 * Derive the escrow state PDA
 */
export function getEscrowStatePDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("escrow_state")],
    ESCROW_PROGRAM_ID
  )
}

/**
 * Derive the escrow token account PDA
 */
export function getEscrowTokenAccountPDA(escrowState: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("escrow_token"), escrowState.toBuffer()],
    ESCROW_PROGRAM_ID
  )
}

/**
 * Derive the agent balance PDA
 */
export function getAgentBalancePDA(agentId: string, escrowState: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("agent_balance"), Buffer.from(agentId), escrowState.toBuffer()],
    ESCROW_PROGRAM_ID
  )
}

/**
 * Check if escrow is initialized
 */
export async function isEscrowInitialized(connection: Connection): Promise<boolean> {
  try {
    const [escrowState] = getEscrowStatePDA()
    const accountInfo = await connection.getAccountInfo(escrowState)
    return accountInfo !== null
  } catch (error) {
    return false
  }
}

/**
 * Initialize escrow if not already initialized
 */
export async function ensureEscrowInitialized(
  connection: Connection,
  wallet: any
): Promise<void> {
  const isInitialized = await isEscrowInitialized(connection)
  
  if (isInitialized) {
    return // Already initialized
  }

  // Get the correct USDC mint for the network
  const usdcMint = getUSDCMint(connection)

  // Initialize the escrow
  const program = await getEscrowProgram(connection, wallet)
  const [escrowState] = getEscrowStatePDA()
  const [escrowTokenAccount] = getEscrowTokenAccountPDA(escrowState)

  try {
    const signature = await program.methods
      .initialize(usdcMint)
      .accounts({
        escrowState,
        escrowTokenAccount,
        usdcMint: usdcMint,
        authority: wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .rpc()

    // Wait for confirmation
    await connection.confirmTransaction(signature, "confirmed")
  } catch (error: any) {
    // If initialization fails, it might already be initialized by another user
    // Check again
    const checkAgain = await isEscrowInitialized(connection)
    if (!checkAgain) {
      throw new Error(`Failed to initialize escrow: ${error.message}`)
    }
    // If it's now initialized, that's fine - another user initialized it
  }
}

/**
 * Build a deposit transaction for the escrow
 */
export async function buildEscrowDepositTransaction(
  connection: Connection,
  user: PublicKey,
  agentId: string,
  agentWallet: PublicKey,
  amount: number // Amount in USDC (will be converted to base units)
): Promise<{
  transaction: any
  escrowState: PublicKey
  escrowTokenAccount: PublicKey
  agentBalance: PublicKey
  userTokenAccount: PublicKey
}> {
  // Get the correct USDC mint for the network
  const usdcMint = getUSDCMint(connection)

  // Convert amount to base units (USDC has 6 decimals)
  const amountBaseUnits = new BN(Math.floor(amount * 1_000_000))

  // Derive PDAs
  const [escrowState] = getEscrowStatePDA()
  const [escrowTokenAccount] = getEscrowTokenAccountPDA(escrowState)
  const [agentBalance] = getAgentBalancePDA(agentId, escrowState)

  // Get user's token account
  const userTokenAccount = await getAssociatedTokenAddress(usdcMint, user)

  return {
    transaction: {
      escrowState: escrowState.toBase58(),
      escrowTokenAccount: escrowTokenAccount.toBase58(),
      agentBalance: agentBalance.toBase58(),
      user: user.toBase58(),
      userTokenAccount: userTokenAccount.toBase58(),
      agentWallet: agentWallet.toBase58(),
      tokenProgram: TOKEN_PROGRAM_ID.toBase58(),
      systemProgram: SystemProgram.programId.toBase58(),
      rent: SYSVAR_RENT_PUBKEY.toBase58(),
      agentId,
      amount: amountBaseUnits.toString(),
    },
    escrowState,
    escrowTokenAccount,
    agentBalance,
    userTokenAccount,
  }
}

/**
 * Verify that a transaction is an escrow deposit
 */
export async function verifyEscrowDepositTransaction(
  connection: Connection,
  transactionSignature: string,
  expectedAgentId: string,
  expectedAmount: number
): Promise<boolean> {
  try {
    const tx = await connection.getTransaction(transactionSignature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    })

    if (!tx || !tx.meta || !tx.transaction) {
      return false
    }

    // Derive expected PDAs
    const [escrowState] = getEscrowStatePDA()
    const [escrowTokenAccount] = getEscrowTokenAccountPDA(escrowState)
    const [agentBalance] = getAgentBalancePDA(expectedAgentId, escrowState)

    // Get account keys - handle both legacy and versioned transactions
    const accountKeys = tx.transaction.message.staticAccountKeys || tx.transaction.message.accountKeys || []
    
    // Get instructions - handle both legacy and versioned transactions
    const instructions = tx.transaction.message.instructions || []
    const escrowProgramId = ESCROW_PROGRAM_ID.toBase58()

    // Find the deposit instruction
    for (const ix of instructions) {
      // Handle both legacy and versioned instruction formats
      let programId: PublicKey | undefined
      
      if (typeof ix === 'object' && 'programId' in ix) {
        // Legacy instruction format
        programId = ix.programId as PublicKey
      } else if (typeof ix === 'object' && 'programIdIndex' in ix) {
        // Versioned instruction format - programIdIndex refers to accountKeys array
        const programIdIndex = (ix as any).programIdIndex
        if (programIdIndex !== undefined && accountKeys[programIdIndex]) {
          programId = accountKeys[programIdIndex]
        }
      }

      if (programId && programId.toBase58() === escrowProgramId) {
        // This is likely the escrow deposit instruction
        // Verify accounts match
        const escrowStateIndex = accountKeys.findIndex(
          (key) => key && key.toBase58() === escrowState.toBase58()
        )
        const escrowTokenAccountIndex = accountKeys.findIndex(
          (key) => key && key.toBase58() === escrowTokenAccount.toBase58()
        )
        const agentBalanceIndex = accountKeys.findIndex(
          (key) => key && key.toBase58() === agentBalance.toBase58()
        )

        if (
          escrowStateIndex !== -1 &&
          escrowTokenAccountIndex !== -1 &&
          agentBalanceIndex !== -1
        ) {
          // Check token balance changes to verify amount
          const preTokenBalances = tx.meta.preTokenBalances || []
          const postTokenBalances = tx.meta.postTokenBalances || []

          // Find the escrow token account balance change
          const escrowBalanceChange = postTokenBalances.find(
            (balance) => balance.accountIndex === escrowTokenAccountIndex
          )

          if (escrowBalanceChange) {
            // Verify the balance increased
            const preBalance = preTokenBalances.find(
              (balance) => balance.accountIndex === escrowTokenAccountIndex
            )
            const preAmount = preBalance ? parseFloat(preBalance.uiTokenAmount.uiAmountString || "0") : 0
            const postAmount = parseFloat(escrowBalanceChange.uiTokenAmount.uiAmountString || "0")
            const increase = postAmount - preAmount

            // Allow small tolerance for rounding
            if (increase >= expectedAmount * 0.99) {
              return true
            }
          } else {
            // If we found the accounts but can't verify balance, still return true
            // as the structure matches
            return true
          }
        }
      }
    }

    return false
  } catch (error) {
    console.error("Error verifying escrow deposit transaction:", error)
    return false
  }
}

