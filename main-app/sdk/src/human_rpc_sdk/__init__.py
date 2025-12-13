"""
Human RPC SDK - Autonomous Payment Agent for x402 protocol.

Automatically handles 402 Payment Required responses by making
Solana payments (SOL or USDC) to unlock paywalled content.

Provides AutoAgent HTTP client and @guard decorator for seamless
integration of human-in-the-loop verification in AI applications.
"""

from .agent import AutoAgent
from .decorator import guard
from .exceptions import (
    SDKError,
    SDKConfigurationError,
    InvoiceValidationError,
    TransactionBuildError,
    PaymentError,
    HumanVerificationError
)

__all__ = [
    "AutoAgent",
    "guard",
    "SDKError",
    "SDKConfigurationError", 
    "InvoiceValidationError",
    "TransactionBuildError",
    "PaymentError",
    "HumanVerificationError"
]
__version__ = "0.1.0"

