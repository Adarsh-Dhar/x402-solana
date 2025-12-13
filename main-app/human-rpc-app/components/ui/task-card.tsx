"use client"

import { motion } from "framer-motion"
import { Bot, Clock, AlertTriangle, ArrowRight, CheckCircle, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { Task } from "../human-rpc-app"

interface TaskCardProps {
  task: Task
  onSelect: () => void
}

export default function TaskCard({ task, onSelect }: TaskCardProps) {
  const isCompleted = task.status === "completed"
  
  // Extract result information for completed tasks
  const getTaskResult = () => {
    if (!isCompleted) return null
    
    // Try to get result from context data or other sources
    const contextData = task.context?.data
    if (contextData && typeof contextData === 'object') {
      // Check for result in various possible locations
      const result = (contextData as any).result || (contextData as any).decision || (contextData as any).sentiment
      if (result) {
        return typeof result === 'string' ? result.toUpperCase() : String(result).toUpperCase()
      }
    }
    
    return "COMPLETED"
  }

  const taskResult = getTaskResult()
  const isPositiveResult = taskResult === "YES" || taskResult === "POSITIVE"
  const isNegativeResult = taskResult === "NO" || taskResult === "NEGATIVE"

  return (
    <motion.div
      whileHover={{ y: -4, scale: 1.02 }}
      transition={{ type: "spring", stiffness: 300 }}
      className={`group relative overflow-hidden rounded-xl border p-5 backdrop-blur-sm transition-all ${
        isCompleted 
          ? "border-border/50 bg-card/30 hover:border-[var(--solana-purple)]/30 hover:shadow-[0_0_30px_rgba(139,92,246,0.1)]"
          : "border-border bg-card/50 hover:border-[var(--neon-green)]/30 hover:shadow-[0_0_30px_rgba(34,197,94,0.1)]"
      }`}
    >
      {task.status === "urgent" && (
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[var(--alert-red)] to-transparent" />
      )}
      
      {isCompleted && (
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[var(--solana-purple)] to-transparent" />
      )}

      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
            isCompleted ? "bg-[var(--solana-purple)]/10" : "bg-muted"
          }`}>
            {isCompleted ? (
              <CheckCircle className="h-5 w-5 text-[var(--solana-purple)]" />
            ) : (
              <Bot className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          <div>
            <p className="font-mono text-sm font-semibold text-foreground">{task.id}</p>
            <p className="text-xs text-muted-foreground">{task.agentName}</p>
          </div>
        </div>

        {task.status === "urgent" ? (
          <Badge className="bg-[var(--alert-red)]/20 text-[var(--alert-red)] border-[var(--alert-red)]/30">
            <AlertTriangle className="mr-1 h-3 w-3" />
            Urgent
          </Badge>
        ) : isCompleted ? (
          <Badge className={`border-[var(--solana-purple)]/30 ${
            isPositiveResult 
              ? "bg-[var(--neon-green)]/20 text-[var(--neon-green)]"
              : isNegativeResult
              ? "bg-[var(--alert-red)]/20 text-[var(--alert-red)]"
              : "bg-[var(--solana-purple)]/20 text-[var(--solana-purple)]"
          }`}>
            {isPositiveResult && <CheckCircle className="mr-1 h-3 w-3" />}
            {isNegativeResult && <XCircle className="mr-1 h-3 w-3" />}
            {taskResult || "Completed"}
          </Badge>
        ) : (
          <Badge variant="secondary" className="bg-muted text-muted-foreground">
            {task.category}
          </Badge>
        )}
      </div>

      <p className="mb-4 line-clamp-2 text-sm text-muted-foreground">{task.context.summary}</p>

      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          {task.createdAt}
        </div>
        <div className={`font-mono text-lg font-bold ${
          isCompleted ? "text-[var(--solana-purple)]" : "text-[var(--neon-green)]"
        }`}>
          {task.reward}
        </div>
      </div>

      {task.payment && !isCompleted && (
        <div className="mb-4 rounded-lg border border-[var(--solana-purple)]/30 bg-[var(--solana-purple)]/5 p-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Payment Required:</span>
            <span className="font-mono font-semibold text-[var(--solana-purple)]">
              {task.payment.amount} {task.payment.currency}
            </span>
          </div>
        </div>
      )}

      <Button
        onClick={onSelect}
        className={`w-full transition-all ${
          isCompleted
            ? "bg-[var(--solana-purple)]/10 text-[var(--solana-purple)] hover:bg-[var(--solana-purple)]/20"
            : "bg-[var(--neon-green)]/10 text-[var(--neon-green)] hover:bg-[var(--neon-green)]/20"
        }`}
        variant="ghost"
      >
        {isCompleted ? "View Results" : "Start Task"}
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </motion.div>
  )
}
