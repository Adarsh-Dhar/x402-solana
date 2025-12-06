import base64
import json
import requests
from solders.transaction import Transaction
from solders.pubkey import Pubkey
from solders.hash import Hash
from solders.message import Message
from solders.instruction import Instruction, AccountMeta
from solders.system_program import transfer, TransferParams

# Hardcoded Mainnet Defaults (Enforcing standardization)
RPC_URL = "https://api.mainnet-beta.solana.com"
USDC_MINT = Pubkey.from_string("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")
TOKEN_PROGRAM_ID = Pubkey.from_string("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
ASSOCIATED_TOKEN_PROGRAM_ID = Pubkey.from_string("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")


def derive_associated_token_address(wallet: Pubkey, mint: Pubkey) -> Pubkey:
    """
    Derive the associated token account address for a wallet and mint.
    Uses the standard SPL Token associated token account derivation.
    """
    # The seeds for ATA derivation are: [wallet, TOKEN_PROGRAM_ID, mint]
    seeds = [
        bytes(wallet),
        bytes(TOKEN_PROGRAM_ID),
        bytes(mint),
    ]
    
    # Find the program address using Pubkey.find_program_address
    address, _ = Pubkey.find_program_address(seeds, ASSOCIATED_TOKEN_PROGRAM_ID)
    return address


class PaymentCore:
    def __init__(self, wallet_manager):
        self.wallet = wallet_manager
        self.rpc_url = RPC_URL

    def _get_recent_blockhash(self) -> Hash:
        """Get recent blockhash from RPC."""
        try:
            blockhash_payload = {
                "jsonrpc": "2.0",
                "id": 2,
                "method": "getLatestBlockhash",
                "params": [{"commitment": "confirmed"}]
            }
            blockhash_response = requests.post(self.rpc_url, json=blockhash_payload, timeout=10)
            blockhash_data = blockhash_response.json()
            
            if "error" in blockhash_data:
                raise ValueError(f"RPC error: {blockhash_data['error']}")
            
            recent_blockhash_str = blockhash_data.get("result", {}).get("value", {}).get("blockhash")
            
            if not recent_blockhash_str:
                raise ValueError("Could not get recent blockhash from RPC")
            
            return Hash.from_string(recent_blockhash_str)
        except Exception as e:
            raise ValueError(f"Could not get recent blockhash: {e}")

    def _check_token_balance(self, token_account: Pubkey) -> int:
        """Check token account balance."""
        try:
            balance_payload = {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "getTokenAccountBalance",
                "params": [str(token_account)]
            }
            balance_response = requests.post(self.rpc_url, json=balance_payload, timeout=10)
            balance_data = balance_response.json()
            
            if "error" in balance_data:
                # Token account might not exist yet
                return 0
            
            result = balance_data.get("result", {}).get("value", {})
            amount = result.get("amount", "0")
            return int(amount)
        except Exception as e:
            print(f"⚠️  Could not check balance: {e}")
            return 0

    def _check_sol_balance(self, pubkey: Pubkey) -> int:
        """Check SOL balance in lamports."""
        try:
            balance_payload = {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "getBalance",
                "params": [str(pubkey)]
            }
            balance_response = requests.post(self.rpc_url, json=balance_payload, timeout=10)
            balance_data = balance_response.json()
            
            if "error" in balance_data:
                return 0
            
            balance = balance_data.get("result", {}).get("value", 0)
            return int(balance)
        except Exception as e:
            print(f"⚠️  Could not check SOL balance: {e}")
            return 0

    def build_payment_payload(self, payment_details: dict):
        """
        Unified method to build x402-compliant payment payload.
        Automatically detects if payment is SOL or USDC based on payment details.
        
        Args:
            payment_details: Dictionary containing payment information:
                - For USDC: tokenAccount, mint, amount, cluster
                - For SOL: recipientWallet, amount, cluster
        
        Returns:
            Dictionary with x402 payment payload structure
        """
        token_account = payment_details.get("tokenAccount")
        mint = payment_details.get("mint")
        recipient_wallet = payment_details.get("recipientWallet")
        amount = payment_details.get("amount")
        cluster = payment_details.get("cluster", "mainnet-beta")
        
        # Determine network
        network = "mainnet-beta" if "mainnet" in cluster else "devnet"
        
        # Convert amount to int
        if isinstance(amount, str):
            amount = int(float(amount))
        elif isinstance(amount, float):
            amount = int(amount)
        
        if not amount:
            raise ValueError("Payment amount is required")
        
        # Determine payment type and build transaction
        if token_account and mint:
            # USDC payment
            return self._pay_with_usdc(token_account, mint, amount, network)
        elif recipient_wallet:
            # SOL payment
            return self._pay_with_sol(recipient_wallet, amount, network)
        else:
            raise ValueError(
                "Invalid payment requirements: Missing recipient or token details. "
                "For USDC: tokenAccount and mint required. "
                "For SOL: recipientWallet required."
            )

    def _pay_with_usdc(self, recipient_ata_str: str, mint_str: str, amount: int, network: str):
        """
        Build USDC (SPL Token) payment transaction.
        
        Args:
            recipient_ata_str: Recipient's associated token account address
            mint_str: USDC mint address
            amount: Amount in token base units (6 decimals for USDC)
            network: Network name (mainnet-beta, devnet, etc.)
            
        Returns:
            Dictionary with x402 payment payload structure
        """
        payer_kp = self.wallet.get_signer()
        payer_pubkey = payer_kp.pubkey()
        recipient_ata = Pubkey.from_string(recipient_ata_str)
        mint_pubkey = Pubkey.from_string(mint_str)

        # Derive sender's associated token account
        sender_ata = derive_associated_token_address(payer_pubkey, mint_pubkey)

        # Check balance
        balance = self._check_token_balance(sender_ata)
        if balance < amount:
            raise Exception(
                f"Insufficient Funds. Please send USDC to {payer_pubkey}. "
                f"Required: {amount / 1_000_000} USDC, Available: {balance / 1_000_000} USDC"
            )

        # Build SPL Token Transfer Instruction
        # Transfer instruction type is 3
        instruction_data = bytearray([3])  # Transfer instruction
        instruction_data.extend(amount.to_bytes(8, 'little'))

        # Create instruction
        transfer_ix = Instruction(
            program_id=TOKEN_PROGRAM_ID,
            data=bytes(instruction_data),
            accounts=[
                AccountMeta(pubkey=sender_ata, is_signer=False, is_writable=True),
                AccountMeta(pubkey=recipient_ata, is_signer=False, is_writable=True),
                AccountMeta(pubkey=payer_pubkey, is_signer=True, is_writable=False),
            ]
        )

        return self._sign_and_encode([transfer_ix], payer_kp, payer_pubkey, network)

    def _pay_with_sol(self, recipient_address: str, amount_lamports: int, network: str):
        """
        Build SOL (native) payment transaction.
        
        Args:
            recipient_address: Recipient's Solana wallet address
            amount_lamports: Amount in lamports
            network: Network name (mainnet-beta, devnet, etc.)
            
        Returns:
            Dictionary with x402 payment payload structure
        """
        payer_kp = self.wallet.get_signer()
        payer_pubkey = payer_kp.pubkey()
        recipient_pubkey = Pubkey.from_string(recipient_address)

        # Validate addresses
        if payer_pubkey == recipient_pubkey:
            raise ValueError(f"Cannot send SOL to self. Address: {payer_pubkey}")

        # Check balance (add buffer for fees)
        balance = self._check_sol_balance(payer_pubkey)
        if balance < amount_lamports + 5000:  # Add buffer for transaction fees
            raise Exception(
                f"Insufficient Funds. Please send SOL to {payer_pubkey}. "
                f"Required: {(amount_lamports + 5000) / 1_000_000_000} SOL, "
                f"Available: {balance / 1_000_000_000} SOL"
            )

        # Build SOL transfer instruction
        transfer_ix = transfer(
            TransferParams(
                from_pubkey=payer_pubkey,
                to_pubkey=recipient_pubkey,
                lamports=amount_lamports
            )
        )

        return self._sign_and_encode([transfer_ix], payer_kp, payer_pubkey, network)

    def _sign_and_encode(self, instructions: list, payer_kp, payer_pubkey: Pubkey, network: str):
        """
        Sign transaction and encode for x402 header.
        
        Args:
            instructions: List of Instruction objects
            payer_kp: Keypair for signing
            payer_pubkey: Public key of payer (fee payer)
            network: Network name (mainnet-beta, devnet, etc.)
            
        Returns:
            Dictionary with x402 payment payload structure
        """
        # Get recent blockhash
        recent_blockhash = self._get_recent_blockhash()

        # Build message
        message = Message.new_with_blockhash(instructions, payer_pubkey, recent_blockhash)

        # Create and sign transaction
        tx = Transaction.new_unsigned(message)
        tx.sign([payer_kp], recent_blockhash)

        # Serialize and encode
        serialized = bytes(tx)
        encoded_tx = base64.b64encode(serialized).decode('utf-8')

        return {
            "x402Version": 1,
            "scheme": "solana",
            "network": network,
            "payload": {
                "serializedTransaction": encoded_tx
            }
        }

