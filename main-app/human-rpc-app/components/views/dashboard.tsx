"use client"

import { motion } from "framer-motion"
import { Activity, Clock, Zap } from "lucide-react"
import TaskCard from "../ui/task-card"
import type { Task } from "../human-rpc-app"

interface DashboardProps {
  tasks: Task[]
  onTaskSelect: (taskId: string) => void
}

export default function Dashboard({ tasks, onTaskSelect }: DashboardProps) {
  const openTasks = tasks.filter((t) => t.status !== "completed")
  const urgentTasks = tasks.filter((t) => t.status === "urgent")

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="mb-2 text-2xl font-bold text-foreground sm:text-3xl">Open Tasks</h1>
        <p className="text-muted-foreground">AI agents need your confirmation. Make decisions, earn rewards.</p>
      </motion.div>

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
              <p className="text-2xl font-bold text-foreground">{openTasks.length}</p>
              <p className="text-sm text-muted-foreground">Open Tasks</p>
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
              <p className="text-2xl font-bold text-foreground">~2m</p>
              <p className="text-sm text-muted-foreground">Avg Response</p>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {tasks.map((task, index) => (
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
    </div>
  )
}
