"use client"

import { useParams } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import AgentIntegration from "@/components/agent-integration"
import Billing from "@/components/billing"
import Playground from "@/components/playground"
import LiveActivity from "@/components/live-activity"

export default function AgentDetailPage() {
  const params = useParams()
  const agentId = params.agentId as string

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Agent Details</h1>
        <p className="text-muted-foreground mt-2">Manage your agent configuration and monitor activity</p>
      </div>

      <Tabs defaultValue="integration" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="integration">Integration</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="playground">Playground</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
        
        <TabsContent value="integration" className="mt-6">
          <AgentIntegration agentId={agentId} />
        </TabsContent>
        
        <TabsContent value="billing" className="mt-6">
          <Billing agentId={agentId} />
        </TabsContent>
        
        <TabsContent value="playground" className="mt-6">
          <Playground agentId={agentId} />
        </TabsContent>
        
        <TabsContent value="activity" className="mt-6">
          <LiveActivity agentId={agentId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

