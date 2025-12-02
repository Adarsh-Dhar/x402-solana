import NextAuth from "next-auth"
import { authOptions } from "@/lib/auth-config"

// Auth.js v5 (next-auth@5) with the App Router exposes handlers via the `handlers` property.
// We need to re-export those handlers as GET and POST so that routes like `/api/auth/session`
// are correctly wired up and do not return 405.
const { handlers } = NextAuth(authOptions)

export const GET = handlers.GET
export const POST = handlers.POST

