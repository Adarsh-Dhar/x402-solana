"use client"

import { Button } from "@/components/ui/button"
import { Wallet } from "lucide-react"

export function SimpleWalletButton() {
  console.log("[SimpleWalletButton] Component rendering")
  
  return (
    <Button
      onClick={() => {
        console.log("[SimpleWalletButton] Button clicked")
        alert("Simple wallet button clicked!")
      }}
      className="w-full justify-center border-[var(--solana-purple)]/50 font-semibold text-[var(--solana-purple)] hover:bg-[var(--solana-purple)]/10 bg-transparent"
    >
      <Wallet className="mr-2 h-4 w-4" />
      Simple Wallet Button
    </Button>
  )
}