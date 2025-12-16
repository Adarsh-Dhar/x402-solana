"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Cpu, Wallet, Mail, Lock, AlertCircle, LockIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { useWallet } from "@solana/wallet-adapter-react"
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui"
import { Connection, LAMPORTS_PER_SOL } from "@solana/web3.js"
import { signIn } from "next-auth/react"
import { motion } from "framer-motion"
import { STAKE_AMOUNT_SOL, STAKE_AMOUNT_LAMPORTS, REQUIRED_LAMPORTS } from "@/lib/stake-config"

// Simple wallet button component
function SimpleWalletButton() {
  return (
    <div className="space-y-3">
      <div className="text-center">
        <p className="text-sm text-muted-foreground mb-3">Connect your Solana wallet to continue</p>
        <WalletMultiButton className="w-full" />
      </div>
    </div>
  )
}



// Placeholder staking function
async function stakeWithProgram({ wallet, connection, amount }: any) {
  // This is a placeholder - implement actual staking logic
  console.log("Staking with program:", { amount })
  return "mock_transaction_signature"
}

export default function RegisterPage() {
  const router = useRouter()
  const [step, setStep] = useState<"form" | "stake">("stake")
  const [isLoading, setIsLoading] = useState(false)
  const [isStaking, setIsStaking] = useState(false)
  const [isRollingBack, setIsRollingBack] = useState(false)
  const [error, setError] = useState("")
  const [registeredUserId, setRegisteredUserId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  })
  
  // Safely handle wallet hook
  const wallet = useWallet()
  const { publicKey, connected } = wallet

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })

      const data = await response.json()

      if (!response.ok) {
        if (response.status === 409) {
          setError("An account with this email already exists. Please log in instead.")
        } else {
          setError(data.error || "Registration failed")
        }
        setRegisteredUserId(null)
        setIsLoading(false)
        return
      }

      setRegisteredUserId(data?.user?.id ?? null)
      setStep("stake")
      setIsLoading(false)
    } catch (err) {
      setError("An error occurred. Please try again.")
      setRegisteredUserId(null)
      setIsLoading(false)
    }
  }

  useEffect(() => {
    // Wallet state tracking for debugging if needed
    if (process.env.NODE_ENV === 'development') {
      console.log("[Register] Wallet state changed", {
        connected,
        publicKey: publicKey?.toString() ?? null,
      })
    }
  }, [connected, publicKey])

  const rollbackRegistration = async () => {
    if (!formData.email) return

    try {
      setIsRollingBack(true)
      await fetch("/api/auth/unregister", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: formData.email }),
      })
    } catch (rollbackError) {
      console.error("Failed to rollback registration after staking error:", rollbackError)
    } finally {
      setRegisteredUserId(null)
      setIsRollingBack(false)
    }
  }

  const parseJSONResponse = async (response: Response) => {
    const contentType = response.headers.get("content-type")
    const clonedResponse = response.clone()
    const text = await clonedResponse.text()
    
    if (!contentType || !contentType.includes("application/json")) {
      console.error("[Stake] Non-JSON response received. Content-Type:", contentType)
      console.error("[Stake] Response text (first 500 chars):", text.substring(0, 500))
      throw new Error(`Server returned non-JSON response (${contentType || "unknown"}). Please check server logs.`)
    }
    
    try {
      return JSON.parse(text)
    } catch (parseError: any) {
      console.error("[Stake] Failed to parse JSON:", parseError)
      console.error("[Stake] Response text (first 500 chars):", text.substring(0, 500))
      throw new Error(`Invalid JSON response: ${parseError.message}`)
    }
  }

  const handleStake = async () => {
    if (!connected || !publicKey) {
      setError("Please connect your Solana wallet before staking.")
      return
    }

    if (!registeredUserId) {
      setError("We could not verify your account. Please restart registration.")
      setStep("form")
      return
    }

    setError("")
    setIsStaking(true)

    try {
      const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com"
      const connection = new Connection(rpcUrl, "confirmed")

      const balanceLamports = await connection.getBalance(publicKey)

      if (balanceLamports < REQUIRED_LAMPORTS) {
        setError(
          `Insufficient SOL balance on Devnet. You need at least ${(REQUIRED_LAMPORTS / LAMPORTS_PER_SOL).toFixed(
            4
          )} SOL to stake (including fees). Your balance is ${(balanceLamports / LAMPORTS_PER_SOL).toFixed(4)} SOL.`
        )
        setIsStaking(false)
        return
      }

      const signature = await stakeWithProgram({
        wallet,
        connection,
        amount: BigInt(STAKE_AMOUNT_LAMPORTS),
      })

      const stakeResponse = await fetch("/api/stake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: registeredUserId,
          walletAddress: publicKey.toString(),
          transactionSignature: signature,
        }),
      })

      if (!stakeResponse.ok) {
        await rollbackRegistration()
        setError("Stake could not be recorded. Please try again.")
        setStep("form")
        setIsStaking(false)
        return
      }

      // Auto-login after successful registration and staking
      const loginResult = await signIn("credentials", {
        email: formData.email,
        password: formData.password,
        redirect: false,
      })

      if (!loginResult?.error) {
        setRegisteredUserId(null)
        setIsStaking(false)
        router.push("/")
        router.refresh()
      } else {
        setError("Registration and stake completed successfully! Redirecting to login...")
        setIsStaking(false)
        setTimeout(() => {
          router.push("/login")
        }, 2000)
      }
    } catch (err: any) {
      console.error("[Stake] Error during stake flow:", err)
      await rollbackRegistration()
      setError(err?.message || "Staking failed. Please try again.")
      setStep("form")
      setIsStaking(false)
    }
  }



  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <button
          onClick={() => router.push("/login")}
          className="mb-6 flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="font-mono text-sm">Back to Login</span>
        </button>

        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--solana-purple)]/10 border border-[var(--solana-purple)]/30">
            <Cpu className="h-6 w-6 text-[var(--solana-purple)]" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Join Human RPC</h1>
          <p className="mt-2 text-muted-foreground">
            {step === "form" ? "Create your account" : "Stake to participate"}
          </p>
        </div>

        <div className="mb-8 flex items-center justify-center gap-4">
          <div className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full font-mono text-sm ${
                step === "form" ? "bg-[var(--solana-purple)] text-white" : "bg-[var(--neon-green)] text-background"
              }`}
            >
              1
            </div>
            <span className="text-sm text-muted-foreground">Account</span>
          </div>
          <div className="h-px w-8 bg-border" />
          <div className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full font-mono text-sm ${
                step === "stake" ? "bg-[var(--solana-purple)] text-white" : "bg-muted text-muted-foreground"
              }`}
            >
              2
            </div>
            <span className="text-sm text-muted-foreground">Stake</span>
          </div>
        </div>

        {step === "form" ? (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="rounded-xl border border-border bg-card/50 p-6 backdrop-blur-sm"
          >
            <form onSubmit={handleRegister} className="space-y-4">
              {error && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="reg-email" className="text-muted-foreground">
                  Email
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="reg-email"
                    type="email"
                    placeholder="you@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="bg-background/50 pl-10"
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reg-password" className="text-muted-foreground">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="reg-password"
                    type="password"
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="bg-background/50 pl-10"
                    required
                    disabled={isLoading}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Must be at least 6 characters long
                </p>
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full bg-[var(--solana-purple)] font-semibold text-white hover:bg-[var(--solana-purple)]/90"
              >
                {isLoading ? "Creating account..." : "Continue to Staking"}
              </Button>
            </form>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="rounded-xl border border-border bg-card/50 p-6 backdrop-blur-sm"
          >
            {error && (
              <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="mb-6 rounded-lg border border-[var(--solana-purple)]/30 bg-[var(--solana-purple)]/5 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--solana-purple)]/20">
                    <Wallet className="h-5 w-5 text-[var(--solana-purple)]" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Required Stake</p>
                    <p className="text-sm text-muted-foreground">Participation requirement</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-mono text-2xl font-bold text-[var(--solana-purple)]">{STAKE_AMOUNT_SOL} SOL</p>
                  <p className="font-mono text-sm text-muted-foreground">Devnet stake</p>
                </div>
              </div>
            </div>

            <div className="mb-6 space-y-4">
              <SimpleWalletButton />
            </div>

            {connected && publicKey && (
              <div className="mb-6 rounded-lg border border-[var(--neon-green)]/30 bg-[var(--neon-green)]/5 p-4">
                <p className="text-sm text-muted-foreground mb-1">Connected Wallet</p>
                <p className="font-mono text-sm text-[var(--neon-green)] break-all">{publicKey.toString()}</p>
              </div>
            )}

            <div className="mb-6 rounded-lg border border-border bg-background/50 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 text-muted-foreground" />
                <div className="text-sm text-muted-foreground">
                  <p className="mb-2">Your stake will be:</p>
                  <ul className="list-inside list-disc space-y-1">
                    <li>Locked while you&apos;re an active member</li>
                    <li>At risk if you consistently disagree with consensus</li>
                    <li>Fully refundable when you leave the network</li>
                  </ul>
                </div>
              </div>
            </div>

            <Button
              onClick={handleStake}
              disabled={isStaking || isRollingBack || !connected}
              className="relative w-full overflow-hidden bg-[var(--solana-purple)] py-6 font-semibold text-white transition-all hover:bg-[var(--solana-purple)]/90 hover:shadow-[0_0_40px_var(--solana-purple-glow)] disabled:opacity-70"
            >
              {isStaking ? (
                <span className="flex items-center gap-2">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
                  >
                    <LockIcon className="h-5 w-5" />
                  </motion.div>
                  Processing...
                </span>
              ) : (
                <>
                  <LockIcon className="mr-2 h-5 w-5" />
                  Lock Stake & Join
                </>
              )}
              {!isStaking && (
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                  animate={{ x: ["-100%", "100%"] }}
                  transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY, repeatDelay: 1 }}
                />
              )}
            </Button>

            <button
              onClick={() => setStep("form")}
              className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground"
            >
              Back to account details
            </button>
          </motion.div>
        )}
      </motion.div>
    </div>
  )
}