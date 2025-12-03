import { Connection, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js"
import type { PrismaClient } from "@prisma/client"
import { SOLANA_RPC_URL } from "@/lib/solanaConfig"
import { loadTreasuryKeypair, TREASURY_PUBLIC_KEY } from "@/lib/treasury"

// Per-task reward configuration (SOL)
export const TASK_REWARD_SOL = parseFloat(process.env.TASK_REWARD_SOL || "0.1")
export const TASK_REWARD_LAMPORTS = TASK_REWARD_SOL * LAMPORTS_PER_SOL

export interface WinnerPayout {
  userId: string
  walletAddress: string
  lamports: number
  signature: string
}

export interface RewardsPayoutResult {
  taskId: string
  consensusDecision: "yes" | "no"
  totalLamportsConfigured: number
  totalLamportsDistributed: number
  winnersCount: number
  payouts: WinnerPayout[]
  skippedReason?: string
}

/**
 * Distribute SOL rewards for a task to all voters whose decision matches the final consensus.
 * Uses the configured treasury wallet as the source of funds.
 */
export async function distributeSolRewardToWinners(
  prisma: PrismaClient,
  taskId: string,
  consensusDecision: "yes" | "no",
  totalLamports: number = TASK_REWARD_LAMPORTS
): Promise<RewardsPayoutResult> {
  const baseResult: RewardsPayoutResult = {
    taskId,
    consensusDecision,
    totalLamportsConfigured: totalLamports,
    totalLamportsDistributed: 0,
    winnersCount: 0,
    payouts: [],
  }

  try {
    console.log("[Rewards] Starting SOL rewards distribution for task:", {
      taskId,
      consensusDecision,
      totalLamports,
    })

    if (!totalLamports || totalLamports <= 0) {
      console.warn("[Rewards] totalLamports is zero or undefined - skipping payouts")
      return { ...baseResult, skippedReason: "NO_REWARD_CONFIGURED" }
    }

    const treasury = loadTreasuryKeypair()
    if (!treasury) {
      return { ...baseResult, skippedReason: "TREASURY_NOT_CONFIGURED" }
    }

    // Sanity log to ensure we're paying from the expected public key
    console.log("[Rewards] Using treasury wallet:", {
      configured: TREASURY_PUBLIC_KEY.toBase58(),
      signer: treasury.publicKey.toBase58(),
    })

    const prismaAny = prisma as any
    const voteModel = prismaAny.vote
    const userModel = prismaAny.user

    // Get all winning votes with associated users who have a walletAddress set
    const votes = await voteModel.findMany({
      where: {
        taskId,
        decision: consensusDecision,
        userId: { not: null },
        user: {
          walletAddress: { not: null },
        },
      },
      include: {
        user: true,
      },
    })

    if (!votes || votes.length === 0) {
      console.log("[Rewards] No eligible winners (no votes with matching decision and walletAddress)")
      return { ...baseResult, skippedReason: "NO_ELIGIBLE_WINNERS" }
    }

    const winners = votes.filter((v: any) => v.user && v.user.walletAddress)
    if (winners.length === 0) {
      console.log("[Rewards] Votes found but no users with walletAddress - skipping payouts")
      return { ...baseResult, skippedReason: "NO_WALLET_ADDRESSES" }
    }

    const lamportsPerWinner = Math.floor(totalLamports / winners.length)
    if (lamportsPerWinner <= 0) {
      console.warn(
        "[Rewards] Computed lamportsPerWinner is zero - totalLamports too small for number of winners",
        {
          totalLamports,
          winnersCount: winners.length,
        }
      )
      return { ...baseResult, skippedReason: "REWARD_TOO_SMALL" }
    }

    console.log("[Rewards] Distributing rewards:", {
      totalLamports,
      winnersCount: winners.length,
      lamportsPerWinner,
      solPerWinner: lamportsPerWinner / LAMPORTS_PER_SOL,
    })

    const connection = new Connection(SOLANA_RPC_URL, "confirmed")
    const payouts: WinnerPayout[] = []

    for (const vote of winners) {
      const walletAddress = vote.user.walletAddress as string
      try {
        const toPubkey = new PublicKey(walletAddress)
        const tx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: treasury.publicKey,
            toPubkey,
            lamports: lamportsPerWinner,
          })
        )

        const signature = await connection.sendTransaction(tx, [treasury], {
          skipPreflight: false,
          preflightCommitment: "confirmed",
        })

        await connection.confirmTransaction(signature, "confirmed")

        console.log("[Rewards] Paid winner:", {
          userId: vote.userId,
          walletAddress,
          lamports: lamportsPerWinner,
          signature,
        })

        payouts.push({
          userId: vote.userId as string,
          walletAddress,
          lamports: lamportsPerWinner,
          signature,
        })
      } catch (error: any) {
        console.error(
          "[Rewards] Failed to pay winner:",
          {
            userId: vote.userId,
            walletAddress,
          },
          error?.message || error
        )
        // Continue with other winners even if one payment fails
      }
    }

    const totalDistributed = payouts.reduce((sum, p) => sum + p.lamports, 0)

    const result: RewardsPayoutResult = {
      ...baseResult,
      totalLamportsDistributed: totalDistributed,
      winnersCount: payouts.length,
      payouts,
      skippedReason: payouts.length === 0 ? "ALL_PAYOUTS_FAILED" : undefined,
    }

    console.log("[Rewards] Completed rewards distribution:", {
      taskId,
      winnersPaid: payouts.length,
      totalLamportsDistributed: totalDistributed,
      totalSolDistributed: totalDistributed / LAMPORTS_PER_SOL,
    })

    return result
  } catch (error: any) {
    console.error("[Rewards] Unexpected error during rewards distribution:", error?.message || error)
    return {
      ...baseResult,
      skippedReason: "UNEXPECTED_ERROR",
    }
  }
}


