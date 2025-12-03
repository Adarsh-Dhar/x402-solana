import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * Temporary stub implementation for notifications API.
 * 
 * The previous version depended on `getServerSession` from `next-auth`,
 * which is not available in the installed NextAuth version and caused
 * a compile-time error that broke all API routes (including tasks polling).
 * 
 * For now, we:
 * - Return an empty notifications array on GET
 * - Return a simple success response on PATCH
 * 
 * This unblocks the Human RPC task polling flow without changing the UI.
 */
export async function GET() {
  return NextResponse.json(
    { notifications: [] },
    {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
    }
  )
}

export async function PATCH() {
  return NextResponse.json(
    { success: true },
    {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
    }
  )
}


