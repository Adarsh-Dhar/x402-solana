"use client"

import { useWallet } from "@solana/wallet-adapter-react"
import { useWalletModal } from "@solana/wallet-adapter-react-ui"
import { Button } from "@/components/ui/button"
import { Wallet } from "lucide-react"
import { useEffect, useState } from "react"

export function CustomWalletButton() {
  const { connected, connecting, publicKey, disconnect, wallets } = useWallet()
  const { setVisible } = useWalletModal()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    console.log("[CustomWalletButton] Mounted", {
      connected,
      connecting,
      publicKey: publicKey?.toString(),
      walletsAvailable: wallets.length,
    })
  }, [])

  useEffect(() => {
    console.log("[CustomWalletButton] Wallet state changed", {
      connected,
      connecting,
      publicKey: publicKey?.toString(),
    })
  }, [connected, connecting, publicKey])

  if (!mounted) {
    return (
      <Button 
        disabled 
        className="w-full justify-center border-[var(--solana-purple)]/50 font-semibold text-[var(--solana-purple)] hover:bg-[var(--solana-purple)]/10 bg-transparent"
      >
        <Wallet className="mr-2 h-4 w-4" />
        Loading...
      </Button>
    )
  }

  const handleClick = () => {
    if (connected) {
      disconnect()
    } else {
      setVisible(true)
    }
  }

  const getButtonText = () => {
    if (connecting) return "Connecting..."
    if (connected && publicKey) {
      const address = publicKey.toString()
      return `${address.slice(0, 4)}...${address.slice(-4)}`
    }
    return "Connect Wallet"
  }

  return (
    <Button
      onClick={handleClick}
      disabled={connecting}
      className="w-full justify-center border-[var(--solana-purple)]/50 font-semibold text-[var(--solana-purple)] hover:bg-[var(--solana-purple)]/10 bg-transparent"
    >
      <Wallet className="mr-2 h-4 w-4" />
      {getButtonText()}
    </Button>
  )
}