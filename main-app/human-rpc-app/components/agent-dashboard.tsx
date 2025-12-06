"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Activity, TrendingUp, Wallet, Plus } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import RegisterAgentFlow from "./register-agent-flow"
import { Dialog, DialogContent } from "@/components/ui/dialog"

interface AgentMetrics {
  totalHumanCalls: number
  accuracyRate: number
  currentBalance: number
  autoRefillStatus: string
}

export default function AgentDashboard() {
  const [metrics, setMetrics] = useState<AgentMetrics>({
    totalHumanCalls: 0,
    accuracyRate: 0,
    currentBalance: 0,
    autoRefillStatus: "Disabled",
  })
  const [isLoading, setIsLoading] = useState(true)
  const [showRegisterModal, setShowRegisterModal] = useState(false)

  useEffect(() => {
    fetchMetrics()
  }, [])

  const fetchMetrics = async () => {
    try {
      const response = await fetch("/api/agents")
      if (response.ok) {
        const data = await response.json()
        // Aggregate metrics across all agents
        const totalHumanCalls = data.agents.reduce(
          (sum: number, agent: any) => sum + (agent.metrics?.totalHumanCalls || 0),
          0
        )
        const totalCalls = data.agents.reduce(
          (sum: number, agent: any) => sum + (agent.metrics?.totalCalls || 0),
          0
        )
        const accuracyRate =
          totalCalls > 0
            ? data.agents.reduce(
                (sum: number, agent: any) => sum + (agent.metrics?.accuracyRate || 0) * (agent.metrics?.totalCalls || 0),
                0
              ) / totalCalls
            : 0
        const currentBalance = data.agents.reduce((sum: number, agent: any) => sum + (agent.balance || 0), 0)
        const hasAutoRefill = data.agents.some((agent: any) => agent.autoRefuelEnabled)

        setMetrics({
          totalHumanCalls,
          accuracyRate: Math.round(accuracyRate * 100) / 100,
          currentBalance: Math.round(currentBalance * 100) / 100,
          autoRefillStatus: hasAutoRefill ? "Enabled" : "Disabled",
        })
      }
    } catch (error) {
      console.error("Failed to fetch metrics:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleAgentRegistered = () => {
    setShowRegisterModal(false)
    fetchMetrics() // Refresh metrics
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Developer Dashboard</h1>
          <p className="text-muted-foreground mt-1">Monitor and manage your AI agents</p>
        </div>
        <Button onClick={() => setShowRegisterModal(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Deploy New Agent
        </Button>
      </div>

      {/* Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Human Calls</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--neon-green)]/10 border border-[var(--neon-green)]/30">
                  <Activity className="h-6 w-6 text-[var(--neon-green)]" />
                </div>
                <div>
                  <p className="text-3xl font-bold text-foreground">
                    {isLoading ? "..." : metrics.totalHumanCalls.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">Times agents asked for help</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">Accuracy Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--solana-purple)]/10 border border-[var(--solana-purple)]/30">
                  <TrendingUp className="h-6 w-6 text-[var(--solana-purple)]" />
                </div>
                <div>
                  <p className="text-3xl font-bold text-foreground">
                    {isLoading ? "..." : `${metrics.accuracyRate.toFixed(1)}%`}
                  </p>
                  <p className="text-xs text-muted-foreground">Human agreement rate</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">Current Balance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--alert-red)]/10 border border-[var(--alert-red)]/30">
                  <Wallet className="h-6 w-6 text-[var(--alert-red)]" />
                </div>
                <div>
                  <p className="text-3xl font-bold text-foreground">
                    {isLoading ? "..." : `$${metrics.currentBalance.toFixed(2)}`}
                  </p>
                  <p className="text-xs text-muted-foreground">USDC • {metrics.autoRefillStatus}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Register Agent Modal */}
      <Dialog open={showRegisterModal} onOpenChange={setShowRegisterModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <RegisterAgentFlow onComplete={handleAgentRegistered} onCancel={() => setShowRegisterModal(false)} />
        </DialogContent>
      </Dialog>
    </div>
  )
}

