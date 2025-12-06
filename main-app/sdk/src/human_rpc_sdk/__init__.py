"""
Human RPC SDK - Autonomous Payment Agent for x402 protocol.

Automatically handles 402 Payment Required responses by making
Solana payments (SOL or USDC) to unlock paywalled content.
"""

from .client import AutoAgent

__all__ = ["AutoAgent"]
__version__ = "0.1.0"

