"use client"

import { useState, useEffect } from "react"
import { useSession, signOut } from "next-auth/react"
import { motion } from "framer-motion"
import { ArrowLeft, Shield, Clock, DollarSign, Check, X, AlertTriangle, Users, Target } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import type { Task } from "../human-rpc-app"

interface RewardsMetadata {
  winnersCount: number
  totalLamportsDistributed: number
}

interface TaskDetailsProps {
  task: Task
  onBack: () => void
}

interface ConsensusInfo {
  aiCertainty: number | null
  requiredVoters: number
  consensusThreshold: number
  currentVoteCount: number
  yesVotes: number
  noVotes: number
}

export default function TaskDetails({ task, onBack }: TaskDetailsProps) {
  const { data: session, status } = useSession()
  const [decision, setDecision] = useState<"yes" | "no" | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [consensusInfo, setConsensusInfo] = useState<ConsensusInfo | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)

  // Fetch consensus information
  const fetchConsensusInfo = async () => {
    try {
      const taskId = task.taskId || task.id.replace(/^#/, "")
      const response = await fetch(`/api/v1/tasks/${taskId}`)
      if (response.ok) {
        const data = await response.json()
        if (data.consensus) {
          setConsensusInfo(data.consensus)
        }
      }
    } catch (err) {
      console.error("Error fetching consensus info:", err)
    }
  }

  // Sync user email from authenticated session
  useEffect(() => {
    if (status === "authenticated" && session?.user?.email) {
      setUserEmail(session.user.email)
    } else if (status === "unauthenticated") {
      setUserEmail(null)
    }
  }, [status, session?.user?.email])

  // Poll for consensus updates
  useEffect(() => {
    if (task.status !== "completed") {
      fetchConsensusInfo()
      const interval = setInterval(fetchConsensusInfo, 5000) // Poll every 5 seconds
      return () => clearInterval(interval)
    }
  }, [task.status, task.taskId, task.id])

  const handleDecision = async (choice: "yes" | "no") => {
    if (!userEmail) {
      setError("You must be logged in to submit a decision.")
      return
    }
    setDecision(choice)
    setIsSubmitting(true)
    setError(null)

    try {
      // Extract full task ID (use taskId if available, otherwise try to extract from id)
      const taskId = task.taskId || task.id.replace(/^#/, "")

      const response = await fetch(`/api/v1/tasks/${taskId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ decision: choice, userEmail }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }))
        throw new Error(errorData.error || `Failed to submit decision: ${response.status}`)
      }

      const result = await response.json()
      console.log("Decision submitted successfully:", result)
      
      // Update consensus info from response
      if (result.consensus) {
        setConsensusInfo(result.consensus)
      }
      
      // If consensus reached, refresh to show completion
      if (result.consensus?.reached) {
        setTimeout(() => {
          window.location.reload()
        }, 2000)
      } else {
        // Refresh consensus info
        fetchConsensusInfo()
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to submit decision"
      setError(errorMessage)
      console.error("Error submitting decision:", err)
      // Reset decision state on error so user can try again
      setDecision(null)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Calculate consensus progress
  const voteProgress = consensusInfo
    ? (consensusInfo.currentVoteCount / consensusInfo.requiredVoters) * 100
    : 0

  const majorityPercentage =
    consensusInfo && consensusInfo.currentVoteCount > 0
      ? (Math.max(consensusInfo.yesVotes, consensusInfo.noVotes) / consensusInfo.currentVoteCount) * 100
      : 0

  const thresholdPercentage = consensusInfo ? consensusInfo.consensusThreshold * 100 : 51

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
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
        className="mb-6 flex flex-wrap items-center gap-3"
      >
        <h1 className="font-mono text-2xl font-bold text-foreground sm:text-3xl">Task {task.id}</h1>
        <Badge
          variant={task.status === "urgent" ? "destructive" : "secondary"}
          className={
            task.status === "urgent"
              ? "bg-[var(--alert-red)]/20 text-[var(--alert-red)] border-[var(--alert-red)]/30"
              : "bg-muted text-muted-foreground"
          }
        >
          {task.status === "urgent" && <AlertTriangle className="mr-1 h-3 w-3" />}
          {task.status.toUpperCase()}
        </Badge>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-5">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="space-y-6 lg:col-span-3"
        >
          <div className="rounded-xl border border-border bg-card/50 p-6 backdrop-blur-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-foreground">Agent Request</h2>
              <span className="rounded-full bg-[var(--solana-purple)]/20 px-3 py-1 font-mono text-xs text-[var(--solana-purple)]">
                {task.agentName}
              </span>
            </div>
            <p className="mb-6 text-muted-foreground">{task.context.summary}</p>

            <div className="rounded-lg border border-border bg-background/50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">
                  {"// "}
                  {task.context.type}.json
                </span>
              </div>
              <pre className="overflow-x-auto font-mono text-sm text-foreground">
                {JSON.stringify(task.context.data, null, 2)}
              </pre>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card/50 p-6 backdrop-blur-sm">
            <h3 className="mb-4 font-semibold text-foreground">Task Metadata</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Created</p>
                  <p className="font-mono text-sm text-foreground">{task.createdAt}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <Shield className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Category</p>
                  <p className="font-mono text-sm text-foreground">{task.category}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--neon-green)]/10">
                  <DollarSign className="h-5 w-5 text-[var(--neon-green)]" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Reward</p>
                  <p className="font-mono text-sm text-[var(--neon-green)]">{task.reward}</p>
                </div>
              </div>
            </div>
            {task.payment && (
              <div className="mt-6 rounded-lg border border-[var(--solana-purple)]/30 bg-[var(--solana-purple)]/5 p-4">
                <h4 className="mb-3 text-sm font-semibold text-foreground">Payment Information</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Amount</span>
                    <span className="font-mono text-sm font-semibold text-[var(--solana-purple)]">
                      {task.payment.amount} {task.payment.currency}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Address</span>
                    <span className="font-mono text-xs text-foreground break-all text-right max-w-[200px]">
                      {task.payment.address}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {(() => {
              if (!task.context?.data?.rewards) return null

              const rawRewards = task.context.data.rewards as unknown
              if (!rawRewards || typeof rawRewards !== "object") {
                return null
              }

              const rewards = rawRewards as RewardsMetadata
              const totalWinners = rewards.winnersCount ?? 0
              const totalLamports = rewards.totalLamportsDistributed ?? 0
              const totalSol = totalLamports / 1_000_000_000
              const perWinnerSol = totalWinners > 0 ? totalSol / totalWinners : 0

              return (
                <div className="mt-6 rounded-lg border border-[var(--neon-green)]/30 bg-[var(--neon-green)]/5 p-4">
                  <h4 className="mb-3 text-sm font-semibold text-foreground">Rewards Distributed</h4>
                  <div className="grid gap-3 text-sm sm:grid-cols-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Total Winners</p>
                      <p className="font-mono text-sm text-foreground">{totalWinners}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total Distributed</p>
                      <p className="font-mono text-sm text-[var(--neon-green)]">{totalSol.toFixed(4)} SOL</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Per Winner (approx)</p>
                      <p className="font-mono text-sm text-[var(--neon-green)]">{perWinnerSol.toFixed(4)} SOL</p>
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="lg:col-span-2"
        >
          <div className="sticky top-24 rounded-xl border border-border bg-card/50 p-6 backdrop-blur-sm">
            <h2 className="mb-4 text-center font-semibold text-foreground">Submit Your Decision</h2>

            {/* Consensus Progress */}
            {consensusInfo && task.status !== "completed" && (
              <div className="mb-6 space-y-4 rounded-lg border border-[var(--solana-purple)]/30 bg-[var(--solana-purple)]/5 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-[var(--solana-purple)]" />
                    <span className="text-sm font-semibold text-foreground">Consensus Progress</span>
                  </div>
                  <span className="font-mono text-sm text-[var(--solana-purple)]">
                    {consensusInfo.currentVoteCount}/{consensusInfo.requiredVoters}
                  </span>
                </div>
                <Progress value={voteProgress} className="h-2" />
                
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded border border-[var(--neon-green)]/30 bg-[var(--neon-green)]/10 p-2">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">YES</span>
                      <span className="font-mono font-bold text-[var(--neon-green)]">
                        {consensusInfo.yesVotes}
                      </span>
                    </div>
                  </div>
                  <div className="rounded border border-[var(--alert-red)]/30 bg-[var(--alert-red)]/10 p-2">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">NO</span>
                      <span className="font-mono font-bold text-[var(--alert-red)]">
                        {consensusInfo.noVotes}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Target className="h-3 w-3 text-muted-foreground" />
                    <span className="text-muted-foreground">Threshold</span>
                  </div>
                  <span className="font-mono font-semibold text-foreground">
                    {thresholdPercentage.toFixed(1)}%
                  </span>
                </div>

                {consensusInfo.aiCertainty && (
                  <div className="text-xs text-muted-foreground">
                    AI Certainty: {(consensusInfo.aiCertainty * 100).toFixed(1)}%
                  </div>
                )}
              </div>
            )}

            <div className="mb-6 rounded-lg border border-[var(--solana-purple)]/30 bg-[var(--solana-purple)]/5 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <span className="text-sm text-muted-foreground">Agent Escrow</span>
                  <div className="mt-1 font-mono text-lg font-bold text-[var(--solana-purple)]">
                    {task.escrowAmount}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Secured via x402 protocol on Solana
                  </p>
                </div>

                <div className="flex flex-col items-end gap-2">
                  {status === "authenticated" && userEmail && (
                    <>
                      <span className="font-mono text-xs text-[var(--neon-green)]">
                        Voting as {userEmail}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-border/60 bg-background/40 text-xs font-mono text-muted-foreground hover:bg-[var(--alert-red)]/10 hover:text-[var(--alert-red)] hover:border-[var(--alert-red)]/40"
                        onClick={() =>
                          signOut({
                            callbackUrl: "/login",
                          })
                        }
                      >
                        Logout
                      </Button>
                    </>
                  )}
                  {status === "unauthenticated" && (
                    <span className="text-xs text-muted-foreground">
                      Not logged in
                    </span>
                  )}
                </div>
              </div>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 rounded-lg border border-[var(--alert-red)]/30 bg-[var(--alert-red)]/10 p-4 text-center"
              >
                <p className="text-sm text-[var(--alert-red)]">{error}</p>
              </motion.div>
            )}

            {decision && !isSubmitting && !error ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-lg border border-[var(--neon-green)]/30 bg-[var(--neon-green)]/10 p-6 text-center"
              >
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--neon-green)]/20">
                  <Check className="h-6 w-6 text-[var(--neon-green)]" />
                </div>
                <p className="font-semibold text-foreground">Decision Submitted</p>
                <p className="text-sm text-muted-foreground">
                  You voted: <span className="font-mono text-[var(--neon-green)]">{decision.toUpperCase()}</span>
                </p>
              </motion.div>
            ) : (
              <div className="space-y-3">
                <Button
                  onClick={() => handleDecision("yes")}
                  disabled={isSubmitting}
                  className="h-16 w-full bg-[var(--neon-green)] text-lg font-bold text-background transition-all hover:bg-[var(--neon-green)]/90 hover:shadow-[0_0_30px_var(--neon-green-glow)] disabled:opacity-50"
                >
                  {isSubmitting && decision === "yes" ? (
                    <span className="animate-pulse">Submitting...</span>
                  ) : (
                    <>
                      <Check className="mr-2 h-5 w-5" />
                      YES - CONFIRM
                    </>
                  )}
                </Button>

                <Button
                  onClick={() => handleDecision("no")}
                  disabled={isSubmitting}
                  variant="outline"
                  className="h-16 w-full border-[var(--alert-red)]/50 text-lg font-bold text-[var(--alert-red)] transition-all hover:bg-[var(--alert-red)]/10 hover:shadow-[0_0_30px_var(--alert-red-glow)] disabled:opacity-50"
                >
                  {isSubmitting && decision === "no" ? (
                    <span className="animate-pulse">Submitting...</span>
                  ) : (
                    <>
                      <X className="mr-2 h-5 w-5" />
                      NO - REJECT
                    </>
                  )}
                </Button>
              </div>
            )}

            <p className="mt-6 text-center text-xs text-muted-foreground">
              Your stake: <span className="text-[var(--solana-purple)]">$20.00</span> at risk if you disagree with
              consensus
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
