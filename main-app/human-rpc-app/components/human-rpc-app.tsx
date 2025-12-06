"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
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
  taskId?: string // Full database ID for API calls
  agentName: string
  reward: string
  rewardAmount: number
  status: "open" | "urgent" | "completed"
  createdAt: string
  category: string
  taskTier?: "TRAINING" | "LIVE_FIRE" | "DISPUTE" // Task tier for rank restrictions
  escrowAmount: string
  payment: {
    amount: number | string
    address: string
    currency: string
  } | null
  context: {
    type: string
    summary: string
    data: {
      userQuery: string
      agentConclusion: string
      confidence: number
      reasoning: string
      payment?: {
        signature: string
        amount: number | string
        amountDisplay: string
        currency: string
        explorerUrl: string
      }
      [key: string]: unknown // Allow additional fields for backward compatibility
    }
  }
}

export default function HumanRPCApp() {
  const { data: session } = useSession()
  const [currentView, setCurrentView] = useState<ViewType>("dashboard")
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [hasUrgentNotification, setHasUrgentNotification] = useState(false)
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const [notifications, setNotifications] = useState<
    {
      id: string
      title: string
      body: string
      type: string
      createdAt: string
      isRead: boolean
    }[]
  >([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch tasks from API
  useEffect(() => {
    const fetchTasks = async () => {
      try {
        setIsLoading(true)
        setError(null)
        // Include userEmail in query params if available so backend can filter out already-voted tasks
        const userEmail = session?.user?.email
        const url = userEmail 
          ? `/api/v1/tasks?userEmail=${encodeURIComponent(userEmail)}`
          : "/api/v1/tasks"
        const response = await fetch(url)
        if (!response.ok) {
          throw new Error(`Failed to fetch tasks: ${response.statusText}`)
        }
        const data = await response.json()
        // Filter to show only pending tasks (status === "open")
        const pendingTasks = data.filter((task: Task) => task.status === "open")
        setTasks(pendingTasks)
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
  }, [session])

  // Fetch notifications for current user
  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const response = await fetch("/api/notifications")
        if (!response.ok) return
        const data = await response.json()
        const items = (data.notifications || []) as typeof notifications
        setNotifications(items)
        const unreadCount = items.filter((n) => !n.isRead).length
        setUnreadNotifications(unreadCount)
        setHasUrgentNotification(unreadCount > 0)
      } catch (err) {
        console.error("Error fetching notifications:", err)
      }
    }

    fetchNotifications()
    const interval = setInterval(fetchNotifications, 15000)
    return () => clearInterval(interval)
  }, [])

  const handleNotificationClick = async () => {
    setHasUrgentNotification(false)
    setUnreadNotifications(0)
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
      })
    } catch (err) {
      console.error("Error marking notifications as read:", err)
    }
  }

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
    <div className="min-h-screen bg-background w-full">
      <AnimatePresence mode="wait">
        {showHeader && (
          <Header
            onProfileClick={() => handleNavigate("profile")}
            onLogoClick={() => handleNavigate("dashboard")}
            hasUrgentNotification={hasUrgentNotification}
            onNotificationClick={handleNotificationClick}
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
