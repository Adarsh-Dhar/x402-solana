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
import { Connection, PublicKey, LAMPORTS_PER_SOL, Transaction, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js"
import {
  getAssociatedTokenAddress,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token"
import { format } from "date-fns"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor"
import {
  getEscrowProgram,
  getEscrowStatePDA,
  getEscrowTokenAccountPDA,
  getAgentBalancePDA,
  ensureEscrowInitialized,
  getUSDCMint,
  ESCROW_PROGRAM_ID,
  USDC_MINT,
} from "@/lib/escrow"

interface BillingProps {
  agentId: string
}

export default function Billing({ agentId }: BillingProps) {
  const wallet = useWallet()
  const [balance, setBalance] = useState(0)
  const [autoRefuelEnabled, setAutoRefuelEnabled] = useState(false)
  const [autoRefuelThreshold, setAutoRefuelThreshold] = useState(2)
  const [autoRefuelAmount, setAutoRefuelAmount] = useState(20)
  const [transactions, setTransactions] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)
  const [isToppingUp, setIsToppingUp] = useState(false)
  const [agentData, setAgentData] = useState<{ agentId: string; walletAddress: string | null } | null>(null)

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
        setAgentData({
          agentId: data.agentId,
          walletAddress: data.walletAddress,
        })
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

    if (!agentData || !agentData.walletAddress) {
      toast.error("Agent wallet address not found")
      return
    }

    // Prompt for amount
    const amountStr = prompt("Enter top-up amount (USDC):")
    if (!amountStr) {
      return
    }

    const amount = parseFloat(amountStr)
    if (isNaN(amount) || amount <= 0) {
      toast.error("Invalid amount")
      return
    }

    setIsToppingUp(true)

    try {
      const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com"
      const connection = new Connection(rpcUrl, "confirmed")

      // Ensure escrow is initialized (will initialize if needed)
      try {
        await ensureEscrowInitialized(connection, wallet)
      } catch (error: any) {
        // If initialization fails, it might be because someone else initialized it
        // Try to proceed with deposit anyway
        console.warn("Escrow initialization check failed, proceeding:", error.message)
      }

      // Get USDC mint based on network
      const usdcMint = getUSDCMint(connection)

      // Get escrow program
      const program = await getEscrowProgram(connection, wallet)

      // Derive PDAs
      const [escrowState] = getEscrowStatePDA()
      const [escrowTokenAccount] = getEscrowTokenAccountPDA(escrowState)
      const [agentBalance] = getAgentBalancePDA(agentData.agentId, escrowState)

      // Get user's token account
      const userTokenAccount = getAssociatedTokenAddressSync(usdcMint, wallet.publicKey)
      const agentWallet = new PublicKey(agentData.walletAddress)

      // Check if user's token account exists, create if not
      let userTokenAccountInfo
      try {
        userTokenAccountInfo = await getAccount(connection, userTokenAccount)
      } catch (error) {
        // Token account doesn't exist, create it
        const createATAInstruction = createAssociatedTokenAccountInstruction(
          wallet.publicKey, // payer
          userTokenAccount, // ata
          wallet.publicKey, // owner
          usdcMint // mint
        )

        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed")
        const createTx = new Transaction({
          feePayer: wallet.publicKey,
          blockhash,
          lastValidBlockHeight,
        }).add(createATAInstruction)

        const createTxSig = await wallet.sendTransaction(createTx, connection, {
          skipPreflight: false,
        })

        await connection.confirmTransaction(
          {
            signature: createTxSig,
            blockhash,
            lastValidBlockHeight,
          },
          "confirmed"
        )

        toast.info("Created USDC token account")
        
        // Fetch the account info after creation
        userTokenAccountInfo = await getAccount(connection, userTokenAccount)
      }

      // Convert amount to base units (USDC has 6 decimals)
      const amountBaseUnits = new BN(Math.floor(amount * 1_000_000))

      // Check if user has sufficient USDC balance
      if (!userTokenAccountInfo || userTokenAccountInfo.amount < BigInt(amountBaseUnits.toString())) {
        const currentBalance = userTokenAccountInfo
          ? Number(userTokenAccountInfo.amount) / 1_000_000
          : 0
        const isMainnet = connection.rpcEndpoint.includes("mainnet")
        const faucetInfo = isMainnet
          ? "You need to acquire USDC from an exchange or DEX."
          : "You can get devnet USDC from a faucet or by swapping SOL for USDC on a devnet DEX."

        toast.error(
          `Insufficient USDC balance. You have $${currentBalance.toFixed(2)} USDC, but need $${amount.toFixed(2)}. ${faucetInfo}`
        )
        setIsToppingUp(false)
        return
      }

      // Build deposit transaction
      const depositIx = await program.methods
        .deposit(agentData.agentId, amountBaseUnits)
        .accounts({
          escrowState,
          escrowTokenAccount,
          agentBalance,
          user: wallet.publicKey,
          userTokenAccount,
          agentWallet,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .instruction()

      // Get recent blockhash
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed")

      // Create transaction
      const transaction = new Transaction({
        feePayer: wallet.publicKey,
        blockhash,
        lastValidBlockHeight,
      }).add(depositIx)

      // Send transaction using wallet adapter
      const signature = await wallet.sendTransaction(transaction, connection, {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      })

      toast.success("Top-up transaction submitted!")

      // Wait for confirmation
      await connection.confirmTransaction(
        {
          signature,
          blockhash,
          lastValidBlockHeight,
        },
        "confirmed"
      )

      const tx = signature

      // Submit to backend
      const response = await fetch(`/api/agents/${agentId}/topup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          transactionSignature: tx,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        toast.success(`Top-up successful! New balance: $${data.newBalance.toFixed(2)}`)
        // Refresh billing data
        await fetchBillingData()
      } else {
        const error = await response.json()
        toast.error(error.error || "Failed to process top-up")
      }
    } catch (error: any) {
      console.error("Top-up error:", error)
      toast.error(error.message || "Failed to top up agent")
    } finally {
      setIsToppingUp(false)
    }
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
              <Button
                onClick={handleTopUp}
                className="ml-2"
                disabled={!wallet.connected || isToppingUp || !agentData?.walletAddress}
              >
                {isToppingUp ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  "Top Up"
                )}
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
                {transactions.map((tx) => {
                  // Handle amount - could be Decimal, number, or string
                  const amount = typeof tx.amount === 'object' && tx.amount !== null && 'toNumber' in tx.amount
                    ? tx.amount.toNumber()
                    : typeof tx.amount === 'string'
                    ? parseFloat(tx.amount)
                    : typeof tx.amount === 'number'
                    ? tx.amount
                    : 0

                  // Handle date - could be string or Date
                  const date = tx.createdAt instanceof Date
                    ? tx.createdAt
                    : typeof tx.createdAt === 'string'
                    ? new Date(tx.createdAt)
                    : new Date()

                  return (
                    <TableRow key={tx.id}>
                      <TableCell className="font-mono text-xs">
                        {format(date, "PPp")}
                      </TableCell>
                      <TableCell>
                        <span className="capitalize">{tx.type}</span>
                      </TableCell>
                      <TableCell className="font-mono">
                        {tx.type === "topup" ? "+" : "-"}${amount.toFixed(2)}
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
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

