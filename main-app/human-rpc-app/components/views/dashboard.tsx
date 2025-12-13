"use client"

import { motion } from "framer-motion"
import { Activity, Clock, Zap } from "lucide-react"
import TaskCard from "../ui/task-card"
import type { Task } from "../human-rpc-app"

interface DashboardProps {
  activeTasks: Task[]
  completedTasks: Task[]
  onTaskSelect: (taskId: string) => void
  isLoading?: boolean
  error?: string | null
}

export default function Dashboard({ activeTasks, completedTasks, onTaskSelect, isLoading = false, error = null }: DashboardProps) {
  const openTasks = activeTasks.filter((t) => t.status === "open")
  const urgentTasks = activeTasks.filter((t) => t.status === "urgent")

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="mb-2 text-2xl font-bold text-foreground sm:text-3xl">Active Tasks</h1>
        <p className="text-muted-foreground">AI agents waiting for consensus. Vote now to earn rewards.</p>
      </motion.div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-red-400"
        >
          <p className="font-semibold">Error loading tasks</p>
          <p className="text-sm">{error}</p>
        </motion.div>
      )}

      {isLoading && !error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mb-8 text-center text-muted-foreground"
        >
          <p>Loading tasks...</p>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-8 grid gap-4 sm:grid-cols-3"
      >
        <div className="rounded-xl border border-border bg-card/50 p-4 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--neon-green)]/10">
              <Activity className="h-5 w-5 text-[var(--neon-green)]" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{activeTasks.length}</p>
              <p className="text-sm text-muted-foreground">Active Tasks</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card/50 p-4 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--alert-red)]/10">
              <Zap className="h-5 w-5 text-[var(--alert-red)]" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{urgentTasks.length}</p>
              <p className="text-sm text-muted-foreground">Urgent (Jury Duty)</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card/50 p-4 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--solana-purple)]/10">
              <Clock className="h-5 w-5 text-[var(--solana-purple)]" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{completedTasks.length}</p>
              <p className="text-sm text-muted-foreground">Completed</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Active Tasks Section */}
      {!isLoading && !error && activeTasks.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 rounded-xl border border-border bg-card/50 p-8 text-center backdrop-blur-sm"
        >
          <p className="text-muted-foreground">No active tasks. Tasks will appear here when agents need human consensus.</p>
        </motion.div>
      )}

      {!isLoading && !error && activeTasks.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="mb-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {activeTasks.map((task, index) => (
            <motion.div
              key={task.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * index }}
            >
              <TaskCard task={task} onSelect={() => onTaskSelect(task.id)} />
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Completed Tasks Section */}
      {!isLoading && !error && completedTasks.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-12"
        >
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-xl font-bold text-foreground">Completed Tasks</h2>
            <p className="text-sm text-muted-foreground">{completedTasks.length} tasks completed</p>
          </div>
          
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {completedTasks.map((task, index) => (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 * index }}
              >
                <TaskCard task={task} onSelect={() => onTaskSelect(task.id)} />
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  )
}
