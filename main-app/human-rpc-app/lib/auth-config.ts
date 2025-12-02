import { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { prisma } from "./prisma"
import { verifyPassword } from "./auth"

export const authOptions: NextAuthOptions = {
  // Auth.js v5 prefers `AUTH_SECRET`, but we also fall back to `NEXTAUTH_SECRET`
  // so existing setups keep working. Make sure at least one of these is defined.
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        // Retry logic to handle read-after-write consistency
        // Sometimes the database update isn't immediately visible
        let user = null
        let attempts = 0
        const maxAttempts = 3

        while (attempts < maxAttempts && !user) {
          attempts++

          // Query user with explicit select to ensure we get fresh data
          const queriedUser = await prisma.user.findUnique({
            where: { email: credentials.email },
            select: {
              id: true,
              email: true,
              password: true,
              stakeAmount: true,
              walletAddress: true,
              stakeTransactionHash: true,
            },
          })

          if (!queriedUser) {
            return null // User doesn't exist
          }

          const isValid = await verifyPassword(credentials.password, queriedUser.password)

          if (!isValid) {
            return null // Invalid password
          }

          // Check staking status - ensure all three fields are present and not null/empty
          // stakeAmount is a Prisma Decimal type - just check if it exists (not null/undefined)
          // The value itself doesn't matter as long as it's been set
          const stakeAmountExists = queriedUser.stakeAmount !== null && 
            queriedUser.stakeAmount !== undefined

          const walletAddressValid = !!queriedUser.walletAddress && 
            queriedUser.walletAddress.trim() !== ""

          const transactionHashValid = !!queriedUser.stakeTransactionHash &&
            queriedUser.stakeTransactionHash.trim() !== ""

          const hasCompletedStaking = 
            stakeAmountExists &&
            walletAddressValid &&
            transactionHashValid

          // Debug logging to help diagnose issues
          if (attempts === 1) {
            console.log("[Auth] Staking check for user:", credentials.email, {
              stakeAmount: queriedUser.stakeAmount?.toString() || "null/undefined",
              stakeAmountExists,
              walletAddress: queriedUser.walletAddress || "missing",
              walletAddressValid,
              transactionHash: queriedUser.stakeTransactionHash || "missing",
              transactionHashValid,
              hasCompletedStaking,
            })
          }

          if (hasCompletedStaking) {
            // Staking is complete, use this user
            user = queriedUser
            break
          } else {
            // Staking not complete yet - might be a timing issue
            if (attempts < maxAttempts) {
              // Wait a bit and retry (database might not have synced yet)
              console.log(`[Auth] Staking incomplete, retrying (attempt ${attempts}/${maxAttempts}) for:`, credentials.email)
              await new Promise((resolve) => setTimeout(resolve, 500 * attempts)) // Progressive delay
              continue
            } else {
              // All retries exhausted, staking is truly incomplete
              console.log("[Auth] Staking incomplete after all retries for user:", credentials.email, {
                hasStakeAmount: !!queriedUser.stakeAmount,
                hasWalletAddress: !!queriedUser.walletAddress,
                hasTransactionHash: !!queriedUser.stakeTransactionHash,
              })
              return null
            }
          }
        }

        if (!user) {
          return null
        }

        return {
          id: user.id,
          email: user.email,
        }
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async signIn({ user, account, credentials }) {
      // If authorize returned null, it means either:
      // 1. Invalid credentials (user doesn't exist or wrong password)
      // 2. Staking is incomplete (after all retries in authorize)
      // In both cases, we should deny login
      // The authorize function now handles retries, so if it returns null, it's final
      
      if (user) {
        // Authorize succeeded, allow login
        return true
      }
      
      // Authorize returned null - deny login
      // This could be invalid credentials or incomplete staking
      // The client-side check-staking API will provide better error messages
      return false
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.email = user.email
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.email = token.email as string
      }
      return session
    },
  },
}
