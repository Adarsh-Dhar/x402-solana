import os
import base58
from solders.keypair import Keypair
from solders.pubkey import Pubkey


class WalletManager:
    """
    Wallet manager that loads private key from environment variable.
    
    Production-ready: Requires SOLANA_PRIVATE_KEY environment variable
    to be set with a base58-encoded private key.
    """
    
    def __init__(self):
        self.keypair = self._load_wallet()

    def _load_wallet(self) -> Keypair:
        """
        Load wallet from SOLANA_PRIVATE_KEY environment variable.
        
        Raises:
            ValueError: If SOLANA_PRIVATE_KEY is not set
        """
        private_key = os.getenv("SOLANA_PRIVATE_KEY")
        
        if not private_key:
            raise ValueError(
                "SOLANA_PRIVATE_KEY environment variable is required. "
                "Please set it with your base58-encoded private key.\n"
                "Example: export SOLANA_PRIVATE_KEY='your_base58_private_key_here'"
            )
        
        try:
            # Decode base58 string to bytes, then load keypair
            private_key_bytes = base58.b58decode(private_key)
            return Keypair.from_bytes(private_key_bytes)
        except Exception as e:
            raise ValueError(
                f"Failed to load private key from SOLANA_PRIVATE_KEY: {e}\n"
                "Please ensure the key is a valid base58-encoded Solana private key."
            ) from e

    def get_signer(self):
        """Get the keypair for signing transactions."""
        return self.keypair

    def get_public_key(self) -> Pubkey:
        """Get the public key (wallet address)."""
        return self.keypair.pubkey()

