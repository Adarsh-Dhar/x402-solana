"use client"

import { motion } from "framer-motion"
import AgentList from "@/components/agent-list"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import RegisterAgentFlow from "@/components/register-agent-flow"

export default function AgentsPage() {
  const [showRegisterModal, setShowRegisterModal] = useState(false)

  return (
    <div className="container mx-auto p-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Agents</h1>
            <p className="text-muted-foreground mt-1">Manage your deployed AI agents</p>
          </div>
          <Button onClick={() => setShowRegisterModal(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Deploy New Agent
          </Button>
        </div>

        <AgentList />

        <Dialog open={showRegisterModal} onOpenChange={setShowRegisterModal}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Deploy New Agent</DialogTitle>
            </DialogHeader>
            <RegisterAgentFlow
              onComplete={() => {
                setShowRegisterModal(false)
                window.location.reload() // Refresh to show new agent
              }}
              onCancel={() => setShowRegisterModal(false)}
            />
          </DialogContent>
        </Dialog>
      </motion.div>
    </div>
  )
}

