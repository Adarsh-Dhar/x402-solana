"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import AgentDashboard from "@/components/agent-dashboard"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"

export default function AgentPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login?callbackUrl=/agent")
    }
  }, [status, router])

  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!session) {
    return null
  }

  return (
    <div className="container mx-auto p-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <AgentDashboard />
      </motion.div>
    </div>
  )
}

