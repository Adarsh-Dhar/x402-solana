import type { WalletContextState } from "@solana/wallet-adapter-react"
import { Connection, PublicKey, SystemProgram, Transaction } from "@solana/web3.js"

type StakeWithProgramParams = {
  wallet: WalletContextState
  connection: Connection
  amount: bigint | number
}

// Frontend-visible staking wallet; must match the backend's STAKING_WALLET_ADDRESS / NEXT_PUBLIC_STAKING_WALLET.
const STAKING_WALLET =
  process.env.NEXT_PUBLIC_STAKING_WALLET || "11111111111111111111111111111111"

export const stakeWithProgram = async ({
  wallet,
  connection,
  amount,
}: StakeWithProgramParams): Promise<string> => {
  if (!wallet.publicKey) {
    throw new Error("Wallet is not connected.")
  }

  const lamports = typeof amount === "bigint" ? Number(amount) : amount

  if (!Number.isSafeInteger(lamports) || lamports <= 0) {
    throw new Error("Stake amount must be a positive integer number of lamports.")
  }

  // Validate staking wallet address
  if (STAKING_WALLET === "11111111111111111111111111111111") {
    throw new Error(
      "Staking wallet address is not configured. Please set NEXT_PUBLIC_STAKING_WALLET environment variable."
    )
  }

  const fromPubkey = wallet.publicKey
  let toPubkey: PublicKey
  try {
    toPubkey = new PublicKey(STAKING_WALLET)
  } catch (error) {
    throw new Error(`Invalid staking wallet address: ${STAKING_WALLET}`)
  }

  // Build the transfer instruction
  const ix = SystemProgram.transfer({
    fromPubkey,
    toPubkey,
    lamports,
  })

  // Fetch recent blockhash - required for transaction simulation
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed")

  // Create transaction with recent blockhash
  const tx = new Transaction({
    feePayer: wallet.publicKey,
    blockhash,
    lastValidBlockHeight,
  }).add(ix)

  // Send transaction - wallet adapter will:
  // 1. Sign the transaction
  // 2. Simulate the transaction (now possible with blockhash)
  // 3. Send the transaction
  const signature = await wallet.sendTransaction(tx, connection, {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  })

  // Wait for confirmation using the blockhash info we already have
  const confirmation = await connection.confirmTransaction(
    {
      signature,
      blockhash,
      lastValidBlockHeight,
    },
    "confirmed"
  )

  if (confirmation.value.err) {
    throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`)
  }

  return signature
}

