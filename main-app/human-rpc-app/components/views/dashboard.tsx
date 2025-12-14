"use client"

import { motion } from "framer-motion"
import { Activity, Clock, Zap } from "lucide-react"
import TaskCard from "../ui/task-card"
import type { Task } from "../human-rpc-app"

interface DashboardProps {
  activeTasks: Task[]
  completedTasks: Task[]
  abortedTasks: Task[]
  onTaskSelect: (taskId: string) => void
  isLoading?: boolean
  error?: string | null
  taskCategory: "ongoing" | "aborted" | "completed"
  onCategoryChange: (category: "ongoing" | "aborted" | "completed") => void
}

export default function Dashboard({ 
  activeTasks, 
  completedTasks, 
  abortedTasks, 
  onTaskSelect, 
  isLoading = false, 
  error = null,
  taskCategory,
  onCategoryChange
}: DashboardProps) {
  const openTasks = activeTasks.filter((t) => t.status === "open")
  const urgentTasks = activeTasks.filter((t) => t.status === "urgent")
  
  // Get current tasks based on category
  const getCurrentTasks = () => {
    switch (taskCategory) {
      case "ongoing":
        return activeTasks
      case "completed":
        return completedTasks
      case "aborted":
        return abortedTasks
      default:
        return activeTasks
    }
  }
  
  const currentTasks = getCurrentTasks()

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="mb-2 text-2xl font-bold text-foreground sm:text-3xl">
          {taskCategory === "ongoing" && "Active Tasks"}
          {taskCategory === "completed" && "Completed Tasks"}
          {taskCategory === "aborted" && "Aborted Tasks"}
        </h1>
        <p className="text-muted-foreground">
          {taskCategory === "ongoing" && "AI agents waiting for consensus. Vote now to earn rewards."}
          {taskCategory === "completed" && "Tasks where consensus has been reached."}
          {taskCategory === "aborted" && "Tasks that were terminated when agents stopped."}
        </p>
      </motion.div>

      {/* Category Tabs */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }} 
        className="mb-8"
      >
        <div className="flex space-x-1 rounded-xl bg-card/50 p-1 backdrop-blur-sm border border-border">
          <button
            onClick={() => onCategoryChange("ongoing")}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              taskCategory === "ongoing"
                ? "bg-[var(--neon-green)] text-background shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Ongoing ({activeTasks.length})
          </button>
          <button
            onClick={() => onCategoryChange("completed")}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              taskCategory === "completed"
                ? "bg-[var(--solana-purple)] text-background shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Completed ({completedTasks.length})
          </button>
          <button
            onClick={() => onCategoryChange("aborted")}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              taskCategory === "aborted"
                ? "bg-[var(--alert-red)] text-background shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Aborted ({abortedTasks.length})
          </button>
        </div>
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

      {taskCategory === "ongoing" && (
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
      )}

      {/* Tasks Section */}
      {!isLoading && !error && currentTasks.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 rounded-xl border border-border bg-card/50 p-8 text-center backdrop-blur-sm"
        >
          <p className="text-muted-foreground">
            {taskCategory === "ongoing" && "No active tasks. Tasks will appear here when agents need human consensus."}
            {taskCategory === "completed" && "No completed tasks yet."}
            {taskCategory === "aborted" && "No aborted tasks."}
          </p>
        </motion.div>
      )}

      {!isLoading && !error && currentTasks.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="mb-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {currentTasks.map((task, index) => (
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
