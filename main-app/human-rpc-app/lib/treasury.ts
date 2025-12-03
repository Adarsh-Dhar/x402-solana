import { Keypair, PublicKey } from "@solana/web3.js"

// Reuse the same treasury wallet address used in the tasks API
export const TREASURY_WALLET_ADDRESS =
  process.env.STAKING_WALLET_ADDRESS ||
  process.env.NEXT_PUBLIC_STAKING_WALLET ||
  "11111111111111111111111111111111"

export const TREASURY_PUBLIC_KEY = new PublicKey(TREASURY_WALLET_ADDRESS)

/**
 * Load the treasury Keypair from the TREASURY_SECRET_KEY env var.
 *
 * The secret key should be stored as a JSON array string, e.g.:
 * "[12,34,56,...]"
 */
export function loadTreasuryKeypair(): Keypair | null {
  const secret = process.env.TREASURY_SECRET_KEY

  if (!secret) {
    console.error("[Treasury] TREASURY_SECRET_KEY is not configured - rewards payouts will be skipped")
    return null
  }

  try {
    const parsed = JSON.parse(secret)
    const secretBytes = Uint8Array.from(parsed)
    const keypair = Keypair.fromSecretKey(secretBytes)

    // Sanity check: ensure public key matches configured treasury wallet
    if (!keypair.publicKey.equals(TREASURY_PUBLIC_KEY)) {
      console.warn(
        "[Treasury] Loaded treasury keypair does not match TREASURY_WALLET_ADDRESS. " +
          "Check STAKING_WALLET_ADDRESS / NEXT_PUBLIC_STAKING_WALLET and TREASURY_SECRET_KEY."
      )
    }

    return keypair
  } catch (error: any) {
    console.error("[Treasury] Failed to load treasury keypair from TREASURY_SECRET_KEY:", error?.message || error)
    return null
  }
}


