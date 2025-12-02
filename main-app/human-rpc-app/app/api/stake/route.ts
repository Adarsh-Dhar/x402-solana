import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js"

const STAKE_AMOUNT_SOL = 0.01 // 0.01 SOL stake for devnet
const STAKE_AMOUNT_LAMPORTS = STAKE_AMOUNT_SOL * LAMPORTS_PER_SOL

// This should be your staking wallet address
const STAKING_WALLET =
  process.env.STAKING_WALLET_ADDRESS || process.env.NEXT_PUBLIC_STAKING_WALLET || "11111111111111111111111111111111"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { userId, walletAddress, transactionSignature } = body

    if (!userId || !walletAddress || !transactionSignature) {
      return NextResponse.json(
        { error: "User ID, wallet address, and transaction signature are required" },
        { status: 400 }
      )
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        walletAddress: true,
        stakeAmount: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    if (user.stakeAmount || user.walletAddress) {
      return NextResponse.json({ error: "Stake already recorded for this user" }, { status: 409 })
    }

    // Verify the transaction on Solana
    const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com", "confirmed")
    
    try {
      const tx = await connection.getTransaction(transactionSignature, {
        commitment: "confirmed",
      })

      if (!tx) {
        return NextResponse.json({ error: "Transaction not found" }, { status: 400 })
      }

      // Verify transaction details
      // Check that the transaction is from the correct wallet
      const userWalletPubkey = new PublicKey(walletAddress)
      const stakingWalletPubkey = new PublicKey(STAKING_WALLET)
      
      if (!tx.transaction.message.accountKeys.some(key => key.pubkey.equals(userWalletPubkey))) {
        return NextResponse.json(
          { error: "Transaction must be from the provided wallet address" },
          { status: 400 }
        )
      }
      
      // Verify the transaction amount by checking pre/post balances
      // The difference should be approximately the stake amount (accounting for fees)
      const preBalances = tx.meta?.preBalances || []
      const postBalances = tx.meta?.postBalances || []
      const accountKeys = tx.transaction.message.accountKeys
      
      let userBalanceChange = 0
      let stakingBalanceChange = 0
      
      for (let i = 0; i < accountKeys.length; i++) {
        const key = accountKeys[i]
        if (key.pubkey.equals(userWalletPubkey)) {
          userBalanceChange = (postBalances[i] || 0) - (preBalances[i] || 0)
        }
        if (key.pubkey.equals(stakingWalletPubkey)) {
          stakingBalanceChange = (postBalances[i] || 0) - (preBalances[i] || 0)
        }
      }
      
      // Verify the staking wallet received the correct amount
      // Allow for small variance due to transaction fees
      if (stakingBalanceChange < STAKE_AMOUNT_LAMPORTS - 5000) { // Allow 0.000005 SOL variance for fees
        return NextResponse.json(
          { error: `Transaction amount must be at least ${STAKE_AMOUNT_SOL} SOL. Received: ${stakingBalanceChange / LAMPORTS_PER_SOL} SOL` },
          { status: 400 }
        )
      }
      
      // Update user with staking information
      const updatedUser = await prisma.user.update({
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
        },
      })

      return NextResponse.json({ user: updatedUser }, { status: 200 })
    } catch (error) {
      console.error("Transaction verification error:", error)
      return NextResponse.json({ error: "Failed to verify transaction" }, { status: 400 })
    }
  } catch (error) {
    console.error("Staking error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

