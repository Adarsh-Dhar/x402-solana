"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Loader2, Bot, CheckCircle2, AlertCircle } from "lucide-react"
import { toast } from "sonner"

interface PlaygroundProps {
  agentId: string
}

export default function Playground({ agentId }: PlaygroundProps) {
  const [query, setQuery] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<any>(null)

  const handleTest = async () => {
    if (!query.trim()) {
      toast.error("Please enter a query")
      return
    }

    setIsLoading(true)
    setResult(null)

    try {
      const response = await fetch(`/api/agents/${agentId}/playground`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      })

      if (!response.ok) {
        throw new Error("Failed to test agent")
      }

      const data = await response.json()
      setResult(data)
    } catch (error: any) {
      toast.error(error.message || "Failed to test agent")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Playground Mode</CardTitle>
          <CardDescription>Test your agent's threshold without running your Python code</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label htmlFor="query" className="text-sm font-medium mb-2 block">
              Test Query
            </label>
            <Textarea
              id="query"
              placeholder="Type a hard question that might trigger human review..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              rows={4}
              className="font-mono text-sm"
            />
          </div>
          <Button onClick={handleTest} disabled={isLoading || !query.trim()} className="w-full">
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Testing...
              </>
            ) : (
              <>
                <Bot className="h-4 w-4 mr-2" />
                Test Agent
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <Card>
            <CardHeader>
              <CardTitle>Results</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* AI Confidence */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">AI Confidence</span>
                  <Badge
                    variant={
                      result.aiConfidence >= result.confidenceThreshold
                        ? "default"
                        : result.aiConfidence >= 70
                          ? "outline"
                          : "destructive"
                    }
                    className="font-mono"
                  >
                    {result.aiConfidence.toFixed(1)}%
                  </Badge>
                </div>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      result.aiConfidence >= result.confidenceThreshold
                        ? "bg-[var(--neon-green)]"
                        : result.aiConfidence >= 70
                          ? "bg-yellow-400"
                          : "bg-[var(--alert-red)]"
                    }`}
                    style={{ width: `${result.aiConfidence}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Threshold: {result.confidenceThreshold.toFixed(1)}%
                </p>
              </div>

              {/* Status */}
              <div>
                <span className="text-sm font-medium mb-2 block">Status</span>
                <div className="flex items-center gap-2">
                  {result.wouldTriggerHuman ? (
                    <>
                      <AlertCircle className="h-4 w-4 text-yellow-400" />
                      <Badge variant="outline" className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                        Would Trigger HumanRPC
                      </Badge>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-[var(--neon-green)]" />
                      <Badge variant="default" className="bg-[var(--neon-green)]/20 text-[var(--neon-green)] border-[var(--neon-green)]/30">
                        AI Auto (No Human Needed)
                      </Badge>
                    </>
                  )}
                </div>
              </div>

              {/* Human Response */}
              {result.humanResponse && (
                <div>
                  <span className="text-sm font-medium mb-2 block">Simulated Human Response</span>
                  <div className="rounded-lg border border-[var(--neon-green)]/30 bg-[var(--neon-green)]/10 p-3">
                    <p className="text-sm text-foreground">{result.humanResponse}</p>
                  </div>
                </div>
              )}

              {/* Estimated Cost */}
              {result.estimatedCost > 0 && (
                <div>
                  <span className="text-sm font-medium mb-2 block">Estimated Cost</span>
                  <p className="text-sm font-mono text-foreground">${result.estimatedCost.toFixed(2)} USDC</p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  )
}

