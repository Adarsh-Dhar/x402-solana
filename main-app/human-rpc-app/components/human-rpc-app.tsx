"use client"

import { useState } from "react"
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
  context: {
    type: string
    summary: string
    data: Record<string, unknown>
  }
}

const mockTasks: Task[] = [
  {
    id: "#8821",
    agentName: "TradingBot-Alpha",
    reward: "0.5 USDC",
    rewardAmount: 0.5,
    status: "open",
    createdAt: "2 min ago",
    category: "Trading",
    escrowAmount: "1.0 USDC",
    context: {
      type: "trade_confirmation",
      summary: "Confirm limit order execution for ETH/USDC pair at specified price threshold",
      data: {
        pair: "ETH/USDC",
        action: "BUY",
        amount: "2.5 ETH",
        price: "$2,847.32",
        slippage: "0.5%",
        timestamp: "2024-12-02T14:32:00Z",
      },
    },
  },
  {
    id: "#8822",
    agentName: "DataMiner-X9",
    reward: "0.75 USDC",
    rewardAmount: 0.75,
    status: "urgent",
    createdAt: "5 min ago",
    category: "Verification",
    escrowAmount: "1.5 USDC",
    context: {
      type: "data_validation",
      summary: "Verify extracted data accuracy from financial document",
      data: {
        source: "Q3 Earnings Report",
        company: "TechCorp Inc.",
        revenue: "$4.2B",
        confidence: "87%",
      },
    },
  },
  {
    id: "#8823",
    agentName: "ContractBot-Legal",
    reward: "1.2 USDC",
    rewardAmount: 1.2,
    status: "open",
    createdAt: "12 min ago",
    category: "Legal",
    escrowAmount: "2.4 USDC",
    context: {
      type: "clause_verification",
      summary: "Review and confirm interpretation of contract termination clause",
      data: {
        clause: "Section 8.2",
        interpretation: "30-day notice required",
        jurisdiction: "Delaware",
      },
    },
  },
  {
    id: "#8824",
    agentName: "SentimentAI-Pro",
    reward: "0.3 USDC",
    rewardAmount: 0.3,
    status: "open",
    createdAt: "18 min ago",
    category: "Analysis",
    escrowAmount: "0.6 USDC",
    context: {
      type: "sentiment_check",
      summary: "Validate sentiment classification of social media mentions",
      data: {
        platform: "Twitter/X",
        mentions: 1247,
        sentiment: "Bullish",
        confidence: "72%",
      },
    },
  },
  {
    id: "#8825",
    agentName: "SecurityBot-Zero",
    reward: "2.0 USDC",
    rewardAmount: 2.0,
    status: "urgent",
    createdAt: "1 min ago",
    category: "Security",
    escrowAmount: "4.0 USDC",
    context: {
      type: "threat_assessment",
      summary: "Confirm flagged transaction pattern as potential security threat",
      data: {
        txHash: "0x7f9a...3e2b",
        riskLevel: "HIGH",
        pattern: "Unusual withdrawal sequence",
        flaggedAmount: "$45,000",
      },
    },
  },
  {
    id: "#8826",
    agentName: "PriceOracle-V2",
    reward: "0.4 USDC",
    rewardAmount: 0.4,
    status: "open",
    createdAt: "25 min ago",
    category: "Oracle",
    escrowAmount: "0.8 USDC",
    context: {
      type: "price_verification",
      summary: "Verify real-world asset price for on-chain oracle update",
      data: {
        asset: "Gold (XAU)",
        proposedPrice: "$2,043.50/oz",
        source: "LBMA",
        deviation: "0.12%",
      },
    },
  },
]

export default function HumanRPCApp() {
  const [currentView, setCurrentView] = useState<ViewType>("dashboard")
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [hasUrgentNotification, setHasUrgentNotification] = useState(true)

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

  const selectedTask = mockTasks.find((t) => t.id === selectedTaskId)

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
          {currentView === "dashboard" && <Dashboard tasks={mockTasks} onTaskSelect={handleTaskSelect} />}
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
