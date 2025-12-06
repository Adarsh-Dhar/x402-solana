"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Copy, Check, Eye, EyeOff } from "lucide-react"
import { toast } from "sonner"

interface IntegrationSnippetProps {
  agentId: string
  apiKey: string
}

export default function IntegrationSnippet({ agentId, apiKey }: IntegrationSnippetProps) {
  const [copied, setCopied] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)

  const codeSnippet = `# Copy-Paste this into your main.py

from human_rpc import guard

@guard(
    agent_id="${agentId}",  # Auto-filled
    api_key="${showApiKey ? apiKey : "hrpc_••••••••••••••••••••••••••••••••"}"  # Auto-filled (masked)
)
def my_ai_function(query):
    # Your AI logic here
    return response`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(codeSnippet)
      setCopied(true)
      toast.success("Code copied to clipboard!")
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      toast.error("Failed to copy code")
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Integration Code</CardTitle>
        <CardDescription>Your agent is live! Paste this into your Python project.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <pre className="overflow-x-auto rounded-lg border border-border bg-muted/50 p-4 text-sm font-mono">
            <code>{codeSnippet}</code>
          </pre>
          <div className="absolute top-2 right-2 flex gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowApiKey(!showApiKey)}
              className="h-8 w-8"
              title={showApiKey ? "Hide API key" : "Show API key"}
            >
              {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={handleCopy} className="h-8 w-8" title="Copy code">
              {copied ? <Check className="h-4 w-4 text-[var(--neon-green)]" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-3">
          <p className="text-xs text-yellow-400">
            <strong>Important:</strong> Save your API key now. You won't be able to see it again after closing this
            dialog.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

