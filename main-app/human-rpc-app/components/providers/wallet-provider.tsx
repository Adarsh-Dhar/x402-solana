"use client"

import { useMemo, ReactNode, useEffect } from "react"
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
  // Always use devnet for now
  const network = WalletAdapterNetwork.Devnet

  const endpoint = useMemo(
    () => process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl(network),
    [network],
  )

  // Explicitly register common adapters; Standard Wallet will also hook in where supported
  const wallets = useMemo(
    () => {
      try {
        return [
          new PhantomWalletAdapter(),
          new SolflareWalletAdapter({ network }),
          new TorusWalletAdapter(),
        ]
      } catch (error) {
        console.error("[SolanaWalletProvider] Error initializing wallets:", error)
        return []
      }
    },
    [network],
  )

  useEffect(() => {
    // Handle potential ethers conflicts
    if (typeof window !== "undefined") {
      // Suppress ethers redefinition warnings
      const originalConsoleWarn = console.warn
      console.warn = (...args) => {
        const message = args.join(' ')
        if (message.includes('ethers') && message.includes('redefine')) {
          // Suppress ethers redefinition warnings
          return
        }
        originalConsoleWarn.apply(console, args)
      }

      console.log("[SolanaWalletProvider] Initialised", {
        endpoint,
        network,
        wallets: wallets.map((w) => w.name),
        walletsLength: wallets.length,
      })

      // Restore console.warn after a delay
      setTimeout(() => {
        console.warn = originalConsoleWarn
      }, 5000)
    }
  }, [endpoint, network, wallets])

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}

