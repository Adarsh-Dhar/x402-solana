"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { useWallet } from "@solana/wallet-adapter-react"
import { Connection, Transaction, SystemProgram, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js"
import { Loader2, CheckCircle2, ArrowRight, ArrowLeft, Upload } from "lucide-react"
import IntegrationSnippet from "./integration-snippet"
import { toast } from "sonner"

type Step = "identity" | "configuration" | "deploy" | "success"

interface AgentData {
  name: string
  description: string
  avatarUrl: string | null
  confidenceThreshold: number
  maxDailyBudget: number
  responseTime: "fast" | "standard" | "economy"
}

interface RegisteredAgent {
  agent: {
    agentId: string
    name: string
  }
  apiKey: string
}

export default function RegisterAgentFlow({
  onComplete,
  onCancel,
}: {
  onComplete: () => void
  onCancel: () => void
}) {
  const [step, setStep] = useState<Step>("identity")
  const [isLoading, setIsLoading] = useState(false)
  const [agentData, setAgentData] = useState<AgentData>({
    name: "",
    description: "",
    avatarUrl: null,
    confidenceThreshold: 90,
    maxDailyBudget: 10,
    responseTime: "standard",
  })
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [registeredAgent, setRegisteredAgent] = useState<RegisteredAgent | null>(null)
  const wallet = useWallet()

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        const result = reader.result as string
        setAvatarPreview(result)
        setAgentData({ ...agentData, avatarUrl: result })
      }
      reader.readAsDataURL(file)
    }
  }

  const handleNext = () => {
    if (step === "identity") {
      if (!agentData.name.trim()) {
        toast.error("Agent name is required")
        return
      }
      setStep("configuration")
    } else if (step === "configuration") {
      setStep("deploy")
    }
  }

  const handleDeploy = async () => {
    if (!wallet.connected || !wallet.publicKey) {
      toast.error("Please connect your Solana wallet")
      return
    }

    setIsLoading(true)

    try {
      // Create a simple transaction for on-chain registration
      // In production, this would interact with the x402 program
      const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com"
      const connection = new Connection(rpcUrl, "confirmed")

      // Create a minimal transaction (0.001 SOL for registration fee)
      const registrationFee = 0.001 * LAMPORTS_PER_SOL
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: new PublicKey("11111111111111111111111111111111"), // System program (placeholder)
          lamports: registrationFee,
        })
      )

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed")
      transaction.recentBlockhash = blockhash
      transaction.feePayer = wallet.publicKey

      // Send transaction
      const signature = await wallet.sendTransaction(transaction, connection, {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      })

      // Wait for confirmation
      await connection.confirmTransaction(
        {
          signature,
          blockhash,
          lastValidBlockHeight,
        },
        "confirmed"
      )

      // Register agent via API
      const response = await fetch("/api/agents/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...agentData,
          transactionSignature: signature,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to register agent")
      }

      const data = await response.json()
      setRegisteredAgent(data)
      setStep("success")
      toast.success("Agent deployed successfully!")
    } catch (error: any) {
      console.error("Deployment error:", error)
      toast.error(error.message || "Failed to deploy agent")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full">
      <AnimatePresence mode="wait">
        {step === "identity" && (
          <motion.div
            key="identity"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div>
              <h2 className="text-2xl font-bold text-foreground">Step 1: Identity</h2>
              <p className="text-muted-foreground mt-1">Give your agent a name and description</p>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Agent Name</Label>
                <Input
                  id="name"
                  placeholder="CustomerSupport_Bot_01"
                  value={agentData.name}
                  onChange={(e) => setAgentData({ ...agentData, name: e.target.value })}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="description">Agent Description</Label>
                <Textarea
                  id="description"
                  placeholder="Handles refund requests for e-commerce."
                  value={agentData.description}
                  onChange={(e) => setAgentData({ ...agentData, description: e.target.value })}
                  className="mt-1"
                  rows={3}
                />
                <p className="text-xs text-muted-foreground mt-1">Helps human workers understand context</p>
              </div>

              <div>
                <Label htmlFor="avatar">Agent Avatar (Optional)</Label>
                <div className="mt-1 flex items-center gap-4">
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="Avatar preview" className="h-20 w-20 rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed border-muted-foreground/50">
                      <Upload className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  <Input
                    id="avatar"
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    className="flex-1"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">Displayed to human workers</p>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onCancel}>
                Cancel
              </Button>
              <Button onClick={handleNext} className="gap-2">
                Next
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </motion.div>
        )}

        {step === "configuration" && (
          <motion.div
            key="configuration"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div>
              <h2 className="text-2xl font-bold text-foreground">Step 2: Configuration</h2>
              <p className="text-muted-foreground mt-1">Set up guard settings for your agent</p>
            </div>

            <div className="space-y-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Confidence Threshold</Label>
                  <span className="text-sm font-mono text-foreground">{agentData.confidenceThreshold}%</span>
                </div>
                <Slider
                  value={[agentData.confidenceThreshold]}
                  onValueChange={(value) => setAgentData({ ...agentData, confidenceThreshold: value[0] })}
                  min={0}
                  max={100}
                  step={1}
                  className="mt-2"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  If confidence drops below {agentData.confidenceThreshold}%, we call a human.
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Max Daily Budget</Label>
                  <span className="text-sm font-mono text-foreground">${agentData.maxDailyBudget.toFixed(2)}</span>
                </div>
                <Slider
                  value={[agentData.maxDailyBudget]}
                  onValueChange={(value) => setAgentData({ ...agentData, maxDailyBudget: value[0] })}
                  min={0}
                  max={100}
                  step={0.5}
                  className="mt-2"
                />
                <p className="text-xs text-muted-foreground mt-1">Prevents runaway costs.</p>
              </div>

              <div>
                <Label>Response Time</Label>
                <RadioGroup
                  value={agentData.responseTime}
                  onValueChange={(value) =>
                    setAgentData({ ...agentData, responseTime: value as "fast" | "standard" | "economy" })
                  }
                  className="mt-2"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="fast" id="fast" />
                    <Label htmlFor="fast" className="font-normal cursor-pointer">
                      Fast (30s)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="standard" id="standard" />
                    <Label htmlFor="standard" className="font-normal cursor-pointer">
                      Standard (2m)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="economy" id="economy" />
                    <Label htmlFor="economy" className="font-normal cursor-pointer">
                      Economy (10m)
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStep("identity")} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Button onClick={handleNext} className="gap-2">
                Next
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </motion.div>
        )}

        {step === "deploy" && (
          <motion.div
            key="deploy"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div>
              <h2 className="text-2xl font-bold text-foreground">Step 3: Deploy</h2>
              <p className="text-muted-foreground mt-1">Review and deploy your agent</p>
            </div>

            <div className="rounded-lg border border-border bg-card/50 p-4 space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Name:</span>
                <span className="text-sm font-mono text-foreground">{agentData.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Confidence Threshold:</span>
                <span className="text-sm font-mono text-foreground">{agentData.confidenceThreshold}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Max Daily Budget:</span>
                <span className="text-sm font-mono text-foreground">${agentData.maxDailyBudget.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Response Time:</span>
                <span className="text-sm font-mono text-foreground capitalize">{agentData.responseTime}</span>
              </div>
            </div>

            {!wallet.connected && (
              <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-4">
                <p className="text-sm text-yellow-400">Please connect your Solana wallet to continue</p>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStep("configuration")} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Button onClick={handleDeploy} disabled={isLoading || !wallet.connected} className="gap-2">
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Deploying...
                  </>
                ) : (
                  <>
                    Deploy Agent
                    <CheckCircle2 className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </motion.div>
        )}

        {step === "success" && registeredAgent && (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-6"
          >
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--neon-green)]/10 border border-[var(--neon-green)]/30">
                <CheckCircle2 className="h-8 w-8 text-[var(--neon-green)]" />
              </div>
              <h2 className="text-2xl font-bold text-foreground">Agent Deployed Successfully!</h2>
              <p className="text-muted-foreground mt-1">Your agent is live and ready to use</p>
            </div>

            <IntegrationSnippet agentId={registeredAgent.agent.agentId} apiKey={registeredAgent.apiKey} />

            <div className="flex justify-end">
              <Button onClick={onComplete} className="gap-2">
                Go to Dashboard
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

