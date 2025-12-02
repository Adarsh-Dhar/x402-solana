import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// Diagnostic endpoint to check staking status for debugging
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { email } = body

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        stakeAmount: true,
        walletAddress: true,
        stakeTransactionHash: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Check staking status
    const stakeAmountExists = user.stakeAmount !== null && 
      user.stakeAmount !== undefined &&
      user.stakeAmount.toString() !== "0" &&
      user.stakeAmount.toString() !== "0.00"

    const hasCompletedStaking = 
      stakeAmountExists &&
      !!user.walletAddress && 
      user.walletAddress.trim() !== "" &&
      !!user.stakeTransactionHash &&
      user.stakeTransactionHash.trim() !== ""

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        stakeAmount: user.stakeAmount?.toString() || null,
        walletAddress: user.walletAddress || null,
        stakeTransactionHash: user.stakeTransactionHash || null,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      stakeAmountExists,
      hasCompletedStaking,
      checks: {
        stakeAmount: {
          value: user.stakeAmount?.toString(),
          exists: stakeAmountExists,
          isNull: user.stakeAmount === null,
          isUndefined: user.stakeAmount === undefined,
        },
        walletAddress: {
          value: user.walletAddress,
          exists: !!user.walletAddress,
          notEmpty: user.walletAddress?.trim() !== "",
        },
        transactionHash: {
          value: user.stakeTransactionHash,
          exists: !!user.stakeTransactionHash,
          notEmpty: user.stakeTransactionHash?.trim() !== "",
        },
      },
    }, { status: 200 })
  } catch (error) {
    console.error("Debug staking error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

