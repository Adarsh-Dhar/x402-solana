"use client"

import { useWallet } from "@solana/wallet-adapter-react"
import { useWalletModal } from "@solana/wallet-adapter-react-ui"
import { Button } from "@/components/ui/button"
import { Wallet, AlertTriangle } from "lucide-react"
import { useEffect, useState } from "react"

export function CustomWalletButton() {
  const [mounted, setMounted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [debugInfo, setDebugInfo] = useState<any>({})

  // Wrap wallet hooks in try-catch
  let walletHookResult: any = {}
  let modalHookResult: any = {}
  
  try {
    walletHookResult = useWallet()
    console.log("[CustomWalletButton] useWallet SUCCESS", {
      connected: walletHookResult.connected,
      connecting: walletHookResult.connecting,
      publicKey: walletHookResult.publicKey?.toString(),
      walletsLength: walletHookResult.wallets?.length,
    })
  } catch (err: any) {
    console.error("[CustomWalletButton] useWallet ERROR", err)
    setError(`useWallet failed: ${err.message}`)
  }

  try {
    modalHookResult = useWalletModal()
    console.log("[CustomWalletButton] useWalletModal SUCCESS")
  } catch (err: any) {
    console.error("[CustomWalletButton] useWalletModal ERROR", err)
    setError(`useWalletModal failed: ${err.message}`)
  }

  const { connected, connecting, publicKey, disconnect, wallets } = walletHookResult
  const { setVisible } = modalHookResult

  useEffect(() => {
    try {
      setMounted(true)
      const info = {
        mounted: true,
        connected: connected || false,
        connecting: connecting || false,
        publicKey: publicKey?.toString() || null,
        walletsAvailable: wallets?.length || 0,
        walletNames: wallets?.map((w: any) => w.adapter?.name) || [],
        hasSetVisible: typeof setVisible === 'function',
        timestamp: new Date().toISOString(),
      }
      setDebugInfo(info)
      console.log("[CustomWalletButton] MOUNTED SUCCESS", info)
    } catch (err: any) {
      console.error("[CustomWalletButton] Mount ERROR", err)
      setError(`Mount failed: ${err.message}`)
    }
  }, [connected, connecting, publicKey, wallets, setVisible])

  useEffect(() => {
    if (mounted) {
      try {
        const stateChange = {
          connected: connected || false,
          connecting: connecting || false,
          publicKey: publicKey?.toString() || null,
          timestamp: new Date().toISOString(),
        }
        console.log("[CustomWalletButton] STATE CHANGE", stateChange)
      } catch (err: any) {
        console.error("[CustomWalletButton] State change logging error", err)
      }
    }
  }, [connected, connecting, publicKey, mounted])

  // Show error state if there's an error
  if (error) {
    console.error("[CustomWalletButton] RENDERING ERROR STATE", error)
    return (
      <div className="w-full space-y-2">
        <Button 
          disabled 
          className="w-full justify-center border-red-500/50 font-semibold text-red-500 bg-red-500/10"
        >
          <AlertTriangle className="mr-2 h-4 w-4" />
          Wallet Error
        </Button>
        <div className="text-xs text-red-500 p-2 bg-red-500/10 rounded">
          {error}
        </div>
        <details className="text-xs text-muted-foreground">
          <summary>Debug Info</summary>
          <pre className="mt-2 p-2 bg-muted/50 rounded text-xs overflow-auto">
            {JSON.stringify(debugInfo, null, 2)}
          </pre>
        </details>
      </div>
    )
  }

  // Show loading state during hydration
  if (!mounted) {
    console.log("[CustomWalletButton] RENDERING LOADING STATE")
    return (
      <Button 
        disabled 
        className="w-full justify-center border-[var(--solana-purple)]/50 font-semibold text-[var(--solana-purple)] hover:bg-[var(--solana-purple)]/10 bg-transparent"
      >
        <Wallet className="mr-2 h-4 w-4" />
        Loading Wallet...
      </Button>
    )
  }

  const handleClick = () => {
    try {
      console.log("[CustomWalletButton] BUTTON CLICKED", {
        connected,
        hasSetVisible: typeof setVisible === 'function',
        hasDisconnect: typeof disconnect === 'function',
      })
      
      if (connected && typeof disconnect === 'function') {
        console.log("[CustomWalletButton] DISCONNECTING")
        disconnect()
      } else if (typeof setVisible === 'function') {
        console.log("[CustomWalletButton] OPENING MODAL")
        setVisible(true)
      } else {
        console.error("[CustomWalletButton] NO VALID ACTION AVAILABLE")
        setError("Wallet functions not available")
      }
    } catch (err: any) {
      console.error("[CustomWalletButton] CLICK ERROR", err)
      setError(`Click failed: ${err.message}`)
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

  console.log("[CustomWalletButton] RENDERING NORMAL STATE", {
    connected,
    connecting,
    buttonText: getButtonText(),
  })

  return (
    <div className="w-full space-y-2">
      <Button
        onClick={handleClick}
        disabled={connecting}
        className="w-full justify-center border-[var(--solana-purple)]/50 font-semibold text-[var(--solana-purple)] hover:bg-[var(--solana-purple)]/10 bg-transparent"
      >
        <Wallet className="mr-2 h-4 w-4" />
        {getButtonText()}
      </Button>
      
      {/* Debug info in development */}
      {process.env.NODE_ENV === 'development' && (
        <details className="text-xs text-muted-foreground">
          <summary>Wallet Debug</summary>
          <pre className="mt-2 p-2 bg-muted/50 rounded text-xs overflow-auto">
            {JSON.stringify(debugInfo, null, 2)}
          </pre>
        </details>
      )}
    </div>
  )
}