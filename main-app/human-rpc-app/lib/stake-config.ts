import { LAMPORTS_PER_SOL } from "@solana/web3.js"

// Centralized stake configuration
// This ensures frontend and backend use the same values
export const STAKE_CONFIG = {
  // Stake amount in SOL (can be overridden by environment variable)
  AMOUNT_SOL: parseFloat(process.env.NEXT_PUBLIC_STAKE_AMOUNT_SOL || "0.01"),
  
  // Calculated lamports (derived from SOL amount)
  get AMOUNT_LAMPORTS() {
    return this.AMOUNT_SOL * LAMPORTS_PER_SOL
  },
  
  // Additional fee buffer for transactions (in lamports)
  TRANSACTION_FEE_BUFFER: 5000,
  
  // Get total required lamports (stake + fees)
  get REQUIRED_LAMPORTS() {
    return this.AMOUNT_LAMPORTS + this.TRANSACTION_FEE_BUFFER
  }
}

// Export individual values for convenience
export const STAKE_AMOUNT_SOL = STAKE_CONFIG.AMOUNT_SOL
export const STAKE_AMOUNT_LAMPORTS = STAKE_CONFIG.AMOUNT_LAMPORTS
export const REQUIRED_LAMPORTS = STAKE_CONFIG.REQUIRED_LAMPORTS