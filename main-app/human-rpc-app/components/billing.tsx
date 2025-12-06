"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useWallet } from "@solana/wallet-adapter-react"
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui"
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js"
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token"
import { format } from "date-fns"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"

interface BillingProps {
  agentId: string
}

const USDC_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU") // Devnet USDC

export default function Billing({ agentId }: BillingProps) {
  const wallet = useWallet()
  const [balance, setBalance] = useState(0)
  const [autoRefuelEnabled, setAutoRefuelEnabled] = useState(false)
  const [autoRefuelThreshold, setAutoRefuelThreshold] = useState(2)
  const [autoRefuelAmount, setAutoRefuelAmount] = useState(20)
  const [transactions, setTransactions] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)

  useEffect(() => {
    fetchBillingData()
  }, [agentId])

  const fetchBillingData = async () => {
    try {
      const response = await fetch(`/api/agents/${agentId}`)
      if (response.ok) {
        const data = await response.json()
        setBalance(data.balance)
        setAutoRefuelEnabled(data.autoRefuelEnabled || false)
        setAutoRefuelThreshold(data.autoRefuelThreshold || 2)
        setAutoRefuelAmount(data.autoRefuelAmount || 20)
        setTransactions(data.recentTransactions || [])
      }
    } catch (error) {
      console.error("Failed to fetch billing data:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleUpdateSettings = async () => {
    setIsUpdating(true)
    try {
      const response = await fetch(`/api/agents/${agentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          autoRefuelEnabled,
          autoRefuelThreshold,
          autoRefuelAmount,
        }),
      })

      if (response.ok) {
        toast.success("Settings updated successfully")
      } else {
        throw new Error("Failed to update settings")
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to update settings")
    } finally {
      setIsUpdating(false)
    }
  }

  const handleTopUp = async () => {
    if (!wallet.connected || !wallet.publicKey) {
      toast.error("Please connect your wallet")
      return
    }

    // In production, this would open a wallet modal for USDC transfer
    toast.info("Top-up functionality - integrate with USDC transfer")
  }

  // Calculate fuel gauge percentage (0-100%)
  const fuelGaugePercentage = Math.min(100, (balance / 50) * 100) // Assuming $50 is full

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Fuel Gauge */}
      <Card>
        <CardHeader>
          <CardTitle>Agent Balance</CardTitle>
          <CardDescription>USDC balance for this agent</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="relative h-32 w-full rounded-lg border border-border bg-muted/50 overflow-hidden">
              {/* Fuel level */}
              <div
                className="absolute bottom-0 left-0 right-0 bg-[var(--neon-green)] transition-all duration-500"
                style={{ height: `${fuelGaugePercentage}%` }}
              />
              {/* Gauge marks */}
              <div className="absolute inset-0 flex flex-col justify-between p-2">
                <div className="text-xs text-muted-foreground">$50</div>
                <div className="text-xs text-muted-foreground">$25</div>
                <div className="text-xs text-muted-foreground">$0</div>
              </div>
              {/* Balance text */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-3xl font-bold text-foreground">${balance.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">USDC</p>
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <WalletMultiButton />
              <Button onClick={handleTopUp} className="ml-2" disabled={!wallet.connected}>
                Top Up
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Auto-Refuel Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Auto-Refuel Settings</CardTitle>
          <CardDescription>Automatically refuel agent balance when it gets low</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="auto-refuel">Enable Auto-Refuel</Label>
              <p className="text-xs text-muted-foreground">
                Automatically move USDC from your main wallet to this agent when balance hits threshold
              </p>
            </div>
            <Switch
              id="auto-refuel"
              checked={autoRefuelEnabled}
              onCheckedChange={setAutoRefuelEnabled}
            />
          </div>

          {autoRefuelEnabled && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="space-y-4 pt-4 border-t border-border"
            >
              <div>
                <Label htmlFor="threshold">Threshold Amount (USDC)</Label>
                <Input
                  id="threshold"
                  type="number"
                  min="0"
                  step="0.01"
                  value={autoRefuelThreshold}
                  onChange={(e) => setAutoRefuelThreshold(parseFloat(e.target.value) || 0)}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  When balance drops below ${autoRefuelThreshold.toFixed(2)}, auto-refuel will trigger
                </p>
              </div>

              <div>
                <Label htmlFor="amount">Refuel Amount (USDC)</Label>
                <Input
                  id="amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={autoRefuelAmount}
                  onChange={(e) => setAutoRefuelAmount(parseFloat(e.target.value) || 0)}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Amount to transfer when auto-refuel triggers: ${autoRefuelAmount.toFixed(2)} USDC
                </p>
              </div>

              <Button onClick={handleUpdateSettings} disabled={isUpdating}>
                {isUpdating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Updating...
                  </>
                ) : (
                  "Save Settings"
                )}
              </Button>
            </motion.div>
          )}
        </CardContent>
      </Card>

      {/* Transaction History */}
      <Card>
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
          <CardDescription>Recent transactions for this agent</CardDescription>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No transactions yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Signature</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="font-mono text-xs">
                      {format(new Date(tx.createdAt), "PPp")}
                    </TableCell>
                    <TableCell>
                      <span className="capitalize">{tx.type}</span>
                    </TableCell>
                    <TableCell className="font-mono">
                      {tx.type === "topup" ? "+" : "-"}${tx.amount.toFixed(2)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {tx.signature ? (
                        <a
                          href={`https://solscan.io/tx/${tx.signature}?cluster=devnet`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--neon-green)] hover:underline"
                        >
                          {tx.signature.slice(0, 8)}...
                        </a>
                      ) : (
                        "--"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

