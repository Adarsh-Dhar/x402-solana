"use client"

import { motion } from "framer-motion"
import { ArrowLeft, Shield, TrendingUp, DollarSign, CheckCircle, XCircle, Clock } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Progress } from "@/components/ui/progress"

interface ProfileProps {
  onBack: () => void
}

const decisionHistory = [
  { id: "#8815", agent: "TradingBot-Alpha", decision: "YES", consensus: "YES", reward: "+0.5 USDC", time: "1h ago" },
  { id: "#8814", agent: "DataMiner-X9", decision: "NO", consensus: "NO", reward: "+0.75 USDC", time: "2h ago" },
  { id: "#8812", agent: "ContractBot-Legal", decision: "YES", consensus: "YES", reward: "+1.2 USDC", time: "5h ago" },
  { id: "#8810", agent: "SentimentAI-Pro", decision: "NO", consensus: "YES", reward: "-0.3 USDC", time: "8h ago" },
  { id: "#8808", agent: "SecurityBot-Zero", decision: "YES", consensus: "YES", reward: "+2.0 USDC", time: "12h ago" },
]

export default function Profile({ onBack }: ProfileProps) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <motion.button
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        onClick={onBack}
        className="mb-6 flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        <span className="font-mono text-sm">Back to Dashboard</span>
      </motion.button>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 rounded-xl border border-border bg-card/50 p-6 backdrop-blur-sm"
      >
        <div className="flex flex-col items-center gap-6 sm:flex-row">
          <div className="relative">
            <Avatar className="h-24 w-24 border-2 border-[var(--solana-purple)]">
              <AvatarImage src="/cyberpunk-profile-avatar.png" />
              <AvatarFallback className="bg-muted text-2xl font-bold">JD</AvatarFallback>
            </Avatar>
            <span className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full border-4 border-card bg-[var(--neon-green)]" />
          </div>

          <div className="flex-1 text-center sm:text-left">
            <h1 className="mb-1 text-2xl font-bold text-foreground">John Doe</h1>
            <p className="mb-4 font-mono text-sm text-muted-foreground">0x7f9a...3e2b</p>

            <div className="flex flex-wrap justify-center gap-4 sm:justify-start">
              <div className="rounded-lg border border-[var(--neon-green)]/30 bg-[var(--neon-green)]/10 px-4 py-2">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-[var(--neon-green)]" />
                  <span className="font-mono text-lg font-bold text-[var(--neon-green)]">98/100</span>
                </div>
                <p className="text-xs text-muted-foreground">Reputation Score</p>
              </div>

              <div className="rounded-lg border border-[var(--solana-purple)]/30 bg-[var(--solana-purple)]/10 px-4 py-2">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-[var(--solana-purple)]" />
                  <span className="font-mono text-lg font-bold text-[var(--solana-purple)]">$20.00</span>
                </div>
                <p className="text-xs text-muted-foreground">Staked / Active</p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-8 grid gap-4 sm:grid-cols-3"
      >
        <div className="rounded-xl border border-border bg-card/50 p-6 backdrop-blur-sm">
          <div className="mb-2 flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-[var(--neon-green)]" />
            <span className="text-sm text-muted-foreground">Tasks Completed</span>
          </div>
          <p className="font-mono text-3xl font-bold text-foreground">247</p>
        </div>

        <div className="rounded-xl border border-border bg-card/50 p-6 backdrop-blur-sm">
          <div className="mb-2 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-[var(--solana-purple)]" />
            <span className="text-sm text-muted-foreground">Accuracy Rate</span>
          </div>
          <p className="font-mono text-3xl font-bold text-foreground">96.8%</p>
          <Progress value={96.8} className="mt-2 h-1.5 bg-muted [&>div]:bg-[var(--solana-purple)]" />
        </div>

        <div className="rounded-xl border border-border bg-card/50 p-6 backdrop-blur-sm">
          <div className="mb-2 flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-[var(--neon-green)]" />
            <span className="text-sm text-muted-foreground">Total Earnings</span>
          </div>
          <p className="font-mono text-3xl font-bold text-[var(--neon-green)]">$412.50</p>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-xl border border-border bg-card/50 backdrop-blur-sm"
      >
        <div className="border-b border-border p-4">
          <h2 className="font-semibold text-foreground">Decision History</h2>
        </div>
        <div className="divide-y divide-border">
          {decisionHistory.map((item, index) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.05 * index }}
              className="flex items-center justify-between p-4"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  {item.decision === item.consensus ? (
                    <CheckCircle className="h-5 w-5 text-[var(--neon-green)]" />
                  ) : (
                    <XCircle className="h-5 w-5 text-[var(--alert-red)]" />
                  )}
                </div>
                <div>
                  <p className="font-mono text-sm text-foreground">
                    {item.id} <span className="text-muted-foreground">·</span>{" "}
                    <span className="text-muted-foreground">{item.agent}</span>
                  </p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>You: {item.decision}</span>
                    <span>·</span>
                    <span>Consensus: {item.consensus}</span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p
                  className={`font-mono text-sm font-medium ${
                    item.reward.startsWith("+") ? "text-[var(--neon-green)]" : "text-[var(--alert-red)]"
                  }`}
                >
                  {item.reward}
                </p>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {item.time}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  )
}
