"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, Bot, Clock, Loader2 } from "lucide-react"
import CaseFileModal from "./case-file-modal"
import { format } from "date-fns"

interface Activity {
  id: string
  query: string
  aiConfidence: number | null
  status: "resolved" | "ai_auto" | "pending"
  humanVerdict: string | null
  cost: number | null
  timestamp: string
  task?: any
}

interface LiveActivityProps {
  agentId: string
}

export default function LiveActivity({ agentId }: LiveActivityProps) {
  const [activities, setActivities] = useState<Activity[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null)
  const [page, setPage] = useState(1)

  useEffect(() => {
    fetchActivities()
    // Poll for updates every 5 seconds
    const interval = setInterval(fetchActivities, 5000)
    return () => clearInterval(interval)
  }, [agentId, page])

  const fetchActivities = async () => {
    try {
      const response = await fetch(`/api/agents/${agentId}/activity?page=${page}&limit=50`)
      if (response.ok) {
        const data = await response.json()
        setActivities(data.activities)
      }
    } catch (error) {
      console.error("Failed to fetch activities:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "resolved":
        return (
          <Badge variant="default" className="bg-[var(--neon-green)]/20 text-[var(--neon-green)] border-[var(--neon-green)]/30">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Resolved
          </Badge>
        )
      case "ai_auto":
        return (
          <Badge variant="outline" className="bg-muted">
            <Bot className="h-3 w-3 mr-1" />
            AI Auto
          </Badge>
        )
      case "pending":
        return (
          <Badge variant="outline" className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        )
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const getConfidenceColor = (confidence: number | null) => {
    if (!confidence) return "text-muted-foreground"
    if (confidence >= 90) return "text-[var(--neon-green)]"
    if (confidence >= 70) return "text-yellow-400"
    return "text-[var(--alert-red)]"
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <>
      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>Query</TableHead>
              <TableHead>AI Confidence</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Human Verdict</TableHead>
              <TableHead>Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activities.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No activity yet. Activities will appear here when your agent makes requests.
                </TableCell>
              </TableRow>
            ) : (
              activities.map((activity) => (
                <TableRow
                  key={activity.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setSelectedActivity(activity)}
                >
                  <TableCell className="font-mono text-xs">
                    {format(new Date(activity.timestamp), "h:mm a")}
                  </TableCell>
                  <TableCell className="max-w-md truncate">{activity.query}</TableCell>
                  <TableCell>
                    {activity.aiConfidence !== null ? (
                      <span className={`font-mono text-sm ${getConfidenceColor(activity.aiConfidence)}`}>
                        {activity.aiConfidence.toFixed(0)}%
                        {activity.aiConfidence < 70 && " (Low)"}
                        {activity.aiConfidence >= 90 && " (High)"}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">--</span>
                    )}
                  </TableCell>
                  <TableCell>{getStatusBadge(activity.status)}</TableCell>
                  <TableCell>
                    {activity.humanVerdict ? (
                      <span className="font-semibold text-foreground">{activity.humanVerdict}</span>
                    ) : (
                      <span className="text-muted-foreground italic">
                        {activity.status === "pending" ? "Waiting for Human" : "--"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {activity.cost !== null ? (
                      <span className="font-mono text-sm">${activity.cost.toFixed(2)}</span>
                    ) : (
                      <span className="text-muted-foreground">--</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {selectedActivity && (
        <CaseFileModal activity={selectedActivity} onClose={() => setSelectedActivity(null)} />
      )}
    </>
  )
}

