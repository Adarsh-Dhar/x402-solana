"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Bot, Wallet, Activity, ArrowRight } from "lucide-react"
import Link from "next/link"

interface Agent {
  id: string
  name: string
  description: string | null
  avatarUrl: string | null
  agentId: string
  balance: number
  isActive: boolean
  metrics: {
    totalHumanCalls: number
    totalCalls: number
    accuracyRate: number
  }
  recentActivity: any[]
}

export default function AgentList() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchAgents()
  }, [])

  const fetchAgents = async () => {
    try {
      const response = await fetch("/api/agents")
      if (response.ok) {
        const data = await response.json()
        setAgents(data.agents)
      }
    } catch (error) {
      console.error("Failed to fetch agents:", error)
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">Loading agents...</div>
      </div>
    )
  }

  if (agents.length === 0) {
    return (
      <div className="text-center py-12">
        <Bot className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">No agents yet</h3>
        <p className="text-muted-foreground mb-4">Deploy your first agent to get started</p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {agents.map((agent, index) => (
        <motion.div
          key={agent.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
        >
          <Card className="h-full flex flex-col">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  {agent.avatarUrl ? (
                    <img
                      src={agent.avatarUrl}
                      alt={agent.name}
                      className="h-12 w-12 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--neon-green)]/10 border border-[var(--neon-green)]/30">
                      <Bot className="h-6 w-6 text-[var(--neon-green)]" />
                    </div>
                  )}
                  <div>
                    <CardTitle className="text-base">{agent.name}</CardTitle>
                    {agent.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{agent.description}</p>
                    )}
                  </div>
                </div>
                <Badge variant={agent.isActive ? "default" : "outline"}>
                  {agent.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Balance</span>
                  <span className="font-mono font-semibold text-foreground">${agent.balance.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Human Calls</span>
                  <span className="font-semibold text-foreground">{agent.metrics.totalHumanCalls}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Accuracy</span>
                  <span className="font-semibold text-foreground">{agent.metrics.accuracyRate.toFixed(1)}%</span>
                </div>
              </div>
              <Link href={`/agent/agents/${agent.agentId}`}>
                <Button variant="outline" className="w-full gap-2">
                  View Details
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  )
}

