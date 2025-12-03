"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { ArrowLeft, Shield, Clock, DollarSign, Check, X, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { Task } from "../human-rpc-app"

interface TaskDetailsProps {
  task: Task
  onBack: () => void
}

export default function TaskDetails({ task, onBack }: TaskDetailsProps) {
  const [decision, setDecision] = useState<"yes" | "no" | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDecision = async (choice: "yes" | "no") => {
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
        body: JSON.stringify({ decision: choice }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }))
        throw new Error(errorData.error || `Failed to submit decision: ${response.status}`)
      }

      const result = await response.json()
      console.log("Decision submitted successfully:", result)
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
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="lg:col-span-2"
        >
          <div className="sticky top-24 rounded-xl border border-border bg-card/50 p-6 backdrop-blur-sm">
            <h2 className="mb-6 text-center font-semibold text-foreground">Submit Your Decision</h2>

            <div className="mb-6 rounded-lg border border-[var(--solana-purple)]/30 bg-[var(--solana-purple)]/5 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Agent Escrow</span>
                <span className="font-mono text-lg font-bold text-[var(--solana-purple)]">{task.escrowAmount}</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Secured via x402 protocol on Solana</p>
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
