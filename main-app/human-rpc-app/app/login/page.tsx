"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { signIn } from "next-auth/react"
import { motion } from "framer-motion"
import { Cpu, ArrowRight, Mail, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    try {
      // First check staking status to provide better error messages
      const checkResponse = await fetch("/api/auth/check-staking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })

      // Helper function to safely parse JSON response
      const parseJSONResponse = async (response: Response) => {
        const contentType = response.headers.get("content-type")
        if (!contentType || !contentType.includes("application/json")) {
          const text = await response.text()
          console.error("[Login] Non-JSON response received:", text.substring(0, 200))
          throw new Error("Server returned non-JSON response. Please try again.")
        }
        return response.json()
      }

      let checkData
      try {
        checkData = await parseJSONResponse(checkResponse)
      } catch (parseError: any) {
        console.error("[Login] Failed to parse response:", parseError)
        setError("An error occurred while checking your account. Please try again.")
        setIsLoading(false)
        return
      }

      if (!checkResponse.ok) {
        // Invalid credentials
        setError(checkData.error || "Invalid email or password")
        setIsLoading(false)
        return
      }

      if (!checkData.hasCompletedStaking) {
        // Staking not complete
        setError(checkData.message || "Please complete staking to activate your account")
        setIsLoading(false)
        return
      }

      // Staking is complete, proceed with login
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      })

      if (result?.error) {
        // This should rarely happen if staking check passed, but handle it anyway
        let errorMessage = "Invalid email or password"
        
        if (result.error && typeof result.error === "string") {
          if (result.error.includes("staking") || result.error.includes("activate")) {
            errorMessage = result.error
          } else if (result.error !== "CredentialsSignin") {
            errorMessage = result.error
          }
        }
        
        setError(errorMessage)
        setIsLoading(false)
      } else {
        router.push("/")
        router.refresh()
      }
    } catch (err: any) {
      // Handle network errors or other exceptions
      const errorMessage = err?.message || "An error occurred. Please try again."
      setError(errorMessage)
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-4xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--neon-green)]/10 border border-[var(--neon-green)]/30">
            <Cpu className="h-6 w-6 text-[var(--neon-green)]" />
          </div>
          <h1 className="font-mono text-2xl font-bold text-foreground">
            Human<span className="text-[var(--neon-green)]">RPC</span>
          </h1>
          <p className="mt-2 text-muted-foreground">Human intelligence for AI decisions</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-xl border border-border bg-card/50 p-6 backdrop-blur-sm"
          >
            <h2 className="mb-6 text-xl font-semibold text-foreground">Login</h2>

            <form onSubmit={handleLogin} className="space-y-4">
              {error && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-muted-foreground">
                  Email
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-background/50 pl-10"
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-muted-foreground">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-background/50 pl-10"
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full bg-[var(--neon-green)] font-semibold text-background hover:bg-[var(--neon-green)]/90"
              >
                {isLoading ? "Signing in..." : "Sign In"}
                {!isLoading && <ArrowRight className="ml-2 h-4 w-4" />}
              </Button>
            </form>

            <p className="mt-4 text-center text-xs text-muted-foreground">
              Forgot password? <button className="text-[var(--neon-green)] hover:underline">Reset it here</button>
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="relative overflow-hidden rounded-xl border border-[var(--solana-purple)]/30 bg-gradient-to-br from-[var(--solana-purple)]/10 to-transparent p-6"
          >
            <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[var(--solana-purple)]/10 blur-3xl" />

            <h2 className="mb-4 text-xl font-semibold text-foreground">Become a Member</h2>
            <p className="mb-6 text-muted-foreground">
              Join the Human RPC network. Stake $20 SOL to participate in AI consensus decisions and earn rewards.
            </p>

            <div className="mb-6 space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--neon-green)]/20">
                  <span className="text-sm text-[var(--neon-green)]">✓</span>
                </div>
                <span className="text-sm text-foreground">Earn USDC for each decision</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--neon-green)]/20">
                  <span className="text-sm text-[var(--neon-green)]">✓</span>
                </div>
                <span className="text-sm text-foreground">Build your reputation score</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--neon-green)]/20">
                  <span className="text-sm text-[var(--neon-green)]">✓</span>
                </div>
                <span className="text-sm text-foreground">x402 secured payments</span>
              </div>
            </div>

            <Button
              onClick={() => router.push("/login/register")}
              variant="outline"
              className="w-full border-[var(--solana-purple)]/50 font-semibold text-[var(--solana-purple)] hover:bg-[var(--solana-purple)]/10 bg-transparent"
            >
              Get Started
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </motion.div>
        </div>
      </motion.div>
    </div>
  )
}

