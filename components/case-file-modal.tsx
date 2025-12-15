"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"

interface Activity {
  id: string
  query: string
  aiConfidence: number | null
  status: string
  humanVerdict: string | null
  cost: number | null
  timestamp: string
  task?: any
}

interface CaseFileModalProps {
  activity: Activity
  onClose: () => void
}

export default function CaseFileModal({ activity, onClose }: CaseFileModalProps) {
  const taskContext = activity.task?.context?.data || {}
  const taskResult = activity.task?.result || {}

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Case File</DialogTitle>
          <DialogDescription>Detailed view of this activity</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Query */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Query</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-foreground">{activity.query}</p>
              <p className="text-xs text-muted-foreground mt-2">
                Timestamp: {format(new Date(activity.timestamp), "PPpp")}
              </p>
            </CardContent>
          </Card>

          {/* AI Analysis */}
          {taskContext.agentConclusion && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Agent Conclusion</CardTitle>
                <p className="text-xs text-muted-foreground">What the agent thinks</p>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-foreground">{taskContext.agentConclusion}</p>
                {activity.aiConfidence !== null && (
                  <div className="mt-3">
                    <p className="text-xs text-muted-foreground mb-1">Agent's confidence level</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[var(--neon-green)]"
                          style={{ width: `${activity.aiConfidence}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono text-foreground">{activity.aiConfidence.toFixed(0)}%</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Reasoning */}
          {taskContext.reasoning && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Agent Reasoning</CardTitle>
                <p className="text-xs text-muted-foreground">Why the agent thinks that</p>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-foreground whitespace-pre-wrap">{taskContext.reasoning}</p>
              </CardContent>
            </Card>
          )}

          {/* Human Verdict */}
          {activity.humanVerdict && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Human Verdict</CardTitle>
                <p className="text-xs text-muted-foreground">Human worker's decision</p>
              </CardHeader>
              <CardContent>
                <Badge variant="default" className="bg-[var(--neon-green)]/20 text-[var(--neon-green)] border-[var(--neon-green)]/30 mb-2">
                  {activity.humanVerdict}
                </Badge>
                {taskResult.humanReasoning && (
                  <p className="text-sm text-foreground mt-2">{taskResult.humanReasoning}</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Cost Breakdown */}
          {activity.cost !== null && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Cost Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Human Review Cost</span>
                  <span className="text-sm font-mono font-semibold text-foreground">${activity.cost.toFixed(2)}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Status */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Status</CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant={activity.status === "resolved" ? "default" : "outline"}>
                {activity.status === "resolved" && "✅ Resolved"}
                {activity.status === "ai_auto" && "🤖 AI Auto"}
                {activity.status === "pending" && "⏳ Pending"}
              </Badge>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  )
}

