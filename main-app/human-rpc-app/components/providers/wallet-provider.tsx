"use client"

import { useMemo, ReactNode, useEffect, useState } from "react"
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react"
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base"
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui"
import { clusterApiUrl } from "@solana/web3.js"
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  TorusWalletAdapter,
} from "@solana/wallet-adapter-wallets"

// Import wallet adapter CSS
import "@solana/wallet-adapter-react-ui/styles.css"

export function SolanaWalletProvider({ children }: { children: ReactNode }) {
  const [initError, setInitError] = useState<string | null>(null)
  const [isClient, setIsClient] = useState(false)

  // Always use devnet for now
  const network = WalletAdapterNetwork.Devnet

  const endpoint = useMemo(() => {
    try {
      const url = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl(network)
      console.log("[SolanaWalletProvider] Endpoint resolved", { url, network })
      return url
    } catch (error: any) {
      console.error("[SolanaWalletProvider] Endpoint resolution error", error)
      setInitError(`Endpoint error: ${error.message}`)
      return "https://api.devnet.solana.com" // fallback
    }
  }, [network])

  // Explicitly register common adapters; Standard Wallet will also hook in where supported
  const wallets = useMemo(() => {
    try {
      console.log("[SolanaWalletProvider] Initializing wallets...")
      
      const walletList = []
      
      try {
        const phantom = new PhantomWalletAdapter()
        walletList.push(phantom)
        console.log("[SolanaWalletProvider] Phantom adapter created successfully")
      } catch (err: any) {
        console.error("[SolanaWalletProvider] Phantom adapter error:", err)
      }

      try {
        const solflare = new SolflareWalletAdapter({ network })
        walletList.push(solflare)
        console.log("[SolanaWalletProvider] Solflare adapter created successfully")
      } catch (err: any) {
        console.error("[SolanaWalletProvider] Solflare adapter error:", err)
      }

      try {
        const torus = new TorusWalletAdapter()
        walletList.push(torus)
        console.log("[SolanaWalletProvider] Torus adapter created successfully")
      } catch (err: any) {
        console.error("[SolanaWalletProvider] Torus adapter error:", err)
      }

      console.log("[SolanaWalletProvider] Wallets initialized", {
        count: walletList.length,
        names: walletList.map(w => w.name),
      })

      return walletList
    } catch (error: any) {
      console.error("[SolanaWalletProvider] Critical wallet initialization error:", error)
      setInitError(`Wallet init error: ${error.message}`)
      return []
    }
  }, [network])

  useEffect(() => {
    setIsClient(true)
    
    if (typeof window !== "undefined") {
      try {
        // Handle potential ethers conflicts
        const originalConsoleWarn = console.warn
        console.warn = (...args) => {
          const message = args.join(' ')
          if (message.includes('ethers') && message.includes('redefine')) {
            return // Suppress ethers redefinition warnings
          }
          originalConsoleWarn.apply(console, args)
        }

        const providerInfo = {
          endpoint,
          network,
          wallets: wallets.map((w) => ({ name: w.name, readyState: w.readyState })),
          walletsLength: wallets.length,
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
          url: window.location.href,
        }

        console.log("[SolanaWalletProvider] INITIALIZATION SUCCESS", providerInfo)

        // Test wallet adapter imports
        console.log("[SolanaWalletProvider] Testing imports:", {
          ConnectionProvider: typeof ConnectionProvider,
          WalletProvider: typeof WalletProvider,
          WalletModalProvider: typeof WalletModalProvider,
          PhantomWalletAdapter: typeof PhantomWalletAdapter,
        })

        // Restore console.warn after a delay
        setTimeout(() => {
          console.warn = originalConsoleWarn
        }, 5000)

      } catch (error: any) {
        console.error("[SolanaWalletProvider] Setup error:", error)
        setInitError(`Setup error: ${error.message}`)
      }
    }
  }, [endpoint, network, wallets])

  // Show error state if initialization failed
  if (initError) {
    console.error("[SolanaWalletProvider] RENDERING ERROR STATE", initError)
    return (
      <div className="p-4 border border-red-500 bg-red-500/10 rounded-lg">
        <h3 className="text-red-500 font-semibold mb-2">Wallet Provider Error</h3>
        <p className="text-red-500 text-sm mb-4">{initError}</p>
        <details className="text-xs text-red-400">
          <summary>Technical Details</summary>
          <pre className="mt-2 p-2 bg-red-500/20 rounded text-xs overflow-auto">
            {JSON.stringify({
              endpoint,
              network,
              walletsCount: wallets.length,
              isClient,
              timestamp: new Date().toISOString(),
            }, null, 2)}
          </pre>
        </details>
        <div className="mt-4">
          {children}
        </div>
      </div>
    )
  }

  // Don't render providers until client-side
  if (!isClient) {
    console.log("[SolanaWalletProvider] WAITING FOR CLIENT")
    return <div>{children}</div>
  }

  try {
    console.log("[SolanaWalletProvider] RENDERING PROVIDERS")
    return (
      <ConnectionProvider endpoint={endpoint}>
        <WalletProvider wallets={wallets} autoConnect={false}>
          <WalletModalProvider>{children}</WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    )
  } catch (error: any) {
    console.error("[SolanaWalletProvider] RENDER ERROR", error)
    return (
      <div className="p-4 border border-red-500 bg-red-500/10 rounded-lg">
        <h3 className="text-red-500 font-semibold mb-2">Wallet Render Error</h3>
        <p className="text-red-500 text-sm">{error.message}</p>
        <div className="mt-4">
          {children}
        </div>
      </div>
    )
  }
}

