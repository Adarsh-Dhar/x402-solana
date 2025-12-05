import NextAuth from "next-auth"
import { authOptions } from "./auth-config"

// Create and export auth instance for NextAuth v5
// This can be used in API routes and server components
export const { auth, handlers, signIn, signOut } = NextAuth(authOptions)

