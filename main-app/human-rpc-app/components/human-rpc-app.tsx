"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import Dashboard from "./views/dashboard"
import TaskDetails from "./views/task-details"
import Profile from "./views/profile"
import Login from "./views/login"
import Register from "./views/register"
import Header from "./layout/header"
import DevMenu from "./layout/dev-menu"

export type ViewType = "dashboard" | "task-details" | "profile" | "login" | "register"

export interface Task {
  id: string
  agentName: string
  reward: string
  rewardAmount: number
  status: "open" | "urgent" | "completed"
  createdAt: string
  category: string
  escrowAmount: string
  payment: {
    amount: number | string
    address: string
    currency: string
  } | null
  context: {
    type: string
    summary: string
    data: Record<string, unknown>
  }
}

export default function HumanRPCApp() {
  const [currentView, setCurrentView] = useState<ViewType>("dashboard")
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [hasUrgentNotification, setHasUrgentNotification] = useState(true)
  const [tasks, setTasks] = useState<Task[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch tasks from API
  useEffect(() => {
    const fetchTasks = async () => {
      try {
        setIsLoading(true)
        setError(null)
        const response = await fetch("/api/v1/tasks")
        if (!response.ok) {
          throw new Error(`Failed to fetch tasks: ${response.statusText}`)
        }
        const data = await response.json()
        setTasks(data)
      } catch (err) {
        console.error("Error fetching tasks:", err)
        setError(err instanceof Error ? err.message : "Failed to load tasks")
        setTasks([]) // Set empty array on error
      } finally {
        setIsLoading(false)
      }
    }

    fetchTasks()
    
    // Optionally refresh tasks periodically (every 30 seconds)
    const interval = setInterval(fetchTasks, 30000)
    return () => clearInterval(interval)
  }, [])

  const handleTaskSelect = (taskId: string) => {
    setSelectedTaskId(taskId)
    setCurrentView("task-details")
  }

  const handleNavigate = (view: ViewType) => {
    setCurrentView(view)
    if (view !== "task-details") {
      setSelectedTaskId(null)
    }
  }

  const selectedTask = tasks.find((t) => t.id === selectedTaskId)

  const showHeader = currentView !== "login" && currentView !== "register"

  return (
    <div className="min-h-screen bg-background">
      <AnimatePresence mode="wait">
        {showHeader && (
          <Header
            onProfileClick={() => handleNavigate("profile")}
            onLogoClick={() => handleNavigate("dashboard")}
            hasUrgentNotification={hasUrgentNotification}
            onNotificationClick={() => setHasUrgentNotification(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        <motion.main
          key={currentView}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
          className={showHeader ? "pt-20" : ""}
        >
          {currentView === "dashboard" && (
            <Dashboard 
              tasks={tasks} 
              onTaskSelect={handleTaskSelect}
              isLoading={isLoading}
              error={error}
            />
          )}
          {currentView === "task-details" && selectedTask && (
            <TaskDetails task={selectedTask} onBack={() => handleNavigate("dashboard")} />
          )}
          {currentView === "profile" && <Profile onBack={() => handleNavigate("dashboard")} />}
          {currentView === "login" && (
            <Login onLogin={() => handleNavigate("dashboard")} onRegister={() => handleNavigate("register")} />
          )}
          {currentView === "register" && (
            <Register onBack={() => handleNavigate("login")} onComplete={() => handleNavigate("dashboard")} />
          )}
        </motion.main>
      </AnimatePresence>

      <DevMenu currentView={currentView} onNavigate={handleNavigate} />
    </div>
  )
}
