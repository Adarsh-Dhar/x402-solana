import os
import base58
from typing import Optional
from solders.keypair import Keypair
from solders.pubkey import Pubkey
from .exceptions import SDKConfigurationError


class WalletManager:
    """
    Wallet manager that loads private key from environment variable or parameter.
    
    Supports loading private keys from environment variables or direct parameter
    with proper validation and error handling.
    """
    
    def __init__(self, private_key: Optional[str] = None):
        """
        Initialize wallet manager.
        
        Args:
            private_key: Optional base58-encoded private key. If None, loads from env var.
            
        Raises:
            SDKConfigurationError: If private key is missing or invalid
        """
        self.keypair = self._load_wallet(private_key)

    def _load_wallet(self, private_key: Optional[str] = None) -> Keypair:
        """
        Load wallet from parameter or environment variable.
        
        Args:
            private_key: Optional private key string
            
        Returns:
            Loaded keypair
            
        Raises:
            SDKConfigurationError: If private key is missing or invalid
        """
        # Use provided key or fall back to environment variable
        key = private_key or os.getenv("SOLANA_PRIVATE_KEY")
        
        if not key:
            raise SDKConfigurationError(
                "SOLANA_PRIVATE_KEY environment variable is required or provide private_key parameter. "
                "Please set it with your base58-encoded private key.\n"
                "Example: export SOLANA_PRIVATE_KEY='your_base58_private_key_here'"
            )
        
        try:
            # Decode base58 string to bytes, then load keypair
            private_key_bytes = base58.b58decode(key)
            return Keypair.from_bytes(private_key_bytes)
        except Exception as e:
            raise SDKConfigurationError(
                f"Failed to load private key: {e}\n"
                "Please ensure the key is a valid base58-encoded Solana private key."
            ) from e

    def get_signer(self) -> Keypair:
        """Get the keypair for signing transactions."""
        return self.keypair

    def get_public_key(self) -> Pubkey:
        """Get the public key (wallet address)."""
        return self.keypair.pubkey()

