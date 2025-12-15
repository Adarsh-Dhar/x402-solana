"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Copy, Check, Eye, EyeOff, RefreshCw, AlertCircle } from "lucide-react"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"

interface AgentIntegrationProps {
  agentId: string
}

export default function AgentIntegration({ agentId }: AgentIntegrationProps) {
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [showApiKey, setShowApiKey] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [hasApiKey, setHasApiKey] = useState(false)

  // Check if API key exists in sessionStorage (from recent registration)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedKey = sessionStorage.getItem(`agent_api_key_${agentId}`)
      if (storedKey) {
        setApiKey(storedKey)
        setHasApiKey(true)
      }
    }
  }, [agentId])

  // Always mask API key in code snippet - never show the actual key in code
  const getCodeSnippet = () => {
    return `# Copy-Paste this into your main.py

from human_rpc import guard

@guard(
    agent_id="${agentId}",  # Auto-filled
    api_key="hrpc_••••••••••••••••••••••••••••••••"  # Replace with your API key (click "Show API Key" below to reveal)
)
def my_ai_function(query):
    # Your AI logic here
    return response`
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(getCodeSnippet())
      setCopied(true)
      toast.success("Code copied to clipboard!")
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      toast.error("Failed to copy code")
    }
  }

  const handleRegenerateApiKey = async () => {
    if (!confirm("Are you sure you want to regenerate the API key? The old key will no longer work.")) {
      return
    }

    setIsRegenerating(true)
    try {
      const response = await fetch(`/api/agents/${agentId}/regenerate-api-key`, {
        method: "POST",
      })

      if (!response.ok) {
        throw new Error("Failed to regenerate API key")
      }

      const data = await response.json()
      setApiKey(data.apiKey)
      setShowApiKey(false) // Keep it hidden by default, user must click to reveal
      setHasApiKey(true)
      // Store in sessionStorage temporarily
      if (typeof window !== "undefined") {
        sessionStorage.setItem(`agent_api_key_${agentId}`, data.apiKey)
      }
      toast.success("API key regenerated! Click 'Show API Key' to view it.")
    } catch (error: any) {
      toast.error(error.message || "Failed to regenerate API key")
    } finally {
      setIsRegenerating(false)
    }
  }

  const handleRevealApiKey = () => {
    if (!hasApiKey && !apiKey) {
      toast.info("Please regenerate the API key first to view it")
      return
    }
    setShowApiKey(!showApiKey)
  }

  return (
    <div className="space-y-6">
      {/* Integration Code Snippet */}
      <Card>
        <CardHeader>
          <CardTitle>Integration Code</CardTitle>
          <CardDescription>Copy this code into your Python project to use your agent</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <pre className="overflow-x-auto rounded-lg border border-border bg-muted/50 p-4 text-sm font-mono">
              <code>{getCodeSnippet()}</code>
            </pre>
            <div className="absolute top-2 right-2 flex gap-2">
              <Button variant="ghost" size="icon" onClick={handleCopy} className="h-8 w-8" title="Copy code">
                {copied ? <Check className="h-4 w-4 text-[var(--neon-green)]" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* API Key Management */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>API Key</CardTitle>
              <CardDescription>Your agent's API key for authentication</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRegenerateApiKey}
              disabled={isRegenerating}
              className="gap-2"
            >
              {isRegenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Regenerating...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Regenerate
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {apiKey || hasApiKey ? (
            <>
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-lg border border-border bg-muted/50 p-3 font-mono text-sm">
                  {showApiKey ? (
                    <span className="text-foreground break-all">{apiKey || "hrpc_••••••••••••••••••••••••••••••••"}</span>
                  ) : (
                    <span className="text-muted-foreground">hrpc_••••••••••••••••••••••••••••••••</span>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleRevealApiKey}
                  className="h-10 w-10"
                  title={showApiKey ? "Hide API key" : "Show API key"}
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                {showApiKey && apiKey && (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(apiKey)
                        toast.success("API key copied to clipboard!")
                      } catch (error) {
                        toast.error("Failed to copy API key")
                      }
                    }}
                    className="h-10 w-10"
                    title="Copy API key"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {showApiKey && (
                <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-3 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-yellow-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-yellow-400">
                    <strong>Important:</strong> Save your API key now. You won't be able to see it again after closing
                    this page or refreshing. If you lose it, you'll need to regenerate a new one.
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-lg border border-muted bg-muted/50 p-4 text-center">
              <p className="text-sm text-muted-foreground mb-4">
                Your API key is securely stored. Click "Regenerate" to create a new key and view it.
              </p>
              <Button variant="outline" onClick={handleRegenerateApiKey} disabled={isRegenerating} className="gap-2">
                {isRegenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Regenerating...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    Regenerate API Key
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Agent ID Display */}
      <Card>
        <CardHeader>
          <CardTitle>Agent Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Agent ID</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-lg border border-border bg-muted/50 p-2 text-sm font-mono text-foreground">
                  {agentId}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(agentId)
                      toast.success("Agent ID copied!")
                    } catch (error) {
                      toast.error("Failed to copy")
                    }
                  }}
                  className="h-9 w-9"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

