"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { ArrowLeft, Cpu, Mail, Lock, User, Wallet, LockIcon, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface RegisterProps {
  onBack: () => void
  onComplete: () => void
}

export default function Register({ onBack, onComplete }: RegisterProps) {
  const [step, setStep] = useState<"form" | "stake">("form")
  const [isStaking, setIsStaking] = useState(false)
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
  })

  const handleStake = async () => {
    setIsStaking(true)
    await new Promise((resolve) => setTimeout(resolve, 2000))
    onComplete()
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <button
          onClick={onBack}
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
            <form
              onSubmit={(e) => {
                e.preventDefault()
                setStep("stake")
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="name" className="text-muted-foreground">
                  Full Name
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="name"
                    placeholder="John Doe"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="bg-background/50 pl-10"
                    required
                  />
                </div>
              </div>

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
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-[var(--solana-purple)] font-semibold text-white hover:bg-[var(--solana-purple)]/90"
              >
                Continue to Staking
              </Button>
            </form>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="rounded-xl border border-border bg-card/50 p-6 backdrop-blur-sm"
          >
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
                  <p className="font-mono text-2xl font-bold text-[var(--solana-purple)]">0.01 SOL</p>
                  <p className="font-mono text-sm text-muted-foreground">Devnet stake</p>
                </div>
              </div>
            </div>

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
              disabled={isStaking}
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
