"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { signIn } from "next-auth/react"
import { motion } from "framer-motion"
import { ArrowLeft, Cpu, Mail, Lock, Wallet, LockIcon, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useWallet } from "@solana/wallet-adapter-react"
import { Connection, LAMPORTS_PER_SOL } from "@solana/web3.js"
import { CustomWalletButton } from "@/components/custom-wallet-button"
import { stakeWithProgram } from "@/lib/solanaStaking"

const STAKE_AMOUNT_SOL = 0.01 // 0.01 SOL stake for devnet
const STAKE_AMOUNT_LAMPORTS = Math.round(STAKE_AMOUNT_SOL * LAMPORTS_PER_SOL)

export default function RegisterPage() {
  if (typeof window !== "undefined") {
    console.log("[Register] Component render", {
      path: window.location.pathname,
    })
  }
  const router = useRouter()
  const wallet = useWallet()
  const { publicKey, connected } = wallet
  const [step, setStep] = useState<"form" | "stake">("form")
  const [isLoading, setIsLoading] = useState(false)
  const [isStaking, setIsStaking] = useState(false)
  const [isRollingBack, setIsRollingBack] = useState(false)
  const [error, setError] = useState("")
  const [registeredUserId, setRegisteredUserId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  })

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
      // After successful registration, move to staking step
      setStep("stake")
      setIsLoading(false)
    } catch (err) {
      setError("An error occurred. Please try again.")
      setRegisteredUserId(null)
      setIsLoading(false)
    }
  }

  useEffect(() => {
    console.log("[Register] Wallet state changed", {
      connected,
      publicKey: publicKey?.toString() ?? null,
    })
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

  // Helper function to safely parse JSON response
  const parseJSONResponse = async (response: Response) => {
    const contentType = response.headers.get("content-type")
    
    // Clone the response so we can read it multiple times if needed
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
      console.log("[Stake] Starting stake flow with config:", {
        rpcUrl,
        stakeAmountSol: STAKE_AMOUNT_SOL,
        stakeAmountLamports: STAKE_AMOUNT_LAMPORTS,
        walletConnected: connected,
        walletPublicKey: publicKey.toString(),
      })

      const connection = new Connection(rpcUrl, "confirmed")

      // Check user's SOL balance before attempting to send the transaction
      const balanceLamports = await connection.getBalance(publicKey)
      const requiredLamports = STAKE_AMOUNT_LAMPORTS + 5000 // small extra for fees

      console.log("[Stake] Wallet balance check:", {
        balanceLamports,
        balanceSol: balanceLamports / LAMPORTS_PER_SOL,
        requiredLamports,
        requiredSol: requiredLamports / LAMPORTS_PER_SOL,
      })

      if (balanceLamports < requiredLamports) {
        setError(
          `Insufficient SOL balance on Devnet. You need at least ${(requiredLamports / LAMPORTS_PER_SOL).toFixed(
            4
          )} SOL to stake (including fees). Your balance is ${(balanceLamports / LAMPORTS_PER_SOL).toFixed(4)} SOL.`
        )
        setIsStaking(false)
        return
      }

      // Call the on-chain staking program instead of a raw SOL transfer
      const signature = await stakeWithProgram({
        wallet,
        connection,
        amount: BigInt(STAKE_AMOUNT_LAMPORTS),
      })
      console.log("[Stake] Staking program transaction confirmed:", { signature })

      // Update user with staking info
      const stakeResponse = await fetch("/api/stake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: registeredUserId,
          walletAddress: publicKey.toString(),
          transactionSignature: signature,
        }),
      })

      console.log("[Stake] /api/stake response status:", stakeResponse.status)
      console.log("[Stake] /api/stake response ok:", stakeResponse.ok)
      console.log("[Stake] /api/stake response headers:", {
        contentType: stakeResponse.headers.get("content-type"),
        statusText: stakeResponse.statusText,
      })

      if (!stakeResponse.ok) {
        try {
          const data = await parseJSONResponse(stakeResponse)
          console.error("[Stake] /api/stake error payload:", data)
          await rollbackRegistration()
          setError(
            data.error ||
              "Stake could not be recorded. Your account was not created, please try registering again."
          )
        } catch (parseError: any) {
          console.error("[Stake] Failed to parse error response:", parseError)
          // Try to get the raw response for debugging
          try {
            const clonedResponse = stakeResponse.clone()
            const text = await clonedResponse.text()
            console.error("[Stake] Raw error response:", text.substring(0, 500))
          } catch (e) {
            // Ignore if we can't clone
          }
          await rollbackRegistration()
          setError(
            parseError.message ||
              "Stake could not be recorded. Please check server logs and try again."
          )
        }
        setStep("form")
        setIsStaking(false)
        return
      }

      // Parse the response to verify the data was saved
      let stakeData
      try {
        stakeData = await parseJSONResponse(stakeResponse)
        console.log("[Stake] /api/stake response data:", stakeData)
      } catch (parseError: any) {
        console.error("[Stake] Failed to parse success response:", parseError)
        console.error("[Stake] Error details:", {
          message: parseError.message,
          stack: parseError.stack,
        })
        
        // Even if parsing fails, the staking transaction was confirmed on-chain
        // The database update might have succeeded even if response was malformed
        // Proceed with login attempts - the retry logic will verify the data is in the database
        console.log("[Stake] Proceeding with login despite parse error - staking was confirmed on-chain")
        stakeData = null
      }

      // Verify the response contains the staking data
      if (stakeData && stakeData.user?.walletAddress && stakeData.user?.stakeAmount && stakeData.user?.stakeTransactionHash) {
        console.log("[Stake] Staking data confirmed in API response:", {
          walletAddress: stakeData.user.walletAddress,
          stakeAmount: stakeData.user.stakeAmount,
          transactionHash: stakeData.user.stakeTransactionHash,
        })
      } else {
        console.warn("[Stake] /api/stake response missing staking data:", stakeData)
        // Even if response is invalid, staking was confirmed on-chain
        // The database update might have succeeded even if response was malformed
        // Proceed with login attempts - the retry logic will verify the data is in the database
        console.log("[Stake] Proceeding with login despite invalid response - staking was confirmed on-chain, database update may have succeeded")
      }

      // Wait a moment for database to be fully synced across connections
      // Give extra time for the update to be visible in subsequent queries
      await new Promise((resolve) => setTimeout(resolve, 1500))

      // Verify staking data is visible in database before attempting login
      let stakingVerified = false
      let verifyAttempts = 0
      const maxVerifyAttempts = 5

      console.log("[Stake] Verifying staking data is visible in database...")

      while (verifyAttempts < maxVerifyAttempts && !stakingVerified) {
        verifyAttempts++
        try {
          const verifyResponse = await fetch("/api/auth/check-staking", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: formData.email,
              password: formData.password,
            }),
          })

          let verifyData
          try {
            verifyData = await parseJSONResponse(verifyResponse)
          } catch (parseError: any) {
            console.error("[Stake] Failed to parse verify response:", parseError)
            if (verifyAttempts < maxVerifyAttempts) {
              await new Promise((resolve) => setTimeout(resolve, 800))
              continue
            }
            break
          }

          if (verifyResponse.ok && verifyData.hasCompletedStaking) {
            console.log("[Stake] Staking verified in database!")
            stakingVerified = true
            break
          } else {
            console.log(`[Stake] Staking not yet visible (verify attempt ${verifyAttempts}/${maxVerifyAttempts})`)
            if (verifyAttempts < maxVerifyAttempts) {
              await new Promise((resolve) => setTimeout(resolve, 800))
            }
          }
        } catch (verifyError: any) {
          console.error("[Stake] Error verifying staking:", verifyError)
          if (verifyAttempts < maxVerifyAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 800))
          }
        }
      }

      if (!stakingVerified) {
        console.warn("[Stake] Could not verify staking in database, but proceeding with login attempts")
      } else {
        // Small delay after verification to ensure database state is fully synced
        await new Promise((resolve) => setTimeout(resolve, 500))
      }

      // Auto-login after successful registration and staking
      // Retry NextAuth login directly - it will check staking status internally
      let loginSuccess = false
      let loginAttempts = 0
      const maxLoginAttempts = 8 // Increased attempts for better reliability

      console.log("[Stake] Starting auto-login attempts after successful staking")

      while (loginAttempts < maxLoginAttempts && !loginSuccess) {
        loginAttempts++

        try {
          console.log(`[Stake] Login attempt ${loginAttempts}/${maxLoginAttempts}`)

          // Directly attempt NextAuth login
          // The authorize function will check staking status
          const loginResult = await signIn("credentials", {
            email: formData.email,
            password: formData.password,
            redirect: false,
          })

          console.log("[Stake] Login result:", loginResult)

          // Check for success - NextAuth returns { error: null } or { error: undefined } on success
          // CredentialsSignin means login failed - it's NOT success
          const isSuccess = 
            !loginResult?.error || 
            loginResult?.error === null ||
            loginResult?.error === undefined

          if (isSuccess) {
            // Login successful!
            console.log("[Stake] Login successful! Result:", loginResult)
            loginSuccess = true
            break
          } else {
            // Login failed - could be staking not visible yet or other issue
            console.log(`[Stake] Login failed (attempt ${loginAttempts}):`, loginResult.error)
            
            // Check if it's a staking-related error
            const isStakingError = 
              loginResult.error.includes("staking") || 
              loginResult.error.includes("activate") ||
              loginResult.error === "CredentialsSignin" // Generic error might mean staking check failed

            if (isStakingError && loginAttempts < maxLoginAttempts) {
              // Wait longer between attempts for database to sync
              const waitTime = loginAttempts * 500 // Progressive backoff: 500ms, 1000ms, 1500ms...
              console.log(`[Stake] Waiting ${waitTime}ms before retry...`)
              await new Promise((resolve) => setTimeout(resolve, waitTime))
              continue
            } else if (!isStakingError) {
              // Non-staking error, don't retry
              console.error("[Stake] Non-staking login error, stopping retries")
              break
            }
          }
        } catch (loginError: any) {
          console.error(`[Stake] Error during login attempt ${loginAttempts}:`, loginError)
          if (loginAttempts < maxLoginAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 1000))
            continue
          }
        }
      }

      if (loginSuccess) {
        console.log("[Stake] Auto-login successful, redirecting to app")
        setRegisteredUserId(null)
        setIsStaking(false)
        router.push("/")
        router.refresh()
      } else {
        // Login failed after all retries
        // The account and stake are saved, so user can login manually
        console.warn("[Stake] Auto-login failed after all retries, redirecting to login page")
        setError(
          "Registration and stake completed successfully! Redirecting to login..."
        )
        setIsStaking(false)
        // Redirect to login page after a short delay
        setTimeout(() => {
          router.push("/login")
        }, 2000)
      }
    } catch (err: any) {
      console.error("[Stake] Error during stake flow:", err)
      await rollbackRegistration()

      const msg = (err?.message || "").toString()

      if (msg.includes("disconnected port object")) {
        setError(
          "Your wallet extension lost connection (disconnected port). Please fully reload the page, reopen your wallet, reconnect, and try staking again."
        )
      } else if (err?.name === "WalletSendTransactionError") {
        console.error("[Stake] WalletSendTransactionError details:", {
          message: err?.message,
          logs: err?.logs,
        })
        setError(
          "Wallet failed to send the stake transaction (simulation error). Make sure your wallet is on Devnet, you have enough SOL, and then try again."
        )
      } else {
        setError(
          err?.message ||
            "Staking failed. Your account was not created, please try registering and staking again."
        )
      }
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

            <div className="mb-6">
              <CustomWalletButton />
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

