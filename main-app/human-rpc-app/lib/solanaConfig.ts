import { PublicKey } from "@solana/web3.js"
import solanaStakingIdl from "./solana_staking_idl.json"

// Runtime IDL object for the staking program
export const SOLANA_STAKING_IDL = solanaStakingIdl as any

// Program ID as defined in the Rust program / IDL
export const SOLANA_STAKING_PROGRAM_ID = new PublicKey(
  "DgpcXMpoah8Jczc5h8Be61mTgcUhyiAKDwQfTgo2aJ6F",
)

// Cluster URL used by the app (falls back to devnet)
export const SOLANA_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com"

// Mint used for staking. This MUST be configured by the app.
export const getStakeMint = (): PublicKey => {
  const mintStr = process.env.NEXT_PUBLIC_STAKE_MINT

  if (!mintStr) {
    throw new Error(
      "NEXT_PUBLIC_STAKE_MINT is not set. Please configure the SPL token mint address used for staking.",
    )
  }

  try {
    return new PublicKey(mintStr)
  } catch {
    throw new Error(
      "NEXT_PUBLIC_STAKE_MINT is invalid. Please set it to a valid Solana mint address.",
    )
  }
}


