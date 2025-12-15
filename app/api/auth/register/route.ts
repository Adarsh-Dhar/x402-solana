import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { hashPassword, validateEmail, validatePassword } from "@/lib/auth"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 })
    }

    if (!validateEmail(email)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 })
    }

    const passwordValidation = validatePassword(password)
    if (!passwordValidation.valid) {
      return NextResponse.json({ error: passwordValidation.message }, { status: 400 })
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        walletAddress: true,
        stakeAmount: true,
        stakeTransactionHash: true,
      },
    })

    if (existingUser) {
      const hasCompletedStake =
        !!existingUser.walletAddress && !!existingUser.stakeAmount && !!existingUser.stakeTransactionHash

      // If the user has already completed staking, block re-registration
      if (hasCompletedStake) {
        return NextResponse.json({ error: "User with this email already exists" }, { status: 409 })
      }

      // If the user exists but never completed staking, clear the incomplete record
      await prisma.user.delete({
        where: { email },
      })
    }

    const hashedPassword = await hashPassword(password)

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
      },
      select: {
        id: true,
        email: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ user }, { status: 201 })
  } catch (error) {
    console.error("Registration error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

