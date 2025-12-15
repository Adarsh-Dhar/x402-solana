import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { email } = body

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 })
    }

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    })

    if (!existingUser) {
      // If the user is already gone, treat as success so the client can safely retry registration
      return NextResponse.json({ success: true, message: "User not found; nothing to delete" }, { status: 200 })
    }

    await prisma.user.delete({
      where: { email },
    })

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error("Unregister error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}


