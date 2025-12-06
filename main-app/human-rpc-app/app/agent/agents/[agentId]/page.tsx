"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import LiveActivity from "@/components/live-activity"
import Billing from "@/components/billing"
import Playground from "@/components/playground"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Loader2 } from "lucide-react"
import { toast } from "sonner"

export default function AgentDetailPage() {
  const params = useParams()
  const router = useRouter()
  const agentId = params.agentId as string
  const [agent, setAgent] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchAgent()
  }, [agentId])

  const fetchAgent = async () => {
    try {
      const response = await fetch(`/api/agents/${agentId}`)
      if (response.ok) {
        const data = await response.json()
        setAgent(data)
      } else {
        toast.error("Agent not found")
        router.push("/agent/agents")
      }
    } catch (error) {
      console.error("Failed to fetch agent:", error)
      toast.error("Failed to load agent")
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (!agent) {
    return null
  }

  return (
    <div className="container mx-auto p-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Button variant="ghost" onClick={() => router.push("/agent/agents")} className="mb-4 gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Agents
        </Button>

        <div className="mb-6">
          <div className="flex items-center gap-4 mb-2">
            {agent.avatarUrl ? (
              <img src={agent.avatarUrl} alt={agent.name} className="h-16 w-16 rounded-lg object-cover" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-[var(--neon-green)]/10 border border-[var(--neon-green)]/30">
                <span className="text-2xl">🤖</span>
              </div>
            )}
            <div>
              <h1 className="text-3xl font-bold text-foreground">{agent.name}</h1>
              {agent.description && <p className="text-muted-foreground mt-1">{agent.description}</p>}
            </div>
            <Badge variant={agent.isActive ? "default" : "outline"} className="ml-auto">
              {agent.isActive ? "Active" : "Inactive"}
            </Badge>
          </div>
        </div>

        <Tabs defaultValue="activity" className="space-y-4">
          <TabsList>
            <TabsTrigger value="activity">Live Activity</TabsTrigger>
            <TabsTrigger value="billing">Billing</TabsTrigger>
            <TabsTrigger value="playground">Playground</TabsTrigger>
          </TabsList>

          <TabsContent value="activity">
            <LiveActivity agentId={agentId} />
          </TabsContent>

          <TabsContent value="billing">
            <Billing agentId={agentId} />
          </TabsContent>

          <TabsContent value="playground">
            <Playground agentId={agentId} />
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  )
}

