import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyPassword } from "@/lib/auth"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        password: true,
        stakeAmount: true,
        walletAddress: true,
        stakeTransactionHash: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })
    }

    const isValid = await verifyPassword(password, user.password)

    if (!isValid) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })
    }

    // Check staking status - ensure all three fields are present and not null/empty
    // stakeAmount is a Prisma Decimal type - just check if it exists (not null/undefined)
    const stakeAmountExists = user.stakeAmount !== null && 
      user.stakeAmount !== undefined

    const walletAddressValid = !!user.walletAddress && 
      user.walletAddress.trim() !== ""

    const transactionHashValid = !!user.stakeTransactionHash &&
      user.stakeTransactionHash.trim() !== ""

    const hasCompletedStaking = 
      stakeAmountExists &&
      walletAddressValid &&
      transactionHashValid

    // Debug logging
    console.log("[CheckStaking] Staking status for user:", email, {
      stakeAmount: user.stakeAmount?.toString() || "null/undefined",
      stakeAmountExists,
      walletAddress: user.walletAddress || "missing",
      walletAddressValid,
      transactionHash: user.stakeTransactionHash || "missing",
      transactionHashValid,
      hasCompletedStaking,
    })

    return NextResponse.json(
      {
        hasCompletedStaking,
        message: hasCompletedStaking
          ? "Account is ready"
          : "Please complete staking to activate your account",
      },
      { status: 200 }
    )
  } catch (error) {
    console.error("Check staking error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

